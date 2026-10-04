/**
 * relationship-commands.js
 *
 * Mutation boundary for relationship records.
 *
 * Owns:
 *   - id generation
 *   - structural validation of create / update / end / remove
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
 * no duplicates, metadata is a plain object. Nothing more.
 *
 * CONTRACT
 *
 *   - Every command returns { success: true, ... } or
 *     { success: false, code, message }.
 *   - Never throws for domain errors.
 *   - One logical mutation = one batch call to State = one markDataDirty.
 *   - Multi-record operations (endAllActiveForCharacter, removeAllReferencesTo)
 *     commit once.
 *
 * Load order: after relationship-state.js, relationship-types.js,
 * relationship-utils.js, and relationship-queries.js.
 */

(function() {
    'use strict';

    var State   = window.RelationshipState;
    var Utils   = window.RelationshipUtils;
    var Types   = window.RELATIONSHIP_TYPES;
    var STATUS  = window.RELATIONSHIP_STATUS;
    var Queries = window.RelationshipQueries;

    if (!State || !Utils || !Types || !STATUS || !Queries) {
        throw new Error('relationship-commands.js: state, utils, types, queries must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _generateId() {
        if (typeof window.generateId !== 'function') {
            throw new Error('relationship-commands.js: generateId required');
        }
        return window.generateId('rel');
    }

    function _now() {
        return Date.now();
    }

    // -------------------------------------------------------------------------
    // RESULT HELPERS
    // -------------------------------------------------------------------------

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // -------------------------------------------------------------------------
    // STRUCTURAL VALIDATION
    //
    // This is the only validation RelationshipCommands performs. It
    // refuses records State cannot index. Domain policy is the caller's
    // responsibility.
    // -------------------------------------------------------------------------

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

        if (input.attributes !== undefined && !Array.isArray(input.attributes)) {
            errors.push('invalid_attributes');
        }

        if (input.metadata !== undefined &&
            (input.metadata === null || typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
            errors.push('invalid_metadata');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------
    // CREATE
    //
    // input: {
    //   participantA, participantB, type,
    //   status,                 required
    //   startYear?, endYear?,
    //   attributes?, metadata?
    // }
    //
    // Returns { success: true, relationship: <projection> }.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // UPDATE
    //
    // patch: { status?, endYear?, attributes?, metadata?, startYear? }
    //
    // Status transitions are validated by the caller's domain rules
    // against that domain's transition table. RelationshipCommands does
    // not know what any status value means.
    //
    // Metadata is a shallow merge. Attributes is a full replace.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // END
    //
    // Convenience for ending a single relationship. Callers that own a
    // transition table should validate the transition (ongoing -> ended)
    // before calling this, but RelationshipCommands will still refuse to
    // end a record that is not currently ongoing, because ending an
    // ended record is a structural error in every domain.
    //
    // endYear is required. reason, when supplied, is written to
    // metadata.endReason as a shallow merge.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // SET WIDOWED
    //
    // Domain-appropriate for romance. Structural: refuses non-ongoing
    // records. Writes endYear and metadata.endReason = 'death_of_partner'.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // REMOVE
    //
    // Structural removal. This is a hard delete from State. Callers that
    // need a historical record should call end(), not remove(). Use
    // remove() only when a record was created in error and never should
    // have existed.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // ATTRIBUTE PRIMITIVES
    //
    // Structural only. The caller's domain rules must validate that the
    // attribute is allowed for the archetype (and, for cultural
    // attributes, allowed for the participants' cultures). These
    // primitives refuse duplicates and unknown attribute ids, nothing
    // more.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // BATCH END
    //
    // endAllActiveForCharacter: end every ongoing record referencing a
    // character. Optional filters narrow by type and by role:
    //   options.type   — only end records of this archetype
    //   options.role   — 'a' | 'b' | 'either' (default 'either')
    //   options.endYear (required)
    //   options.reason
    //
    // One State batch, one markDataDirty, one subscriber notification.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // BATCH REMOVE
    //
    // removeAllReferencesTo: hard-remove every relationship record
    // referencing a character, in one batch. Used by
    // CharacterDeletionCommands on hard delete.
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipCommands = {
        create: create,
        update: update,
        end: end,
        setWidowed: setWidowed,
        remove: remove,

        addAttribute: addAttribute,
        removeAttribute: removeAttribute,

        endAllActiveForCharacter: endAllActiveForCharacter,
        removeAllReferencesTo: removeAllReferencesTo
    };

})();
