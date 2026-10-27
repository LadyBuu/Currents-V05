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
 *     Indentation for the hierarchy is driven by data-depth, with CSS
 *     owning the pixel values.
 *   - Every interpolated string is escaped via window.escapeHtml, including
 *     rank symbols. formatting.js is a hard dependency.
 *   - Event handling is delegated: one listener per container, tracked in a
 *     WeakMap, replaced on re-render.
 *   - Rows are native <button> elements. Keyboard-accessible by default.
 *
 * REFRESH CONTRACT:
 *   Callers register containers via RankUI.registerContainer(containerId,
 *   kind, options). refreshAll() re-renders only registered containers. No
 *   DOM-walking heuristic.
 *
 * RETURN VALUE CONTRACT:
 *   Every renderer returns either an HTML string (on success) or null/false
 *   (on failure), consistently within its own API:
 *
 *     - renderRankList(container, options)          -> boolean
 *     - renderRankHierarchy(container, options)     -> boolean
 *     - renderRankTree(container, options)          -> boolean
 *     - renderRankSelector(container, options)      -> boolean
 *     - renderRankCard(rankId, container?, options?) -> string | null
 *     - renderRankStatistics(rankId, container?, options?) -> string | null
 *
 *   The list/hierarchy/tree/selector renderers write to a container and
 *   return true/false to signal whether the write occurred. The card and
 *   statistics renderers can either return HTML (when called without a
 *   container) or write to a container and return the HTML. Both return
 *   null when the rank is missing. This is the pattern Phase 7 fixed for
 *   renderRankStatistics (was false/html/true); it now matches
 *   renderRankCard.
 *
 * HIERARCHY CSS CONTRACT:
 *   The hierarchy renderer emits elements with class "rank-hierarchy-node"
 *   and attribute data-depth="N" (N is the nesting level, 0 for roots).
 *   Presentation is owned by CSS via rules such as:
 *
 *     .rank-hierarchy-node[data-depth="0"] { padding-left: 0; }
 *     .rank-hierarchy-node[data-depth="1"] { padding-left: 20px; }
 *     .rank-hierarchy-node[data-depth="2"] { padding-left: 40px; }
 *     .rank-hierarchy-node[data-depth="3"] { padding-left: 60px; }
 *     .rank-hierarchy-node[data-depth="4"] { padding-left: 80px; }
 *
 *   Deeper hierarchies (depth >= 5) can use a CSS variable approach:
 *
 *     .rank-hierarchy-node { padding-left: calc(var(--rank-depth, 0) * 20px); }
 *
 *   In the second case, the renderer must also emit
 *     style="--rank-depth: N"
 *   on the node. The current implementation uses explicit data-depth and
 *   relies on CSS rules for depths 0-4 (the practical maximum for a rank
 *   hierarchy). If the world ever supports deeper hierarchies, extend the
 *   CSS rules or switch to the variable approach.
 *
 *   The previous revision emitted style="margin-left: Npx" on every node,
 *   which violated the file's own no-inline-styles policy. The data-depth
 *   approach restores the policy and makes the indentation themeable.
 *
 * DEPENDENCIES (REQUIRED, load-time):
 *   - rank-queries.js  (RankQueries)
 *   - rank-state.js    (RankState)
 *   - formatting.js    (escapeHtml) — was previously optional with a local
 *                       fallback; the fallback has been removed.
 *   - icons.js         (Icons)
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - modals-rank.js   (RankModals) — for default click handlers. If
 *                       absent, the default click handler is a no-op for
 *                       'edit' and 'details', and the caller must supply
 *                       its own onAction handlers.
 *
 * ICON POLICY: Uses icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - _escapeHtml given a three-tier fallback (escapeHtml -> _escapeHtml
 *       -> local implementation). This was a defensive pattern that hid
 *       a missing formatting.js behind a silent local copy.
 *   Current revision (Phase 7):
 *     - formatting.js promoted to a hard load-time dependency.
 *       _escapeHtml deleted; _esc now calls window.escapeHtml directly.
 *     - _renderHierarchyNode replaces style="margin-left: Npx" with
 *       data-depth="N". CSS owns the indentation. See HIERARCHY CSS
 *       CONTRACT in the header.
 *     - renderRankStatistics return value normalized: was false on
 *       missing rank, HTML when container omitted, true when written to
 *       container. Now: null on missing rank, HTML in all success cases.
 *       Matches renderRankCard.
 *     - Header PRESENTATION CONTRACT, RETURN VALUE CONTRACT, and
 *       HIERARCHY CSS CONTRACT sections added.
 *     - No public signature change for existing renderers.
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
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'rank-ui-list.js requires formatting.js (escapeHtml missing).'
        );
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

    function _esc(v) {
        return window.escapeHtml(_isMissing(v) ? '' : String(v));
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
                return renderRankCard(entry.options.rankId, containerId, entry.options) !== null;
            case 'stats':
                return renderRankStatistics(entry.options.rankId, containerId, entry.options) !== null;
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
    //
    // Return value:
    //   - null             when the rank does not exist
    //   - HTML string      on success (both container and no-container forms)

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
    //
    // Indentation is owned by CSS via the data-depth attribute. See
    // HIERARCHY CSS CONTRACT in the header.

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

        // Indentation via data-depth; CSS rules own the pixel values.
        var html = '<div class="rank-hierarchy-node" ' +
            'data-depth="' + _esc(depth) + '">' +
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
    //
    // Return value:
    //   - null          when the rank does not exist or container is invalid
    //   - HTML string   on success (both container and no-container forms)
    //
    // Matches renderRankCard. The previous revision returned false for the
    // missing-rank case, HTML for the no-container case, and true for the
    // written-to-container case — three different shapes for the same
    // operation.

    function renderRankStatistics(rankId, containerOrId, options) {
        options = options || {};
        if (!_hasId(rankId)) return null;

        var rank = RQ.getRank(rankId);
        if (!rank) return null;

        var stats = RQ.getRankHolderStats(rankId);

        var html = '<div class="rank-stats">' +
            '<div class="rank-stats__title">' + _esc(rank.name) + '</div>' +
            _renderStatsGrid(stats) +
        '</div>';

        if (containerOrId === undefined) {
            return html;
        }

        var container = _resolveContainer(containerOrId);
        if (!container) return null;

        container.innerHTML = html;

        if (options.autoRegister !== false && typeof containerOrId === 'string') {
            registerContainer(containerOrId, 'stats', Object.assign({}, options, {
                rankId: rankId
            }));
        }
        return html;
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
