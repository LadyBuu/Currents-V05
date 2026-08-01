/**
 * =============================================================================
 * RANK MANAGER TAB (js/tabs/rank-manager-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing ranks.
 * REUSES existing modals from modals-rank.js
 * INCLUDES Issues detection with selectable fixes
 * 
 * DEPENDENCIES:
 *   - RankState (from rank-state.js)
 *   - RankQueries (from rank-queries.js)
 *   - RankCommands (from rank-commands.js)
 *   - RankIssues (from rank-issues.js)
 *   - modals-rank.js (RankModals.openCreateRankModal, openEditRankModal, openRankDetailsModal)
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _getIcon, _showToast)
 *   - ui.js (registerTabRenderer)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;
    var _rendering = false;
    var _registered = false;

    // =========================================================================
    // DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _getAllRanks() {
        if (typeof RankQueries !== 'undefined' && RankQueries.getAllRanks) {
            return RankQueries.getAllRanks();
        }
        if (typeof window.getRanks === 'function') {
            return window.getRanks();
        }
        if (window.masterData && window.masterData.data && window.masterData.data.ranks) {
            return window.masterData.data.ranks;
        }
        return [];
    }

    function _getRankHolderCount(rankId) {
        if (typeof RankQueries !== 'undefined' && RankQueries.getRankHolderCount) {
            return RankQueries.getRankHolderCount(rankId, false);
        }
        return 0;
    }

    function _getRankLevelName(priority) {
        if (typeof RankQueries !== 'undefined' && RankQueries.getRankLevelName) {
            return RankQueries.getRankLevelName(priority);
        }
        var levels = {
            1: 'Sovereign',
            2: 'High Noble',
            3: 'Noble',
            4: 'Gentry',
            5: 'Commoner'
        };
        return levels[priority] || 'Level ' + priority;
    }

    function _invalidateCache() {
        if (typeof RankState !== 'undefined' && RankState.invalidateCache) {
            RankState.invalidateCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
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

    // =========================================================================
    // OPEN ISSUES MODAL - WITH CHECKBOXES AND FIX ALL
    // =========================================================================

    function openIssuesModal(containerId) {
        if (typeof RankIssues === 'undefined' || typeof RankIssues.checkAll !== 'function') {
            _showToast('RankIssues system not available', 'error');
            return;
        }

        var results = RankIssues.checkAll();
        
        if (!results.success) {
            _showToast('Failed to check issues: ' + (results.error || 'Unknown error'), 'error');
            return;
        }

        var issues = results.issues || [];
        var issueCount = issues.length;
        var errorCount = results.bySeverity?.error?.length || 0;
        var warningCount = results.bySeverity?.warning?.length || 0;

        if (issueCount === 0) {
            _showToast('No rank issues found', 'success');
            renderRankList(containerId);
            return;
        }

        // Build issue list HTML using CSS classes
        var issueHtml = '';
        var hasFixable = false;

        for (var i = 0; i < issues.length; i++) {
            var issue = issues[i];
            var isFixable = issue.fix && typeof issue.fix === 'function';
            if (isFixable) hasFixable = true;
            
            var severityClass = issue.severity === 'error' ? 'error' : 
                               (issue.severity === 'warning' ? 'warning' : 'info');
            var severityIcon = issue.severity === 'error' ? _getIconSafe('X_HEAVY') : 
                              (issue.severity === 'warning' ? _getIconSafe('WARNING') : _getIconSafe('CIRCLE_DOT'));
            
            issueHtml +=
                '<div class="issue-item">' +
                (isFixable ? 
                    '<input type="checkbox" class="issue-checkbox" data-index="' + i + '" checked>' :
                    '<span class="no-check">—</span>'
                ) +
                '<div class="content">' +
                '<div class="title">' +
                '<span class="severity ' + severityClass + '">' + severityIcon + ' ' + (issue.severity || 'info').toUpperCase() + '</span> ' +
                _escapeHtml(issue.type || 'Issue') +
                '</div>' +
                '<div class="message">' + _escapeHtml(issue.message) + '</div>' +
                (issue.rankName ? '<div class="meta">Rank: ' + _escapeHtml(issue.rankName) + '</div>' : '') +
                (issue.characterName ? '<div class="meta">Character: ' + _escapeHtml(issue.characterName) + '</div>' : '') +
                (issue.fixLabel ? '<div class="fix-label">Fix: ' + _escapeHtml(issue.fixLabel) + '</div>' : '') +
                (isFixable ? '' : '<div class="no-fix">Manual fix required</div>') +
                '</div>' +
                '</div>';
        }

        var modalContent =
            '<div class="issues-list">' +
            '<div class="issues-toolbar">' +
            '<div class="summary">' +
            '<span style="font-weight:bold;">' + issueCount + '</span> issues found' +
            (errorCount > 0 ? ' · <span class="error-count">' + errorCount + ' errors</span>' : '') +
            (warningCount > 0 ? ' · <span class="warning-count">' + warningCount + ' warnings</span>' : '') +
            '</div>' +
            '<div class="actions">' +
            '<button id="issuesSelectAllBtn" class="btn-sm">Select All</button>' +
            '<button id="issuesSelectNoneBtn" class="btn-sm">Select None</button>' +
            '</div>' +
            '</div>' +
            '<div style="margin-bottom:8px;font-size:0.55rem;color:var(--dim);">' +
            'Check the issues you want to fix. Uncheck to skip. Issues without a checkbox require manual intervention.' +
            '</div>' +
            issueHtml +
            '</div>';

        var modal = _openModal({
            title: 'Rank Issues (' + issueCount + ' found)',
            content: modalContent,
            confirmText: 'Fix Selected',
            cancelText: 'Cancel',
            onConfirm: function() {
                var checkboxes = document.querySelectorAll('.issue-checkbox:checked');
                var selectedIndices = [];
                for (var i = 0; i < checkboxes.length; i++) {
                    selectedIndices.push(parseInt(checkboxes[i].dataset.index));
                }

                if (selectedIndices.length === 0) {
                    _showToast('No issues selected to fix', 'warning');
                    return false;
                }

                var fixedCount = 0;
                var fixedErrors = 0;
                var fixedWarnings = 0;

                for (var j = 0; j < selectedIndices.length; j++) {
                    var idx = selectedIndices[j];
                    var issue = issues[idx];
                    if (issue.fix && typeof issue.fix === 'function') {
                        try {
                            var result = issue.fix();
                            if (result !== false) {
                                fixedCount++;
                                if (issue.severity === 'error') fixedErrors++;
                                else if (issue.severity === 'warning') fixedWarnings++;
                            }
                        } catch (e) {
                            // Silently handle individual fix failures
                        }
                    }
                }

                if (fixedCount > 0) {
                    if (typeof window.saveMasterData === 'function') {
                        window.saveMasterData(true);
                    }
                    _invalidateCache();
                    _closeTopModal();
                    _showToast('Fixed ' + fixedCount + ' issue(s) (' + fixedErrors + ' errors, ' + fixedWarnings + ' warnings)', 'success');
                    renderRankList(containerId);
                    return true;
                } else {
                    _showToast('No issues were fixed', 'info');
                    return false;
                }
            },
            onOpen: function() {
                var selectAllBtn = document.getElementById('issuesSelectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function() {
                        var checkboxes = document.querySelectorAll('.issue-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                        }
                    });
                }

                var selectNoneBtn = document.getElementById('issuesSelectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.addEventListener('click', function() {
                        var checkboxes = document.querySelectorAll('.issue-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                        }
                    });
                }
            }
        });

        return modal;
    }

    // =========================================================================
    // RENDER RANK LIST
    // =========================================================================

    function renderRankList(containerId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            _invalidateCache();

            var ranks = _getAllRanks();

            // Sort by priority then name
            ranks.sort(function(a, b) {
                var pa = a.priority || 5;
                var pb = b.priority || 5;
                if (pa !== pb) return pa - pb;
                return (a.name || '').localeCompare(b.name || '');
            });

            var html = '';

            // --- Toolbar with Add Rank and Fix Issues buttons ---
            html +=
                '<div class="tab-toolbar">' +
                '<div class="info">' +
                '<span class="count">' + ranks.length + '</span> ranks defined' +
                '</div>' +
                '<div class="actions">' +
                '<button id="fixRankIssuesBtn" class="btn warning">' +
                _getIcon('WARNING') + ' Fix Issues' +
                '</button>' +
                '<button id="addRankBtn" class="btn primary">' +
                _getIcon('PLUS') + ' Add Rank' +
                '</button>' +
                '</div>' +
                '</div>';

            if (ranks.length === 0) {
                html +=
                    '<div class="empty-state">' +
                    '<div class="icon">' + _getIcon('CIRCLE_DOT') + '</div>' +
                    '<div class="message">No ranks defined yet.</div>' +
                    '<div class="sub-message">Click "Add Rank" to create one.</div>' +
                    '</div>';
            } else {
                html +=
                    '<div class="table-container">' +
                    '<table class="data-table">' +
                    '<thead>' +
                    '<tr>' +
                    '<th class="center">Symbol</th>' +
                    '<th>Name</th>' +
                    '<th class="center">Level</th>' +
                    '<th class="center">Priority</th>' +
                    '<th class="center">Holders</th>' +
                    '<th class="center">Inheritance</th>' +
                    '<th class="center">Actions</th>' +
                    '</tr>' +
                    '</thead>' +
                    '<tbody>';

                for (var i = 0; i < ranks.length; i++) {
                    var rank = ranks[i];
                    var holderCount = _getRankHolderCount(rank.id);
                    var levelName = _getRankLevelName(rank.priority);
                    var symbol = rank.symbol || '⟡';
                    var inheritanceSource = rank.inheritanceSource || 'none';
                    var sourceRankName = '—';
                    if (rank.sourceRankId) {
                        var sourceRank = _getRankById(rank.sourceRankId);
                        if (sourceRank) sourceRankName = sourceRank.name;
                    }
                    
                    var inheritanceDisplay = inheritanceSource === 'none' ? '—' : 
                        (inheritanceSource === 'parent' ? 'Parent → ' + sourceRankName : 
                        (inheritanceSource === 'spouse' ? 'Spouse → ' + sourceRankName : inheritanceSource));

                    html +=
                        '<tr>' +
                        '<td class="symbol-cell">' + _escapeHtml(symbol) + '</td>' +
                        '<td class="name-cell">' + _escapeHtml(rank.name) + '</td>' +
                        '<td class="center dim-text">' + _escapeHtml(levelName) + '</td>' +
                        '<td class="center">' + (rank.priority || 5) + '</td>' +
                        '<td class="center">' +
                        (holderCount > 0 ?
                            '<span class="accent-text">' + holderCount + '</span>' :
                            '<span class="empty-badge">—</span>'
                        ) +
                        '</td>' +
                        '<td class="center dim-text">' + _escapeHtml(inheritanceDisplay) + '</td>' +
                        '<td class="actions-cell">' +
                        '<button class="rank-detail-btn action-btn" data-rank-id="' + rank.id + '">' +
                        _getIcon('CIRCLE_DOT') + ' Details' +
                        '</button>' +
                        '<button class="rank-edit-btn action-btn" data-rank-id="' + rank.id + '">' +
                        _getIcon('EDIT') + ' Edit' +
                        '</button>' +
                        '<button class="rank-delete-btn action-btn danger" data-rank-id="' + rank.id + '"' + (holderCount > 0 ? ' disabled' : '') + '>' +
                        _getIcon('X_HEAVY') + ' Delete' +
                        '</button>' +
                        '</td>' +
                        '</tr>';
                }

                html += '</tbody></table></div>';
            }

            container.innerHTML = html;

            // ============================================================
            // BUTTON HANDLERS
            // ============================================================

            // Fix Issues button
            var fixBtn = document.getElementById('fixRankIssuesBtn');
            if (fixBtn) {
                fixBtn.addEventListener('click', function() {
                    openIssuesModal(containerId);
                });
            }

            // Add Rank button
            var addBtn = document.getElementById('addRankBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function() {
                    if (typeof RankModals !== 'undefined' && RankModals.openCreateRankModal) {
                        RankModals.openCreateRankModal({
                            onComplete: function() {
                                renderRankList(containerId);
                            }
                        });
                    }
                });
            }

            // Detail buttons
            var detailBtns = container.querySelectorAll('.rank-detail-btn');
            for (var i = 0; i < detailBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var rankId = this.dataset.rankId;
                        if (typeof RankModals !== 'undefined' && RankModals.openRankDetailsModal) {
                            RankModals.openRankDetailsModal(rankId);
                        }
                    });
                })(detailBtns[i]);
            }

            // Edit buttons
            var editBtns = container.querySelectorAll('.rank-edit-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var rankId = this.dataset.rankId;
                        if (typeof RankModals !== 'undefined' && RankModals.openEditRankModal) {
                            RankModals.openEditRankModal(rankId, {
                                onComplete: function() {
                                    renderRankList(containerId);
                                }
                            });
                        }
                    });
                })(editBtns[i]);
            }

            // Delete buttons
            var deleteBtns = container.querySelectorAll('.rank-delete-btn:not([disabled])');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var rankId = this.dataset.rankId;
                        if (typeof RankCommands !== 'undefined' && RankCommands.deleteRank) {
                            var result = RankCommands.deleteRank(rankId);
                            if (result && result.success) {
                                _showToast('Rank deleted', 'info');
                                renderRankList(containerId);
                            } else {
                                _showToast('Failed to delete rank: ' + (result.error || 'Unknown error'), 'error');
                            }
                        }
                    });
                })(deleteBtns[i]);
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // TAB RENDERER (for ui.js tab system)
    // =========================================================================

    function tabRenderer(containerId, locationId, summary) {
        renderRankList(containerId);
    }

    // =========================================================================
    // REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerWithTabSystem() {
        if (_registered) return;
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('ranks', tabRenderer, false);
            _registered = true;
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init(containerId) {
        if (_initialized) return;
        _initialized = true;

        containerId = containerId || 'tab-ranks';

        registerWithTabSystem();

        if (!_registered && typeof window.registerTabRenderer !== 'function') {
            var checkInterval = setInterval(function() {
                if (typeof window.registerTabRenderer === 'function') {
                    clearInterval(checkInterval);
                    registerWithTabSystem();
                    if (document.getElementById(containerId)) {
                        renderRankList(containerId);
                    }
                }
            }, 100);
            setTimeout(function() {
                clearInterval(checkInterval);
            }, 5000);
            return;
        }

        var checkContainer = function() {
            var container = document.getElementById(containerId);
            if (container) {
                renderRankList(containerId);
                return;
            }
            setTimeout(checkContainer, 100);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkContainer);
        } else {
            setTimeout(checkContainer, 50);
        }
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.RankManager = {
        init: init,
        renderRankList: renderRankList,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem,
        openIssuesModal: openIssuesModal
    };

    if (document.getElementById('tab-ranks')) {
        init('tab-ranks');
    }

})();