/**
 * =============================================================================
 * STILL WATERS - RANK STATE (rank-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-state.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL rank data.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankState.getRank(id) - Get rank by ID
 *   - RankState.getAllRanks() - Get all ranks
 *   - RankState.getRanksByPriority(priority) - Get ranks by priority
 *   - RankState.getRankHierarchy() - Get hierarchical rank structure
 *   - RankState.getInheritanceRules() - Get all inheritance rules
 *   - RankState.getInheritanceRulesForRank(rankId) - Get rules for a rank
 *   - RankState.addRank(rankData) - Add a new rank
 *   - RankState.updateRank(rankId, updates) - Update a rank
 *   - RankState.deleteRank(rankId) - Delete a rank
 *   - RankState.addInheritanceRule(parentRankId, childRankId, minChildAge, order)
 *   - RankState.removeInheritanceRule(parentRankId, ruleIndex)
 *   - RankState.subscribe(callback) - Subscribe to state changes
 *   - RankState.invalidateCache() - Clear all caches
 * 
 * DEPENDENCIES:
 *   - ids.js: generateId
 *   - accessors.js: getRanks (via wrapper)
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingState = false;
    var _initialized = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getRanksFromMaster() {
        if (typeof window.getRanks === 'function') {
            return window.getRanks();
        }
        if (window.masterData && window.masterData.data) {
            return window.masterData.data.ranks || [];
        }
        return [];
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        ranks: {
            byId: new Map(),
            byPriority: new Map(),
            byName: new Map(),
            all: []
        },
        inheritanceRules: {},
        subscribers: [],
        lastUpdate: 0
    };

    // =========================================================================
    // 3. INITIALIZATION
    // =========================================================================

    function _initialize() {
        if (_initialized) return;

        try {
            var ranks = _getRanksFromMaster();
            _state.ranks.all = ranks.slice();

            // Build caches
            _state.ranks.byId = new Map();
            _state.ranks.byPriority = new Map();
            _state.ranks.byName = new Map();

            for (var i = 0; i < ranks.length; i++) {
                var rank = ranks[i];
                if (!rank || !rank.id) continue;

                _state.ranks.byId.set(rank.id, rank);

                if (rank.priority) {
                    if (!_state.ranks.byPriority.has(rank.priority)) {
                        _state.ranks.byPriority.set(rank.priority, []);
                    }
                    _state.ranks.byPriority.get(rank.priority).push(rank);
                }

                if (rank.name) {
                    _state.ranks.byName.set(rank.name.toLowerCase(), rank);
                }
            }

            // Sort priority lists
            for (var entry of _state.ranks.byPriority) {
                entry[1].sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            // Load inheritance rules
            if (window.masterData && window.masterData.data) {
                _state.inheritanceRules = window.masterData.data.rankInheritanceRules || {};
            }

            _state.lastUpdate = Date.now();
            _initialized = true;

        } catch (e) {
            // Silently handle initialization errors
        }
    }

    // =========================================================================
    // 4. PERSISTENCE
    // =========================================================================

    function _persistRanks() {
        try {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.ranks = _state.ranks.all;
                window.masterData.data.rankInheritanceRules = _state.inheritanceRules;
                _saveMasterData();
                _invalidateAccessorCaches();
            }
        } catch (e) {
            // Silently handle persistence errors
        }
    }

    // =========================================================================
    // 5. NOTIFICATION SYSTEM
    // =========================================================================

    function _notifySubscribers(event, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({ type: event, data: data, timestamp: Date.now() });
            } catch (e) {
                // Silently handle subscriber errors
            }
        }
    }

    // =========================================================================
    // 6. PUBLIC API - QUERIES
    // =========================================================================

    function getRank(rankId) {
        _initialize();
        return _state.ranks.byId.get(rankId) || null;
    }

    function getAllRanks() {
        _initialize();
        return _state.ranks.all.slice();
    }

    function getRanksByPriority(priority) {
        _initialize();
        var ranks = _state.ranks.byPriority.get(priority);
        return ranks ? ranks.slice() : [];
    }

    function getRankHierarchy() {
        _initialize();
        var ranks = _state.ranks.all;
        if (ranks.length === 0) return [];

        var rankMap = new Map();
        for (var i = 0; i < ranks.length; i++) {
            var rank = ranks[i];
            rankMap.set(rank.id, {
                ...rank,
                children: []
            });
        }

        for (var i = 0; i < ranks.length; i++) {
            var rank = ranks[i];
            var parentId = rank.parentRankId;
            if (parentId && rankMap.has(parentId)) {
                var parent = rankMap.get(parentId);
                var child = rankMap.get(rank.id);
                if (parent && child) {
                    parent.children.push(child);
                }
            }
        }

        var roots = [];
        for (var i = 0; i < ranks.length; i++) {
            var rank = ranks[i];
            var parentId = rank.parentRankId;
            if (!parentId || !rankMap.has(parentId)) {
                var node = rankMap.get(rank.id);
                if (node) roots.push(node);
            }
        }

        // Sort children recursively
        function sortNode(node) {
            if (node.children && node.children.length > 0) {
                node.children.sort(function(a, b) {
                    return (a.priority || 999) - (b.priority || 999);
                });
                for (var i = 0; i < node.children.length; i++) {
                    sortNode(node.children[i]);
                }
            }
        }

        for (var i = 0; i < roots.length; i++) {
            sortNode(roots[i]);
        }

        roots.sort(function(a, b) {
            return (a.priority || 999) - (b.priority || 999);
        });

        return roots;
    }

    function getInheritanceRules() {
        _initialize();
        return { ..._state.inheritanceRules };
    }

    function getInheritanceRulesForRank(rankId) {
        _initialize();
        var rules = _state.inheritanceRules[rankId];
        return rules ? rules.slice() : [];
    }

    function getRankCount() {
        _initialize();
        return _state.ranks.all.length;
    }

    // =========================================================================
    // 7. PUBLIC API - COMMANDS
    // =========================================================================

    function addRank(rankData) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var newRank = {
                id: _generateId('rank'),
                name: rankData.name || 'New Rank',
                priority: rankData.priority || 5,
                numbered: rankData.numbered || false,
                numberingType: rankData.numberingType || 'reign',
                numberingPrefix: rankData.numberingPrefix || '',
                numberingSuffix: rankData.numberingSuffix || '',
                symbol: rankData.symbol || '⟡',
                genderRestriction: rankData.genderRestriction || 'either',
                locationTypeId: rankData.locationTypeId || null,
                deprecateOnDeath: rankData.deprecateOnDeath || false,
                spouseInheritance: rankData.spouseInheritance || null,
                allowsMultipleSpouses: rankData.allowsMultipleSpouses || false,
                parentRankId: rankData.parentRankId || null,
                customSurnameRule: rankData.customSurnameRule || false,
                surnameConnector: rankData.surnameConnector || 'of',
                surnamePrefix: rankData.surnamePrefix || '',
                surnameSuffix: rankData.surnameSuffix || '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Prevent self-parent
            if (newRank.parentRankId === newRank.id) {
                newRank.parentRankId = null;
            }

            _state.ranks.all.push(newRank);
            _state.ranks.byId.set(newRank.id, newRank);

            if (newRank.priority) {
                if (!_state.ranks.byPriority.has(newRank.priority)) {
                    _state.ranks.byPriority.set(newRank.priority, []);
                }
                _state.ranks.byPriority.get(newRank.priority).push(newRank);
                _state.ranks.byPriority.get(newRank.priority).sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            if (newRank.name) {
                _state.ranks.byName.set(newRank.name.toLowerCase(), newRank);
            }

            _state.lastUpdate = Date.now();
            _persistRanks();
            _notifySubscribers('rankAdded', { rank: newRank });

            return { success: true, data: newRank };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to add rank' };
        } finally {
            _processingState = false;
        }
    }

    function updateRank(rankId, updates) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var rank = _state.ranks.byId.get(rankId);
            if (!rank) {
                return { success: false, error: 'Rank not found' };
            }

            // Prevent self-parent
            if (updates.parentRankId === rankId) {
                updates.parentRankId = null;
            }

            // Update the rank
            var oldName = rank.name;
            var oldPriority = rank.priority;

            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    rank[key] = updates[key];
                }
            }
            rank.updatedAt = Date.now();

            // Update caches if name changed
            if (oldName && oldName !== rank.name) {
                _state.ranks.byName.delete(oldName.toLowerCase());
                if (rank.name) {
                    _state.ranks.byName.set(rank.name.toLowerCase(), rank);
                }
            }

            // Update caches if priority changed
            if (oldPriority !== rank.priority) {
                // Remove from old priority
                if (oldPriority && _state.ranks.byPriority.has(oldPriority)) {
                    var oldList = _state.ranks.byPriority.get(oldPriority);
                    var index = oldList.indexOf(rank);
                    if (index !== -1) {
                        oldList.splice(index, 1);
                    }
                }
                // Add to new priority
                if (rank.priority) {
                    if (!_state.ranks.byPriority.has(rank.priority)) {
                        _state.ranks.byPriority.set(rank.priority, []);
                    }
                    _state.ranks.byPriority.get(rank.priority).push(rank);
                    _state.ranks.byPriority.get(rank.priority).sort(function(a, b) {
                        return a.name.localeCompare(b.name);
                    });
                }
            }

            _state.lastUpdate = Date.now();
            _persistRanks();
            _notifySubscribers('rankUpdated', { rankId: rankId, rank: rank });

            return { success: true, data: rank };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to update rank' };
        } finally {
            _processingState = false;
        }
    }

    function deleteRank(rankId) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var rank = _state.ranks.byId.get(rankId);
            if (!rank) {
                return { success: false, error: 'Rank not found' };
            }

            // Remove from all caches
            _state.ranks.byId.delete(rankId);

            if (rank.name) {
                _state.ranks.byName.delete(rank.name.toLowerCase());
            }

            if (rank.priority && _state.ranks.byPriority.has(rank.priority)) {
                var list = _state.ranks.byPriority.get(rank.priority);
                var index = list.indexOf(rank);
                if (index !== -1) {
                    list.splice(index, 1);
                }
            }

            // Remove from all array
            var allIndex = _state.ranks.all.indexOf(rank);
            if (allIndex !== -1) {
                _state.ranks.all.splice(allIndex, 1);
            }

            // Remove from inheritance rules
            if (_state.inheritanceRules[rankId]) {
                delete _state.inheritanceRules[rankId];
            }
            for (var parentId in _state.inheritanceRules) {
                if (_state.inheritanceRules.hasOwnProperty(parentId)) {
                    _state.inheritanceRules[parentId] = _state.inheritanceRules[parentId].filter(function(rule) {
                        return rule.childRankId !== rankId;
                    });
                    if (_state.inheritanceRules[parentId].length === 0) {
                        delete _state.inheritanceRules[parentId];
                    }
                }
            }

            _state.lastUpdate = Date.now();
            _persistRanks();
            _notifySubscribers('rankDeleted', { rankId: rankId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to delete rank' };
        } finally {
            _processingState = false;
        }
    }

    function addInheritanceRule(parentRankId, childRankId, minChildAge, order) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            minChildAge = minChildAge || 0;
            order = order || 10;

            var parentRank = _state.ranks.byId.get(parentRankId);
            var childRank = _state.ranks.byId.get(childRankId);

            if (!parentRank || !childRank) {
                return { success: false, error: 'Parent or child rank not found' };
            }

            if (!_state.inheritanceRules[parentRankId]) {
                _state.inheritanceRules[parentRankId] = [];
            }

            // Check for duplicate
            var exists = _state.inheritanceRules[parentRankId].some(function(rule) {
                return rule.childRankId === childRankId;
            });
            if (exists) {
                return { success: false, error: 'Inheritance rule already exists' };
            }

            _state.inheritanceRules[parentRankId].push({
                childRankId: childRankId,
                childRankIdFemale: null,
                minChildAge: minChildAge,
                maxChildren: null,
                order: order
            });

            _state.inheritanceRules[parentRankId].sort(function(a, b) {
                return a.order - b.order;
            });

            _state.lastUpdate = Date.now();
            _persistRanks();
            _notifySubscribers('inheritanceRuleAdded', {
                parentRankId: parentRankId,
                childRankId: childRankId
            });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to add inheritance rule' };
        } finally {
            _processingState = false;
        }
    }

    function removeInheritanceRule(parentRankId, ruleIndex) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            if (!_state.inheritanceRules[parentRankId]) {
                return { success: false, error: 'No rules for this rank' };
            }

            if (ruleIndex < 0 || ruleIndex >= _state.inheritanceRules[parentRankId].length) {
                return { success: false, error: 'Invalid rule index' };
            }

            var removed = _state.inheritanceRules[parentRankId].splice(ruleIndex, 1);

            if (_state.inheritanceRules[parentRankId].length === 0) {
                delete _state.inheritanceRules[parentRankId];
            }

            _state.lastUpdate = Date.now();
            _persistRanks();
            _notifySubscribers('inheritanceRuleRemoved', {
                parentRankId: parentRankId,
                rule: removed[0]
            });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to remove inheritance rule' };
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 8. SUBSCRIPTION
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    // =========================================================================
    // 9. CACHE MANAGEMENT
    // =========================================================================

    function invalidateCache() {
        if (_processingState) return;
        _processingState = true;

        try {
            _initialized = false;
            _state.ranks.byId = new Map();
            _state.ranks.byPriority = new Map();
            _state.ranks.byName = new Map();
            _state.ranks.all = [];
            _state.inheritanceRules = {};
            _initialize();
            _notifySubscribers('cacheInvalidated', {});
        } catch (e) {
            // Silently handle
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RankState = {
        // Queries
        getRank: getRank,
        getAllRanks: getAllRanks,
        getRanksByPriority: getRanksByPriority,
        getRankHierarchy: getRankHierarchy,
        getInheritanceRules: getInheritanceRules,
        getInheritanceRulesForRank: getInheritanceRulesForRank,
        getRankCount: getRankCount,

        // Commands
        addRank: addRank,
        updateRank: updateRank,
        deleteRank: deleteRank,
        addInheritanceRule: addInheritanceRule,
        removeInheritanceRule: removeInheritanceRule,

        // Subscription
        subscribe: subscribe,

        // Cache
        invalidateCache: invalidateCache
    };

    // Legacy aliases
    window._rankState = window.RankState;

})();