/**
 * professional-commands.js
 *
 * Mutation boundary for professional relationships.
 *
 * DIRECTION
 *   apprenticeship    participantA = master,   participantB = apprentice
 *   mastership        participantA = master,   participantB = expert
 *   employment        participantA = employer, participantB = employee
 *   guild_membership  participantA = guild,    participantB = member
 *
 * Owns:
 *   - creating apprenticeships, masterships, employment, and guild
 *     memberships
 *   - progressing and completing an apprenticeship
 *   - updating guild rank
 *   - ending any of the four archetypes
 *   - one commit per logical operation
 *
 * Depends on:
 *   - ProfessionalRules for policy
 *   - ProfessionalQueries for existence checks
 *   - RelationshipCommands for state writes
 *   - RomanceQueries for the character name accessors (via
 *     getCharacterById)
 *   - SkillCommands for skill writes (required for apprenticeship
 *     progression; absence is a hard failure, not a silent skip)
 *   - CharacterCommands for character field updates (profession array
 *     updates, when applicable)
 *
 * SKILL WRITE PATH
 *   Apprentice skill progression modifies the character record.
 *   SkillCommands.updateSkillLevel is the canonical writer. This
 *   module never reaches into the character record directly.
 *
 * Does NOT own:
 *   - direct state access (goes through RelationshipCommands)
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness
 *   - queries
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, professional-rules.js,
 * professional-queries.js.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var PR = window.ProfessionalRules;
    var PQ = window.ProfessionalQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !PR || !PQ || !A || !STATUS) {
        throw new Error('professional-commands.js: relationship-commands.js, professional-rules.js, professional-queries.js must load first');
    }

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('professional-commands.js: getCharacterById required');
        }
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
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('professional-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error('professional-commands.js: calculateAge required');
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }

    function _ageAtYear(character, year) {
        if (!character || typeof character.birthYear !== 'number') return null;
        if (character.isDeceased && typeof character.deathYear === 'number' &&
            character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _skillProvider() {
        if (!window.SkillQueries) {
            throw new Error('professional-commands.js: SkillQueries required');
        }
        return window.SkillQueries;
    }

    function _skillWriter() {
        if (!window.SkillCommands || typeof window.SkillCommands.updateSkillLevel !== 'function') {
            throw new Error('professional-commands.js: SkillCommands.updateSkillLevel required');
        }
        return window.SkillCommands;
    }

    function _getSkillLevel(characterId, roleId) {
        if (!roleId) return null;
        var sp = _skillProvider();
        if (typeof sp.getSkillLevel !== 'function') {
            throw new Error('professional-commands.js: SkillQueries.getSkillLevel required');
        }
        var level = sp.getSkillLevel(characterId, roleId);
        return (typeof level === 'number') ? level : null;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
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
    // APPRENTICESHIP
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   roleId (required),
     *   roleName?,
     *   startYear?,
     *   initialSkill?,
     *   specializations?,
     *   notes?
     * }
     */
    function createApprenticeship(masterId, apprenticeId, options) {
        options = options || {};

        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return _fail('MISSING_ID', 'masterId and apprenticeId required');
        }
        if (masterId === apprenticeId) {
            return _fail('SAME_PERSON', 'cannot apprentice to self');
        }
        if (!_characterExists(masterId) || !_characterExists(apprenticeId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }
        if (typeof options.roleId !== 'string' || options.roleId.length === 0) {
            return _fail('MISSING_ROLE', 'roleId required');
        }

        var master = _getCharacter(masterId);
        var apprentice = _getCharacter(apprenticeId);

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var masterSkill = _getSkillLevel(masterId, options.roleId);
        var apprenticeSkill = _getSkillLevel(apprenticeId, options.roleId);

        var validation = PR.canCreateApprenticeship({
            masterId: masterId,
            apprenticeId: apprenticeId,
            masterSkillLevel: masterSkill,
            apprenticeSkillLevel: apprenticeSkill,
            masterAge: _ageAtYear(master, startYear),
            apprenticeAge: _ageAtYear(apprentice, startYear),
            roleId: options.roleId
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        // Already apprenticed to any master in the same role?
        var existingMasters = PQ.getMasterRelationships(apprenticeId);
        for (var i = 0; i < existingMasters.length; i++) {
            if (existingMasters[i].roleId === options.roleId) {
                return _fail('ALREADY_APPRENTICED',
                    'already apprenticed in role ' + options.roleId);
            }
        }

        var createResult = RC.create({
            participantA: masterId,
            participantB: apprenticeId,
            type: APPRENTICESHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: {
                roleId: options.roleId,
                roleName: (typeof options.roleName === 'string') ? options.roleName : null,
                skillLevel: (typeof apprenticeSkill === 'number') ? apprenticeSkill : 0,
                specializationsTaught: Array.isArray(options.specializations)
                    ? options.specializations.slice()
                    : [],
                notes: (typeof options.notes === 'string') ? options.notes : ''
            }
        });
        if (!createResult.success) return createResult;

        // Initialize apprentice skill if the caller asked for a higher
        // starting value than the current one.
        if (typeof options.initialSkill === 'number' &&
            (apprenticeSkill === null || options.initialSkill > apprenticeSkill)) {
            var writer = _skillWriter();
            writer.updateSkillLevel(apprenticeId, options.roleId, PR.clampSkill(options.initialSkill));
        }

        _logEvent('professional', 'Apprenticeship Formed',
            master.name + ' took ' + apprentice.name +
            ' as apprentice in ' + options.roleId,
            [master, apprentice]);

        var projection = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        return _ok({ relationship: projection });
    }

    /**
     * Progresses apprentice skill in the role by `amount` (default 1).
     * Syncs relationship metadata. One commit.
     */
    function progressApprenticeship(masterId, apprenticeId, amount) {
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return _fail('MISSING_ID', 'masterId and apprenticeId required');
        }

        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'apprenticeship not ongoing');
        }

        var roleId = rel.roleId;
        if (!roleId) return _fail('MISSING_ROLE', 'apprenticeship has no role');

        var check = PR.canProgressApprenticeship({ status: rel.status });
        if (!check.valid) {
            return _fail('INVALID', check.errors.join('; '));
        }

        var delta = (typeof amount === 'number' && !isNaN(amount)) ? amount : 1;
        var current = _getSkillLevel(apprenticeId, roleId);
        if (current === null) current = 0;

        var newSkill = PR.clampSkill(current + delta);
        var gained = newSkill - current;

        var writer = _skillWriter();
        writer.updateSkillLevel(apprenticeId, roleId, newSkill);

        RC.update(rel.relationshipId, {
            metadata: {
                skillLevel: newSkill,
                stage: PR.skillTier(newSkill)
            }
        });

        return _ok({
            relationshipId: rel.relationshipId,
            previousSkill: current,
            newSkill: newSkill,
            gained: gained,
            tier: PR.skillTier(newSkill)
        });
    }

    /**
     * Completes an apprenticeship: ends the relationship with reason
     * 'completed'. If finalSkill is provided, sets it first.
     */
    function completeApprenticeship(masterId, apprenticeId, finalSkill) {
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return _fail('MISSING_ID', 'masterId and apprenticeId required');
        }

        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'apprenticeship not ongoing');
        }

        var check = PR.canCompleteApprenticeship({
            status: rel.status,
            skillLevel: finalSkill
        });
        if (!check.valid) {
            return _fail('INVALID', check.errors.join('; '));
        }

        var year = _getCurrentYear();

        if (typeof finalSkill === 'number' && rel.roleId) {
            var writer = _skillWriter();
            writer.updateSkillLevel(apprenticeId, rel.roleId, PR.clampSkill(finalSkill));
        }

        var endResult = RC.end(rel.relationshipId, year, 'completed');
        if (!endResult.success) return endResult;

        _logEvent('professional', 'Apprenticeship Completed',
            _getCharacterName(apprenticeId) + ' completed apprenticeship with ' +
            _getCharacterName(masterId),
            [_getCharacter(masterId), _getCharacter(apprenticeId)]);

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    /**
     * options: { endYear?, reason? }
     */
    function endApprenticeship(masterId, apprenticeId, options) {
        options = options || {};

        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return _fail('MISSING_ID', 'masterId and apprenticeId required');
        }

        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = (typeof options.reason === 'string' && options.reason.length > 0)
            ? options.reason
            : 'apprenticeship ended';

        var result = RC.end(rel.relationshipId, year, reason);
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    // -------------------------------------------------------------------------
    // MASTERSHIP
    // -------------------------------------------------------------------------

    /**
     * options: { roleId?, startYear?, notes? }
     */
    function createMastership(masterId, expertId, options) {
        options = options || {};

        if (typeof masterId !== 'string' || typeof expertId !== 'string') {
            return _fail('MISSING_ID', 'masterId and expertId required');
        }
        if (masterId === expertId) {
            return _fail('SAME_PERSON', 'cannot be master of self');
        }
        if (!_characterExists(masterId) || !_characterExists(expertId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        // Reject duplicate active mastership between the same pair.
        var existing = RC ? window.RelationshipQueries.getActiveBetweenOfType(masterId, expertId, MASTERSHIP) : [];
        if (existing.length > 0) {
            return _fail('ALREADY_MASTERED', 'active mastership already exists');
        }

        var createResult = RC.create({
            participantA: masterId,
            participantB: expertId,
            type: MASTERSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: {
                roleId: typeof options.roleId === 'string' ? options.roleId : null,
                notes: (typeof options.notes === 'string') ? options.notes : ''
            }
        });
        if (!createResult.success) return createResult;

        _logEvent('professional', 'Mastership Formed',
            _getCharacterName(masterId) + ' became master of ' +
            _getCharacterName(expertId),
            [_getCharacter(masterId), _getCharacter(expertId)]);

        return _ok({ relationship: createResult.relationship });
    }

    function endMastership(masterId, expertId, options) {
        options = options || {};
        if (typeof masterId !== 'string' || typeof expertId !== 'string') {
            return _fail('MISSING_ID', 'masterId and expertId required');
        }

        var records = window.RelationshipQueries.getActiveBetweenOfType(masterId, expertId, MASTERSHIP);
        var target = null;
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA === masterId &&
                records[i].participantB === expertId) {
                target = records[i];
                break;
            }
        }
        if (!target) return _fail('NOT_FOUND', 'no active mastership');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = (typeof options.reason === 'string' && options.reason.length > 0)
            ? options.reason
            : 'mastership ended';

        var result = RC.end(target.id, year, reason);
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(target.id) });
    }

    // -------------------------------------------------------------------------
    // EMPLOYMENT
    // -------------------------------------------------------------------------

    /**
     * options: { role?, wages?, startYear?, notes? }
     */
    function createEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId required');
        }
        if (employerId === employeeId) {
            return _fail('SAME_PERSON', 'cannot employ self');
        }
        if (!_characterExists(employerId) || !_characterExists(employeeId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
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

        var createResult = RC.create({
            participantA: employerId,
            participantB: employeeId,
            type: EMPLOYMENT,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: {
                role: typeof options.role === 'string' ? options.role : null,
                wages: (typeof options.wages === 'number') ? options.wages : 0,
                notes: (typeof options.notes === 'string') ? options.notes : ''
            }
        });
        if (!createResult.success) return createResult;

        _logEvent('professional', 'Employment Formed',
            _getCharacterName(employeeId) + ' employed by ' +
            _getCharacterName(employerId),
            [employer, employee]);

        return _ok({ relationship: createResult.relationship });
    }

    /**
     * options: { endYear?, reason? }
     */
    function endEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId required');
        }

        var rel = PQ.getEmploymentBetween(employerId, employeeId);
        if (!rel) return _fail('NOT_FOUND', 'no employment found');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = (typeof options.reason === 'string' && options.reason.length > 0)
            ? options.reason
            : 'employment ended';

        var result = RC.end(rel.relationshipId, year, reason);
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    /**
     * options: { role?, wages?, notes? }
     */
    function updateEmployment(employerId, employeeId, options) {
        options = options || {};

        if (typeof employerId !== 'string' || typeof employeeId !== 'string') {
            return _fail('MISSING_ID', 'employerId and employeeId required');
        }

        var rel = PQ.getEmploymentBetween(employerId, employeeId);
        if (!rel) return _fail('NOT_FOUND', 'no employment found');

        var patch = {};
        if (typeof options.role === 'string') patch.role = options.role;
        if (typeof options.wages === 'number') patch.wages = options.wages;
        if (typeof options.notes === 'string') patch.notes = options.notes;

        if (Object.keys(patch).length === 0) {
            return _fail('NO_UPDATES', 'nothing to update');
        }

        var result = RC.update(rel.relationshipId, { metadata: patch });
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    // -------------------------------------------------------------------------
    // GUILD MEMBERSHIP
    // -------------------------------------------------------------------------

    /**
     * options: { rank?, startYear?, notes? }
     */
    function createGuildMembership(guildId, memberId, options) {
        options = options || {};

        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId required');
        }
        if (guildId === memberId) {
            return _fail('SAME_PERSON', 'character cannot be their own guild');
        }
        if (!_characterExists(guildId) || !_characterExists(memberId)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
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

        var createResult = RC.create({
            participantA: guildId,
            participantB: memberId,
            type: GUILD_MEMBERSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: {
                rank: typeof options.rank === 'string' ? options.rank : null,
                notes: (typeof options.notes === 'string') ? options.notes : ''
            }
        });
        if (!createResult.success) return createResult;

        _logEvent('professional', 'Guild Membership',
            _getCharacterName(memberId) + ' joined guild ' +
            _getCharacterName(guildId),
            [_getCharacter(guildId), member]);

        return _ok({ relationship: createResult.relationship });
    }

    /**
     * options: { endYear?, reason? }
     */
    function removeGuildMembership(guildId, memberId, options) {
        options = options || {};

        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId required');
        }

        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active guild membership');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = (typeof options.reason === 'string' && options.reason.length > 0)
            ? options.reason
            : 'left guild';

        var result = RC.end(rel.relationshipId, year, reason);
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    function setGuildRank(guildId, memberId, rank) {
        if (typeof guildId !== 'string' || typeof memberId !== 'string') {
            return _fail('MISSING_ID', 'guildId and memberId required');
        }

        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active guild membership');

        var result = RC.update(rel.relationshipId, {
            metadata: { rank: typeof rank === 'string' ? rank : null }
        });
        if (!result.success) return result;

        return _ok({ relationship: window.RelationshipQueries.getById(rel.relationshipId) });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.ProfessionalCommands = {
        createApprenticeship: createApprenticeship,
        progressApprenticeship: progressApprenticeship,
        completeApprenticeship: completeApprenticeship,
        endApprenticeship: endApprenticeship,

        createMastership: createMastership,
        endMastership: endMastership,

        createEmployment: createEmployment,
        updateEmployment: updateEmployment,
        endEmployment: endEmployment,

        createGuildMembership: createGuildMembership,
        removeGuildMembership: removeGuildMembership,
        setGuildRank: setGuildRank
    };

})();
