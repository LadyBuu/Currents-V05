/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP COMMANDS (relationship-commands.js)
 * =============================================================================
 *
 * LOCATION: js/social/relationship-commands.js
 *
 * Mutation boundary for relationship records.
 *
 * Owns:
 *   - id generation
 *   - structural validation of create / createBatch / update / end /
 *     remove
 *   - commit boundary (markDataDirty; never saveMasterData)
 *   - event dispatch through RelationshipState subscribers
 *
 * Does NOT own:
 *   - domain policy (age, attribute meaning, cultural gating)
 *   - status transition tables (each domain's -rules.js owns its table)
 *   - interpretation of status or attribute values
 *   - query projections (callers use RelationshipQueries)
 *
 * DEPENDENCY DIRECTION
 *
 *   DomainCommands
 *          │
 *          ├── DomainRules     (policy)
 *          ├── CultureRules    (cultural institutions)
 *          │
 *          ▼
 *   RelationshipCommands    (structural invariants + state write)
 *          │
 *          ▼
 *   RelationshipState
 *
 * Domain commands MUST call RelationshipCommands rather than reaching
 * into RelationshipState directly. This file refuses structurally
 * malformed records so that State never holds one, but it does not
 * enforce domain policy. Structural validity means: required fields
 * present, participantA !== participantB, attributes is an array with
 * no duplicates, metadata is a plain object, endYear is not before
 * startYear. Nothing more.
 *
 * COMMIT SEMANTICS
 *
 *   create                     one commit (one State.applyInserts)
 *   createBatch                one commit (one State.applyInserts for
 *                              the whole batch, atomic)
 *   update                     one commit (one State.applyUpdates)
 *   end                        one commit (one State.applyUpdates)
 *   setWidowed                 one commit (one State.applyUpdates)
 *   remove                     one commit (one State.applyRemovals)
 *   addAttribute               one commit (delegates to update)
 *   removeAttribute            one commit (delegates to update)
 *   endAllActiveForCharacter   one commit (one State.applyUpdates for
 *                              the whole batch)
 *   removeAllReferencesTo      one commit (one State.applyRemovals for
 *                              the whole batch)
 *
 *   Every public command in this file commits exactly once. Domain
 *   commands that need to write multiple records as a single logical
 *   operation must either use createBatch (for inserts) or compose
 *   their own multi-write flows (documented per-command in the domain
 *   module's own header).
 *
 * CONTRACT
 *
 *   - Every command returns { success: true, ... } or
 *     { success: false, code, message }.
 *   - Never throws for domain errors.
 *   - One logical mutation = one batch call to State = one markDataDirty.
 *
 * Load order: after relationship-state.js, relationship-types.js,
 * relationship-utils.js, and relationship-queries.js.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3.4):
 *     - _validateCreateInput now rejects endYear < startYear.
 *       Previously a relationship with startYear: 100, endYear: 50 was
 *       considered structurally valid (only the types were checked,
 *       not the ordering). The domain's transition tables prevent
 *       ending a relationship before it starts at the command layer
 *       (end() refuses non-ongoing records), but the create path
 *       accepted impossible records directly.
 *     - createBatch's per-record loop applies the same check so
 *       create and createBatch reject the inversion consistently.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    var State   = window.RelationshipState;
    var Utils   = window.RelationshipUtils;
    var Types   = window.RELATIONSHIP_TYPES;
    var STATUS  = window.RELATIONSHIP_STATUS;
    var Queries = window.RelationshipQueries;

    if (!State || !Utils || !Types || !STATUS || !Queries) {
        throw new Error(
            'relationship-commands.js: state, utils, types, queries ' +
            'must load first'
        );
    }

    // =========================================================================
    // 0. DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // =========================================================================

    function _generateId() {
        if (typeof window.generateId !== 'function') {
            throw new Error('relationship-commands.js: generateId required');
        }
        return window.generateId('rel');
    }

    function _now() {
        return Date.now();
    }

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // =========================================================================
    // 2. STRUCTURAL VALIDATION
    //
    // This is the only validation RelationshipCommands performs. It
    // refuses records State cannot index. Domain policy is the caller's
    // responsibility.
    // =========================================================================

    /**
     * @private
     * Checks for endYear < startYear. Returns true if the pair is
     * invalid (endYear strictly before startYear).
     *
     * Only fires when both are present and numeric. A relationship
     * with startYear but no endYear (ongoing), or with neither, is
     * valid.
     */
    function _isEndBeforeStart(startYear, endYear) {
        if (startYear === undefined || startYear === null) return false;
        if (endYear === undefined || endYear === null) return false;
        if (typeof startYear !== 'number' || typeof endYear !== 'number') {
            return false;
        }
        return endYear < startYear;
    }

    function _validateCreateInput(input) {
        var errors = [];

        if (!input || typeof input !== 'object') {
            return { valid: false, errors: ['missing_input'] };
        }

        if (typeof input.participantA !== 'string' || input.participantA.length === 0) {
            errors.push('missing_participantA');
        }
        if (typeof input.participantB !== 'string' || input.participantB.length === 0) {
            errors.push('missing_participantB');
        }
        if (input.participantA && input.participantB &&
            input.participantA === input.participantB) {
            errors.push('same_participant');
        }

        if (typeof input.type !== 'string' || input.type.length === 0) {
            errors.push('missing_type');
        }

        if (typeof input.status !== 'string' || input.status.length === 0) {
            errors.push('missing_status');
        }

        if (input.startYear !== undefined && input.startYear !== null &&
            typeof input.startYear !== 'number') {
            errors.push('invalid_startYear');
        }

        if (input.endYear !== undefined && input.endYear !== null &&
            typeof input.endYear !== 'number') {
            errors.push('invalid_endYear');
        }

        // Phase 3.4: reject impossible chronology. A relationship
        // cannot end before it starts.
        if (_isEndBeforeStart(input.startYear, input.endYear)) {
            errors.push('endYear_before_startYear');
        }

        if (input.attributes !== undefined && !Array.isArray(input.attributes)) {
            errors.push('invalid_attributes');
        }

        if (input.metadata !== undefined &&
            (input.metadata === null ||
             typeof input.metadata !== 'object' ||
             Array.isArray(input.metadata))) {
            errors.push('invalid_metadata');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 3. CREATE (single)
    //
    // input: {
    //   participantA, participantB, type, status,
    //   startYear?, endYear?, attributes?, metadata?
    // }
    //
    // Returns { success: true, relationship: <projection> }.
    //
    // One commit.
    // =========================================================================

    function create(input) {
        var check = _validateCreateInput(input);
        if (!check.valid) {
            return _fail('INVALID_INPUT', check.errors.join('; '));
        }

        if (input.attributes && input.attributes.length > 0) {
            var uniqueness = Utils.validateAttributeUniqueness(input.attributes);
            if (!uniqueness.valid) {
                return _fail('INVALID_ATTRIBUTES', uniqueness.errors.join('; '));
            }
        }

        var now = _now();
        var record = {
            id: _generateId(),
            type: input.type,
            status: input.status,
            participantA: input.participantA,
            participantB: input.participantB,
            startYear: input.startYear === undefined ? null : input.startYear,
            endYear: input.endYear === undefined ? null : input.endYear,
            attributes: input.attributes ? input.attributes.slice() : [],
            metadata: input.metadata ? Object.assign({}, input.metadata) : {},
            createdAt: now,
            updatedAt: now
        };

        var result = State.applyInserts([record]);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ relationship: Queries.getById(record.id) });
    }

    // =========================================================================
    // 4. CREATE BATCH
    //
    // Inserts N records in a single State batch: one applyInserts call,
    // one markDataDirty, one subscriber notification. All-or-nothing.
    //
    // The caller is responsible for preparing fully-formed records
    // (id, type, status, participantA/B, attributes, metadata,
    // timestamps). This function validates structural input (the same
    // checks applyInserts performs) plus duplicate-id-within-batch, and
    // refuses the whole batch if any record fails.
    //
    // State.applyInserts performs the final structural check (including
    // duplicate ids against existing State) and commits atomically.
    //
    // This is the primitive used by domain commands that need to create
    // multiple edges as one logical operation (e.g.
    // FriendshipCommands.createMutualFriendships). It is NOT a command
    // itself; it knows nothing about any specific archetype.
    //
    // Returns { success: true, inserted: [id...] } on success, where
    // inserted preserves the order of the input records. Returns
    // { success: false, code, message } on any failure; nothing is
    // inserted when the batch is refused.
    // =========================================================================

    function createBatch(records) {
        if (!Array.isArray(records)) {
            return _fail('INVALID_INPUT', 'records must be an array');
        }
        if (records.length === 0) {
            return _ok({ inserted: [] });
        }

        var seen = {};
        for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            if (!rec || typeof rec !== 'object') {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' is not an object'
                );
            }
            if (typeof rec.id !== 'string' || rec.id.length === 0) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has no id'
                );
            }
            if (typeof rec.type !== 'string' || rec.type.length === 0) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has no type'
                );
            }
            if (typeof rec.status !== 'string' || rec.status.length === 0) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has no status'
                );
            }
            if (typeof rec.participantA !== 'string' || rec.participantA.length === 0) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has no participantA'
                );
            }
            if (typeof rec.participantB !== 'string' || rec.participantB.length === 0) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has no participantB'
                );
            }
            if (rec.participantA === rec.participantB) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has same_participant'
                );
            }
            if (rec.startYear !== undefined && rec.startYear !== null &&
                typeof rec.startYear !== 'number') {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has invalid startYear'
                );
            }
            if (rec.endYear !== undefined && rec.endYear !== null &&
                typeof rec.endYear !== 'number') {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has invalid endYear'
                );
            }
            // Phase 3.4: same chronology check as create. Applied per
            // record so create and createBatch reject the inversion
            // consistently.
            if (_isEndBeforeStart(rec.startYear, rec.endYear)) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has endYear_before_startYear'
                );
            }
            if (rec.attributes !== undefined && !Array.isArray(rec.attributes)) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has invalid attributes'
                );
            }
            if (rec.metadata !== undefined &&
                (rec.metadata === null ||
                 typeof rec.metadata !== 'object' ||
                 Array.isArray(rec.metadata))) {
                return _fail(
                    'INVALID_INPUT',
                    'record at index ' + i + ' has invalid metadata'
                );
            }
            if (seen[rec.id]) {
                return _fail(
                    'INVALID_INPUT',
                    'duplicate id within batch: ' + rec.id
                );
            }
            seen[rec.id] = true;

            if (rec.attributes && rec.attributes.length > 0) {
                var uniqueness = Utils.validateAttributeUniqueness(rec.attributes);
                if (!uniqueness.valid) {
                    return _fail(
                        'INVALID_ATTRIBUTES',
                        'record at index ' + i + ': ' +
                        uniqueness.errors.join('; ')
                    );
                }
            }
        }

        var result = State.applyInserts(records);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ inserted: result.inserted });
    }

    // =========================================================================
    // 5. UPDATE
    //
    // patch: { status?, startYear?, endYear?, attributes?, metadata? }
    //
    // Status transitions are validated by the caller's domain rules
    // against that domain's transition table. RelationshipCommands does
    // not know what any status value means.
    //
    // Metadata is a shallow merge. Attributes is a full replace.
    //
    // One commit.
    // =========================================================================

    function update(id, patch) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (!patch || typeof patch !== 'object') {
            return _fail('MISSING_PATCH', 'patch required');
        }

        var current = State.getRecordCopy(id);
        if (!current) {
            return _fail('NOT_FOUND', 'relationship not found');
        }

        if (patch.status !== undefined) {
            if (typeof patch.status !== 'string' || patch.status.length === 0) {
                return _fail('INVALID_STATUS', 'status must be a non-empty string');
            }
        }

        if (patch.startYear !== undefined && patch.startYear !== null &&
            typeof patch.startYear !== 'number') {
            return _fail('INVALID_START_YEAR', 'startYear must be a number or null');
        }

        if (patch.endYear !== undefined && patch.endYear !== null &&
            typeof patch.endYear !== 'number') {
            return _fail('INVALID_END_YEAR', 'endYear must be a number or null');
        }

        // Phase 3.4 (adjacent): an update that would produce an
        // endYear < startYear should be refused too, using the
        // current record's other field when the patch only supplies
        // one. This closes the same inconsistency on the update path
        // that the create path closes above. It is included in this
        // commit for consistency even though the action plan scoped
        // Phase 3.4 to the create paths.
        var nextStartYear = patch.startYear !== undefined
            ? patch.startYear
            : current.startYear;
        var nextEndYear = patch.endYear !== undefined
            ? patch.endYear
            : current.endYear;
        if (_isEndBeforeStart(nextStartYear, nextEndYear)) {
            return _fail(
                'INVALID_YEARS',
                'endYear cannot be before startYear'
            );
        }

        if (patch.attributes !== undefined) {
            if (!Array.isArray(patch.attributes)) {
                return _fail('INVALID_ATTRIBUTES', 'attributes must be an array');
            }
            var uniqueness = Utils.validateAttributeUniqueness(patch.attributes);
            if (!uniqueness.valid) {
                return _fail('INVALID_ATTRIBUTES', uniqueness.errors.join('; '));
            }
        }

        if (patch.metadata !== undefined &&
            (patch.metadata === null ||
             typeof patch.metadata !== 'object' ||
             Array.isArray(patch.metadata))) {
            return _fail('INVALID_METADATA', 'metadata must be a plain object');
        }

        var appliedPatch = {
            status:     patch.status,
            startYear:  patch.startYear,
            endYear:    patch.endYear,
            attributes: patch.attributes ? patch.attributes.slice() : undefined,
            metadata:   patch.metadata ? Object.assign({}, patch.metadata) : undefined,
            updatedAt:  _now()
        };

        var result = State.applyUpdates([{ id: id, patch: appliedPatch }]);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ relationship: Queries.getById(id) });
    }

    // =========================================================================
    // 6. END
    //
    // Convenience for ending a single relationship. Callers that own a
    // transition table should validate the transition (ongoing -> ended)
    // before calling this, but RelationshipCommands will still refuse to
    // end a record that is not currently ongoing, because ending an
    // ended record is a structural error in every domain.
    //
    // endYear is required. reason, when supplied, is written to
    // metadata.endReason as a shallow merge.
    //
    // One commit.
    // =========================================================================

    function end(id, endYear, reason) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (typeof endYear !== 'number') {
            return _fail('MISSING_END_YEAR', 'endYear must be a number');
        }

        var current = State.getRecordCopy(id);
        if (!current) {
            return _fail('NOT_FOUND', 'relationship not found');
        }
        if (current.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'relationship is not ongoing');
        }

        // Phase 3.4 (adjacent): same chronology check as update.
        // A record whose startYear is later than the supplied endYear
        // is not logically endable.
        if (_isEndBeforeStart(current.startYear, endYear)) {
            return _fail(
                'INVALID_YEARS',
                'endYear cannot be before startYear'
            );
        }

        var patch = {
            status: STATUS.ENDED,
            endYear: endYear,
            updatedAt: _now()
        };
        if (reason !== undefined && reason !== null && reason !== '') {
            patch.metadata = { endReason: reason };
        }

        var result = State.applyUpdates([{ id: id, patch: patch }]);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ relationship: Queries.getById(id) });
    }

    // =========================================================================
    // 7. SET WIDOWED
    //
    // Domain-appropriate for romance. Structural: refuses non-ongoing
    // records. Writes endYear and metadata.endReason = 'death_of_partner'.
    //
    // One commit.
    // =========================================================================

    function setWidowed(id, endYear) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (typeof endYear !== 'number') {
            return _fail('MISSING_END_YEAR', 'endYear must be a number');
        }

        var current = State.getRecordCopy(id);
        if (!current) {
            return _fail('NOT_FOUND', 'relationship not found');
        }
        if (current.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'relationship is not ongoing');
        }

        // Phase 3.4 (adjacent): same chronology check as end.
        if (_isEndBeforeStart(current.startYear, endYear)) {
            return _fail(
                'INVALID_YEARS',
                'endYear cannot be before startYear'
            );
        }

        var result = State.applyUpdates([{
            id: id,
            patch: {
                status: STATUS.WIDOWED,
                endYear: endYear,
                metadata: { endReason: 'death_of_partner' },
                updatedAt: _now()
            }
        }]);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ relationship: Queries.getById(id) });
    }

    // =========================================================================
    // 8. REMOVE
    //
    // Structural removal. This is a hard delete from State. Callers that
    // need a historical record should call end(), not remove(). Use
    // remove() only when a record was created in error and never should
    // have existed.
    //
    // One commit.
    // =========================================================================

    function remove(id) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (!State.hasId(id)) {
            return _fail('NOT_FOUND', 'relationship not found');
        }

        var result = State.applyRemovals([id]);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ id: id });
    }

    // =========================================================================
    // 9. ATTRIBUTE PRIMITIVES
    //
    // Structural only. The caller's domain rules must validate that the
    // attribute is allowed for the archetype (and, for cultural
    // attributes, allowed for the participants' cultures). These
    // primitives refuse duplicates and unknown attribute ids, nothing
    // more.
    //
    // Both delegate to update(), so both are one commit.
    // =========================================================================

    function addAttribute(id, attribute) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (typeof attribute !== 'string' || attribute.length === 0) {
            return _fail('MISSING_ATTRIBUTE', 'attribute required');
        }
        if (!Types.isKnownAttribute(attribute)) {
            return _fail('UNKNOWN_ATTRIBUTE', 'unknown attribute: ' + attribute);
        }

        var current = State.getRecordCopy(id);
        if (!current) {
            return _fail('NOT_FOUND', 'relationship not found');
        }
        if (current.attributes.indexOf(attribute) !== -1) {
            return _ok({ relationship: current, unchanged: true });
        }

        var next = current.attributes.slice();
        next.push(attribute);

        return update(id, { attributes: next });
    }

    function removeAttribute(id, attribute) {
        if (typeof id !== 'string' || id.length === 0) {
            return _fail('MISSING_ID', 'id required');
        }
        if (typeof attribute !== 'string' || attribute.length === 0) {
            return _fail('MISSING_ATTRIBUTE', 'attribute required');
        }

        var current = State.getRecordCopy(id);
        if (!current) {
            return _fail('NOT_FOUND', 'relationship not found');
        }
        if (current.attributes.indexOf(attribute) === -1) {
            return _ok({ relationship: current, unchanged: true });
        }

        var next = current.attributes.filter(function(a) {
            return a !== attribute;
        });

        return update(id, { attributes: next });
    }

    // =========================================================================
    // 10. BATCH END
    //
    // endAllActiveForCharacter: end every ongoing record referencing a
    // character. Optional filters narrow by type and by role:
    //   options.type   — only end records of this archetype
    //   options.role   — 'a' | 'b' | 'either' (default 'either')
    //   options.endYear (required)
    //   options.reason
    //
    // One State batch, one markDataDirty, one subscriber notification.
    // =========================================================================

    function endAllActiveForCharacter(characterId, options) {
        options = options || {};
        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }
        if (typeof options.endYear !== 'number') {
            return _fail('MISSING_END_YEAR', 'endYear must be a number');
        }

        var role = options.role || 'either';
        if (role !== 'a' && role !== 'b' && role !== 'either') {
            return _fail('INVALID_ROLE', 'role must be a, b, or either');
        }

        var records = Queries.getForCharacter(characterId, { activeOnly: true });
        if (options.type !== undefined) {
            records = records.filter(function(r) { return r.type === options.type; });
        }

        var targets = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (role === 'a' && r.participantA !== characterId) continue;
            if (role === 'b' && r.participantB !== characterId) continue;
            targets.push(r);
        }

        if (targets.length === 0) {
            return _ok({ ended: [], count: 0 });
        }

        var now = _now();
        var metadataPatch = (options.reason !== undefined &&
                             options.reason !== null &&
                             options.reason !== '')
            ? { metadata: { endReason: options.reason } }
            : {};

        var updates = targets.map(function(r) {
            return {
                id: r.id,
                patch: Object.assign({
                    status: STATUS.ENDED,
                    endYear: options.endYear,
                    updatedAt: now
                }, metadataPatch)
            };
        });

        var result = State.applyUpdates(updates);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ ended: result.updated.slice(), count: result.updated.length });
    }

    // =========================================================================
    // 11. BATCH REMOVE
    //
    // removeAllReferencesTo: hard-remove every relationship record
    // referencing a character, in one batch. Used by
    // CharacterDeletionCommands on hard delete.
    //
    // One State batch, one markDataDirty, one subscriber notification.
    // =========================================================================

    function removeAllReferencesTo(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }

        var ids = State.idsForCharacter(characterId);
        if (ids.length === 0) {
            return _ok({ removed: [], count: 0 });
        }

        var result = State.applyRemovals(ids);
        if (!result.success) {
            return _fail('STATE_REJECTED', result.reason);
        }

        return _ok({ removed: result.removed.slice(), count: result.removed.length });
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.RelationshipCommands = {
        create: create,
        createBatch: createBatch,
        update: update,
        end: end,
        setWidowed: setWidowed,
        remove: remove,

        addAttribute: addAttribute,
        removeAttribute: removeAttribute,

        endAllActiveForCharacter: endAllActiveForCharacter,
        removeAllReferencesTo: removeAllReferencesTo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RelationshipCommands;
    }

})();
