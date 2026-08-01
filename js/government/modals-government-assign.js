/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT ASSIGNMENT MODALS js/government/modals-government-assign.js
 * =============================================================================
 * 
 * This file contains assignment-specific UI modals:
 * - Bulk assignment modal
 * - Assignment history viewer
 * - Succession planning viewer
 * - Assignment statistics viewer
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - government-assignment.js (GovernmentAssignment)
 *   - government-commands.js (GovernmentCommands)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. BULK ASSIGNMENT MODAL
    // =========================================================================

    function openBulkAssignModal(departmentId, positionId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return;
            }

            var candidates = GovernmentAssignment.getQualifiedCandidates(departmentId, positionId, { limit: 20 });
            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');
            var checkIcon = _getIcon('CHECK_SIMPLE');

            var selectedCharIds = [];

            var candidatesHtml = '';
            if (candidates.length === 0) {
                candidatesHtml = '<div style="text-align: center; padding: 20px; color: var(--dim);">No qualified candidates found</div>';
            } else {
                for (var i = 0; i < candidates.length; i++) {
                    var c = candidates[i];
                    var char = c.character;
                    var charId = char.id;
                    var isChecked = selectedCharIds.indexOf(charId) !== -1;

                    candidatesHtml +=
                        '<div class="candidate-item" data-char-id="' + charId + '" style="' +
                        'background: ' + (isChecked ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isChecked ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 6px 10px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div style="display: flex; align-items: center; gap: 8px;">' +
                        '<input type="checkbox" class="candidate-checkbox" ' + (isChecked ? 'checked' : '') + ' style="cursor: pointer;">' +
                        '<span style="font-size: 0.7rem;">' + personIcon + ' ' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px;">' +
                        '<span>Age: ' + c.age + '</span>' +
                        '<span>Exp: ' + c.experience + 'y</span>' +
                        (c.rank ? '<span style="color: var(--accent);">' + _escapeHtml(c.rank.name) + '</span>' : '') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Qualified Candidates (' + candidates.length + ')</div>' +
                '<div style="max-height: 300px; overflow-y: auto;">' +
                candidatesHtml +
                '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">' +
                '<button id="bulkSelectAllBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Select All</button>' +
                '<button id="bulkSelectNoneBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Select None</button>' +
                '<span style="font-size: 0.55rem; color: var(--dim); margin-left: auto;"><span id="bulkSelectedCount">0</span> selected</span>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="bulkStartYear" value="' + _getCurrentYear() + '" min="1" style="width:100px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Select multiple characters to assign them to this position. All assignments will use the same start year.' +
                '</div>';

            _openModal({
                title: 'Bulk Assign: ' + position.name,
                content: modalContent,
                confirmText: 'Assign Selected',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var startYear = parseInt(document.getElementById('bulkStartYear').value) || _getCurrentYear();

                    if (selectedCharIds.length === 0) {
                        _showToast('No characters selected', 'warning');
                        return false;
                    }

                    var assignments = selectedCharIds.map(function(charId) {
                        return {
                            characterId: charId,
                            startYear: startYear,
                            title: position.name
                        };
                    });

                    var results = GovernmentCommands.bulkAssignCharacters(departmentId, positionId, assignments);

                    _closeTopModal();
                    if (onSuccess) onSuccess(results);
                    return true;
                }
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.candidate-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.type !== 'checkbox') {
                                var checkbox = this.querySelector('.candidate-checkbox');
                                if (checkbox) {
                                    checkbox.checked = !checkbox.checked;
                                    var event = new Event('change');
                                    checkbox.dispatchEvent(event);
                                }
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            var checkbox = this.querySelector('.candidate-checkbox');
                            this.style.background = checkbox && checkbox.checked ? 'var(--accent-dim)' : 'var(--bg3)';
                        });
                    })(items[i]);
                }

                var checkboxes = document.querySelectorAll('.candidate-checkbox');
                for (var i = 0; i < checkboxes.length; i++) {
                    (function(checkbox) {
                        checkbox.addEventListener('change', function() {
                            var item = this.closest('.candidate-item');
                            var charId = item.dataset.charId;
                            var idx = selectedCharIds.indexOf(charId);

                            if (this.checked) {
                                if (idx === -1) selectedCharIds.push(charId);
                                item.style.background = 'var(--accent-dim)';
                                item.style.borderColor = 'var(--accent)';
                            } else {
                                if (idx !== -1) selectedCharIds.splice(idx, 1);
                                item.style.background = 'var(--bg3)';
                                item.style.borderColor = 'var(--border)';
                            }

                            var countEl = document.getElementById('bulkSelectedCount');
                            if (countEl) countEl.textContent = selectedCharIds.length;
                        });
                    })(checkboxes[i]);
                }

                var selectAllBtn = document.getElementById('bulkSelectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function() {
                        var checkboxes = document.querySelectorAll('.candidate-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                            var event = new Event('change');
                            checkboxes[i].dispatchEvent(event);
                        }
                    });
                }

                var selectNoneBtn = document.getElementById('bulkSelectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.addEventListener('click', function() {
                        var checkboxes = document.querySelectorAll('.candidate-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                            var event = new Event('change');
                            checkboxes[i].dispatchEvent(event);
                        }
                    });
                }

            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 4. ASSIGNMENT HISTORY MODAL
    // =========================================================================

    function openAssignmentHistoryModal(departmentId, positionId, characterId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var history = GovernmentQueries.getAssignmentHistory(departmentId, positionId, characterId, 50);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            if (!history || history.length === 0) {
                _showToast('No assignment history found', 'info');
                return;
            }

            var title = 'Assignment History';
            if (departmentId) {
                var dept = GovernmentState.getDepartment(departmentId);
                if (dept) title += ': ' + dept.name;
            }
            if (positionId) {
                var pos = GovernmentState.getPositionById(departmentId, positionId);
                if (pos) title += ' - ' + pos.name;
            }
            if (characterId) {
                var char = _getCharacterById(characterId);
                if (char) title += ' - ' + char.name;
            }

            var historyHtml = '';
            for (var i = 0; i < history.length; i++) {
                var h = history[i];
                var isActive = h.isActive;
                var endDisplay = h.endYear || 'Present';

                historyHtml +=
                    '<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<div>' +
                    '<span style="font-size: 0.7rem;">' + personIcon + ' ' + _escapeHtml(h.characterName) + '</span>' +
                    (h.positionName ? ' <span style="font-size: 0.55rem; color: var(--dim);">→ ' + _escapeHtml(h.positionName) + '</span>' : '') +
                    (h.title && h.title !== h.positionName ? ' <span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(h.title) + ')</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                    h.startYear + ' - ' + endDisplay +
                    (h.duration ? ' (' + h.duration + 'y)' : '') +
                    (h.endReason ? ' - ' + _escapeHtml(h.endReason) : '') +
                    '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div style="max-height: 400px; overflow-y: auto;">' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-bottom: 8px;">' + history.length + ' assignment(s) found</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Shows all assignments in chronological order (most recent first).' +
                '</div>';

            _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. SUCCESSION PLANNING MODAL
    // =========================================================================

    function openSuccessionPlanningModal(departmentId, positionId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var plan = GovernmentAssignment.getSuccessionPlan(departmentId, positionId);
            if (!plan) {
                _showToast('Succession plan not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');

            var candidatesHtml = '';
            if (plan.candidates.length === 0) {
                candidatesHtml = '<div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.6rem;">No candidates identified</div>';
            } else {
                for (var i = 0; i < plan.candidates.length; i++) {
                    var c = plan.candidates[i];
                    candidatesHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span>' + (c.isReady ? '✓' : '•') + ' ' + _escapeHtml(c.characterName) + '</span>' +
                        '<span style="color: var(--dim);">' +
                        'Age: ' + c.age + ' · Exp: ' + c.experience + 'y' +
                        (c.rank ? ' · ' + _escapeHtml(c.rank) : '') +
                        (c.isReady ? ' · <span style="color: var(--success);">Ready</span>' : '') +
                        '</span>' +
                        '</div>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Position:</strong> ' + _escapeHtml(plan.positionName) + '<br>' +
                (plan.currentHolder ? '<strong>Current Holder:</strong> ' + _escapeHtml(plan.currentHolder.characterName) + ' (since ' + plan.currentHolder.startYear + ')' : '<strong>Current Holder:</strong> Vacant') +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">' + crownIcon + ' Succession Candidates (' + plan.candidates.length + ')</div>' +
                '<div style="max-height: 250px; overflow-y: auto; background: var(--bg3); padding: 8px; border-radius: 4px;">' +
                candidatesHtml +
                '</div>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Candidates are ranked by experience, age, and rank. "Ready" indicates age >= 25 and experience >= 5 years.' +
                '</div>';

            _openModal({
                title: 'Succession Plan: ' + plan.positionName,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. ASSIGNMENT STATISTICS MODAL
    // =========================================================================

    function openAssignmentStatsModal(departmentId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var stats = GovernmentAssignment.analyzeAssignmentHistory(departmentId);
            if (!stats) {
                _showToast('Statistics not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            var byPositionHtml = '';
            var positionKeys = Object.keys(stats.byPosition);
            if (positionKeys.length > 0) {
                for (var i = 0; i < positionKeys.length; i++) {
                    var posId = positionKeys[i];
                    var position = GovernmentState.getPositionById(departmentId, posId);
                    var count = stats.byPosition[posId];
                    byPositionHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.55rem; border-bottom: 1px solid var(--border-light);">' +
                        '<span>' + (position ? _escapeHtml(position.name) : posId) + '</span>' +
                        '<span>' + count + '</span>' +
                        '</div>';
                }
            } else {
                byPositionHtml = '<div style="font-size: 0.55rem; color: var(--dim); text-align: center;">No positions with assignments</div>';
            }

            var byYearHtml = '';
            var yearKeys = Object.keys(stats.byYear).sort();
            if (yearKeys.length > 0) {
                for (var i = 0; i < yearKeys.length; i++) {
                    var year = yearKeys[i];
                    var count = stats.byYear[year];
                    byYearHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.55rem; border-bottom: 1px solid var(--border-light);">' +
                        '<span>' + year + '</span>' +
                        '<span>' + count + '</span>' +
                        '</div>';
                }
            } else {
                byYearHtml = '<div style="font-size: 0.55rem; color: var(--dim); text-align: center;">No assignments recorded</div>';
            }

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Assignments</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + stats.totalAssignments + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Active</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">' + stats.activeAssignments + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Avg Tenure</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + stats.averageTenure + 'y</div>' +
                '</div>' +
                '</div>' +
                (stats.longestServing ? '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; margin-bottom: 12px; font-size: 0.6rem;">' +
                    '<span style="color: var(--dim);">Longest Serving:</span> ' + _escapeHtml(stats.longestServing.characterName) +
                    ' (' + stats.longestServing.tenure + ' years, ' + stats.longestServing.startYear + ' - ' + stats.longestServing.endYear + ')' +
                    '</div>' : '') +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">By Position</div>' +
                byPositionHtml +
                '</div>' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">By Year</div>' +
                byYearHtml +
                '</div>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Department: ' + _escapeHtml(stats.departmentName) +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Assignment Statistics',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openBulkAssignModal = openBulkAssignModal;
    window.openAssignmentHistoryModal = openAssignmentHistoryModal;
    window.openSuccessionPlanningModal = openSuccessionPlanningModal;
    window.openAssignmentStatsModal = openAssignmentStatsModal;

})();