/**
 * =============================================================================
 * STILL WATERS - RANK STATE (rank-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-state.js
 *
 * The authoritative in-memory store for rank records and inheritance rules.
 *
 * This is the SINGLE SOURCE OF TRUTH for the rank catalogue at runtime.
 *
 * EXPORTED FUNCTIONS:
 *   Lifecycle:
 *     - RankState.hydrateFromMasterData(ranks, inheritanceRules)
 *     - RankState.isHydrated()
 *
 *   Subscriptions:
 *     - RankState.subscribe(callback) -> unsubscribe
 *
 *   Reads (clones):
 *     - RankState.getAllRanks()
 *     - RankState.getRank(id)
 *     - RankState.getRanksByPriority(priority)
 *     - RankState.getRankHierarchy()
 *     - RankState.getRankCount()
 *     - RankState.getInheritanceRules()
 *     - RankState.getInheritanceRulesForRank(rankId)
 *
 *   Diagnostics:
 *     - RankState.validateIntegrity() -> { valid, errors }
 *
 *   Internal (for RankCommands only):
 *     - RankState._getRankCanonical(id)
 *     - RankState._getAllRanksCanonical()
 *     - RankState._addRank(rank)
 *     - RankState._updateRank(id, patch)
 *     - RankState._removeRank(id)
 *     - RankState._addInheritanceRule(parentRankId, rule)
 *     - RankState._removeInheritanceRule(parentRankId, ruleIndex)
 *     - RankState._setInheritanceRules(parentRankId, rules)
 *     - RankState._indexesRebuild()
 *
 * OWNERSHIP CONTRACT:
 *   RankState owns:
 *     - the in-memory rank array
 *     - the in-memory inheritance rules map
 *     - derived indexes (byId, byPriority, byName)
 *     - subscription notification
 *
 *   RankState does NOT own:
 *     - persistence format (storage.js owns bytes)
 *     - rank policy (rank-rules.js)
 *     - rank mutations (rank-commands.js)
 *     - numbering policy (rank-assignment.js)
 *     - level vocabulary (rank-constants.js)
 *     - character rank assignments (character record, via CharacterCommands)
 *
 * PERSISTENCE CONTRACT:
 *   State does not persist. Every mutation writes _state into
 *   masterData.data.ranks / masterData.data.rankInheritanceRules in memory,
 *   then calls window.markDataDirty(). Storage decides when to flush.
 *
 *   RankCommands.persist() calls window.saveMasterData() once per batch.
 *
 * INITIALISATION CONTRACT:
 *   Hydration is explicit. Bootstrap calls:
 *       RankState.hydrateFromMasterData(
 *           window.masterData.data.ranks || [],
 *           window.masterData.data.rankInheritanceRules || {}
 *       )
 *   once, before any query or command runs. Public readers throw if state
 *   has not been hydrated. Silent initialisation against an empty store is
 *   how "where did all the ranks go?" bugs are born.
 *
 *   Rehydration is allowed. Calling hydrateFromMasterData a second time
 *   replaces the in-memory catalogue with the supplied records. This is the
 *   supported path for masterDataUpdated reloads, test fixtures, and
 *   reset flows.
 *
 * READ CONTRACT:
 *   Public reads return clones. Container array and object fields on each
 *   rank (children on the hierarchy node, inheritance rules array) are
 *   copied. No public read returns a live canonical rank.
 *
 *   Authorized mutation code calls _getRankCanonical(id) for a live
 *   reference. This is reserved for RankCommands and must not be called by
 *   queries, UI, or cross-domain consumers.
 *
 * SEMANTIC RULES:
 *   - Missing rank -> null. Missing collection -> [].
 *   - Year 0 is preserved. Priority 0 is preserved.
 *   - Duplicate rank ids fail hydration loudly.
 *   - Structural shape errors in persisted records are repaired at the
 *     boundary (normaliseRank). Unknown fields are preserved on the record.
 *   - No recursion guards. Mutations are synchronous and side-effect
 *     explicit; a caller may chain state calls freely.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData, markDataDirty (markDataDirty is required at
 *                   mutation time only; storage.js must be loaded before
 *                   any mutation runs)
 *
 * DEPENDENCIES (NONE AT LOAD):
 *   This module has no load-time dependencies beyond window. It validates
 *   the presence of window.masterData at hydrate time and of
 *   window.markDataDirty at mutation time.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. PRIVATE STATE
    // =========================================================================

    var _ranks = [];              // canonical in-memory rank array
    var _inheritanceRules = {};   // { [parentRankId]: RankRule[] }

    var _cache = {
        byId: new Map(),
        byPriority: new Map(),
        byName: new Map()
    };

    var _subscribers = [];
    var _hydrated = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _requireMasterData() {
        if (typeof window.masterData === 'undefined'
            || !window.masterData
            || !window.masterData.data
            || typeof window.masterData.data !== 'object') {
            throw new Error(
                'rank-state.js: window.masterData is not initialised. ' +
                'storage.js must load and run before RankState.hydrateFromMasterData.'
            );
        }
    }

    function _markDataDirty() {
        if (typeof window.markDataDirty !== 'function') {
            throw new Error(
                'rank-state.js: window.markDataDirty is not available. ' +
                'storage.js must load before any rank mutation runs.'
            );
        }
        window.markDataDirty();
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isValidPriority(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (!Number.isInteger(v)) return false;
        if (v < 1 || v > 10) return false;
        return true;
    }

    // =========================================================================
    // 4. NORMALISATION
    // =========================================================================
    //
    // Runs on every record at hydrate time and again on every record written
    // through _addRank / _updateRank. Guarantees every rank in memory satisfies
    // the current field set. Unknown extra fields on an incoming record are
    // preserved (forward compatibility); known fields are coerced to the
    // correct shape.

    function _normaliseRank(raw) {
        var r = _isPlainObject(raw) ? raw : {};

        var priority = _isValidPriority(r.priority) ? r.priority : 5;

        var numberingType = r.numberingType;
        if (numberingType !== 'ordinal' && numberingType !== 'roman'
            && numberingType !== 'reign') {
            numberingType = 'reign';
        }

        var numberingGroup = r.numberingGroup;
        if (numberingGroup !== 'global' && numberingGroup !== 'parent'
            && numberingGroup !== 'spouse' && numberingGroup !== 'source') {
            numberingGroup = 'global';
        }

        var inheritanceSource = r.inheritanceSource;
        if (inheritanceSource !== 'none' && inheritanceSource !== 'parent'
            && inheritanceSource !== 'spouse') {
            inheritanceSource = 'none';
        }

        var genderRestriction = r.genderRestriction;
        if (genderRestriction !== 'either' && genderRestriction !== 'male'
            && genderRestriction !== 'female') {
            genderRestriction = 'either';
        }

        // Preserve every field we know about; carry forward unknown fields.
        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        out.id = _hasId(r.id) ? r.id : out.id;
        out.name = typeof r.name === 'string' ? r.name : 'New Rank';
        out.priority = priority;
        out.numbered = r.numbered === true;
        out.numberingType = numberingType;
        out.numberingGroup = numberingGroup;
        out.numberingPrefix = typeof r.numberingPrefix === 'string'
            ? r.numberingPrefix
            : '';
        out.numberingSuffix = typeof r.numberingSuffix === 'string'
            ? r.numberingSuffix
            : '';
        out.sourceRankId = _hasId(r.sourceRankId) ? r.sourceRankId : null;
        out.inheritanceSource = inheritanceSource;
        out.symbol = typeof r.symbol === 'string' && r.symbol.length > 0
            ? r.symbol
            : '⟡';
        out.genderRestriction = genderRestriction;
        out.locationTypeId = _hasId(r.locationTypeId) ? r.locationTypeId : null;
        out.deprecateOnDeath = r.deprecateOnDeath === true;
        out.spouseInheritance = _hasId(r.spouseInheritance)
            ? r.spouseInheritance
            : null;
        out.allowsMultipleSpouses = r.allowsMultipleSpouses === true;
        out.parentRankId = _hasId(r.parentRankId) ? r.parentRankId : null;
        out.customSurnameRule = r.customSurnameRule === true;
        out.surnameConnector = typeof r.surnameConnector === 'string'
            ? r.surnameConnector
            : 'of';
        out.surnamePrefix = typeof r.surnamePrefix === 'string'
            ? r.surnamePrefix
            : '';
        out.surnameSuffix = typeof r.surnameSuffix === 'string'
            ? r.surnameSuffix
            : '';
        out.createdAt = _isMissing(r.createdAt) ? null : r.createdAt;
        out.updatedAt = _isMissing(r.updatedAt) ? null : r.updatedAt;

        // Self-parent guard.
        if (out.parentRankId !== null && out.parentRankId === out.id) {
            out.parentRankId = null;
        }
        // Self-source guard.
        if (out.sourceRankId !== null && out.sourceRankId === out.id) {
            out.sourceRankId = null;
        }

        return out;
    }

    function _normaliseInheritanceRule(raw) {
        var r = _isPlainObject(raw) ? raw : {};
        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }
        out.childRankId = _hasId(r.childRankId) ? r.childRankId : null;
        out.childRankIdFemale = _hasId(r.childRankIdFemale)
            ? r.childRankIdFemale
            : null;
        out.minChildAge = (typeof r.minChildAge === 'number'
            && Number.isFinite(r.minChildAge) && r.minChildAge >= 0)
            ? r.minChildAge
            : 0;
        out.maxChildren = (typeof r.maxChildren === 'number'
            && Number.isFinite(r.maxChildren) && r.maxChildren >= 0)
            ? r.maxChildren
            : null;
        out.order = (typeof r.order === 'number' && Number.isFinite(r.order))
            ? r.order
            : 10;
        return out;
    }

    function _normaliseInheritanceRules(raw) {
        if (!_isPlainObject(raw)) return {};
        var out = {};
        for (var parentRankId in raw) {
            if (!Object.prototype.hasOwnProperty.call(raw, parentRankId)) continue;
            var list = raw[parentRankId];
            if (!Array.isArray(list)) continue;
            var cleaned = [];
            for (var i = 0; i < list.length; i++) {
                var rule = _normaliseInheritanceRule(list[i]);
                if (rule.childRankId === null
                    && rule.childRankIdFemale === null) continue;
                cleaned.push(rule);
            }
            if (cleaned.length > 0) out[parentRankId] = cleaned;
        }
        return out;
    }

    // =========================================================================
    // 5. CACHE REBUILD
    // =========================================================================

    function _indexesRebuild() {
        _cache.byId.clear();
        _cache.byPriority.clear();
        _cache.byName.clear();

        for (var i = 0; i < _ranks.length; i++) {
            var rank = _ranks[i];
            if (!rank || !_hasId(rank.id)) continue;

            _cache.byId.set(rank.id, rank);

            var priority = _isValidPriority(rank.priority) ? rank.priority : 5;
            if (!_cache.byPriority.has(priority)) {
                _cache.byPriority.set(priority, []);
            }
            _cache.byPriority.get(priority).push(rank);

            if (typeof rank.name === 'string' && rank.name.length > 0) {
                _cache.byName.set(rank.name.toLowerCase(), rank);
            }
        }

        // Sort each priority bucket by name.
        _cache.byPriority.forEach(function (list) {
            list.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        });
    }

    // =========================================================================
    // 6. PERSISTENCE SYNC (in-memory write only; no storage call)
    // =========================================================================
    //
    // After every mutation:
    //   - masterData.data.ranks is reassigned to a plain-array copy of _ranks
    //   - masterData.data.rankInheritanceRules is reassigned to a plain-object
    //     copy of _inheritanceRules
    //   - markDataDirty() is called
    //
    // Storage flushes on its own schedule. RankCommands.persist() forces a
    // synchronous flush when a caller wants one.

    function _syncToMasterData() {
        _requireMasterData();
        window.masterData.data.ranks = _ranks.slice();
        window.masterData.data.rankInheritanceRules = _cloneInheritanceRules(_inheritanceRules);
        _markDataDirty();
    }

    function _cloneInheritanceRules(source) {
        var out = {};
        for (var parentRankId in source) {
            if (!Object.prototype.hasOwnProperty.call(source, parentRankId)) continue;
            var list = source[parentRankId];
            if (!Array.isArray(list)) continue;
            var copy = [];
            for (var i = 0; i < list.length; i++) {
                copy.push(_normaliseInheritanceRule(list[i]));
            }
            out[parentRankId] = copy;
        }
        return out;
    }

    // =========================================================================
    // 7. NOTIFICATION
    // =========================================================================
    //
    // Synchronous and compositional. A subscriber may mutate state in
    // response to an event; that mutation will emit its own event. There is
    // no blanket suppression guard. If a cycle exists, it is solved at the
    // command/event boundary, not here.

    function _notify(type, data) {
        var subscribers = _subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i]({ type: type, data: data });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('rank-state.js: subscriber threw:', err);
                }
            }
        }
    }

    // =========================================================================
    // 8. HYDRATION
    // =========================================================================

    /**
     * Replaces the in-memory catalogue with the supplied records.
     *
     * Called by bootstrap once, before any query or command runs. May be
     * called again to rebuild state (masterDataUpdated, reset, tests).
     *
     * Throws on:
     *   - missing masterData
     *   - non-array ranks argument
     *   - non-object inheritanceRules argument (must be object or null)
     *   - duplicate rank ids
     *
     * @param {Array} ranks
     * @param {Object|null} inheritanceRules
     */
    function hydrateFromMasterData(ranks, inheritanceRules) {
        _requireMasterData();

        if (ranks === undefined || ranks === null) ranks = [];
        if (!Array.isArray(ranks)) {
            throw new Error(
                'rank-state.js: hydrateFromMasterData expected an array of ranks.'
            );
        }
        if (inheritanceRules === undefined || inheritanceRules === null) {
            inheritanceRules = {};
        }
        if (!_isPlainObject(inheritanceRules)) {
            throw new Error(
                'rank-state.js: hydrateFromMasterData expected a plain object for ' +
                'inheritance rules.'
            );
        }

        var seenIds = {};
        var next = [];
        for (var i = 0; i < ranks.length; i++) {
            var normalised = _normaliseRank(ranks[i]);
            if (!_hasId(normalised.id)) {
                throw new Error(
                    'rank-state.js: rank at index ' + i + ' has no id.'
                );
            }
            if (seenIds[normalised.id]) {
                throw new Error(
                    'rank-state.js: duplicate rank id "' + normalised.id + '".'
                );
            }
            seenIds[normalised.id] = true;
            next.push(normalised);
        }

        _ranks = next;
        _inheritanceRules = _normaliseInheritanceRules(inheritanceRules);
        _indexesRebuild();
        _hydrated = true;

        // Reflect the normalised catalogue back into masterData so the two
        // representations agree from the moment hydration finishes. No
        // markDataDirty: hydration is a read from storage, not a mutation.
        window.masterData.data.ranks = _ranks.slice();
        window.masterData.data.rankInheritanceRules =
            _cloneInheritanceRules(_inheritanceRules);
    }

    function isHydrated() {
        return _hydrated === true;
    }

    function _assertHydrated() {
        if (!_hydrated) {
            throw new Error(
                'rank-state.js: RankState.hydrateFromMasterData must be called ' +
                'before any read or write.'
            );
        }
    }

    // =========================================================================
    // 9. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('rank-state.js: subscribe expects a function.');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 10. PUBLIC READS (clones)
    // =========================================================================

    function _cloneRank(rank) {
        if (!rank) return null;
        var out = {};
        for (var key in rank) {
            if (!Object.prototype.hasOwnProperty.call(rank, key)) continue;
            var v = rank[key];
            if (Array.isArray(v)) {
                out[key] = v.slice();
            } else if (_isPlainObject(v)) {
                out[key] = Object.assign({}, v);
            } else {
                out[key] = v;
            }
        }
        return out;
    }

    function _cloneRankArray(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            out.push(_cloneRank(list[i]));
        }
        return out;
    }

    function getAllRanks() {
        _assertHydrated();
        return _cloneRankArray(_ranks);
    }

    function getRank(rankId) {
        _assertHydrated();
        if (!_hasId(rankId)) return null;
        return _cloneRank(_cache.byId.get(rankId) || null);
    }

    function getRanksByPriority(priority) {
        _assertHydrated();
        if (!_isValidPriority(priority)) return [];
        var list = _cache.byPriority.get(priority);
        return list ? _cloneRankArray(list) : [];
    }

    function getRankCount() {
        _assertHydrated();
        return _ranks.length;
    }

    // =========================================================================
    // 11. HIERARCHY
    // =========================================================================
    //
    // Returns roots (ranks with no parent, or with a parent that does not
    // exist) each carrying a `children` array. Nodes are clones. The
    // `children` array on each node is built fresh on every call.

    function getRankHierarchy() {
        _assertHydrated();

        if (_ranks.length === 0) return [];

        var nodeMap = new Map();
        for (var i = 0; i < _ranks.length; i++) {
            var rank = _ranks[i];
            var node = _cloneRank(rank);
            node.children = [];
            nodeMap.set(rank.id, node);
        }

        for (var j = 0; j < _ranks.length; j++) {
            var r = _ranks[j];
            var parentId = r.parentRankId;
            if (parentId && nodeMap.has(parentId)) {
                var parent = nodeMap.get(parentId);
                var child = nodeMap.get(r.id);
                if (parent && child) {
                    parent.children.push(child);
                }
            }
        }

        var roots = [];
        for (var k = 0; k < _ranks.length; k++) {
            var rr = _ranks[k];
            var pid = rr.parentRankId;
            if (!pid || !nodeMap.has(pid)) {
                var node = nodeMap.get(rr.id);
                if (node) roots.push(node);
            }
        }

        function sortNode(node) {
            if (node.children && node.children.length > 0) {
                node.children.sort(function (a, b) {
                    return (a.priority || 999) - (b.priority || 999)
                        || String(a.name || '').localeCompare(String(b.name || ''));
                });
                for (var i = 0; i < node.children.length; i++) {
                    sortNode(node.children[i]);
                }
            }
        }

        for (var m = 0; m < roots.length; m++) {
            sortNode(roots[m]);
        }

        roots.sort(function (a, b) {
            return (a.priority || 999) - (b.priority || 999)
                || String(a.name || '').localeCompare(String(b.name || ''));
        });

        return roots;
    }

    // =========================================================================
    // 12. INHERITANCE RULES (reads)
    // =========================================================================

    function getInheritanceRules() {
        _assertHydrated();
        return _cloneInheritanceRules(_inheritanceRules);
    }

    function getInheritanceRulesForRank(rankId) {
        _assertHydrated();
        if (!_hasId(rankId)) return [];
        var rules = _inheritanceRules[rankId];
        if (!Array.isArray(rules)) return [];
        var out = [];
        for (var i = 0; i < rules.length; i++) {
            out.push(_normaliseInheritanceRule(rules[i]));
        }
        return out;
    }

    // =========================================================================
    // 13. INTEGRITY DIAGNOSTIC
    // =========================================================================

    /**
     * Validates the in-memory rank catalogue.
     *
     * Checks:
     *   - every rank has a valid id
     *   - no duplicate ids
     *   - priority is 1..10
     *   - parentRankId, when set, points at an existing rank
     *   - sourceRankId, when set, points at an existing rank
     *   - no rank is its own parent
     *   - inheritanceRules reference existing parent and child ranks
     *   - inheritanceRules[parentId] is an array
     *
     * Returns { valid: boolean, errors: string[] }. Never throws.
     */
    function validateIntegrity() {
        if (!_hydrated) {
            return { valid: false, errors: ['state not hydrated'] };
        }

        var errors = [];
        var seenIds = {};
        var idSet = {};

        for (var i = 0; i < _ranks.length; i++) {
            var rank = _ranks[i];
            if (!rank || !_hasId(rank.id)) {
                errors.push('rank at index ' + i + ' has no id');
                continue;
            }
            if (seenIds[rank.id]) {
                errors.push('duplicate rank id "' + rank.id + '"');
            }
            seenIds[rank.id] = true;
            idSet[rank.id] = true;
        }

        for (var j = 0; j < _ranks.length; j++) {
            var r = _ranks[j];
            if (!r || !_hasId(r.id)) continue;

            if (!_isValidPriority(r.priority)) {
                errors.push('rank "' + r.id + '" has invalid priority: ' + r.priority);
            }

            if (r.parentRankId !== null && r.parentRankId !== undefined) {
                if (!idSet[r.parentRankId]) {
                    errors.push('rank "' + r.id + '" has non-existent parentRankId: ' +
                        r.parentRankId);
                }
            }

            if (r.sourceRankId !== null && r.sourceRankId !== undefined) {
                if (!idSet[r.sourceRankId]) {
                    errors.push('rank "' + r.id + '" has non-existent sourceRankId: ' +
                        r.sourceRankId);
                }
            }

            if (r.parentRankId === r.id) {
                errors.push('rank "' + r.id + '" is its own parent');
            }
            if (r.sourceRankId === r.id) {
                errors.push('rank "' + r.id + '" is its own source');
            }
        }

        for (var parentId in _inheritanceRules) {
            if (!Object.prototype.hasOwnProperty.call(_inheritanceRules, parentId)) {
                continue;
            }
            if (!idSet[parentId]) {
                errors.push('inheritanceRules references non-existent parent rank: ' +
                    parentId);
            }
            var rules = _inheritanceRules[parentId];
            if (!Array.isArray(rules)) {
                errors.push('inheritanceRules["' + parentId + '"] is not an array');
                continue;
            }
            for (var k = 0; k < rules.length; k++) {
                var rule = rules[k];
                if (!rule) continue;
                if (rule.childRankId !== null && rule.childRankId !== undefined
                    && !idSet[rule.childRankId]) {
                    errors.push('inheritanceRules["' + parentId + '"][' + k +
                        '] references non-existent childRankId: ' + rule.childRankId);
                }
                if (rule.childRankIdFemale !== null
                    && rule.childRankIdFemale !== undefined
                    && !idSet[rule.childRankIdFemale]) {
                    errors.push('inheritanceRules["' + parentId + '"][' + k +
                        '] references non-existent childRankIdFemale: ' +
                        rule.childRankIdFemale);
                }
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 14. INTERNAL CANONICAL ACCESS (RankCommands only)
    // =========================================================================
    //
    // Returns live references. Reserved for RankCommands. Queries, UI, and
    // cross-domain callers must use the clone-returning public reads.

    function _getRankCanonical(rankId) {
        _assertHydrated();
        if (!_hasId(rankId)) return null;
        return _cache.byId.get(rankId) || null;
    }

    function _getAllRanksCanonical() {
        _assertHydrated();
        return _ranks;
    }

    // =========================================================================
    // 15. INTERNAL MUTATIONS (RankCommands only)
    // =========================================================================
    //
    // These write directly into the in-memory catalogue, sync masterData,
    // and call markDataDirty. They do NOT call saveMasterData.
    //
    // Every mutation runs a full index rebuild. Rank counts are small (the
    // catalogue is O(tens), not O(thousands)), so an incremental index is
    // unwarranted complexity.

    function _addRank(rank) {
        _assertHydrated();

        if (!_isPlainObject(rank)) {
            throw new Error('rank-state.js: _addRank expects a plain object.');
        }
        if (!_hasId(rank.id)) {
            throw new Error('rank-state.js: _addRank requires an id.');
        }
        if (_cache.byId.has(rank.id)) {
            throw new Error('rank-state.js: rank id "' + rank.id +
                '" already exists.');
        }

        var normalised = _normaliseRank(rank);
        _ranks.push(normalised);
        _indexesRebuild();
        _syncToMasterData();
        _notify('rankAdded', _cloneRank(normalised));
        return normalised;
    }

    function _updateRank(rankId, patch) {
        _assertHydrated();

        if (!_hasId(rankId)) {
            throw new Error('rank-state.js: _updateRank requires an id.');
        }
        if (!_isPlainObject(patch)) {
            throw new Error('rank-state.js: _updateRank expects a plain object patch.');
        }

        var rank = _cache.byId.get(rankId);
        if (!rank) return null;

        var candidate = {};
        for (var key in rank) {
            if (Object.prototype.hasOwnProperty.call(rank, key)) {
                candidate[key] = rank[key];
            }
        }
        for (var pKey in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, pKey)) {
                candidate[pKey] = patch[pKey];
            }
        }

        var normalised = _normaliseRank(candidate);

        var idx = _ranks.indexOf(rank);
        if (idx === -1) return null;
        _ranks[idx] = normalised;

        _indexesRebuild();
        _syncToMasterData();
        _notify('rankUpdated', _cloneRank(normalised));
        return normalised;
    }

    function _removeRank(rankId) {
        _assertHydrated();

        if (!_hasId(rankId)) {
            throw new Error('rank-state.js: _removeRank requires an id.');
        }

        var rank = _cache.byId.get(rankId);
        if (!rank) return false;

        var idx = _ranks.indexOf(rank);
        if (idx === -1) return false;
        _ranks.splice(idx, 1);

        delete _inheritanceRules[rankId];
        for (var parentId in _inheritanceRules) {
            if (!Object.prototype.hasOwnProperty.call(_inheritanceRules, parentId)) {
                continue;
            }
            _inheritanceRules[parentId] = _inheritanceRules[parentId].filter(
                function (rule) {
                    return rule.childRankId !== rankId
                        && rule.childRankIdFemale !== rankId;
                }
            );
            if (_inheritanceRules[parentId].length === 0) {
                delete _inheritanceRules[parentId];
            }
        }

        _indexesRebuild();
        _syncToMasterData();
        _notify('rankDeleted', { rankId: rankId });
        return true;
    }

    // =========================================================================
    // 16. INTERNAL INHERITANCE RULE MUTATIONS (RankCommands only)
    // =========================================================================

    function _addInheritanceRule(parentRankId, rule) {
        _assertHydrated();

        if (!_hasId(parentRankId)) {
            throw new Error('rank-state.js: _addInheritanceRule requires a parent id.');
        }
        if (!_cache.byId.has(parentRankId)) {
            throw new Error('rank-state.js: parent rank "' + parentRankId +
                '" does not exist.');
        }
        if (!_isPlainObject(rule)) {
            throw new Error('rank-state.js: _addInheritanceRule expects a plain object.');
        }

        var normalised = _normaliseInheritanceRule(rule);
        if (normalised.childRankId === null
            && normalised.childRankIdFemale === null) {
            throw new Error('rank-state.js: inheritance rule must reference a ' +
                'childRankId or childRankIdFemale.');
        }
        if (normalised.childRankId !== null
            && !_cache.byId.has(normalised.childRankId)) {
            throw new Error('rank-state.js: child rank "' + normalised.childRankId +
                '" does not exist.');
        }
        if (normalised.childRankIdFemale !== null
            && !_cache.byId.has(normalised.childRankIdFemale)) {
            throw new Error('rank-state.js: child rank "' +
                normalised.childRankIdFemale + '" does not exist.');
        }

        if (!Array.isArray(_inheritanceRules[parentRankId])) {
            _inheritanceRules[parentRankId] = [];
        }

        // Duplicate refusal: same childRankId and same childRankIdFemale.
        var existing = _inheritanceRules[parentRankId];
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].childRankId === normalised.childRankId
                && existing[i].childRankIdFemale === normalised.childRankIdFemale) {
                throw new Error('rank-state.js: identical inheritance rule already ' +
                    'exists for parent "' + parentRankId + '".');
            }
        }

        _inheritanceRules[parentRankId].push(normalised);
        _inheritanceRules[parentRankId].sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });

        _syncToMasterData();
        _notify('inheritanceRuleAdded', {
            parentRankId: parentRankId,
            rule: _normaliseInheritanceRule(normalised)
        });
        return normalised;
    }

    function _removeInheritanceRule(parentRankId, ruleIndex) {
        _assertHydrated();

        if (!_hasId(parentRankId)) {
            throw new Error('rank-state.js: _removeInheritanceRule requires a parent id.');
        }
        if (!Array.isArray(_inheritanceRules[parentRankId])) {
            return false;
        }
        if (typeof ruleIndex !== 'number' || !Number.isInteger(ruleIndex)) {
            throw new Error('rank-state.js: ruleIndex must be an integer.');
        }
        if (ruleIndex < 0 || ruleIndex >= _inheritanceRules[parentRankId].length) {
            throw new Error('rank-state.js: ruleIndex out of range.');
        }

        var removed = _inheritanceRules[parentRankId].splice(ruleIndex, 1);

        if (_inheritanceRules[parentRankId].length === 0) {
            delete _inheritanceRules[parentRankId];
        }

        _syncToMasterData();
        _notify('inheritanceRuleRemoved', {
            parentRankId: parentRankId,
            rule: removed[0] ? _normaliseInheritanceRule(removed[0]) : null
        });
        return true;
    }

    function _setInheritanceRules(parentRankId, rules) {
        _assertHydrated();

        if (!_hasId(parentRankId)) {
            throw new Error('rank-state.js: _setInheritanceRules requires a parent id.');
        }
        if (!_cache.byId.has(parentRankId)) {
            throw new Error('rank-state.js: parent rank "' + parentRankId +
                '" does not exist.');
        }
        if (!Array.isArray(rules)) {
            throw new Error('rank-state.js: rules must be an array.');
        }

        var cleaned = [];
        for (var i = 0; i < rules.length; i++) {
            var normalised = _normaliseInheritanceRule(rules[i]);
            if (normalised.childRankId === null
                && normalised.childRankIdFemale === null) continue;
            if (normalised.childRankId !== null
                && !_cache.byId.has(normalised.childRankId)) {
                throw new Error('rank-state.js: child rank "' +
                    normalised.childRankId + '" does not exist.');
            }
            if (normalised.childRankIdFemale !== null
                && !_cache.byId.has(normalised.childRankIdFemale)) {
                throw new Error('rank-state.js: child rank "' +
                    normalised.childRankIdFemale + '" does not exist.');
            }
            cleaned.push(normalised);
        }

        cleaned.sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });

        if (cleaned.length === 0) {
            delete _inheritanceRules[parentRankId];
        } else {
            _inheritanceRules[parentRankId] = cleaned;
        }

        _syncToMasterData();
        _notify('inheritanceRulesSet', { parentRankId: parentRankId });
        return true;
    }

    // =========================================================================
    // 17. MASTER DATA RELOAD
    // =========================================================================

    window.addEventListener('masterDataUpdated', function () {
        if (!window.masterData || !window.masterData.data) return;
        var ranks = Array.isArray(window.masterData.data.ranks)
            ? window.masterData.data.ranks
            : [];
        var rules = _isPlainObject(window.masterData.data.rankInheritanceRules)
            ? window.masterData.data.rankInheritanceRules
            : {};
        try {
            hydrateFromMasterData(ranks, rules);
            _notify('stateReloaded', {});
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('rank-state.js: reload from masterDataUpdated failed:', err);
            }
        }
    });

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.RankState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        isHydrated: isHydrated,

        // Subscriptions
        subscribe: subscribe,

        // Reads
        getAllRanks: getAllRanks,
        getRank: getRank,
        getRanksByPriority: getRanksByPriority,
        getRankHierarchy: getRankHierarchy,
        getRankCount: getRankCount,
        getInheritanceRules: getInheritanceRules,
        getInheritanceRulesForRank: getInheritanceRulesForRank,

        // Diagnostics
        validateIntegrity: validateIntegrity,

        // Internal — reserved for RankCommands
        _getRankCanonical: _getRankCanonical,
        _getAllRanksCanonical: _getAllRanksCanonical,
        _addRank: _addRank,
        _updateRank: _updateRank,
        _removeRank: _removeRank,
        _addInheritanceRule: _addInheritanceRule,
        _removeInheritanceRule: _removeInheritanceRule,
        _setInheritanceRules: _setInheritanceRules,
        _indexesRebuild: _indexesRebuild
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankState;
    }
})();
