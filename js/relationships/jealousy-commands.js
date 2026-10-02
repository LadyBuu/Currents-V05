/**
 * jealousy-commands.js
 *
 * Mutation and transaction boundary for jealousy-driven confrontation
 * and annual processing.
 *
 * RANDOMNESS:
 *   All randomness is supplied by the caller or by window.Random if present.
 *   Never uses Math.random() directly.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var JR = window.JealousyRules;
    var JQ = window.JealousyQueries;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !JR || !JQ || !A || !STATUS) {
        throw new Error('jealousy-commands.js: relationship-* and jealousy-* must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES (fail loud)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('jealousy-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('jealousy-commands.js: getCharacters required');
        }
        return window.getCharacters();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('jealousy-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _roll() {
        if (window.Random && typeof window.Random.next === 'function') {
            return window.Random.next();
        }
        if (typeof window.randomNext === 'function') {
            return window.randomNext();
        }
        throw new Error('jealousy-commands.js: Random.next or randomNext required');
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
    // HISTORY WRITE (owned here; reads go through JealousyQueries)
    // -------------------------------------------------------------------------

    function _appendHistory(characterId, entry) {
        var character = _getCharacter(characterId);
        if (!character) return;
        if (!Array.isArray(character.jealousyHistory)) {
            character.jealousyHistory = [];
        }
        character.jealousyHistory.push(entry);
    }

    // -------------------------------------------------------------------------
    // CONFRONTATION
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   aboutId (optional),
     *   year (optional),
     *   roll (optional; if omitted, uses Random service)
     * }
     */
    function triggerConfrontation(jalouxId, targetId, options) {
        options = options || {};
        var jaloux = _getCharacter(jalouxId);
        var target = _getCharacter(targetId);
        if (!jaloux || !target) return _fail('MISSING_CHARACTER', 'character not found');
        if (jalouxId === targetId) return _fail('SAME_PERSON', 'cannot confront self');

        var aboutId = options.aboutId || null;
        var year = options.year !== undefined ? options.year : _getCurrentYear();

        var jealousy = JQ.getJealousyBetween(jalouxId, targetId, aboutId);
        if (jealousy.level <= 0) {
            return _fail('NO_JEALOUSY', 'no jealousy detected');
        }

        var traits = jaloux.traits || [];
        var adjusted = JR.adjustConfrontationLevel(jealousy.level, traits);
        var consequence = JR.determineConsequence(adjusted);

        if (consequence === JR.CONSEQUENCE.NONE) {
            return _fail('NO_CONSEQUENCE', 'level too low');
        }

        // Record history (single write, no separate save)
        _appendHistory(jalouxId, {
            year: year,
            targetId: targetId,
            aboutId: aboutId,
            jealousyLevel: jealousy.level,
            confrontationLevel: adjusted,
            consequence: consequence
        });

        // Establish rivalry if applicable
        if (JR.consequenceCreatesRivalry(consequence)) {
            var existingRivalry = RQ.hasActiveBetweenOfType(jalouxId, targetId, A.RIVALRY);
            if (!existingRivalry) {
                RC.create({
                    participantA: jalouxId,
                    participantB: targetId,
                    type: A.RIVALRY,
                    status: STATUS.ONGOING,
                    startYear: year,
                    metadata: {
                        cause: consequence,
                        intensity: 0.5
                    }
                });
            }
        }

        _logEvent('jealousy', 'Confrontation',
            jaloux.name + ' confronted ' + target.name +
            ' over ' + (jealousy.triggers[0] || 'jealousy') +
            ' (' + consequence + ')',
            [jaloux, target]);

        _commit();

        return _ok({
            jalouxId: jalouxId,
            targetId: targetId,
            aboutId: aboutId,
            jealousyLevel: jealousy.level,
            confrontationLevel: adjusted,
            consequence: consequence,
            triggers: jealousy.triggers,
            year: year
        });
    }

    // -------------------------------------------------------------------------
    // ANNUAL PROCESSING
    // -------------------------------------------------------------------------

    /**
     * options: { year, maxConfrontations }
     * One roll per character per year. Randomness via Random service.
     */
    function processAnnualJealousy(options) {
        options = options || {};
        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var maxConfrontations = options.maxConfrontations || 50;

        var allChars = _getCharacters();
        var confrontations = [];

        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (char.isDeceased) continue;

            var target = JQ.getPrimaryJealousyTarget(char.id);
            if (!target) continue;

            var roll = _roll();
            var decision = JR.shouldConfrontAnnually({
                jealousyLevel: target.level,
                traits: char.traits || [],
                roll: roll
            });
            if (!decision.triggered) continue;

            var result = triggerConfrontation(char.id, target.targetId, {
                aboutId: target.aboutId,
                year: year
            });
            if (result.success) confrontations.push(result);

            if (confrontations.length >= maxConfrontations) break;
        }

        if (confrontations.length > 0) {
            _logEvent('jealousy', 'Annual Processing',
                confrontations.length + ' jealousy confrontation(s) in ' + year,
                []);
        }

        return _ok({ confrontations: confrontations, year: year });
    }

    // -------------------------------------------------------------------------

    window.JealousyCommands = {
        triggerConfrontation: triggerConfrontation,
        processAnnualJealousy: processAnnualJealousy
    };

})();
