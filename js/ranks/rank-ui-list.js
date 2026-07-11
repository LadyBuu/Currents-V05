/**
 * =============================================================================
 * STILL WATERS - RANK UI LIST (rank-ui-list.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-ui-list.js
 * 
 * This file contains rank list and hierarchy UI rendering.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankUI.renderRankList(containerId, options)
 *   - RankUI.renderRankHierarchy(containerId, options)
 *   - RankUI.renderRankTree(containerId, options)
 *   - RankUI.renderRankSelector(containerId, options)
 *   - RankUI.refreshAll()
 * 
 * DEPENDENCIES:
 *   - rank-queries.js: RankQueries
 *   - rank-commands.js: RankCommands
 *   - modals-rank.js: RankModals
 *   - formatting.js: escapeHtml
 *   - accessors.js: getCharacterById
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingRender = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openRankDetailsModal(rankId) {
        if (typeof window.RankModals !== 'undefined' && 
            typeof window.RankModals.openRankDetailsModal === 'function') {
            return window.RankModals.openRankDetailsModal(rankId);
        }
        return null;
    }

    function _openEditRankModal(rankId) {
        if (typeof window.RankModals !== 'undefined' && 
            typeof window.RankModals.openEditRankModal === 'function') {
            return window.RankModals.openEditRankModal(rankId);
        }
        return null;
    }

    // =========================================================================
    // 2. RENDER RANK LIST
    // =========================================================================

    function renderRankList(containerId, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var emptyMessage = options.emptyMessage || 'No ranks defined';

            var ranks = window.RankQueries.getAllRanks();

            if (!ranks || ranks.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.7rem;">' + 
                    _escapeHtml(emptyMessage) + 
                    '</div>' +
                    (showActions ? '<div style="text-align: center; margin-top: 12px;">' +
                        '<button id="rankListCreateBtn" class="btn" style="padding: 6px 16px; background: var(--accent); border: none; color: white; border-radius: 6px; cursor: pointer; font-size: 0.65rem;">' +
                        _getIconSafe('PLUS') + ' Create Rank' +
                        '</button>' +
                        '</div>' : '');
                return true;
            }

            // Sort by priority then name
            ranks.sort(function(a, b) {
                if (a.priority !== b.priority) return (a.priority || 999) - (b.priority || 999);
                return a.name.localeCompare(b.name);
            });

            var html = '<div class="rank-list">';

            // Group by priority
            var groups = {};
            for (var i = 0; i < ranks.length; i++) {
                var rank = ranks[i];
                var priority = rank.priority || 5;
                if (!groups[priority]) groups[priority] = [];
                groups[priority].push(rank);
            }

            var sortedPriorities = Object.keys(groups).sort(function(a, b) { return parseInt(a) - parseInt(b); });

            for (var p = 0; p < sortedPriorities.length; p++) {
                var priority = sortedPriorities[p];
                var levelName = window.RankQueries.getRankLevelName(parseInt(priority));
                var levelIcon = window.RankQueries.getRankLevelIcon(parseInt(priority));

                html +=
                    '<div style="margin-bottom: 8px;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim); padding: 4px 0; border-bottom: 1px solid var(--border-light);">' +
                    levelIcon + ' ' + levelName +
                    '</div>';

                var groupRanks = groups[priority];
                for (var i = 0; i < groupRanks.length; i++) {
                    var rank = groupRanks[i];
                    var holderCount = window.RankQueries.getRankHolderCount(rank.id, false);

                    html +=
                        '<div class="rank-item" style="' +
                        'display: flex;' +
                        'justify-content: space-between;' +
                        'align-items: center;' +
                        'padding: 6px 8px;' +
                        'margin: 2px 0;' +
                        'background: var(--bg3);' +
                        'border-radius: 4px;' +
                        'cursor: pointer;' +
                        'transition: background 0.2s;' +
                        '" data-rank-id="' + _escapeHtml(rank.id) + '">' +
                        '<div style="display: flex; align-items: center; gap: 8px;">' +
                        '<span style="font-size: 1rem;">' + (rank.symbol || '⟡') + '</span>' +
                        '<span style="font-size: 0.75rem;">' + _escapeHtml(rank.name) + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim);">(' + holderCount + ' holders)</span>' +
                        (rank.numbered ? '<span style="font-size: 0.5rem; color: var(--accent);">#</span>' : '') +
                        '</div>' +
                        (showActions ? '<div style="display: flex; gap: 4px;">' +
                            '<button class="rank-edit-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">' +
                            _getIconSafe('EDIT') + ' Edit' +
                            '</button>' +
                            '<button class="rank-detail-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Details</button>' +
                            '</div>' : '') +
                        '</div>';
                }

                html += '</div>';
            }

            if (showActions) {
                html +=
                    '<div style="text-align: center; margin-top: 12px;">' +
                    '<button id="rankListCreateBtn" class="btn" style="padding: 6px 16px; background: var(--accent); border: none; color: white; border-radius: 6px; cursor: pointer; font-size: 0.65rem;">' +
                    _getIconSafe('PLUS') + ' Create Rank' +
                    '</button>' +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.rank-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var rankId = item.dataset.rankId;
                    var detailBtn = item.querySelector('.rank-detail-btn');
                    var editBtn = item.querySelector('.rank-edit-btn');

                    if (detailBtn) {
                        detailBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openRankDetailsModal(rankId);
                        });
                    }

                    if (editBtn) {
                        editBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openEditRankModal(rankId);
                        });
                    }

                    item.addEventListener('click', function() {
                        _openRankDetailsModal(rankId);
                    });
                })(items[i]);
            }

            // Create button
            var createBtn = document.getElementById('rankListCreateBtn');
            if (createBtn && typeof window.RankModals !== 'undefined') {
                createBtn.addEventListener('click', function() {
                    window.RankModals.openCreateRankModal({
                        onComplete: function() {
                            renderRankList(containerId, options);
                        }
                    });
                });
            }

            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 3. RENDER RANK HIERARCHY
    // =========================================================================

    function renderRankHierarchy(containerId, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var emptyMessage = options.emptyMessage || 'No ranks defined';

            var hierarchy = window.RankQueries.getRankHierarchy();

            if (!hierarchy || hierarchy.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.7rem;">' + 
                    _escapeHtml(emptyMessage) + 
                    '</div>';
                return true;
            }

            function renderNode(node, depth) {
                depth = depth || 0;
                var indent = depth * 20;
                var prefix = depth === 0 ? '' : '│  ';

                var html = '<div class="rank-node" style="padding-left: ' + indent + 'px; margin: 2px 0;">';

                html +=
                    '<div class="rank-node-item" style="' +
                    'display: flex;' +
                    'justify-content: space-between;' +
                    'align-items: center;' +
                    'padding: 4px 8px;' +
                    'background: var(--bg3);' +
                    'border-radius: 4px;' +
                    'cursor: pointer;' +
                    'transition: background 0.2s;' +
                    '" data-rank-id="' + _escapeHtml(node.id) + '">' +
                    '<div style="display: flex; align-items: center; gap: 8px;">' +
                    (depth > 0 ? '<span style="color: var(--dim);">' + prefix + '</span>' : '') +
                    '<span style="font-size: 1rem;">' + (node.symbol || '⟡') + '</span>' +
                    '<span style="font-size: 0.75rem;">' + _escapeHtml(node.name) + '</span>' +
                    '</div>' +
                    (showActions ? '<div style="display: flex; gap: 4px;">' +
                        '<button class="rank-hierarchy-edit-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button>' +
                        '<button class="rank-hierarchy-detail-btn" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Details</button>' +
                        '</div>' : '') +
                    '</div>';

                if (node.children && node.children.length > 0) {
                    html += '<div class="rank-children" style="margin-top: 2px;">';
                    for (var i = 0; i < node.children.length; i++) {
                        html += renderNode(node.children[i], depth + 1);
                    }
                    html += '</div>';
                }

                html += '</div>';
                return html;
            }

            var html = '<div class="rank-hierarchy">';
            for (var i = 0; i < hierarchy.length; i++) {
                html += renderNode(hierarchy[i], 0);
            }
            html += '</div>';

            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.rank-node-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var rankId = item.dataset.rankId;
                    var detailBtn = item.querySelector('.rank-hierarchy-detail-btn');
                    var editBtn = item.querySelector('.rank-hierarchy-edit-btn');

                    if (detailBtn) {
                        detailBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openRankDetailsModal(rankId);
                        });
                    }

                    if (editBtn) {
                        editBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            _openEditRankModal(rankId);
                        });
                    }

                    item.addEventListener('click', function() {
                        _openRankDetailsModal(rankId);
                    });
                })(items[i]);
            }

            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 4. RENDER RANK TREE (Compact)
    // =========================================================================

    function renderRankTree(containerId, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var selectedId = options.selectedId || null;
            var onSelect = options.onSelect || null;
            var showHierarchy = options.showHierarchy !== undefined ? options.showHierarchy : true;

            var ranks = window.RankQueries.getAllRanks();

            if (!ranks || ranks.length === 0) {
                container.innerHTML = 
                    '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.7rem;">No ranks available</div>';
                return true;
            }

            ranks.sort(function(a, b) {
                if (a.priority !== b.priority) return (a.priority || 999) - (b.priority || 999);
                return a.name.localeCompare(b.name);
            });

            var html = '<div class="rank-tree" style="max-height: 300px; overflow-y: auto;">';

            if (showHierarchy) {
                var hierarchy = window.RankQueries.getRankHierarchy();

                function renderNode(node, depth) {
                    depth = depth || 0;
                    var indent = depth * 16;
                    var selected = (selectedId === node.id) ? 'background: var(--accent-dim); border-left: 3px solid var(--accent);' : '';

                    var html = '<div class="rank-tree-item" style="' +
                        'padding: 3px 8px;' +
                        'padding-left: ' + (indent + 8) + 'px;' +
                        'margin: 1px 0;' +
                        'border-radius: 3px;' +
                        'cursor: pointer;' +
                        'transition: background 0.15s;' +
                        selected +
                        '" data-rank-id="' + _escapeHtml(node.id) + '">' +
                        '<span style="font-size: 0.7rem;">' + (node.symbol || '⟡') + '</span> ' +
                        '<span style="font-size: 0.7rem;">' + _escapeHtml(node.name) + '</span>' +
                        '</div>';

                    if (node.children && node.children.length > 0) {
                        for (var i = 0; i < node.children.length; i++) {
                            html += renderNode(node.children[i], depth + 1);
                        }
                    }

                    return html;
                }

                for (var i = 0; i < hierarchy.length; i++) {
                    html += renderNode(hierarchy[i], 0);
                }
            } else {
                for (var i = 0; i < ranks.length; i++) {
                    var rank = ranks[i];
                    var selected = (selectedId === rank.id) ? 'background: var(--accent-dim); border-left: 3px solid var(--accent);' : '';
                    html += '<div class="rank-tree-item" style="' +
                        'padding: 3px 8px;' +
                        'margin: 1px 0;' +
                        'border-radius: 3px;' +
                        'cursor: pointer;' +
                        'transition: background 0.15s;' +
                        selected +
                        '" data-rank-id="' + _escapeHtml(rank.id) + '">' +
                        '<span style="font-size: 0.7rem;">' + (rank.symbol || '⟡') + '</span> ' +
                        '<span style="font-size: 0.7rem;">' + _escapeHtml(rank.name) + '</span>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            var items = container.querySelectorAll('.rank-tree-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    var rankId = item.dataset.rankId;
                    item.addEventListener('click', function() {
                        // Clear previous selection
                        var allItems = container.querySelectorAll('.rank-tree-item');
                        for (var j = 0; j < allItems.length; j++) {
                            allItems[j].style.background = '';
                            allItems[j].style.borderLeft = 'none';
                        }
                        this.style.background = 'var(--accent-dim)';
                        this.style.borderLeft = '3px solid var(--accent)';

                        if (onSelect) {
                            var rank = window.RankQueries.getRank(rankId);
                            if (rank) onSelect(rank);
                        }
                    });
                })(items[i]);
            }

            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 5. RENDER RANK SELECTOR (Dropdown)
    // =========================================================================

    function renderRankSelector(containerId, options) {
        if (_processingRender) return false;
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};
            var selectedId = options.selectedId || null;
            var placeholder = options.placeholder || 'Select a rank...';
            var includeEmpty = options.includeEmpty !== undefined ? options.includeEmpty : true;
            var filterFn = options.filterFn || null;

            var ranks = window.RankQueries.getAllRanks();

            if (filterFn && typeof filterFn === 'function') {
                ranks = ranks.filter(filterFn);
            }

            ranks.sort(function(a, b) {
                if (a.priority !== b.priority) return (a.priority || 999) - (b.priority || 999);
                return a.name.localeCompare(b.name);
            });

            var html = '<select class="rank-selector" style="' +
                'width: 100%;' +
                'padding: 6px 8px;' +
                'background: var(--bg);' +
                'border: 1px solid var(--border);' +
                'border-radius: 6px;' +
                'font-size: 0.7rem;' +
                'color: var(--text);' +
                '">';

            if (includeEmpty) {
                html += '<option value="">' + _escapeHtml(placeholder) + '</option>';
            }

            for (var i = 0; i < ranks.length; i++) {
                var rank = ranks[i];
                var selected = (selectedId === rank.id) ? 'selected' : '';
                html += '<option value="' + _escapeHtml(rank.id) + '" ' + selected + '>' +
                    (rank.symbol || '⟡') + ' ' + _escapeHtml(rank.name) +
                    '</option>';
            }

            html += '</select>';
            container.innerHTML = html;

            return true;

        } catch (e) {
            return false;
        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 6. REFRESH ALL
    // =========================================================================

    function refreshAll() {
        // Find all rank lists
        var lists = document.querySelectorAll('.rank-list');
        for (var i = 0; i < lists.length; i++) {
            var container = lists[i].parentElement;
            if (container && container.id) {
                renderRankList(container.id);
            }
        }

        // Find all rank hierarchies
        var hierarchies = document.querySelectorAll('.rank-hierarchy');
        for (var i = 0; i < hierarchies.length; i++) {
            var container = hierarchies[i].parentElement;
            if (container && container.id) {
                renderRankHierarchy(container.id);
            }
        }

        // Find all rank trees
        var trees = document.querySelectorAll('.rank-tree');
        for (var i = 0; i < trees.length; i++) {
            var container = trees[i].parentElement;
            if (container && container.id) {
                renderRankTree(container.id);
            }
        }

        // Find all rank selectors
        var selectors = document.querySelectorAll('.rank-selector');
        for (var i = 0; i < selectors.length; i++) {
            var container = selectors[i].parentElement;
            if (container && container.id) {
                renderRankSelector(container.id);
            }
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.RankUI = {
        renderRankList: renderRankList,
        renderRankHierarchy: renderRankHierarchy,
        renderRankTree: renderRankTree,
        renderRankSelector: renderRankSelector,
        refreshAll: refreshAll
    };

    // Legacy aliases
    window._rankUI = window.RankUI;

})();