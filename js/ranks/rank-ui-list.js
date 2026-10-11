/**
 * =============================================================================
 * STILL WATERS - RANK UI LIST (rank-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-ui-list.js
 *
 * Rendering for rank lists, cards, hierarchies, trees, selectors, and stats.
 *
 * This file:
 *   - renders a flat rank list (grouped by priority level)
 *   - renders a single rank card
 *   - renders the rank hierarchy as a tree of nodes
 *   - renders a compact rank tree (used as a picker)
 *   - renders a rank select dropdown
 *   - renders per-rank holder statistics
 *   - refreshes any registered container on demand
 *
 * This file does NOT:
 *   - read live rank records (goes through RankQueries / RankState clones)
 *   - mutate state (goes through RankModals / RankCommands from click handlers)
 *   - compute holder statistics (RankQueries.getRankHolderStats does)
 *   - resolve level names (RankQueries.getRankLevelName does)
 *   - resolve level icons (RankQueries.getRankLevelIcon does, which routes
 *     through icons.js)
 *
 * PRESENTATION CONTRACT:
 *   - No emojis. Icons come from Icons.NAME via _icon(). Missing icon throws.
 *   - No inline style attributes. Every element carries a semantic class.
 *   - Every interpolated string is escaped, including rank symbols.
 *   - Event handling is delegated: one listener per container, tracked in a
 *     WeakMap, replaced on re-render.
 *   - Rows are native <button> elements. Keyboard-accessible by default.
 *
 * REFRESH CONTRACT:
 *   Callers register containers via RankUI.registerContainer(containerId,
 *   kind, options). refreshAll() re-renders only registered containers. No
 *   DOM-walking heuristic.
 *
 * DEPENDENCIES (REQUIRED):
 *   - rank-queries.js       (RankQueries)
 *   - rank-state.js         (RankState)
 *   - icons.js              (Icons)
 *   - formatting.js         (escapeHtml, or _escapeHtml)
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - modals-rank.js        (RankModals) — for click handlers
 *   - character-queries.js  (CharacterQueries) — not used here
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RankQueries) {
        throw new Error('rank-ui-list.js requires rank-queries.js to load first.');
    }
    if (!window.RankState) {
        throw new Error('rank-ui-list.js requires rank-state.js to load first.');
    }
    if (!window.Icons) {
        throw new Error('rank-ui-list.js requires icons.js to load first.');
    }

    var RQ = window.RankQueries;
    var RS = window.RankState;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _esc(v) {
        return _escapeHtml(_isMissing(v) ? '' : String(v));
    }

    function _icon(name) {
        if (!window.Icons || typeof window.Icons[name] !== 'string') {
            throw new Error('rank-ui-list.js: unknown icon "' + name + '".');
        }
        return window.Icons[name];
    }

    function _levelIcon(priority) {
        // Returns SVG markup or an empty string. RankQueries delegates to
        // icons.js getRankLevelIcon; if that helper is absent, this returns
        // empty and the level name alone is shown.
        if (typeof RQ.getRankLevelIcon === 'function') {
            var icon = RQ.getRankLevelIcon(priority);
            return typeof icon === 'string' ? icon : '';
        }
        return '';
    }

    function _resolveContainer(containerOrId) {
        if (_isMissing(containerOrId)) return null;
        if (typeof containerOrId === 'string') {
            return document.getElementById(containerOrId);
        }
        if (containerOrId.nodeType === 1) return containerOrId;
        return null;
    }

    function _rankLevelSortKey(rank) {
        var p = rank && typeof rank.priority === 'number' ? rank.priority : 999;
        return p;
    }

    function _sortRanks(list) {
        return list.slice().sort(function (a, b) {
            var ap = _rankLevelSortKey(a);
            var bp = _rankLevelSortKey(b);
            if (ap !== bp) return ap - bp;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    }

    function _getModals() {
        if (typeof window.RankModals === 'undefined') return null;
        return window.RankModals;
    }

    // =========================================================================
    // 3. DELEGATED CLICK HANDLING
    // =========================================================================
    //
    // One click listener per container, tracked via WeakMap. On re-render the
    // previous listener is removed and a fresh one is installed. This avoids
    // the classic "listener stacking" bug when refreshAll runs.

    var _containerHandlers = new WeakMap();

    function _clearDelegatedHandler(container) {
        var previous = _containerHandlers.get(container);
        if (previous) {
            container.removeEventListener('click', previous);
            _containerHandlers.delete(container);
        }
    }

    function _installDelegatedHandler(container, actionMap) {
        _clearDelegatedHandler(container);

        function handleClick(event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            var element = target.closest('[data-rank-action]');
            if (!element || !container.contains(element)) return;

            var action = element.getAttribute('data-rank-action');
            var rankId = element.getAttribute('data-rank-id');
            if (!action) return;

            var handler = actionMap[action];
            if (typeof handler !== 'function') return;

            handler(rankId, element, event);
        }

        container.addEventListener('click', handleClick);
        _containerHandlers.set(container, handleClick);
    }

    // =========================================================================
    // 4. DEFAULT ACTION MAP
    // =========================================================================
    //
    // Used when the caller does not supply its own onAction handlers. Opens
    // the corresponding modal from RankModals, if present.

    function _defaultActionMap() {
        var modals = _getModals();
        return {
            details: function (rankId) {
                if (modals && typeof modals.openRankDetailsModal === 'function') {
                    modals.openRankDetailsModal(rankId);
                }
            },
            edit: function (rankId) {
                if (modals && typeof modals.openEditRankModal === 'function') {
                    modals.openEditRankModal(rankId);
                }
            },
            select: function (rankId) {
                // No-op default. Callers that use the tree/selector register
                // their own 'select' handler.
            }
        };
    }

    // =========================================================================
    // 5. CONTAINER REGISTRY
    // =========================================================================

    var _registeredContainers = new Map();
    // Map<containerId, { kind, options }>

    /**
     * Registers a container for refreshAll().
     *
     * kind: 'list' | 'hierarchy' | 'tree' | 'selector' | 'card' | 'stats'
     */
    function registerContainer(containerId, kind, options) {
        if (!_hasId(containerId)) return false;
        _registeredContainers.set(containerId, {
            kind: kind,
            options: options || {}
        });
        return true;
    }

    function unregisterContainer(containerId) {
        if (!_hasId(containerId)) return false;
        return _registeredContainers.delete(containerId);
    }

    /**
     * Refreshes a single registered container. Returns true on success.
     */
    function refresh(containerId) {
        if (!_hasId(containerId)) return false;
        var entry = _registeredContainers.get(containerId);
        if (!entry) return false;

        switch (entry.kind) {
            case 'list':
                return renderRankList(containerId, entry.options);
            case 'hierarchy':
                return renderRankHierarchy(containerId, entry.options);
            case 'tree':
                return renderRankTree(containerId, entry.options);
            case 'selector':
                return renderRankSelector(containerId, entry.options);
            case 'card':
                return renderRankCard(entry.options.rankId, containerId, entry.options);
            case 'stats':
                return renderRankStatistics(entry.options.rankId, containerId, entry.options);
            default:
                return false;
        }
    }

    /**
     * Refreshes every registered container. Containers whose elements are
     * no longer in the document are skipped and pruned from the registry.
     */
    function refreshAll() {
        var toPrune = [];
        _registeredContainers.forEach(function (entry, containerId) {
            var el = document.getElementById(containerId);
            if (!el) {
                toPrune.push(containerId);
                return;
            }
            refresh(containerId);
        });
        for (var i = 0; i < toPrune.length; i++) {
            _registeredContainers.delete(toPrune[i]);
        }
    }

    // =========================================================================
    // 6. RENDER — LIST
    // =========================================================================
    //
    // Groups ranks by priority level. Each row is a native <button> with
    // delegated click handling. Action buttons (Edit, Details) are nested
    // spans carrying data-rank-action; the delegated handler dispatches.

    function renderRankList(containerOrId, options) {
        options = options || {};
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        var showActions = options.showActions !== false;
        var showHolders = options.showHolders !== false;
        var showLevel = options.showLevel !== false;
        var emptyMessage = options.emptyMessage || 'No ranks defined';

        var ranks = RQ.getAllRanks();

        if (!ranks || ranks.length === 0) {
            container.innerHTML =
                '<div class="rank-empty">' + _esc(emptyMessage) + '</div>';
            _clearDelegatedHandler(container);
            if (options.autoRegister !== false && typeof containerOrId === 'string') {
                registerContainer(containerOrId, 'list', options);
            }
            return true;
        }

        ranks = _sortRanks(ranks);

        // Group by priority.
        var groups = {};
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            var p = (typeof r.priority === 'number') ? r.priority : 5;
            if (!groups[p]) groups[p] = [];
            groups[p].push(r);
        }

        var priorities = Object.keys(groups).map(function (k) {
            return parseInt(k, 10);
        }).filter(function (n) {
            return Number.isFinite(n);
        }).sort(function (a, b) { return a - b; });

        var html = '<div class="rank-list">';
        for (var pi = 0; pi < priorities.length; pi++) {
            var priority = priorities[pi];
            var levelName = RQ.getRankLevelName(priority);
            var levelIcon = _levelIcon(priority);

            html += '<div class="rank-level-group" data-priority="' + _esc(priority) + '">';
            if (showLevel) {
                html += '<div class="rank-level-header">' +
                    (levelIcon ? '<span class="rank-level-icon">' + levelIcon + '</span>' : '') +
                    '<span class="rank-level-name">' + _esc(levelName) + '</span>' +
                '</div>';
            }

            var groupRanks = groups[priority];
            for (var ri = 0; ri < groupRanks.length; ri++) {
                html += _renderListRow(groupRanks[ri], {
                    showActions: showActions,
                    showHolders: showHolders
                });
            }

            html += '</div>';
        }
        html += '</div>';

        container.innerHTML = html;

        // Delegate clicks.
        var actionMap = options.onAction || _defaultActionMap();
        _installDelegatedHandler(container, actionMap);

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'list', options);
        }

        return true;
    }

    function _renderListRow(rank, options) {
        var holderCount = 0;
        if (options.showHolders) {
            holderCount = RQ.getRankHolderCount(rank.id, false);
        }
        var symbol = rank.symbol || '⟡';

        return '<div class="rank-row" data-rank-id="' + _esc(rank.id) + '">' +
            '<button type="button" class="rank-row__main" ' +
                'data-rank-action="details" ' +
                'data-rank-id="' + _esc(rank.id) + '">' +
                '<span class="rank-row__symbol">' + _esc(symbol) + '</span>' +
                '<span class="rank-row__name">' + _esc(rank.name) + '</span>' +
                (rank.numbered === true
                    ? '<span class="rank-row__numbered-badge">#</span>'
                    : '') +
                (options.showHolders
                    ? '<span class="rank-row__holders">' +
                        _esc(holderCount) + ' holder' +
                        (holderCount === 1 ? '' : 's') +
                      '</span>'
                    : '') +
            '</button>' +
            (options.showActions
                ? '<div class="rank-row__actions">' +
                    '<button type="button" class="rank-row__action" ' +
                        'data-rank-action="edit" ' +
                        'data-rank-id="' + _esc(rank.id) + '">Edit</button>' +
                    '<button type="button" class="rank-row__action" ' +
                        'data-rank-action="details" ' +
                        'data-rank-id="' + _esc(rank.id) + '">Details</button>' +
                  '</div>'
                : '') +
        '</div>';
    }

    // =========================================================================
    // 7. RENDER — CARD
    // =========================================================================
    //
    // Single-rank card. Returns HTML string when called with just a rank id,
    // or renders into a container when called with (rankId, containerOrId).

    function renderRankCard(rankId, containerOrId, options) {
        if (!_hasId(rankId)) return null;

        var rank = RQ.getRank(rankId);
        if (!rank) return null;

        var html = _buildCardHtml(rank, options || {});

        if (containerOrId === undefined) {
            return html;
        }

        var container = _resolveContainer(containerOrId);
        if (!container) return null;

        container.innerHTML = html;
        var actionMap = (options && options.onAction) || _defaultActionMap();
        _installDelegatedHandler(container, actionMap);

        if (options && options.autoRegister !== false
            && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'card', Object.assign({}, options, {
                rankId: rankId
            }));
        }
        return html;
    }

    function _buildCardHtml(rank, options) {
        var levelName = RQ.getRankLevelName(rank.priority);
        var levelIcon = _levelIcon(rank.priority);
        var stats = options.showStats === true
            ? RQ.getRankHolderStats(rank.id)
            : null;

        var html = '<div class="rank-card" data-rank-id="' + _esc(rank.id) + '">';

        html += '<div class="rank-card__header">' +
            '<div class="rank-card__symbol">' + _esc(rank.symbol || '⟡') + '</div>' +
            '<div class="rank-card__title">' +
                '<div class="rank-card__name">' + _esc(rank.name) + '</div>' +
                '<div class="rank-card__level">' +
                    (levelIcon ? '<span class="rank-card__level-icon">' +
                        levelIcon + '</span>' : '') +
                    '<span class="rank-card__level-name">' + _esc(levelName) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';

        var facts = [];
        facts.push(['Gender restriction',
            rank.genderRestriction && rank.genderRestriction !== 'either'
                ? rank.genderRestriction
                : 'either']);
        facts.push(['Numbered', rank.numbered === true ? 'Yes' : 'No']);
        if (rank.numbered === true) {
            facts.push(['Numbering',
                (rank.numberingType || 'reign') + ' / ' +
                (rank.numberingGroup || 'global')]);
        }
        facts.push(['Deprecates on death',
            rank.deprecateOnDeath === true ? 'Yes' : 'No']);
        facts.push(['Multiple spouses',
            rank.allowsMultipleSpouses === true ? 'Yes' : 'No']);

        html += '<dl class="rank-card__facts">';
        for (var i = 0; i < facts.length; i++) {
            html += '<div class="rank-card__fact">' +
                '<dt class="rank-card__fact-label">' + _esc(facts[i][0]) + '</dt>' +
                '<dd class="rank-card__fact-value">' + _esc(facts[i][1]) + '</dd>' +
            '</div>';
        }
        html += '</dl>';

        if (stats) {
            html += '<div class="rank-card__stats">' +
                _renderStatsGrid(stats) +
            '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. RENDER — HIERARCHY
    // =========================================================================
    //
    // Renders the parent-child rank hierarchy as a nested tree of nodes. Each
    // node is a native <button> carrying data-rank-action.

    function renderRankHierarchy(containerOrId, options) {
        options = options || {};
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        var showActions = options.showActions !== false;
        var emptyMessage = options.emptyMessage || 'No ranks defined';

        var hierarchy = RQ.getRankHierarchy();

        if (!hierarchy || hierarchy.length === 0) {
            container.innerHTML =
                '<div class="rank-empty">' + _esc(emptyMessage) + '</div>';
            _clearDelegatedHandler(container);
            if (options.autoRegister !== false && typeof containerOrId === 'string') {
                registerContainer(containerOrId, 'hierarchy', options);
            }
            return true;
        }

        var html = '<div class="rank-hierarchy">';
        for (var i = 0; i < hierarchy.length; i++) {
            html += _renderHierarchyNode(hierarchy[i], 0, showActions);
        }
        html += '</div>';

        container.innerHTML = html;

        var actionMap = options.onAction || _defaultActionMap();
        _installDelegatedHandler(container, actionMap);

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'hierarchy', options);
        }
        return true;
    }

    function _renderHierarchyNode(node, depth, showActions) {
        if (!node || !_hasId(node.id)) return '';

        var indent = depth * 20;
        var html = '<div class="rank-hierarchy-node" ' +
            'style="margin-left:' + indent + 'px;">' +
            '<div class="rank-hierarchy-row">' +
                '<button type="button" class="rank-hierarchy-row__main" ' +
                    'data-rank-action="details" ' +
                    'data-rank-id="' + _esc(node.id) + '">' +
                    '<span class="rank-hierarchy-row__symbol">' +
                        _esc(node.symbol || '⟡') + '</span>' +
                    '<span class="rank-hierarchy-row__name">' +
                        _esc(node.name) + '</span>' +
                '</button>' +
                (showActions
                    ? '<div class="rank-hierarchy-row__actions">' +
                        '<button type="button" class="rank-hierarchy-row__action" ' +
                            'data-rank-action="edit" ' +
                            'data-rank-id="' + _esc(node.id) + '">Edit</button>' +
                      '</div>'
                    : '') +
            '</div>';

        if (node.children && node.children.length > 0) {
            html += '<div class="rank-hierarchy-children">';
            for (var i = 0; i < node.children.length; i++) {
                html += _renderHierarchyNode(node.children[i], depth + 1, showActions);
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. RENDER — TREE (compact picker)
    // =========================================================================
    //
    // A denser version of the hierarchy. Used as a picker. The 'select'
    // action is dispatched to the caller via options.onSelect. Does not fall
    // back to a modal.

    function renderRankTree(containerOrId, options) {
        options = options || {};
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        var selectedId = options.selectedId || null;
        var emptyMessage = options.emptyMessage || 'No ranks available';

        var ranks = RQ.getAllRanks();
        if (!ranks || ranks.length === 0) {
            container.innerHTML =
                '<div class="rank-empty">' + _esc(emptyMessage) + '</div>';
            _clearDelegatedHandler(container);
            if (options.autoRegister !== false && typeof containerOrId === 'string') {
                registerContainer(containerOrId, 'tree', options);
            }
            return true;
        }

        ranks = _sortRanks(ranks);

        var html = '<div class="rank-tree">';
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            var selected = r.id === selectedId;
            html += '<button type="button" class="rank-tree-item' +
                (selected ? ' rank-tree-item--selected' : '') + '" ' +
                'data-rank-action="select" ' +
                'data-rank-id="' + _esc(r.id) + '">' +
                '<span class="rank-tree-item__symbol">' +
                    _esc(r.symbol || '⟡') + '</span>' +
                '<span class="rank-tree-item__name">' + _esc(r.name) + '</span>' +
            '</button>';
        }
        html += '</div>';

        container.innerHTML = html;

        var onSelect = typeof options.onSelect === 'function'
            ? options.onSelect
            : null;

        var actionMap = {
            select: function (rankId, element) {
                // Clear the previous selection's class, set this one's.
                var items = container.querySelectorAll('.rank-tree-item');
                for (var i = 0; i < items.length; i++) {
                    items[i].classList.remove('rank-tree-item--selected');
                }
                element.classList.add('rank-tree-item--selected');
                if (onSelect) {
                    var rank = RQ.getRank(rankId);
                    if (rank) onSelect(rank);
                }
            }
        };

        _installDelegatedHandler(container, actionMap);

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'tree', options);
        }
        return true;
    }

    // =========================================================================
    // 10. RENDER — SELECTOR (dropdown)
    // =========================================================================

    function renderRankSelector(containerOrId, options) {
        options = options || {};
        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        var selectedId = options.selectedId || '';
        var placeholder = options.placeholder || 'Select a rank...';
        var includeEmpty = options.includeEmpty !== false;
        var filterFn = typeof options.filterFn === 'function'
            ? options.filterFn
            : null;
        var onChange = typeof options.onChange === 'function'
            ? options.onChange
            : null;

        var ranks = RQ.getAllRanks();
        if (filterFn) ranks = ranks.filter(filterFn);
        ranks = _sortRanks(ranks);

        var html = '<select class="rank-selector" id="' +
            _esc(typeof containerOrId === 'string' ? containerOrId + '_select' : 'rank-selector') +
            '">';
        if (includeEmpty) {
            html += '<option value="">' + _esc(placeholder) + '</option>';
        }
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            var sel = r.id === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(r.id) + '"' + sel + '>' +
                _esc((r.symbol || '⟡') + ' ' + r.name) +
            '</option>';
        }
        html += '</select>';

        container.innerHTML = html;

        var select = container.querySelector('.rank-selector');
        if (select && onChange) {
            select.addEventListener('change', function () {
                var id = this.value;
                var rank = id ? RQ.getRank(id) : null;
                onChange(rank, id);
            });
        }

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'selector', options);
        }
        return true;
    }

    // =========================================================================
    // 11. RENDER — STATISTICS
    // =========================================================================

    function renderRankStatistics(rankId, containerOrId, options) {
        options = options || {};
        if (!_hasId(rankId)) return false;

        var rank = RQ.getRank(rankId);
        if (!rank) return false;

        var stats = RQ.getRankHolderStats(rankId);

        var html = '<div class="rank-stats">' +
            '<div class="rank-stats__title">' + _esc(rank.name) + '</div>' +
            _renderStatsGrid(stats) +
        '</div>';

        if (containerOrId === undefined) {
            return html;
        }

        var container = _resolveContainer(containerOrId);
        if (!container) return false;

        container.innerHTML = html;

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'stats', Object.assign({}, options, {
                rankId: rankId
            }));
        }
        return true;
    }

    function _renderStatsGrid(stats) {
        function cell(label, value, extra) {
            return '<div class="rank-stats__cell' +
                (extra ? ' ' + extra : '') + '">' +
                '<div class="rank-stats__cell-label">' + _esc(label) + '</div>' +
                '<div class="rank-stats__cell-value">' + _esc(value) + '</div>' +
            '</div>';
        }

        var html = '<div class="rank-stats__grid">';
        html += cell('Total', stats.total);
        html += cell('Living', stats.living);
        html += cell('Deceased', stats.deceased);
        html += cell('Male', stats.male);
        html += cell('Female', stats.female);
        if (stats.unknownGender > 0) {
            html += cell('Unknown gender', stats.unknownGender);
        }
        html += cell('Minors', stats.minors);
        html += cell('Adults', stats.adults);
        html += cell('Elders', stats.elders);
        if (stats.unknownAge > 0) {
            html += cell('Unknown age', stats.unknownAge);
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.RankUI = {
        // Renderers
        renderRankList: renderRankList,
        renderRankCard: renderRankCard,
        renderRankHierarchy: renderRankHierarchy,
        renderRankTree: renderRankTree,
        renderRankSelector: renderRankSelector,
        renderRankStatistics: renderRankStatistics,

        // Refresh
        refresh: refresh,
        refreshAll: refreshAll,
        registerContainer: registerContainer,
        unregisterContainer: unregisterContainer
    };

    // Legacy alias.
    window._rankUI = window.RankUI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankUI;
    }
})();
