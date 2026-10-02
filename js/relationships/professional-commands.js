/**
 * professional-commands.js
 *
 * Mutation and transaction boundary for professional relationships.
 * Orchestrates rules + queries + RelationshipCommands.
 *
 * DIRECTION:
 *   APPRENTICESHIP   A = master,   B = apprentice
 *   EMPLOYMENT       A = employer, B = employee
 *   GUILD_MEMBERSHIP A = guild,    B = member
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var PR = window.ProfessionalRules;
    var PQ = window.ProfessionalQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !PR || !PQ || !A || !STATUS) {
        throw new Error('professional-commands.js: relationship-* and professional-rules/queries must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('professional-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('professional-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _ageAtYear(character, year) {
        if (!character || !character.birthYear) return 0;
        if (character.isDeceased && character.deathYear && character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _skillProvider() {
        if (!window.SkillQueries || typeof window.SkillQueries.getSkillLevel !== 'function') {
            throw new Error('professional-commands.js: SkillQueries.getSkillLevel required');
        }
        return window.SkillQueries;
    }

    function _getSkillLevel(characterId, roleId) {
        return _skillProvider().getSkillLevel(characterId, roleId) || 0;
    }

    function _setSkillLevel(characterId, roleId, level) {
        var sp = _skillProvider();
        if (typeof sp.setSkillLevel !== 'function') {
            throw new Error('professional-commands.js: SkillQueries.setSkillLevel required');
        }
        return sp.setSkillLevel(characterId, roleId, level);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _commit() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

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
     *   startYear,
     *   initialSkill (default 0),
     *   specializations (array),
     *   notes
     * }
     */
    function createApprenticeship(masterId, apprenticeId, options) {
        options = options || {};
        if (!masterId || !apprenticeId) return _fail('MISSING_ID', 'master and apprentice required');
        if (masterId === apprenticeId) return _fail('SAME_PERSON', 'cannot apprentice to self');
        if (!options.roleId) return _fail('MISSING_ROLE', 'roleId required');

        var master = _getCharacter(masterId);
        var apprentice = _getCharacter(apprenticeId);
        if (!master || !apprentice) return _fail('MISSING_CHARACTER', 'character not found');

        var startYear = options.startYear !== undefined ? options.startYear : _getCurrentYear();
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

        // Already apprenticed to someone in same role?
        var existingMasters = PQ.getMasterRelationships(apprenticeId, { activeOnly: true });
        for (var i = 0; i < existingMasters.length; i++) {
            var m = existingMasters[i];
            if (m.metadata && m.metadata.roleId === options.roleId) {
                return _fail('ALREADY_APPRENTICED',
                    'Already apprenticed in role ' + options.roleId);
            }
        }

        var createResult = RC.create({
            participantA: masterId,
            participantB: apprenticeId,
            type: A.APPRENTICESHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                roleId: options.roleId,
                roleName: options.roleName || null,
                skillLevel: apprenticeSkill,
                specializationsTaught: options.specializations || [],
                notes: options.notes || ''
            }
        });
        if (!createResult.success) return createResult;

        // Initialize apprentice skill if lower than requested
        if (typeof options.initialSkill === 'number' && options.initialSkill > apprenticeSkill) {
            _setSkillLevel(apprenticeId, options.roleId, options.initialSkill);
        }

        _logEvent('professional', 'Apprenticeship Formed',
            master.name + ' took ' + apprentice.name + ' as apprentice in ' + options.roleId,
            [master, apprentice]);
        _commit();

        return _ok({ relationship: createResult.relationship });
    }

    /**
     * Increases apprentice skill in the role, and syncs the relationship
     * metadata.
     */
    function progressApprenticeship(masterId, apprenticeId, amount) {
        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'apprenticeship not ongoing');

        var meta = rel.metadata || {};
        var roleId = meta.roleId;
        if (!roleId) return _fail('MISSING_ROLE', 'apprenticeship has no role');

        var validation = PR.canProgressApprenticeship({ status: rel.status });
        if (!validation.valid) return _fail('INVALID', validation.errors.join('; '));

        var delta = (typeof amount === 'number') ? amount : 1;
        var currentSkill = _getSkillLevel(apprenticeId, roleId);
        var newSkill = PR.clampSkill(currentSkill + delta);
        var gained = newSkill - currentSkill;

        _setSkillLevel(apprenticeId, roleId, newSkill);

        RC.update(rel.id, {
            metadata: {
                skillLevel: newSkill,
                stage: PR.skillTier(newSkill)
            }
        });

        _commit();
        return _ok({
            previousSkill: currentSkill,
            newSkill: newSkill,
            gained: gained,
            tier: PR.skillTier(newSkill)
        });
    }

    /**
     * Completes the apprenticeship: ends the relationship with reason
     * "completed".
     */
    function completeApprenticeship(masterId, apprenticeId, finalSkill) {
        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'apprenticeship not ongoing');

        var validation = PR.canCompleteApprenticeship({
            status: rel.status,
            skillLevel: finalSkill
        });
        if (!validation.valid) return _fail('INVALID', validation.errors.join('; '));

        var year = _getCurrentYear();
        var meta = rel.metadata || {};
        var roleId = meta.roleId;
        if (roleId && typeof finalSkill === 'number') {
            _setSkillLevel(apprenticeId, roleId, PR.clampSkill(finalSkill));
        }

        var endResult = RC.end(rel.id, year, 'completed');
        if (!endResult.success) return endResult;

        _logEvent('professional', 'Apprenticeship Completed',
            apprenticeId + ' completed apprenticeship with ' + masterId,
            [_getCharacter(masterId), _getCharacter(apprenticeId)]);
        _commit();
        return _ok({ relationship: endResult.relationship });
    }

    function endApprenticeship(masterId, apprenticeId, options) {
        options = options || {};
        var rel = PQ.getApprenticeshipBetween(masterId, apprenticeId);
        if (!rel) return _fail('NOT_FOUND', 'no active apprenticeship');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'ended';

        var result = RC.end(rel.id, year, reason);
        if (result.success) _commit();
        return result;
    }

    // -------------------------------------------------------------------------
    // EMPLOYMENT
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   role, wages, startYear, notes
     * }
     */
    function createEmployment(employerId, employeeId, options) {
        options = options || {};
        if (!employerId || !employeeId) return _fail('MISSING_ID', 'employer and employee required');
        if (employerId === employeeId) return _fail('SAME_PERSON', 'cannot employ self');

        var employer = _getCharacter(employerId);
        var employee = _getCharacter(employeeId);
        if (!employer || !employee) return _fail('MISSING_CHARACTER', 'character not found');

        var startYear = options.startYear !== undefined ? options.startYear : _getCurrentYear();

        var validation = PR.canCreateEmployment({
            employerId: employerId,
            employeeId: employeeId,
            employerAge: _ageAtYear(employer, startYear),
            employeeAge: _ageAtYear(employee, startYear)
        });
        if (!validation.valid) return _fail('VALIDATION_FAILED', validation.errors.join('; '));

        // Cannot be employed by same employer twice for same role
        var existing = PQ.getEmploymentBetween(employerId, employeeId);
        if (existing && existing.status === STATUS.ONGOING) {
            return _fail('ALREADY_EMPLOYED', 'already employed by this employer');
        }

        var createResult = RC.create({
            participantA: employerId,
            participantB: employeeId,
            type: A.EMPLOYMENT,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                role: options.role || null,
                wages: (typeof options.wages === 'number') ? options.wages : 0,
                notes: options.notes || ''
            }
        });
        if (!createResult.success) return createResult;

        _logEvent('professional', 'Employment Formed',
            employee.name + ' employed by ' + employer.name,
            [employer, employee]);
        _commit();
        return _ok({ relationship: createResult.relationship });
    }

    function endEmployment(employerId, employeeId, options) {
        options = options || {};
        var rel = PQ.getEmploymentBetween(employerId, employeeId);
        if (!rel) return _fail('NOT_FOUND', 'no employment found');
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'employment ended';

        var result = RC.end(rel.id, year, reason);
        if (result.success) _commit();
        return result;
    }

    // -------------------------------------------------------------------------
    // GUILD MEMBERSHIP
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   rank, startYear, notes
     * }
     */
    function createGuildMembership(guildId, memberId, options) {
        options = options || {};
        if (!guildId || !memberId) return _fail('MISSING_ID', 'guild and member required');
        if (guildId === memberId) return _fail('SAME_PERSON', 'cannot be own guild');

        var guild = _getCharacter(guildId);
        var member = _getCharacter(memberId);
        if (!guild || !member) return _fail('MISSING_CHARACTER', 'character not found');

        var startYear = options.startYear !== undefined ? options.startYear : _getCurrentYear();

        var validation = PR.canCreateGuildMembership({
            guildId: guildId,
            memberId: memberId,
            memberAge: _ageAtYear(member, startYear),
            rank: options.rank
        });
        if (!validation.valid) return _fail('VALIDATION_FAILED', validation.errors.join('; '));

        // Already a member?
        if (PQ.isInGuild(memberId, guildId)) {
            return _fail('ALREADY_MEMBER', 'already a member of this guild');
        }

        var createResult = RC.create({
            participantA: guildId,
            participantB: memberId,
            type: A.GUILD_MEMBERSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                rank: options.rank || null,
                notes: options.notes || ''
            }
        });
        if (!createResult.success) return createResult;

        _logEvent('professional', 'Guild Membership',
            member.name + ' joined guild',
            [guild, member]);
        _commit();
        return _ok({ relationship: createResult.relationship });
    }

    function removeGuildMembership(guildId, memberId, options) {
        options = options || {};
        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active membership');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'left guild';

        var result = RC.end(rel.id, year, reason);
        if (result.success) _commit();
        return result;
    }

    function setGuildRank(guildId, memberId, rank) {
        var rel = PQ.getGuildMembership(memberId, guildId);
        if (!rel) return _fail('NOT_FOUND', 'no active membership');

        var result = RC.update(rel.id, { metadata: { rank: rank } });
        if (result.success) _commit();
        return result;
    }

    // -------------------------------------------------------------------------

    window.ProfessionalCommands = {
        createApprenticeship: createApprenticeship,
        progressApprenticeship: progressApprenticeship,
        completeApprenticeship: completeApprenticeship,
        endApprenticeship: endApprenticeship,

        createEmployment: createEmployment,
        endEmployment: endEmployment,

        createGuildMembership: createGuildMembership,
        removeGuildMembership: removeGuildMembership,
        setGuildRank: setGuildRank
    };

})();
