/**
 * rivalry-commands.js
 *
 * Mutation boundary for rivalry and enmity relationships.
 *
 * Owns:
 *   - creating rivalries and enmities
 *   - ending rivalries and enmities
 *   - one commit per logical operation
 *
 * Depends on:
 *   - RivalryRules for policy
 *   - RivalryQueries for existence checks
 *   - RelationshipCommands for the actual state write
 *   - CharacterQueries / getCharacterById for name resolution on log
 *
 * Does NOT own:
 *   - direct state access (goes through RelationshipCommands)
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness (no rolls here)
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, rivalry-rules.js,
 * rivalry-queries.js.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RR = window.RivalryRules;
    var RQ = window.RivalryQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RR || !RQ || !A || !STATUS) {
        throw new Error('rivalry-commands.js: relationship-commands.js, rivalry-rules.js, rivalry-queries.js must load first');
    }

    var RIVALRY = A.RIVALRY;
    var ENMITY  = A.ENMITY;

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('rivalry-commands.js: getCharacterById required');
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
            throw new Error('rivalry-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error('rivalry-commands.js: calculateAge required');
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
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
    // INTERNAL: FETCH AGES
    //
    // Rivalry policy needs ages to enforce the age floor. Ages are
    // derived from the character records; if a character has no
    // birthYear, age is null and the validator skips the age check for
    // that participant.
    // -------------------------------------------------------------------------

    function _ageOf(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        return _calculateAge(
            character.birthYear,
            !!character.isDeceased,
            character.deathYear
        );
    }

    // -------------------------------------------------------------------------
    // CREATE INTERNAL
    // -------------------------------------------------------------------------

    function _createInternal(archetype, idA, idB, options, validator) {
        var charA = _getCharacter(idA);
        var charB = _getCharacter(idB);
        if (!charA || !charB) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var validation = validator({
            participantA: idA,
            participantB: idB,
            ageA: _ageOf(charA),
            ageB: _ageOf(charB),
            startYear: startYear
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        var createResult = RC.create({
            participantA: idA,
            participantB: idB,
            type: archetype,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: {}
        });
        if (!createResult.success) return createResult;

        return _ok({
            relationship: createResult.relationship
        });
    }

    // -------------------------------------------------------------------------
    // CREATE RIVALRY
    // -------------------------------------------------------------------------

    /**
     * options: { startYear? }
     */
    function createRivalry(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot be rival of oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        if (RQ.areRivals(idA, idB)) {
            return _fail('ALREADY_RIVALS', 'an active rivalry already exists');
        }

        var result = _createInternal(RIVALRY, idA, idB, options, RR.canCreateRivalry);
        if (!result.success) return result;

        _logEvent('rivalry', 'Rivalry Formed',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' became rivals',
            [_getCharacter(idA), _getCharacter(idB)]);

        return result;
    }

    // -------------------------------------------------------------------------
    // CREATE ENMITY
    // -------------------------------------------------------------------------

    /**
     * options: { startYear? }
     */
    function createEnmity(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot be enemy of oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        if (RQ.areEnemies(idA, idB)) {
            return _fail('ALREADY_ENEMIES', 'an active enmity already exists');
        }

        var result = _createInternal(ENMITY, idA, idB, options, RR.canCreateEnmity);
        if (!result.success) return result;

        _logEvent('rivalry', 'Enmity Formed',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' became enemies',
            [_getCharacter(idA), _getCharacter(idB)]);

        return result;
    }

    // -------------------------------------------------------------------------
    // END RIVALRY
    // -------------------------------------------------------------------------

    /**
     * options: { endYear?, reason? }
     */
    function endRivalry(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }

        var rel = RQ.getActiveRivalryBetween(idA, idB);
        if (!rel) {
            return _fail('NOT_RIVALS', 'no active rivalry');
        }

        var endYear = options.endYear !== undefined
            ? options.endYear
            : _getCurrentYear();

        var reason = options.reason !== undefined && options.reason !== null
            ? options.reason
            : 'rivalry ended';

        var check = RR.canTransition({
            archetype: RIVALRY,
            from: rel.status,
            to: STATUS.ENDED
        });
        if (!check.valid) {
            return _fail('INVALID_TRANSITION', check.errors.join('; '));
        }

        var result = RC.end(rel.relationshipId, endYear, reason);
        if (!result.success) return result;

        _logEvent('rivalry', 'Rivalry Ended',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' are no longer rivals (' + reason + ')',
            [_getCharacter(idA), _getCharacter(idB)]);

        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------
    // END ENMITY
    // -------------------------------------------------------------------------

    /**
     * options: { endYear?, reason? }
     */
    function endEnmity(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }

        var rel = RQ.getActiveEnmityBetween(idA, idB);
        if (!rel) {
            return _fail('NOT_ENEMIES', 'no active enmity');
        }

        var endYear = options.endYear !== undefined
            ? options.endYear
            : _getCurrentYear();

        var reason = options.reason !== undefined && options.reason !== null
            ? options.reason
            : 'enmity ended';

        var check = RR.canTransition({
            archetype: ENMITY,
            from: rel.status,
            to: STATUS.ENDED
        });
        if (!check.valid) {
            return _fail('INVALID_TRANSITION', check.errors.join('; '));
        }

        var result = RC.end(rel.relationshipId, endYear, reason);
        if (!result.success) return result;

        _logEvent('rivalry', 'Enmity Ended',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' are no longer enemies (' + reason + ')',
            [_getCharacter(idA), _getCharacter(idB)]);

        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------
    // ESCALATE / DE-ESCALATE
    //
    // Convenience transitions between rivalry and enmity. Escalation
    // ends the rivalry and creates an enmity; de-escalation does the
    // reverse. Two records, one logical operation.
    // -------------------------------------------------------------------------

    function escalateRivalryToEnmity(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }

        if (!RQ.areRivals(idA, idB)) {
            return _fail('NOT_RIVALS', 'no active rivalry to escalate');
        }

        var year = options.year !== undefined ? options.year : _getCurrentYear();

        var endResult = endRivalry(idA, idB, {
            endYear: year,
            reason: 'escalated_to_enmity'
        });
        if (!endResult.success) return endResult;

        var createResult = createEnmity(idA, idB, { startYear: year });
        if (!createResult.success) return createResult;

        return _ok({
            relationship: createResult.relationship
        });
    }

    function deEscalateEnmityToRivalry(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }

        if (!RQ.areEnemies(idA, idB)) {
            return _fail('NOT_ENEMIES', 'no active enmity to de-escalate');
        }

        var year = options.year !== undefined ? options.year : _getCurrentYear();

        var endResult = endEnmity(idA, idB, {
            endYear: year,
            reason: 'deescalated_to_rivalry'
        });
        if (!endResult.success) return endResult;

        var createResult = createRivalry(idA, idB, { startYear: year });
        if (!createResult.success) return createResult;

        return _ok({
            relationship: createResult.relationship
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RivalryCommands = {
        createRivalry: createRivalry,
        createEnmity: createEnmity,
        endRivalry: endRivalry,
        endEnmity: endEnmity,
        escalateRivalryToEnmity: escalateRivalryToEnmity,
        deEscalateEnmityToRivalry: deEscalateEnmityToRivalry
    };

})();
