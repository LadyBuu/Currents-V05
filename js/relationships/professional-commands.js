/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL COMMANDS (professional-commands.js)
 * =============================================================================
 *
 * LOCATION: js/social/professional-commands.js
 *
 * Mutation boundary for professional relationship edges.
 *
 * DIRECTION
 *
 *   apprenticeship    A = master,     B = apprentice
 *   mastership        A = master,     B = expert
 *   employment        A = employer,   B = employee
 *   guild_membership  A = guild,      B = member
 *
 * OWNERSHIP
 *
 *   ProfessionalCommands owns:
 *       - the edge primitive: createEdge, updateEdgeMetadata,
 *         updateEdgeFields, endEdge, removeEdge — the only sanctioned
 *         entry points for writing a professional edge into
 *         RelationshipState
 *       - the mastership edge commands (createMastership, endMastership)
 *       - the employment edge commands (createEmployment,
 *         updateEmployment, endEmployment)
 *       - the guild membership commands (createGuildMembership,
 *         removeGuildMembership, setGuildRank)
 *
 *   ProfessionalCommands does NOT own:
 *       - apprenticeship lifecycle
 *             → ApprenticeshipCommands
 *       - apprenticeship progression and teaching policy
 *             → ApprenticeshipRules
 *       - skill writes
 *             → CharacterCommands.updateProfession
 *       - role catalogue or specialization membership
 *             → RoleRules
 *       - state
 *             → RelationshipState (via RelationshipCommands)
 *
 * EDGE PRIMITIVE — TWO UPDATE PATHS
 *
 *   updateEdgeMetadata(id, patch)  — shallow-merges into record.metadata.
 *                                    Never touches status, startYear,
 *                                    endYear, participants, or type.
 *
 *   updateEdgeFields(id, patch)    — patches edge-level fields (startYear,
 *                                    endYear). Never touches metadata or
 *                                    participants. Status changes go
 *                                    through endEdge.
 *
 *   Both paths delegate to RelationshipCommands.update, which is the
 *   single writer for relationship records.
 *
 * DEPENDENCIES (must be loaded first):
 *   - relationship-types.js    (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - relationship-commands.js (RelationshipCommands)
 *   - relationship-queries.js  (RelationshipQueries — used by end/update)
 *   - professional-rules.js    (ProfessionalRules)
 *   - professional-queries.js  (ProfessionalQueries)
 *   - character-queries.js     (getCharacterById, calculateAge)
 *   - time.js                  (getCurrentYearSafe)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RelationshipCommands) {
        throw new Error(
            'professional-commands.js requires relationship-commands.js ' +
            '(RelationshipCommands) first.'
        );
    }
    if (!window.RelationshipQueries) {
        throw new Error(
            'professional-commands.js requires relationship-queries.js ' +
            '(RelationshipQueries) first.'
        );
    }
    if (!window.ProfessionalRules) {
        throw new Error(
            'professional-commands.js requires professional-rules.js ' +
            '(ProfessionalRules) first.'
        );
    }
    if (!window.ProfessionalQueries) {
        throw new Error(
            'professional-commands.js requires professional-queries.js ' +
            '(ProfessionalQueries) first.'
        );
    }
    if (!window.RELATIONSHIP_ARCHETYPES) {
        throw new Error(
            'professional-commands.js requires relationship-types.js ' +
            '(RELATIONSHIP_ARCHETYPES) first.'
        );
    }
    if (!window.RELATIONSHIP_STATUS) {
        throw new Error(
            'professional-commands.js requires relationship-types.js ' +
            '(RELATIONSHIP_STATUS) first.'
        );
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'professional-commands.js requires character-queries.js ' +
            '(getCharacterById) first.'
        );
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error(
            'professional-commands.js requires time.js ' +
            '(getCurrentYearSafe) first.'
        );
    }

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var PR = window.ProfessionalRules;
    var PQ = window.ProfessionalQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacter(id) {
        return window.getCharacterById(id);
    }

    function _characterExists(id) {
        return !!_getCharacter(id);
    }

    function _getCharacterName(id) {
        var c = _getCharacter(id);
        return c && typeof c.name === 'string' ? c.name : id;
    }

    function _getCurrentYear() {
        return window.getCurrentYearSafe();
    }

    function _ageAtYear(character, year) {
        if (!character || typeof character.birthYear !== 'number') return null;
        if (character.isDeceased &&
            typeof character.deathYear === 'number' &&
            character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _archetypeId(name) {
        if (name === 'apprenticeship')   return APPRENTICESHIP;
        if (name === 'mastership')       return MASTERSHIP;
        if (name === 'employment')       return EMPLOYMENT;
        if (name === 'guild_membership') return GUILD_MEMBERSHIP;
        return null;
    }

    // =========================================================================
    // 3. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data) {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    // =========================================================================
    // 4. EDGE PRIMITIVE
    // =========================================================================

    /**
     * @param {Object} args
     * @param {string} args.archetype
     * @param {string} args.participantA
     * @param {string} args.participantB
     * @param {number} [args.startYear]
     * @param {Object} [args.metadata]
     * @param {string} [args.status]
     */
    function createEdge(args) {
        if (!args || typeof args !== 'object') {
            return _fail('MISSING_ARGS', 'args object is required');
        }
        if (typeof args.archetype !== 'string') {
            return _fail('MISSING_ARCHETYPE', 'archetype is required');
        }
        var type = _archetypeId(args.archetype);
        if (!type) {
            return _fail('UNKNOWN_ARCHETYPE',
                'Unknown professional archetype: ' + args.archetype);
        }
        if (typeof args.participantA !== 'string' || args.participantA.length === 0) {
            return _fail('MISSING_PARTICIPANT_A', 'participantA is required');
        }
        if (typeof args.participantB !== 'string' || args.participantB.length === 0) {
            return _fail('MISSING_PARTICIPANT_B', 'participantB is required');
        }
        if (args.participantA === args.participantB) {
            return _fail('SAME_PERSON', 'participants must be distinct');
        }

        var attrs = PR.validateAttributes(args.metadata && args.metadata.attributes);
        if (!attrs.valid) {
            return _fail('INVALID_ATTRIBUTES', attrs.errors.join('; '));
        }

        var createResult = RC.create({
            participantA: args.participantA,
            participantB: args.participantB,
            type: type,
            status: typeof args.status === 'string' ? args.status : STATUS.ONGOING,
            startYear: (typeof args.startYear === 'number') ? args.startYear : null,
            attributes: [],
            metadata: args.metadata && typeof args.metadata === 'object'
                ? args.metadata
                : {}
        });

        if (!createResult || !createResult.success) {
            return _fail(
                (createResult && createResult.code) || 'EDGE_CREATE_FAILED',
                (createResult && createResult.message) || 'Failed to create professional edge'
            );
        }

        return _ok({ relationshipId: createResult.relationshipId });
    }

    /**
     * Shallow merge into the edge metadata. Never touches status,
     * startYear, endYear, participants, or type.
     */
    function updateEdgeMetadata(relationshipId, patch) {
        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId is required');
        }
        if (!patch || typeof patch !== 'object') {
            return _fail('MISSING_PATCH', 'patch object is required');
        }

        var result = RC.update(relationshipId, { metadata: patch });
        if (!result || !result.success) {
            return _fail(
                (result && result.code) || 'EDGE_UPDATE_FAILED',
                (result && result.message) || 'Failed to update professional edge'
            );
        }

        return _ok({ relationshipId: relationshipId });
    }

    /**
     * Patch edge-level fields. Permitted keys:
     *
     *   startYear   number | null
     *   endYear     number | null
     *
     * Forbidden keys (returned as an error):
     *
     *   status         → use endEdge
     *   metadata       → use updateEdgeMetadata
     *   participantA   → immutable
     *   participantB   → immutable
     *   type           → immutable
     *   id             → immutable
     *
     * Unknown keys are silently ignored to keep the call site terse;
     * forbidden keys are rejected loudly because silently dropping a
     * status change would hide a caller bug.
     */
    var EDGE_FIELD_ALLOW = {
        startYear: true,
        endYear: true
    };

    var EDGE_FIELD_FORBID = {
        status: 'status changes go through endEdge',
        metadata: 'metadata changes go through updateEdgeMetadata',
        participantA: 'participantA is immutable',
        participantB: 'participantB is immutable',
        type: 'type is immutable',
        id: 'id is immutable'
    };

    function updateEdgeFields(relationshipId, patch) {
        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId is required');
        }
        if (!patch || typeof patch !== 'object') {
            return _fail('MISSING_PATCH', 'patch object is required');
        }

        var safe = {};
        var sawAny = false;

        for (var key in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;

            if (EDGE_FIELD_FORBID[key]) {
                return _fail(
                    'FORBIDDEN_FIELD',
                    'Cannot patch "' + key + '" on an edge: ' + EDGE_FIELD_FORBID[key]
                );
            }

            if (!EDGE_FIELD_ALLOW[key]) continue;

            var v = patch[key];
            if (v !== null && (typeof v !== 'number' || !isFinite(v))) {
                return _fail(
                    'INVALID_FIELD',
                    '"' + key + '" must be a finite number or null'
                );
            }
            safe[key] = v;
            sawAny = true;
        }

        if (!sawAny) {
            return _fail('NO_UPDATES', 'no permitted edge fields supplied');
        }

        var result = RC.update(relationshipId, safe);
        if (!result || !result.success) {
            return _fail(
                (result && result.code) || 'EDGE_UPDATE_FAILED',
                (result && result.message) || 'Failed to update professional edge fields'
            );
        }

        return _ok({ relationshipId: relationshipId });
    }

    /**
     * Ongoing → ended. Fails if the edge is not ongoing.
     */
    function endEdge(relationshipId, endYear, reason) {
        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId is required');
        }

        var year = (typeof endYear === 'number') ? endYear : _getCurrentYear();
        var why = (typeof reason === 'string' && reason.length > 0)
            ? reason
            : 'ended';

        var result = RC.end(relationshipId, year, why);
        if (!result || !result.success) {
            return _fail(
                (result && result.code) || 'EDGE_END_FAILED',
                (result && result.message) || 'Failed to end professional edge'
            );
        }

        return _ok({ relationshipId: relationshipId });
    }

    /**
     * Hard remove. Used by delete-cleanup; not a normal lifecycle path.
     */
    function removeEdge(relationshipId) {
        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId is required');
        }

        var result = RC.remove(relationshipId);
        if (!result || !result.success) {
            return _fail(
                (result && result.code) || 'EDGE_REMOVE_FAILED',
                (result && result.message) || 'Failed to remove professional edge'
            );
        }

        return _ok({ relationshipId: relationshipId });
    }

    // =========================================================================
    // 5. MASTERSHIP
    // =========================================================================

    function createMastership(masterId, expertId, options) {
        options = options || {};

        if (typeof masterId !== 'string' || typeof expertId !== 'string') {
            return _fail('MISSING_ID', 'masterId and expertId are required');
        }
        if (masterId === expertId) {
            return _fail('SAME_PERSON', 'cannot be master of self');
        }
        if (!_characterExists(masterId) || !_characterExists(expertId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var existing = RQ.getActiveBetweenOfType(masterId, expertId, MASTERSHIP);
        if (existing.length > 0) {
            return _fail('ALREADY_MASTERED', 'active mastership already exists');
        }

        var startYear = (typeof options.startYear === 'number')
            ? options.startYear
            : _getCurrentYear();

        var result = createEdge({
            archetype: 'mastership',
            participantA: masterId,
            participantB: expertId,
            startYear: startYear,
            metadata: {
                roleId: typeof options.roleId === 'string' ? options.roleId : null,
                notes: typeof options.notes === 'string' ? options.notes : ''
            }
        });
        if (!result.success) return result;

        _logEvent('professional', 'Mastership Formed',
            _getCharacterName(masterId) + ' became master of ' +
            _getCharacterName(expertId),
            [_getCharacter(masterId), _getCharacter(expertId)]);

        return _ok({
            relationshipId: result.relationshipId,
            relationship: RQ.getById(result.relationshipId)
        });
    }

    function endMastership(masterId, expertId, options) {
        options = options || {};

        if (typeof masterId !== 'string' || typeof expertId !== 'string') {
            return _fail('MISSING_ID', 'masterId and expertId are required');
        }

        var records = RQ.getActiveBetweenOfType(masterId, expertId, MASTERSHIP);
        var target = null;
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA === masterId &&
                records[i].participantB === expertId) {
                target = records[i];
                break;
            }
        }
        if (!target) return _fail('NOT_FOUND', 'no active mastership');

        var result = endEdge(
            target.id,
            options.endYear,
            typeof options.reason === 'string' ? options.reason : 'mastership ended'
        );
        if (!result.success) return result;

        return _ok({
            relationshipId: target.id,
            relationship: RQ.getById(target.id)
        });
    }

    // =========================================================================
    // 6. EMPLOYMENT
    // =========================================================================

    function createEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId are required');
        }
        if (employerId === employeeId) {
            return _fail('SAME_PERSON', 'cannot employ self');
        }
        if (!_characterExists(employerId) || !_characterExists(employeeId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = (typeof options.startYear === 'number')
            ? options.startYear
            : _getCurrentYear();

        var employer = _getCharacter(employerId);
        var employee = _getCharacter(employeeId);

        var validation = PR.canCreateEmployment({
            employerId: employerId,
            employeeId: employeeId,
            employerAge: _ageAtYear(employer, startYear),
            employeeAge: _ageAtYear(employee, startYear)
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        if (PQ.getEmploymentBetween(employerId, employeeId)) {
            return _fail('ALREADY_EMPLOYED', 'already employed by this employer');
        }

        var result = createEdge({
            archetype: 'employment',
            participantA: employerId,
            participantB: employeeId,
            startYear: startYear,
            metadata: {
                role: typeof options.role === 'string' ? options.role : null,
                wages: (typeof options.wages === 'number') ? options.wages : 0,
                notes: typeof options.notes === 'string' ? options.notes : ''
            }
        });
        if (!result.success) return result;

        _logEvent('professional', 'Employment Formed',
            _getCharacterName(employeeId) + ' employed by ' +
            _getCharacterName(employerId),
            [employer, employee]);

        return _ok({
            relationshipId: result.relationshipId,
            relationship: RQ.getById(result.relationshipId)
        });
    }

    function updateEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId are required');
        }

        var rel = PQ.getEmploymentBetween(employerId, employeeId);
        if (!rel) return _fail('NOT_FOUND', 'no active employment');

        var patch = {};
        if (typeof options.role === 'string')  patch.role = options.role;
        if (typeof options.wages === 'number') patch.wages = options.wages;
        if (typeof options.notes === 'string') patch.notes = options.notes;

        if (Object.keys(patch).length === 0) {
            return _fail('NO_UPDATES', 'nothing to update');
        }

        var result = updateEdgeMetadata(rel.relationshipId, patch);
        if (!result.success) return result;

        return _ok({
            relationshipId: rel.relationshipId,
            relationship: RQ.getById(rel.relationshipId)
        });
    }

    function endEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId are required');
        }

        var rel = PQ.getEmploymentBetween(employerId, employeeId);
        if (!rel) return _fail('NOT_FOUND', 'no active employment');

        var result = endEdge(
            rel.relationshipId,
            options.endYear,
            typeof options.reason === 'string' ? options.reason : 'employment ended'
        );
        if (!result.success) return result;

        return _ok({
            relationshipId: rel.relationshipId,
            relationship: RQ.getById(rel.relationshipId)
        });
    }

    // =========================================================================
    // 7. GUILD MEMBERSHIP
    // =========================================================================

    function createGuildMembership(guildId, memberId, options) {
        options = options || {};

        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId are required');
        }
        if (guildId === memberId) {
            return _fail('SAME_PERSON', 'character cannot be their own guild');
        }
        if (!_characterExists(guildId) || !_characterExists(memberId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = (typeof options.startYear === 'number')
            ? options.startYear
            : _getCurrentYear();

        var member = _getCharacter(memberId);

        var validation = PR.canCreateGuildMembership({
            guildId: guildId,
            memberId: memberId,
            memberAge: _ageAtYear(member, startYear),
            rank: options.rank
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        if (PQ.isInGuild(memberId, guildId)) {
            return _fail('ALREADY_MEMBER', 'already a member of this guild');
        }

        var result = createEdge({
            archetype: 'guild_membership',
            participantA: guildId,
            participantB: memberId,
            startYear: startYear,
            metadata: {
                rank: typeof options.rank === 'string' ? options.rank : null,
                notes: typeof options.notes === 'string' ? options.notes : ''
            }
        });
        if (!result.success) return result;

        _logEvent('professional', 'Guild Membership',
            _getCharacterName(memberId) + ' joined guild ' +
            _getCharacterName(guildId),
            [_getCharacter(guildId), member]);

        return _ok({
            relationshipId: result.relationshipId,
            relationship: RQ.getById(result.relationshipId)
        });
    }

    function removeGuildMembership(guildId, memberId, options) {
        options = options || {};

        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId are required');
        }

        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active guild membership');

        var result = endEdge(
            rel.relationshipId,
            options.endYear,
            typeof options.reason === 'string' ? options.reason : 'left guild'
        );
        if (!result.success) return result;

        return _ok({
            relationshipId: rel.relationshipId,
            relationship: RQ.getById(rel.relationshipId)
        });
    }

    function setGuildRank(guildId, memberId, rank) {
        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId are required');
        }

        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active guild membership');

        var result = updateEdgeMetadata(rel.relationshipId, {
            rank: typeof rank === 'string' ? rank : null
        });
        if (!result.success) return result;

        return _ok({
            relationshipId: rel.relationshipId,
            relationship: RQ.getById(rel.relationshipId)
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ProfessionalCommands = {
        // Edge primitive
        createEdge: createEdge,
        updateEdgeMetadata: updateEdgeMetadata,
        updateEdgeFields: updateEdgeFields,
        endEdge: endEdge,
        removeEdge: removeEdge,

        // Mastership
        createMastership: createMastership,
        endMastership: endMastership,

        // Employment
        createEmployment: createEmployment,
        updateEmployment: updateEmployment,
        endEmployment: endEmployment,

        // Guild membership
        createGuildMembership: createGuildMembership,
        removeGuildMembership: removeGuildMembership,
        setGuildRank: setGuildRank
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalCommands;
    }
})();
