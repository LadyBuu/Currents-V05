/**
 * =============================================================================
 * STILL WATERS - RANK COMMANDS (rank-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-commands.js
 *
 * The single write boundary for the rank domain.
 *
 * This file:
 *   - creates, updates, and deletes rank records
 *   - manages inheritance rules
 *   - assigns, deprecates, and removes rank assignments on characters,
 *     delegating the character-record write to CharacterCommands
 *   - manages surname rules
 *   - exposes the death hook for deprecateOnDeath ranks
 *   - owns persist(), the only call site of saveMasterData in this domain
 *
 * This file does NOT:
 *   - read or write the character record directly (CharacterCommands does)
 *   - read or write relationship state (RomanceQueries, FamilyQueries do)
 *   - perform numbering arithmetic on its own (RankAssignment does)
 *   - call saveMasterData anywhere except persist()
 *   - toast, render, or touch the DOM
 *
 * OWNERSHIP:
 *   Rank records             -> RankState (this file calls its _-prefixed
 *                               mutators)
 *   Inheritance rules        -> RankState (this file calls its _-prefixed
 *                               mutators)
 *   Rank assignments         -> CharacterCommands (this file calls its
 *                               public writers)
 *   Rank policy              -> RankRules
 *   Numbering arithmetic     -> RankAssignment
 *
 * PERSISTENCE:
 *   Commands do not save. Every command mutates in-memory state and returns.
 *   The caller is responsible for calling RankCommands.persist() once per
 *   batch, after every command in the batch has succeeded. RankState has
 *   already called markDataDirty on every mutation. persist() forces a
 *   synchronous flush.
 *
 *   Batch callers (annual pipeline, modal onConfirm, bulk operations) call
 *   persist() exactly once at the end. Single-operation callers may call
 *   persist() immediately after a successful command.
 *
 * PERSIST CONTRACT (Pattern A from storage.js):
 *   RankCommands.persist() uses the boolean-inspection pattern documented
 *   in storage.js's DOMAIN PERSIST CONTRACT section:
 *
 *     var ok = window.saveMasterData();
 *     if (ok === true) return { success: true };
 *     var lastError = window.getLastSaveError();
 *     return {
 *         success: false,
 *         reason: lastError && lastError.message
 *             ? lastError.message
 *             : 'saveMasterData returned false'
 *     };
 *
 *   saveMasterData() returns a boolean and does NOT throw on write
 *   failure. The boolean must be inspected. On false, getLastSaveError()
 *   provides the underlying Error so the caller can surface the actual
 *   failure reason (quota exceeded, JSON serialization failure, storage
 *   disabled) rather than a generic message.
 *
 *   Pattern C (the historical broken pattern that silently reported
 *   success on every failed save) must not be reintroduced.
 *
 * CONTRACT:
 *   Every public command returns { success: true, ... } or
 *   { success: false, reason: string, ... }. Never throws for domain errors.
 *   Programming errors (missing required dependency, malformed argument
 *   types where the caller is expected to have validated) throw.
 *
 * DEPENDENCIES (REQUIRED):
 *   - rank-state.js        (RankState)
 *   - rank-rules.js        (RankRules)
 *   - rank-queries.js      (RankQueries) — for getInheritanceSource and
 *                            holder scans
 *   - rank-assignment.js   (RankAssignment) — for getNextRankNumber and
 *                            renumberRankHolders
 *   - character-commands.js (CharacterCommands) — for rank assignment writes
 *   - time.js              (getCurrentYear, isValidYear)
 *   - ids.js               (generateId)
 *   - storage.js           (saveMasterData, getLastSaveError)
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - RomanceQueries.getActiveCommittedPartners — via RankQueries for
 *     spouse inheritance source resolution
 *   - FamilyQueries.getParents — via RankQueries for parent inheritance
 *     source resolution
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - persist() now reads getLastSaveError() when saveMasterData()
 *       returns false. The actual failure reason (quota exceeded,
 *       serialization failure, storage disabled) is surfaced in the
 *       returned reason field instead of the generic
 *       'saveMasterData returned false'. Matches the documented
 *       behaviour in rank-doc.md §10 ("carrying
 *       getLastSaveError().message when available") and matches
 *       storage.js's DOMAIN PERSIST CONTRACT Pattern A.
 *     - getLastSaveError added to the load-time dependency check.
 *       If storage.js does not export it, that is a load-order bug
 *       (storage.js must always export it per its module header).
 *     - Header PERSIST CONTRACT section added, documenting the
 *       Pattern A form with the getLastSaveError() branch.
 *     - No public signature change, no public return-shape change.
 *       Callers of persist() already inspect { success, reason? }.
 *       The reason string becomes more informative on failure.
 *   Previous revision:
 *     - _requiredAssignmentMethods no longer requires
 *       RankAssignment.applySpouseInheritanceFixes or
 *       RankAssignment.updateRankSurnameRule. Neither method is called via
 *       RA.* anywhere in this file: applySpouseInheritanceFixes uses
 *       assignRankToCharacter directly, and updateRankSurnameRule uses
 *       updateRank directly. The stale checks were causing a load-time
 *       failure. The corresponding commands and their behaviour are
 *       unchanged.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RankState) {
        throw new Error('rank-commands.js requires rank-state.js to load first.');
    }
    if (!window.RankRules) {
        throw new Error('rank-commands.js requires rank-rules.js to load first.');
    }
    if (!window.RankQueries) {
        throw new Error('rank-commands.js requires rank-queries.js to load first.');
    }
    if (!window.RankAssignment) {
        throw new Error('rank-commands.js requires rank-assignment.js to load first.');
    }
    if (!window.CharacterCommands) {
        throw new Error('rank-commands.js requires character-commands.js to load first.');
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('rank-commands.js requires ids.js (generateId).');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('rank-commands.js requires time.js (getCurrentYear).');
    }
    if (typeof window.isValidYear !== 'function') {
        throw new Error('rank-commands.js requires time.js (isValidYear).');
    }
    if (typeof window.saveMasterData !== 'function') {
        throw new Error('rank-commands.js requires storage.js (saveMasterData).');
    }
    if (typeof window.getLastSaveError !== 'function') {
        throw new Error(
            'rank-commands.js requires storage.js (getLastSaveError). ' +
            'This is the canonical failure-reason accessor documented in ' +
            'storage.js\'s DOMAIN PERSIST CONTRACT.'
        );
    }

    var RS = window.RankState;
    var RR = window.RankRules;
    var RQ = window.RankQueries;
    var RA = window.RankAssignment;
    var CC = window.CharacterCommands;

    var _requiredCharacterMethods = [
        'addRankAssignment',
        'updateRankAssignment',
        'deprecateRankAssignment',
        'removeRankAssignment',
        'setActiveRank',
        'clearActiveRank',
        'getRankAssignment',
        'getRankAssignments',
        'hasRankAssignment'
    ];
    for (var _m = 0; _m < _requiredCharacterMethods.length; _m++) {
        var _name = _requiredCharacterMethods[_m];
        if (typeof CC[_name] !== 'function') {
            throw new Error(
                'rank-commands.js: CharacterCommands.' + _name +
                ' is required. Character-commands.js must be loaded with the rank API.'
            );
        }
    }

    // Only the two RankAssignment methods this file actually calls are
    // required here. applySpouseInheritanceFixes and updateRankSurnameRule
    // are commands on this module, not methods on RankAssignment; they use
    // assignRankToCharacter and updateRank respectively.
    var _requiredAssignmentMethods = [
        'getNextRankNumber',
        'renumberRankHolders'
    ];
    for (var _a = 0; _a < _requiredAssignmentMethods.length; _a++) {
        var _aName = _requiredAssignmentMethods[_a];
        if (typeof RA[_aName] !== 'function') {
            throw new Error(
                'rank-commands.js: RankAssignment.' + _aName + ' is required.'
            );
        }
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
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

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _isValidYearOrMissing(v) {
        if (_isMissing(v)) return true;
        return window.isValidYear(v) === true;
    }

    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    // =========================================================================
    // 4. PERSISTENCE
    // =========================================================================

    /**
     * Forces a synchronous flush of masterData to storage.
     *
     * The only call site of saveMasterData in this domain. Every command has
     * already mutated in-memory state and called markDataDirty via RankState.
     * persist() is the caller's explicit "I am done; write it out" signal.
     *
     * Uses Pattern A from storage.js's DOMAIN PERSIST CONTRACT:
     * inspect the boolean return, and on failure read getLastSaveError()
     * for the actual cause. saveMasterData() does NOT throw on write
     * failure; it returns false and stores the Error for the caller to
     * retrieve.
     *
     * Returns { success: true } if the write succeeded, or
     * { success: false, reason } carrying the underlying failure message
     * (quota exceeded, serialization failure, storage disabled) when
     * available, or a generic message otherwise.
     */
    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) return _ok();

            var lastError = window.getLastSaveError();
            return _fail(
                (lastError && lastError.message)
                    ? lastError.message
                    : 'saveMasterData returned false'
            );
        } catch (e) {
            return _fail(e && e.message ? e.message : 'saveMasterData threw');
        }
    }

    // =========================================================================
    // 5. RANK CRUD
    // =========================================================================

    /**
     * Creates a rank.
     *
     * Input shape (all optional except name):
     *   {
     *     name,
     *     priority,
     *     symbol,
     *     genderRestriction,
     *     parentRankId,
     *     numbered,
     *     numberingType,
     *     numberingGroup,
     *     sourceRankId,
     *     inheritanceSource,
     *     locationTypeId,
     *     deprecateOnDeath,
     *     spouseInheritance,
     *     allowsMultipleSpouses,
     *     customSurnameRule,
     *     surnameConnector,
     *     surnamePrefix,
     *     surnameSuffix
     *   }
     *
     * applyDefaults fills in the rest. Validation via RankRules.validate.
     */
    function createRank(rankData) {
        if (!_isPlainObject(rankData)) {
            return _fail('rankData must be a plain object.');
        }
        if (!_isNonEmptyString(rankData.name)) {
            return _fail('name is required.');
        }

        var defaults = RR.applyDefaults(rankData);

        // Cross-rank reference checks before writing: parent and source
        // must exist. RankState validates on insert too, but failing here
        // gives a clearer reason to the caller.
        if (_hasId(defaults.parentRankId) && !RS.getRank(defaults.parentRankId)) {
            return _fail('parentRankId "' + defaults.parentRankId + '" does not exist.');
        }
        if (_hasId(defaults.sourceRankId) && !RS.getRank(defaults.sourceRankId)) {
            return _fail('sourceRankId "' + defaults.sourceRankId + '" does not exist.');
        }

        var candidate = Object.assign({}, defaults, {
            id: window.generateId('rank'),
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        var validation = RR.validate(candidate);
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        try {
            var rank = RS._addRank(candidate);
            return _ok({ rank: rank });
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the write.');
        }
    }

    /**
     * Updates a rank.
     *
     * Rejects cross-rank reference changes that would point at a
     * non-existent rank. Coherence checks (sourceRankId requires
     * inheritanceSource, etc.) run via RankRules.validatePatch.
     */
    function updateRank(rankId, updates) {
        if (!_hasId(rankId)) return _fail('rankId is required.');
        if (!_isPlainObject(updates)) {
            return _fail('updates must be a plain object.');
        }

        var current = RS.getRank(rankId);
        if (!current) return _fail('Rank not found.');

        if (_hasId(updates.parentRankId)
            && updates.parentRankId !== current.parentRankId
            && !RS.getRank(updates.parentRankId)) {
            return _fail('parentRankId "' + updates.parentRankId + '" does not exist.');
        }
        if (_hasId(updates.sourceRankId)
            && updates.sourceRankId !== current.sourceRankId
            && !RS.getRank(updates.sourceRankId)) {
            return _fail('sourceRankId "' + updates.sourceRankId + '" does not exist.');
        }

        var coherence = RR.validatePatch(current, updates);
        if (!coherence.valid) {
            return _fail(coherence.errors.join('; '));
        }

        var patch = Object.assign({}, updates, { updatedAt: Date.now() });

        try {
            var updated = RS._updateRank(rankId, patch);
            if (!updated) return _fail('Rank not found after update.');
            return _ok({ rank: updated });
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the write.');
        }
    }

    /**
     * Deletes a rank.
     *
     * Refuses if the rank has non-deprecated holders, unless the caller
     * passes { force: true }. In that case, every assignment for the rank
     * is removed from every character before the rank record is deleted.
     *
     * Also refuses if any other rank references this rank as its parent or
     * source, or if any inheritance rule references it — unless force is
     * set, in which case those references are cleaned up: child ranks lose
     * the parentRankId, sourceRankId references are nulled, and inheritance
     * rules referencing this rank as a child are dropped (RankState._removeRank
     * already does the last part).
     */
    function deleteRank(rankId, options) {
        options = options || {};
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var rank = RS.getRank(rankId);
        if (!rank) return _fail('Rank not found.');

        var holders = RQ.getCharactersWithRank(rankId, false);
        var force = options.force === true;

        if (holders.length > 0 && !force) {
            return _fail(
                'Cannot delete rank with ' + holders.length +
                ' active holder(s). Remove or deprecate assignments first, ' +
                'or pass { force: true }.'
            );
        }

        var allRanks = RS.getAllRanks();
        var referrers = [];
        for (var i = 0; i < allRanks.length; i++) {
            var r = allRanks[i];
            if (!r || r.id === rankId) continue;
            if (r.parentRankId === rankId) referrers.push({ id: r.id, field: 'parentRankId' });
            if (r.sourceRankId === rankId) referrers.push({ id: r.id, field: 'sourceRankId' });
        }
        if (referrers.length > 0 && !force) {
            return _fail(
                'Cannot delete rank referenced by ' + referrers.length +
                ' other rank(s) as parent or source. Pass { force: true } to ' +
                'null the references and proceed.'
            );
        }

        if (force && holders.length > 0) {
            for (var h = 0; h < holders.length; h++) {
                var holderId = holders[h].id;
                var removeResult = CC.removeRankAssignment(holderId, rankId);
                if (!removeResult || removeResult.success !== true) {
                    return _fail('Failed to remove rank assignment from character ' +
                        holderId + ': ' +
                        (removeResult && removeResult.reason
                            ? removeResult.reason
                            : 'unknown error'));
                }
            }
        }

        if (force && referrers.length > 0) {
            for (var r = 0; r < referrers.length; r++) {
                var ref = referrers[r];
                var patch = {};
                patch[ref.field] = null;
                // Coherence: clearing sourceRankId requires inheritanceSource
                // to become 'none'. The current rank record has its own
                // inheritanceSource which we reset here.
                if (ref.field === 'sourceRankId') {
                    patch.inheritanceSource = 'none';
                }
                var updateResult = RS._updateRank(ref.id, patch);
                if (!updateResult) {
                    return _fail('Failed to update referring rank ' + ref.id + '.');
                }
            }
        }

        try {
            var deleted = RS._removeRank(rankId);
            if (!deleted) return _fail('RankState refused the delete.');
            return _ok({
                rankId: rankId,
                removedAssignments: force ? holders.length : 0,
                clearedReferences: force ? referrers.length : 0
            });
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the delete.');
        }
    }

    // =========================================================================
    // 6. INHERITANCE RULES
    // =========================================================================

    function addInheritanceRule(parentRankId, rule) {
        if (!_hasId(parentRankId)) return _fail('parentRankId is required.');
        if (!_isPlainObject(rule)) return _fail('rule must be a plain object.');

        var validation = RR.validateInheritanceRule(rule);
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        if (!RS.getRank(parentRankId)) {
            return _fail('Parent rank not found.');
        }
        if (_hasId(rule.childRankId) && !RS.getRank(rule.childRankId)) {
            return _fail('Child rank "' + rule.childRankId + '" does not exist.');
        }
        if (_hasId(rule.childRankIdFemale) && !RS.getRank(rule.childRankIdFemale)) {
            return _fail('Child rank "' + rule.childRankIdFemale + '" does not exist.');
        }

        try {
            var stored = RS._addInheritanceRule(parentRankId, rule);
            return _ok({ rule: stored });
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the rule.');
        }
    }

    function removeInheritanceRule(parentRankId, ruleIndex) {
        if (!_hasId(parentRankId)) return _fail('parentRankId is required.');
        if (typeof ruleIndex !== 'number' || !Number.isInteger(ruleIndex)) {
            return _fail('ruleIndex must be an integer.');
        }

        try {
            var removed = RS._removeInheritanceRule(parentRankId, ruleIndex);
            if (!removed) return _fail('No such rule.');
            return _ok();
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the delete.');
        }
    }

    /**
     * Bulk-replaces the inheritance rules for a parent rank.
     */
    function setInheritanceRules(parentRankId, rules) {
        if (!_hasId(parentRankId)) return _fail('parentRankId is required.');
        if (!Array.isArray(rules)) return _fail('rules must be an array.');

        for (var i = 0; i < rules.length; i++) {
            var validation = RR.validateInheritanceRule(rules[i]);
            if (!validation.valid) {
                return _fail('rule[' + i + ']: ' + validation.errors.join('; '));
            }
            if (_hasId(rules[i].childRankId) && !RS.getRank(rules[i].childRankId)) {
                return _fail('rule[' + i + ']: child rank "' +
                    rules[i].childRankId + '" does not exist.');
            }
            if (_hasId(rules[i].childRankIdFemale)
                && !RS.getRank(rules[i].childRankIdFemale)) {
                return _fail('rule[' + i + ']: child rank "' +
                    rules[i].childRankIdFemale + '" does not exist.');
            }
        }

        try {
            RS._setInheritanceRules(parentRankId, rules);
            return _ok();
        } catch (e) {
            return _fail(e && e.message ? e.message : 'RankState refused the write.');
        }
    }

    // =========================================================================
    // 7. RANK ASSIGNMENT
    // =========================================================================
    //
    // Assignment writes go through CharacterCommands. The rank domain's job
    // here is:
    //   - validate against RankRules.canAssignRank
    //   - compute the numbering info via RankAssignment.getNextRankNumber
    //   - read/write the character-side assignment via CharacterCommands
    //
    // The character projection used by canAssignRank is fetched from
    // CharacterState.getCharacter (which returns a projection).

    function _getCharacterProjection(characterId) {
        if (!_hasId(characterId)) return null;
        if (typeof window.CharacterState === 'undefined'
            || typeof window.CharacterState.getCharacter !== 'function') {
            return null;
        }
        return window.CharacterState.getCharacter(characterId);
    }

    /**
     * Assigns a rank to a character.
     *
     * options:
     *   {
     *     customTitle,      string | null
     *     address,          string | null
     *     number,           number | null | object (see below)
     *     order,            number
     *     assignedYear,     number
     *     notes,            string
     *     inheritedFrom,    string | null
     *     skipNumbering     boolean   — do not compute a number even for
     *                                  numbered ranks
     *   }
     *
     * number may be:
     *   - undefined       → auto-computed for numbered ranks
     *   - null            → no number
     *   - a number        → treated as rawNumber, display computed via
     *                       RankRules.formatNumber
     *   - an object       → passed through as-is (rawNumber, display, type,
     *                       groupId, holdersInGroup)
     */
    function assignRankToCharacter(characterId, rankId, options) {
        options = options || {};
        if (!_hasId(characterId)) return _fail('characterId is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var rank = RS.getRank(rankId);
        if (!rank) return _fail('Rank not found.');

        var character = _getCharacterProjection(characterId);
        if (!character) return _fail('Character not found.');

        var policy = RR.canAssignRank(character, rank, options);
        if (!policy.valid) return _fail(policy.reason);

        // Numbering.
        var numberInfo = null;
        if (rank.numbered === true && options.skipNumbering !== true) {
            if (options.number === null) {
                numberInfo = null;
            } else if (typeof options.number === 'number') {
                numberInfo = {
                    rawNumber: options.number,
                    display: RR.formatNumber(options.number, rank.numberingType),
                    type: rank.numberingType === 'ordinal' ? 'ordinal' : 'roman',
                    groupId: null,
                    holdersInGroup: null
                };
            } else if (_isPlainObject(options.number)) {
                numberInfo = options.number;
            } else {
                var sourceId = null;
                if (rank.numberingGroup === 'parent'
                    || rank.numberingGroup === 'spouse'
                    || rank.numberingGroup === 'source') {
                    sourceId = RQ.getInheritanceSource(characterId, rankId);
                }
                try {
                    numberInfo = RA.getNextRankNumber(
                        rankId,
                        characterId,
                        sourceId
                    );
                } catch (e) {
                    numberInfo = null;
                }
            }
        }

        var assignedYear = _isValidYearOrMissing(options.assignedYear)
            ? _resolveYear(options.assignedYear)
            : window.getCurrentYear();

        var writeResult = CC.addRankAssignment(characterId, {
            rankId: rankId,
            customTitle: _hasId(options.customTitle) ? options.customTitle : null,
            address: _hasId(options.address) ? options.address : null,
            number: numberInfo,
            order: (typeof options.order === 'number' && Number.isFinite(options.order))
                ? options.order
                : undefined,
            assignedYear: assignedYear,
            notes: typeof options.notes === 'string' ? options.notes : '',
            inheritedFrom: _hasId(options.inheritedFrom) ? options.inheritedFrom : null
        });

        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterCommands refused the rank assignment.');
        }

        return _ok({
            characterId: characterId,
            rankId: rankId,
            assignment: writeResult.assignment,
            activeRankId: writeResult.activeRankId,
            activeRankNumber: writeResult.activeRankNumber,
            reactivated: writeResult.reactivated === true
        });
    }

    /**
     * Deprecates a rank assignment. The assignment record stays on the
     * character, marked deprecated; the active pointer is recomputed by
     * CharacterCommands.
     */
    function deprecateRankAssignment(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('characterId is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var character = _getCharacterProjection(characterId);
        if (!character) return _fail('Character not found.');

        var policy = RR.canDeprecateRankAssignment(character, rankId);
        if (!policy.valid) return _fail(policy.reason);

        var writeResult = CC.deprecateRankAssignment(characterId, rankId);
        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterCommands refused the deprecation.');
        }

        return _ok({
            characterId: characterId,
            rankId: rankId,
            activeRankId: writeResult.activeRankId,
            activeRankNumber: writeResult.activeRankNumber,
            unchanged: writeResult.unchanged === true
        });
    }

    /**
     * Hard-removes a rank assignment. Distinct from deprecate: the record
     * ceases to exist.
     */
    function removeRankAssignment(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('characterId is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var writeResult = CC.removeRankAssignment(characterId, rankId);
        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterCommands refused the removal.');
        }
        return _ok({
            characterId: characterId,
            rankId: rankId,
            activeRankId: writeResult.activeRankId,
            activeRankNumber: writeResult.activeRankNumber
        });
    }

    function setActiveRank(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('characterId is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var writeResult = CC.setActiveRank(characterId, rankId);
        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterCommands refused the active rank write.');
        }
        return _ok({
            characterId: characterId,
            activeRankId: writeResult.activeRankId,
            activeRankNumber: writeResult.activeRankNumber,
            unchanged: writeResult.unchanged === true
        });
    }

    function clearActiveRank(characterId) {
        if (!_hasId(characterId)) return _fail('characterId is required.');

        var writeResult = CC.clearActiveRank(characterId);
        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterCommands refused the active rank clear.');
        }
        return _ok({
            characterId: characterId,
            activeRankId: writeResult.activeRankId,
            activeRankNumber: writeResult.activeRankNumber,
            unchanged: writeResult.unchanged === true
        });
    }

    /**
     * Bulk-assigns a rank to many characters.
     *
     * Does not short-circuit on individual failures: each character is
     * attempted independently. The envelope reports counts and a list of
     * per-character errors.
     */
    function bulkAssignRank(characterIds, rankId, options) {
        options = options || {};
        if (!Array.isArray(characterIds)) {
            return _fail('characterIds must be an array.');
        }
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var rank = RS.getRank(rankId);
        if (!rank) return _fail('Rank not found.');

        var results = [];
        var errors = [];

        for (var i = 0; i < characterIds.length; i++) {
            var cid = characterIds[i];
            var r = assignRankToCharacter(cid, rankId, options);
            if (r.success) {
                results.push({ characterId: cid, assignment: r.assignment });
            } else {
                errors.push({ characterId: cid, reason: r.reason });
            }
        }

        return _ok({
            totalProcessed: characterIds.length,
            successful: results.length,
            failed: errors.length,
            results: results,
            errors: errors
        });
    }

    /**
     * Bulk-deprecates a rank for many characters.
     */
    function bulkDeprecateRank(characterIds, rankId) {
        if (!Array.isArray(characterIds)) {
            return _fail('characterIds must be an array.');
        }
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var succeeded = [];
        var errors = [];

        for (var i = 0; i < characterIds.length; i++) {
            var cid = characterIds[i];
            var r = deprecateRankAssignment(cid, rankId);
            if (r.success) {
                succeeded.push(cid);
            } else {
                errors.push({ characterId: cid, reason: r.reason });
            }
        }

        return _ok({
            totalProcessed: characterIds.length,
            successful: succeeded.length,
            failed: errors.length,
            succeeded: succeeded,
            errors: errors
        });
    }

    // =========================================================================
    // 8. NUMBERING
    // =========================================================================

    /**
     * Renumbers all holders of a rank. Delegates to RankAssignment.
     */
    function renumberRankHolders(rankId) {
        if (!_hasId(rankId)) return _fail('rankId is required.');
        var rank = RS.getRank(rankId);
        if (!rank) return _fail('Rank not found.');
        if (rank.numbered !== true) {
            return _fail('Rank is not numbered.');
        }

        try {
            var result = RA.renumberRankHolders(rankId);
            if (!result || result.success !== true) {
                return _fail(result && result.error
                    ? result.error
                    : 'RankAssignment refused the renumber.');
            }
            return _ok({ rankId: rankId, fixedCount: result.fixedCount || 0 });
        } catch (e) {
            return _fail(e && e.message ? e.message : 'Renumber failed.');
        }
    }

    /**
     * Renumbers every numbered rank. Useful for repair passes and after
     * structural changes to a rank's inheritance source configuration.
     */
    function rebuildAllRankNumbering() {
        var ranks = RS.getAllRanks();
        var fixedCounts = {};
        var totalFixed = 0;
        var errors = [];

        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            if (!r || r.numbered !== true) continue;
            var result = renumberRankHolders(r.id);
            if (result.success) {
                if (result.fixedCount > 0) {
                    fixedCounts[r.id] = result.fixedCount;
                    totalFixed += result.fixedCount;
                }
            } else {
                errors.push({ rankId: r.id, reason: result.reason });
            }
        }

        return _ok({
            totalFixed: totalFixed,
            fixedCounts: fixedCounts,
            errors: errors
        });
    }

    // =========================================================================
    // 9. SURNAME RULE
    // =========================================================================

    function updateRankSurnameRule(rankId, ruleSettings) {
        if (!_hasId(rankId)) return _fail('rankId is required.');
        if (!_isPlainObject(ruleSettings)) {
            return _fail('ruleSettings must be a plain object.');
        }

        var rank = RS.getRank(rankId);
        if (!rank) return _fail('Rank not found.');

        var updates = {
            customSurnameRule: ruleSettings.enabled === true,
            surnameConnector: typeof ruleSettings.connector === 'string'
                ? ruleSettings.connector
                : 'of',
            surnamePrefix: typeof ruleSettings.prefix === 'string'
                ? ruleSettings.prefix
                : '',
            surnameSuffix: typeof ruleSettings.suffix === 'string'
                ? ruleSettings.suffix
                : ''
        };

        return updateRank(rankId, updates);
    }

    // =========================================================================
    // 10. SPOUSE INHERITANCE
    // =========================================================================

    /**
     * Applies a batch of spouse-inheritance fixes.
     *
     * `fixes` is an array of records shaped as produced by
     * RankIssues.checkSpouseInheritance:
     *
     *   { characterId, rankId, spouseName, sourceRankName, ... }
     *
     * The command assigns each rank, using inheritedFrom = the spouse id
     * when present.
     *
     * Persist is the caller's responsibility. The annual pipeline calls
     * persist once after all fixes; a modal calls persist once after the
     * batch.
     */
    function applySpouseInheritanceFixes(fixes) {
        if (!Array.isArray(fixes)) return _fail('fixes must be an array.');
        if (fixes.length === 0) return _ok({ applied: 0, errors: [] });

        var applied = 0;
        var errors = [];
        var currentYear = window.getCurrentYear();

        for (var i = 0; i < fixes.length; i++) {
            var fix = fixes[i];
            if (!_isPlainObject(fix)) {
                errors.push({ index: i, reason: 'fix is not an object' });
                continue;
            }
            if (!_hasId(fix.characterId)) {
                errors.push({ index: i, reason: 'characterId missing' });
                continue;
            }
            if (!_hasId(fix.rankId)) {
                errors.push({ index: i, reason: 'rankId missing' });
                continue;
            }

            var result = assignRankToCharacter(fix.characterId, fix.rankId, {
                notes: 'Inherited from spouse ' +
                    (fix.spouseName || 'unknown') +
                    (fix.sourceRankName ? ' via ' + fix.sourceRankName : ''),
                assignedYear: currentYear,
                inheritedFrom: _hasId(fix.spouseId) ? fix.spouseId : null
            });

            if (result.success) {
                applied++;
            } else {
                errors.push({
                    index: i,
                    characterId: fix.characterId,
                    rankId: fix.rankId,
                    reason: result.reason
                });
            }
        }

        return _ok({
            applied: applied,
            failed: errors.length,
            errors: errors
        });
    }

    // =========================================================================
    // 11. DEATH HOOK
    // =========================================================================

    /**
     * Deprecates every rank assignment on a deceased character where the
     * rank has deprecateOnDeath === true.
     *
     * Called by the death cascade (CharacterLifecycle or the rank
     * integrations module). The caller is responsible for calling persist()
     * after the death cascade, along with whatever else the cascade does.
     *
     * Returns a summary of what was deprecated and what failed.
     */
    function deprecateRanksOnDeath(characterId, options) {
        options = options || {};
        if (!_hasId(characterId)) return _fail('characterId is required.');

        var character = _getCharacterProjection(characterId);
        if (!character) return _fail('Character not found.');

        var assignments = Array.isArray(character.rankAssignments)
            ? character.rankAssignments
            : [];

        var deprecated = [];
        var errors = [];

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!a || a.isDeprecated === true) continue;

            var rank = RS.getRank(a.rankId);
            if (!rank) {
                errors.push({ rankId: a.rankId, reason: 'rank not found' });
                continue;
            }
            if (rank.deprecateOnDeath !== true) continue;

            var result = deprecateRankAssignment(characterId, a.rankId);
            if (result.success) {
                deprecated.push(a.rankId);
            } else {
                errors.push({ rankId: a.rankId, reason: result.reason });
            }
        }

        // Ranks that were deprecated may need renumbering for their
        // remaining holders. Attempt renumber for each affected rank.
        var renumbered = [];
        for (var j = 0; j < deprecated.length; j++) {
            var rankId = deprecated[j];
            var rankRecord = RS.getRank(rankId);
            if (!rankRecord || rankRecord.numbered !== true) continue;
            var rn = renumberRankHolders(rankId);
            if (rn.success && rn.fixedCount > 0) {
                renumbered.push({ rankId: rankId, fixedCount: rn.fixedCount });
            }
        }

        return _ok({
            characterId: characterId,
            deathYear: _isValidYearOrMissing(options.deathYear)
                ? _resolveYear(options.deathYear)
                : window.getCurrentYear(),
            deprecated: deprecated,
            renumbered: renumbered,
            errors: errors
        });
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.RankCommands = {
        // Persistence
        persist: persist,

        // Rank CRUD
        createRank: createRank,
        updateRank: updateRank,
        deleteRank: deleteRank,

        // Inheritance rules
        addInheritanceRule: addInheritanceRule,
        removeInheritanceRule: removeInheritanceRule,
        setInheritanceRules: setInheritanceRules,

        // Assignment
        assignRankToCharacter: assignRankToCharacter,
        deprecateRankAssignment: deprecateRankAssignment,
        removeRankAssignment: removeRankAssignment,
        setActiveRank: setActiveRank,
        clearActiveRank: clearActiveRank,

        // Bulk
        bulkAssignRank: bulkAssignRank,
        bulkDeprecateRank: bulkDeprecateRank,

        // Numbering
        renumberRankHolders: renumberRankHolders,
        rebuildAllRankNumbering: rebuildAllRankNumbering,

        // Surname rule
        updateRankSurnameRule: updateRankSurnameRule,

        // Spouse inheritance
        applySpouseInheritanceFixes: applySpouseInheritanceFixes,

        // Death hook
        deprecateRanksOnDeath: deprecateRanksOnDeath
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankCommands;
    }
})();
