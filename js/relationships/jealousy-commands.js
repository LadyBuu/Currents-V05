/**
 * jealousy-commands.js
 *
 * Mutation boundary for jealousy-driven confrontation and annual
 * processing.
 *
 * Owns:
 *   - triggering a confrontation between two characters
 *   - applying a consequence and, if applicable, creating a rivalry
 *   - annual processing across all living characters
 *
 * Depends on:
 *   - JealousyRules for policy
 *   - JealousyQueries for target discovery and evaluation
 *   - RivalryCommands for rivalry creation when a consequence warrants it
 *   - RelationshipCommands for reading (via queries)
 *   - Character accessors for names, traits, rank
 *   - window.Random for rolls (never Math.random directly)
 *
 * Does NOT own:
 *   - direct state access
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - jealousy history storage (v1 does not persist jealousy events;
 *     see module note)
 *
 * JEALOUSY HISTORY (v1):
 *   Confrontations are not persisted as a dedicated event stream in v1.
 *   The confrontation is applied to the graph (rivalry creation when
 *   warranted) and logged through logEvent. If historical escalation
 *   later requires storage, it graduates to its own state module.
 *
 * Randomness:
 *   Every roll is either caller-supplied or drawn from window.Random.
 *   Never uses Math.random() directly.
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, rivalry-commands.js,
 * jealousy-rules.js, jealousy-queries.js.
 */

(function() {
    'use strict';

    var JR = window.JealousyRules;
    var JQ = window.JealousyQueries;
    var RvC = window.RivalryCommands;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!JR || !JQ || !RvC || !A || !STATUS) {
        throw new Error('jealousy-commands.js: rivalry-commands.js, jealousy-rules.js, jealousy-queries.js must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES
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
    // TRIGGER CONFRONTATION
    //
    // options: {
    //   aboutId?: string,
    //   year?: number,
    //   roll?: number  // optional; supplied to shouldConfrontAnnually
    //                  // for the caller to make the decision; if a
    //                  // confrontation is decided, no further roll is
    //                  // taken.
    // }
    //
    // Flow:
    //   1. Evaluate jealousy between the subject and target (via queries).
    //   2. Adjust level by subject traits (via rules).
    //   3. Determine consequence from adjusted level.
    //   4. If none, return the decision without mutation.
    //   5. If consequence creates a rivalry, create the rivalry.
    //   6. Log the event.
    //
    // Note: this command does not roll for confrontation. The decision
    // to confront is the caller's. Direct calls from UI or script
    // always confront if jealousy is above the threshold that produces
    // a consequence. Annual processing rolls beforehand and only calls
    // this command for the years it decided to confront.
    // -------------------------------------------------------------------------

    function triggerConfrontation(subjectId, targetId, options) {
        options = options || {};

        if (typeof subjectId !== 'string' || typeof targetId !== 'string') {
            return _fail('MISSING_ID', 'subjectId and targetId required');
        }
        if (subjectId === targetId) {
            return _fail('SAME_PERSON', 'cannot confront oneself');
        }

        var subject = _getCharacter(subjectId);
        var target = _getCharacter(targetId);
        if (!subject || !target) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var aboutId = (typeof options.aboutId === 'string' && options.aboutId.length > 0)
            ? options.aboutId
            : null;

        var year = options.year !== undefined ? options.year : _getCurrentYear();

        // 1. Evaluate jealousy
        var jealousy = JQ.getJealousyBetween(subjectId, targetId, aboutId);
        if (jealousy.level <= 0) {
            return _fail('NO_JEALOUSY', 'no jealousy detected');
        }

        // 2. Adjust by traits
        var traits = Array.isArray(subject.traits) ? subject.traits : [];
        var adjusted = JR.adjustConfrontationLevel({
            level: jealousy.level,
            traits: traits
        });

        // 3. Determine consequence
        var consequence = JR.determineConsequence(adjusted);
        if (consequence === JR.CONSEQUENCE.NONE) {
            return _fail('NO_CONSEQUENCE', 'level too low for any consequence');
        }

        // 5. Create rivalry if warranted
        var rivalryCreated = false;
        if (JR.consequenceCreatesRivalry(consequence)) {
            if (!RvC) {
                // Rivalry commands unavailable; do not fabricate. The
                // consequence still applies (as a decision) but no
                // rivalry is recorded.
                rivalryCreated = false;
            } else {
                var existing = RvC && window.RivalryQueries && window.RivalryQueries.areInConflict
                    ? window.RivalryQueries.areInConflict(subjectId, targetId)
                    : false;

                if (!existing) {
                    var intensity = JR.consequenceIntensity(consequence);
                    var createResult = RvC.createRivalry(subjectId, targetId, {
                        startYear: year
                    });
                    rivalryCreated = !!(createResult && createResult.success);

                    // If rivalry already exists, treat as created=false
                    // but do not consider it a failure.
                    if (createResult && !createResult.success &&
                        createResult.code === 'ALREADY_RIVALS') {
                        rivalryCreated = true;
                    }
                } else {
                    rivalryCreated = true;
                }
            }
        }

        // 6. Log
        _logEvent('jealousy', 'Confrontation',
            subject.name + ' confronted ' + target.name +
            (jealousy.triggers.length > 0 ? ' over ' + jealousy.triggers[0] : '') +
            ' (' + consequence + ')',
            [subject, target]);

        return _ok({
            subjectId: subjectId,
            targetId: targetId,
            aboutId: aboutId,
            year: year,
            jealousyLevel: jealousy.level,
            confrontationLevel: adjusted,
            consequence: consequence,
            triggers: jealousy.triggers.slice(),
            type: jealousy.type,
            rivalryCreated: rivalryCreated
        });
    }

    // -------------------------------------------------------------------------
    // ANNUAL PROCESSING
    //
    // options: {
    //   year?: number,
    //   maxConfrontations?: number,
    //   rollProvider?: () => number   // optional; else window.Random
    // }
    //
    // For every living character, evaluate the primary jealousy target.
    // Roll once per character per year. If the roll triggers, invoke
    // triggerConfrontation. Stop at maxConfrontations.
    // -------------------------------------------------------------------------

    function processAnnualJealousy(options) {
        options = options || {};

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var maxConfrontations = (typeof options.maxConfrontations === 'number')
            ? options.maxConfrontations
            : 50;

        var rollFn = (typeof options.rollProvider === 'function')
            ? options.rollProvider
            : _roll;

        var allChars = _getCharacters();
        var confrontations = [];
        var skipped = [];

        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (!char || char.isDeceased) continue;

            var target = JQ.getPrimaryJealousyTarget(char.id);
            if (!target) continue;

            var roll = rollFn();
            var decision = JR.shouldConfrontAnnually({
                jealousyLevel: target.level,
                traits: Array.isArray(char.traits) ? char.traits : [],
                roll: roll
            });

            if (!decision.triggered) {
                skipped.push({
                    characterId: char.id,
                    targetId: target.targetId,
                    level: target.level,
                    chance: decision.chance,
                    roll: roll
                });
                continue;
            }

            var result = triggerConfrontation(char.id, target.targetId, {
                aboutId: target.aboutId,
                year: year
            });

            if (result.success) {
                confrontations.push(result);
            } else {
                skipped.push({
                    characterId: char.id,
                    targetId: target.targetId,
                    level: target.level,
                    chance: decision.chance,
                    roll: roll,
                    reason: result.code
                });
            }

            if (confrontations.length >= maxConfrontations) break;
        }

        if (confrontations.length > 0) {
            _logEvent('jealousy', 'Annual Processing',
                confrontations.length + ' jealousy confrontation(s) in ' + year,
                []);
        }

        return _ok({
            year: year,
            confrontations: confrontations,
            skipped: skipped,
            confrontationCount: confrontations.length,
            skippedCount: skipped.length
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.JealousyCommands = {
        triggerConfrontation: triggerConfrontation,
        processAnnualJealousy: processAnnualJealousy
    };

})();
