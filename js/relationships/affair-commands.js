/**
 * affair-commands.js
 *
 * Mutation and transaction boundary for affairs.
 *
 * An affair is a committed relationship with SECRET attribute, created
 * via RomanceCommands.startCommittedRelationship with forceAffair.
 * This module owns affair-specific metadata, discovery, and consequences.
 *
 * RANDOMNESS:
 *   Caller supplies roll values, or window.Random service is used.
 *   Never uses Math.random() directly.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var RoC = window.RomanceCommands;
    var RoQ = window.RomanceQueries;
    var AR = window.AffairRules;
    var AQ = window.AffairQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !RoC || !RoQ || !AR || !AQ || !A || !ATTR || !STATUS) {
        throw new Error('affair-commands.js: relationship-*, romance-*, affair-* must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('affair-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('affair-commands.js: getCharacters required');
        }
        return window.getCharacters();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('affair-commands.js: getCurrentYearSafe required');
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
        throw new Error('affair-commands.js: Random.next or randomNext required');
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
    // CREATE
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   affairType: 'secret' | 'open' | 'emotional' | 'one_night'
     *   startYear
     *   isScandalous: boolean
     *   notes
     * }
     */
    function createAffair(characterAId, characterBId, options) {
        options = options || {};
        if (!characterAId || !characterBId) return _fail('MISSING_ID', 'both characters required');
        if (characterAId === characterBId) return _fail('SAME_PERSON', 'cannot have affair with self');

        var affairType = AR.normalizeAffairType(options.affairType || AR.AFFAIR_TYPE.SECRET);
        var startYear = options.startYear !== undefined ? options.startYear : _getCurrentYear();

        // Delegate to RomanceCommands; forceAffair ensures SECRET is applied
        var result = RoC.startCommittedRelationship(characterAId, characterBId, {
            startYear: startYear,
            forceAffair: true,
            isScandalous: !!options.isScandalous,
            notes: options.notes || ''
        });
        if (!result.success) return result;

        // Write affair-specific metadata
        RC.update(result.relationship.id, {
            metadata: {
                affairType: affairType,
                isAffair: true,
                discovered: false,
                discoveryYear: null,
                discoveryCircumstances: null,
                consequences: []
            }
        });

        var charA = _getCharacter(characterAId);
        var charB = _getCharacter(characterBId);
        _logEvent('affair', 'Affair Formed',
            (charA && charA.name) + ' and ' + (charB && charB.name) +
            ' began a ' + affairType + ' affair in ' + startYear,
            [charA, charB]);

        _commit();
        return _ok({
            relationship: RQ.getById(result.relationship.id),
            affairType: affairType
        });
    }

    // -------------------------------------------------------------------------
    // DISCOVERY
    // -------------------------------------------------------------------------

    /**
     * Rolls discovery for one affair.
     * options: { roll (optional), circumstances, discovererId }
     */
    function rollDiscovery(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'relationship not found');
        if (rel.type !== A.COMMITTED) return _fail('NOT_AFFAIR', 'not a committed relationship');
        if (!rel.attributes || rel.attributes.indexOf(ATTR.SECRET) === -1) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }
        if (rel.metadata && rel.metadata.discovered) {
            return _ok({ alreadyDiscovered: true });
        }

        var riskProjection = AQ.getDiscoveryRisk(relationshipId);
        if (!riskProjection) return _fail('NO_RISK', 'could not compute discovery risk');

        var roll = options.roll !== undefined ? options.roll : _roll();
        var discovered = roll < riskProjection.annualChance;
        if (!discovered) return _ok({ discovered: false, roll: roll });

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var circumstances = options.circumstances || 'Suspicious behavior was noticed';

        RC.update(relationshipId, {
            metadata: {
                discovered: true,
                discoveryYear: year,
                discoveryCircumstances: circumstances,
                discoveryRisk: riskProjection.risk,
                discovererId: options.discovererId || null
            }
        });

        _logEvent('affair', 'Affair Discovered',
            'An affair was discovered in ' + year,
            [_getCharacter(rel.participantA), _getCharacter(rel.participantB)]);

        _commit();
        return _ok({
            discovered: true,
            year: year,
            circumstances: circumstances,
            risk: riskProjection.risk
        });
    }

    // -------------------------------------------------------------------------
    // CONSEQUENCES
    // -------------------------------------------------------------------------

    /**
     * Applies consequences to a discovered affair.
     *
     * options: {
     *   discovererId,
     *   breakupRoll, murderRoll, executionRoll,  // optional; else rolled
     *   victimId,
     *   rulerId,
     *   breakUpExisting: boolean (default true)
     * }
     *
     * Returns { consequences: [{ type, success, details }] }
     */
    function applyConsequences(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'relationship not found');
        if (rel.type !== A.COMMITTED) return _fail('NOT_AFFAIR', 'not a committed relationship');
        if (!rel.attributes || rel.attributes.indexOf(ATTR.SECRET) === -1) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }
        if (!rel.metadata || !rel.metadata.discovered) {
            return _fail('NOT_DISCOVERED', 'affair not yet discovered');
        }

        var consequences = [];

        // DISCOVERY marker (always)
        consequences.push({
            type: AR.CONSEQUENCE.DISCOVERY,
            success: true,
            details: { year: rel.metadata.discoveryYear }
        });

        // SCANDAL marker (always)
        consequences.push({
            type: AR.CONSEQUENCE.SCANDAL,
            success: true,
            details: {}
        });

        // Get partners who would be affected
        var charA = _getCharacter(rel.participantA);
        var charB = _getCharacter(rel.participantB);
        if (!charA || !charB) return _fail('MISSING_CHARACTER', 'participant missing');

        var partnersA = RoQ.getActiveCommittedPartners(rel.participantA)
            .filter(function(p) { return p.relationship.id !== rel.id; });
        var partnersB = RoQ.getActiveCommittedPartners(rel.participantB)
            .filter(function(p) { return p.relationship.id !== rel.id; });

        var hasPartneredParticipant = partnersA.length > 0 || partnersB.length > 0;
        var eligible = AR.eligibleConsequences({ hasPartneredParticipant: hasPartneredParticipant });

        // BREAKUP
        if (eligible.indexOf(AR.CONSEQUENCE.BREAKUP) !== -1 && options.breakUpExisting !== false) {
            var breakupRoll = options.breakupRoll !== undefined ? options.breakupRoll : _roll();
            var breakupResult = _applyBreakups(rel, partnersA, partnersB, breakupRoll, options.breakupChance);
            consequences.push({
                type: AR.CONSEQUENCE.BREAKUP,
                success: breakupResult.count > 0,
                details: breakupResult
            });
        }

        // MURDER (delegates to external MurderCommands if present)
        if (eligible.indexOf(AR.CONSEQUENCE.MURDER) !== -1 &&
            typeof window.MurderCommands !== 'undefined' &&
            typeof window.MurderCommands.commitMurder === 'function') {
            var murderRoll = options.murderRoll !== undefined ? options.murderRoll : _roll();
            var chance = options.murderChance !== undefined ? options.murderChance : AR.DEFAULT_MURDER_CHANCE;
            if (murderRoll < chance) {
                var victimId = options.victimId || rel.participantA;
                var killerId = options.discovererId || rel.participantB;
                var victim = _getCharacter(victimId);
                var killer = _getCharacter(killerId);
                if (victim && killer && victim.id !== killer.id) {
                    var m = window.MurderCommands.commitMurder(victimId, killerId, {
                        year: rel.metadata.discoveryYear,
                        reason: 'affair discovery'
                    });
                    consequences.push({
                        type: AR.CONSEQUENCE.MURDER,
                        success: !!(m && m.success),
                        details: m
                    });
                }
            }
        }

        // EXECUTION (delegates to external ExecutionCommands if present)
        if (eligible.indexOf(AR.CONSEQUENCE.EXECUTION) !== -1 &&
            typeof window.ExecutionCommands !== 'undefined' &&
            typeof window.ExecutionCommands.execute === 'function') {
            var execRoll = options.executionRoll !== undefined ? options.executionRoll : _roll();
            var execChance = options.executionChance !== undefined ? options.executionChance : AR.DEFAULT_EXECUTION_CHANCE;
            if (execRoll < execChance) {
                var rulerId = options.rulerId || options.discovererId;
                var e = window.ExecutionCommands.execute(rel.participantA, rel.participantB, {
                    year: rel.metadata.discoveryYear,
                    rulerId: rulerId,
                    reason: 'adultery'
                });
                consequences.push({
                    type: AR.CONSEQUENCE.EXECUTION,
                    success: !!(e && e.success),
                    details: e
                });
            }
        }

        // Record what was applied
        var types = consequences.map(function(c) { return c.type; });
        RC.update(relationshipId, {
            metadata: {
                consequencesTriggered: true,
                consequences: types
            }
        });

        _commit();
        return _ok({ consequences: consequences });
    }

    function _applyBreakups(rel, partnersA, partnersB, roll, overrideChance) {
        var chance = overrideChance !== undefined ? overrideChance : AR.DEFAULT_BREAKUP_CHANCE;
        var broke = [];
        if (roll >= chance) return { count: 0, ended: broke };

        var year = rel.metadata.discoveryYear || _getCurrentYear();

        var i;
        for (i = 0; i < partnersA.length; i++) {
            var r = RoC.breakUp(partnersA[i].relationship.id, {
                endYear: year,
                reason: 'affair discovered'
            });
            if (r.success) broke.push(partnersA[i].relationship.id);
        }
        for (i = 0; i < partnersB.length; i++) {
            var r2 = RoC.breakUp(partnersB[i].relationship.id, {
                endYear: year,
                reason: 'affair discovered'
            });
            if (r2.success) broke.push(partnersB[i].relationship.id);
        }

        return { count: broke.length, ended: broke };
    }

    // -------------------------------------------------------------------------
    // END / LEGITIMIZE / RECONCILE
    // -------------------------------------------------------------------------

    function endAffair(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'relationship not found');
        if (rel.type !== A.COMMITTED) return _fail('NOT_AFFAIR', 'not committed');
        if (!rel.attributes || rel.attributes.indexOf(ATTR.SECRET) === -1) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }
        if (rel.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'affair ended';

        var result = RoC.breakUp(relationshipId, {
            endYear: year,
            reason: reason
        });
        if (result.success) _commit();
        return result;
    }

    /**
     * Legitimize = remove SECRET attribute, keep committed relationship.
     * Single mutation. No end+create dance.
     */
    function legitimizeAffair(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'relationship not found');
        if (rel.type !== A.COMMITTED) return _fail('NOT_AFFAIR', 'not committed');
        if (!rel.attributes || rel.attributes.indexOf(ATTR.SECRET) === -1) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }

        var year = options.legitimizationYear !== undefined ? options.legitimizationYear : _getCurrentYear();
        var removeAttrs = [ATTR.SECRET];
        var newAttrs = rel.attributes.filter(function(a) {
            return removeAttrs.indexOf(a) === -1;
        });

        // Optionally add attributes supplied by caller
        var extra = options.attributes || [];
        for (var i = 0; i < extra.length; i++) {
            if (newAttrs.indexOf(extra[i]) === -1) newAttrs.push(extra[i]);
        }

        var result = RC.update(relationshipId, {
            attributes: newAttrs,
            metadata: {
                legitimizedFromAffair: true,
                legitimizationYear: year,
                discoveryCircumstances: rel.metadata ? rel.metadata.discoveryCircumstances : null
            }
        });
        if (!result.success) return result;

        _logEvent('affair', 'Affair Legitimized',
            'Affair legitimized in ' + year,
            [_getCharacter(rel.participantA), _getCharacter(rel.participantB)]);

        _commit();
        return _ok({ relationship: result.relationship });
    }

    /**
     * Reconcile = wronged party accepts the adulterer back.
     * In this model, reconciliation means: the affair ends, but the
     * wronged party's prior committed relationship remains ongoing.
     * Since breakups are separate, this command is a decision record.
     */
    function reconcileAfterAffair(relationshipId, wrongedPartyId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'relationship not found');

        var wronged = _getCharacter(wrongedPartyId);
        if (!wronged) return _fail('MISSING_CHARACTER', 'wronged party not found');

        var duration = 0;
        if (typeof rel.startYear === 'number') {
            var endY = rel.endYear || _getCurrentYear();
            duration = Math.max(0, endY - rel.startYear);
        }

        var chance = AR.calculateReconciliationChance({
            durationYears: duration,
            hasChildren: false,
            wrongedPartyRankPriority: 5,
            affairType: rel.metadata ? rel.metadata.affairType : AR.AFFAIR_TYPE.SECRET
        });

        var roll = options.roll !== undefined ? options.roll : _roll();
        var success = roll < chance;

        _logEvent('affair', 'Reconciliation',
            (success ? 'Successful' : 'Failed') +
            ' reconciliation attempt by ' + wronged.name,
            [wronged]);

        _commit();
        return _ok({
            success: success,
            chance: chance,
            roll: roll,
            wrongedPartyId: wrongedPartyId
        });
    }

    // -------------------------------------------------------------------------
    // BULK
    // -------------------------------------------------------------------------

    function endAllAffairsForCharacter(characterId, options) {
        options = options || {};
        var affairs = RoQ.getActiveAffairsForCharacter(characterId);
        var ended = 0;
        for (var i = 0; i < affairs.length; i++) {
            var otherId = affairs[i].participantA === characterId
                ? affairs[i].participantB
                : affairs[i].participantA;
            var r = endAffair(affairs[i].id, {
                endYear: options.endYear,
                reason: options.reason
            });
            if (r.success) ended++;
        }
        return _ok({ ended: ended });
    }

    // -------------------------------------------------------------------------

    window.AffairCommands = {
        createAffair: createAffair,
        rollDiscovery: rollDiscovery,
        applyConsequences: applyConsequences,
        endAffair: endAffair,
        legitimizeAffair: legitimizeAffair,
        reconcileAfterAffair: reconcileAfterAffair,
        endAllAffairsForCharacter: endAllAffairsForCharacter
    };

})();
