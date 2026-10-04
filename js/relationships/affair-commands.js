/**
 * affair-commands.js
 *
 * Mutation boundary for affairs.
 *
 * An affair is a committed relationship with the SECRET attribute.
 * Creation delegates to RomanceCommands.startCommittedRelationship with
 * forceAffair: true. Discovery, consequence application, legitimization,
 * and reconciliation are owned here.
 *
 * Owns:
 *   - creating affairs (delegating to RomanceCommands)
 *   - rolling discovery (caller may supply roll, else Random service)
 *   - applying consequences (breakup, murder, execution)
 *   - ending affairs
 *   - legitimizing affairs
 *   - reconciling after an affair
 *   - bulk ending all affairs for a character
 *
 * Depends on:
 *   - RomanceCommands for creation
 *   - RomanceRules, RomanceQueries for existence and attribute lookup
 *   - AffairRules for policy
 *   - AffairQueries for projections and discovery risk
 *   - RelationshipCommands for state writes
 *   - MurderCommands and ExecutionCommands if present (optional
 *     cross-domain; absence degrades consequence handling gracefully)
 *
 * Does NOT own:
 *   - direct state access (goes through RelationshipCommands)
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - the definition of "affair" (RomanceRules.isAffair is sole owner)
 *
 * Randomness:
 *   Every roll is either caller-supplied or drawn from window.Random.
 *   Never uses Math.random() directly.
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, romance-commands.js,
 * romance-rules.js, romance-queries.js, affair-rules.js, affair-queries.js.
 */

(function() {
    'use strict';

    var RC   = window.RelationshipCommands;
    var RoC  = window.RomanceCommands;
    var RR   = window.RomanceRules;
    var RoQ  = window.RomanceQueries;
    var AR   = window.AffairRules;
    var AQ   = window.AffairQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RoC || !RR || !RoQ || !AR || !AQ || !A || !ATTR || !STATUS) {
        throw new Error('affair-commands.js: relationship-commands.js, romance-commands.js, romance-rules.js, romance-queries.js, affair-rules.js, affair-queries.js must load first');
    }

    var COMMITTED = A.COMMITTED;

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('affair-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
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

    function _requireMurderCommands() {
        if (typeof window.MurderCommands !== 'object' || window.MurderCommands === null) {
            return null;
        }
        if (typeof window.MurderCommands.commitMurder !== 'function') {
            return null;
        }
        return window.MurderCommands;
    }

    function _requireExecutionCommands() {
        if (typeof window.ExecutionCommands !== 'object' || window.ExecutionCommands === null) {
            return null;
        }
        if (typeof window.ExecutionCommands.execute !== 'function') {
            return null;
        }
        return window.ExecutionCommands;
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
    // CREATE
    //
    // options: {
    //   affairType?: 'secret' | 'open' | 'emotional' | 'one_night',
    //   startYear?,
    //   isScandalous?: boolean,
    //   notes?: string
    // }
    //
    // Delegates to RomanceCommands.startCommittedRelationship with
    // forceAffair: true. The resulting relationship carries SECRET,
    // which is what makes it an affair. Affair-specific metadata
    // (affairType, discovery state, consequence state) is merged in a
    // second update.
    // -------------------------------------------------------------------------

    function createAffair(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot have an affair with oneself');
        }

        var affairType = AR.normalizeAffairType(options.affairType || AR.AFFAIR_TYPE.SECRET);
        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var romanceResult = RoC.startCommittedRelationship(idA, idB, {
            startYear: startYear,
            forceAffair: true,
            isScandalous: !!options.isScandalous,
            notes: typeof options.notes === 'string' ? options.notes : ''
        });
        if (!romanceResult.success) return romanceResult;

        var relId = romanceResult.relationship.relationshipId
            || romanceResult.relationship.id;

        var metaUpdate = RC.update(relId, {
            metadata: {
                affairType: affairType,
                discovered: false,
                discoveryYear: null,
                discoveryCircumstances: null,
                discovererId: null,
                consequencesTriggered: false,
                consequences: [],
                publicBehavior: !!options.publicBehavior
            }
        });
        if (!metaUpdate.success) return metaUpdate;

        var charA = _getCharacter(idA);
        var charB = _getCharacter(idB);

        _logEvent('affair', 'Affair Formed',
            (charA && charA.name ? charA.name : idA) + ' and ' +
            (charB && charB.name ? charB.name : idB) +
            ' began a ' + affairType + ' affair in ' + startYear,
            [charA, charB]);

        return _ok({
            relationship: AQ.getAffairById(relId),
            affairType: affairType
        });
    }

    // -------------------------------------------------------------------------
    // DISCOVERY
    //
    // options: {
    //   roll?: number,             // if omitted, drawn from Random service
    //   year?: number,
    //   circumstances?: string,
    //   discovererId?: string
    // }
    // -------------------------------------------------------------------------

    function rollDiscovery(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = RC ? window.RelationshipQueries.getById(relationshipId) : null;
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) {
            return _fail('NOT_AFFAIR', 'not a committed relationship');
        }
        if (!RR.isAffair(rec.attributes)) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }
        if (rec.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'affair not ongoing');
        }
        if (rec.metadata && rec.metadata.discovered) {
            return _ok({ alreadyDiscovered: true, discovered: true });
        }

        var riskProjection = AQ.getDiscoveryRisk(relationshipId, {
            referenceYear: options.year
        });
        if (!riskProjection) {
            return _fail('NO_RISK', 'could not compute discovery risk');
        }

        var roll = (typeof options.roll === 'number') ? options.roll : _roll();
        var evaluated = AR.evaluateDiscovery({
            risk: riskProjection.risk,
            roll: roll
        });
        if (!evaluated.valid) {
            return _fail('INVALID_DISCOVERY', 'evaluation failed');
        }

        if (!evaluated.discovered) {
            return _ok({
                discovered: false,
                roll: roll,
                chance: evaluated.chance,
                risk: riskProjection.risk
            });
        }

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var circumstances = (typeof options.circumstances === 'string' && options.circumstances.length > 0)
            ? options.circumstances
            : 'Suspicious behavior was noticed';

        var updateResult = RC.update(relationshipId, {
            metadata: {
                discovered: true,
                discoveryYear: year,
                discoveryCircumstances: circumstances,
                discoveryRisk: riskProjection.risk,
                discovererId: typeof options.discovererId === 'string'
                    ? options.discovererId
                    : null
            }
        });
        if (!updateResult.success) return updateResult;

        _logEvent('affair', 'Affair Discovered',
            'An affair between ' +
            (function() {
                var a = _getCharacter(rec.participantA);
                var b = _getCharacter(rec.participantB);
                return (a && a.name ? a.name : rec.participantA) + ' and ' +
                       (b && b.name ? b.name : rec.participantB);
            })() +
            ' was discovered in ' + year,
            [_getCharacter(rec.participantA), _getCharacter(rec.participantB)]);

        return _ok({
            discovered: true,
            year: year,
            circumstances: circumstances,
            risk: riskProjection.risk,
            chance: evaluated.chance,
            roll: roll
        });
    }

    // -------------------------------------------------------------------------
    // APPLY CONSEQUENCES
    //
    // options: {
    //   discovererId?,
    //   breakupRoll?, murderRoll?, executionRoll?,
    //   breakupChance?, murderChance?, executionChance?,
    //   victimId?, rulerId?,
    //   breakUpExisting?: boolean (default true)
    // }
    // -------------------------------------------------------------------------

    function applyConsequences(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) {
            return _fail('NOT_AFFAIR', 'not a committed relationship');
        }
        if (!RR.isAffair(rec.attributes)) {
            return _fail('NOT_AFFAIR', 'not an affair');
        }
        if (!rec.metadata || !rec.metadata.discovered) {
            return _fail('NOT_DISCOVERED', 'affair not yet discovered');
        }
        if (rec.metadata.consequencesTriggered) {
            return _ok({
                alreadyApplied: true,
                consequences: Array.isArray(rec.metadata.consequences)
                    ? rec.metadata.consequences.slice()
                    : []
            });
        }

        var consequences = [];

        // DISCOVERY marker
        consequences.push({
            type: AR.CONSEQUENCE.DISCOVERY,
            success: true,
            details: { year: rec.metadata.discoveryYear }
        });

        // SCANDAL marker with impact computed from facts
        var scandal = _computeScandal(rec);
        consequences.push({
            type: AR.CONSEQUENCE.SCANDAL,
            success: true,
            details: scandal
        });

        // Partnered participants?
        var partnersA = _otherCommittedPartners(rec.participantA, relationshipId);
        var partnersB = _otherCommittedPartners(rec.participantB, relationshipId);
        var hasPartneredParticipant = partnersA.length > 0 || partnersB.length > 0;

        var eligible = AR.eligibleConsequences({
            hasPartneredParticipant: hasPartneredParticipant
        });

        // BREAKUP
        if (eligible.indexOf(AR.CONSEQUENCE.BREAKUP) !== -1 &&
            options.breakUpExisting !== false) {
            var breakupRoll = (typeof options.breakupRoll === 'number')
                ? options.breakupRoll
                : _roll();
            var breakupChance = (typeof options.breakupChance === 'number')
                ? options.breakupChance
                : AR.DEFAULT_BREAKUP_CHANCE;

            var breakupResult = _applyBreakups(
                rec,
                partnersA,
                partnersB,
                breakupRoll,
                breakupChance
            );
            consequences.push({
                type: AR.CONSEQUENCE.BREAKUP,
                success: breakupResult.count > 0,
                details: breakupResult
            });
        }

        // MURDER
        if (eligible.indexOf(AR.CONSEQUENCE.MURDER) !== -1) {
            var murderCmds = _requireMurderCommands();
            if (murderCmds) {
                var murderRoll = (typeof options.murderRoll === 'number')
                    ? options.murderRoll
                    : _roll();
                var murderChance = (typeof options.murderChance === 'number')
                    ? options.murderChance
                    : AR.DEFAULT_MURDER_CHANCE;

                if (murderRoll < murderChance) {
                    var victimId = options.victimId || rec.participantA;
                    var killerId = options.discovererId || rec.participantB;
                    if (victimId !== killerId) {
                        var murderResult = murderCmds.commitMurder(victimId, killerId, {
                            year: rec.metadata.discoveryYear,
                            reason: 'affair discovery'
                        });
                        consequences.push({
                            type: AR.CONSEQUENCE.MURDER,
                            success: !!(murderResult && murderResult.success),
                            details: murderResult || { reason: 'no_result' }
                        });
                    } else {
                        consequences.push({
                            type: AR.CONSEQUENCE.MURDER,
                            success: false,
                            details: { reason: 'victim_equals_killer' }
                        });
                    }
                } else {
                    consequences.push({
                        type: AR.CONSEQUENCE.MURDER,
                        success: false,
                        details: { roll: murderRoll, chance: murderChance, triggered: false }
                    });
                }
            } else {
                consequences.push({
                    type: AR.CONSEQUENCE.MURDER,
                    success: false,
                    details: { reason: 'MurderCommands_unavailable' }
                });
            }
        }

        // EXECUTION
        if (eligible.indexOf(AR.CONSEQUENCE.EXECUTION) !== -1) {
            var execCmds = _requireExecutionCommands();
            if (execCmds) {
                var execRoll = (typeof options.executionRoll === 'number')
                    ? options.executionRoll
                    : _roll();
                var execChance = (typeof options.executionChance === 'number')
                    ? options.executionChance
                    : AR.DEFAULT_EXECUTION_CHANCE;

                if (execRoll < execChance) {
                    var rulerId = options.rulerId || options.discovererId || null;
                    var execResult = execCmds.execute(rec.participantA, rec.participantB, {
                        year: rec.metadata.discoveryYear,
                        rulerId: rulerId,
                        reason: 'adultery'
                    });
                    consequences.push({
                        type: AR.CONSEQUENCE.EXECUTION,
                        success: !!(execResult && execResult.success),
                        details: execResult || { reason: 'no_result' }
                    });
                } else {
                    consequences.push({
                        type: AR.CONSEQUENCE.EXECUTION,
                        success: false,
                        details: { roll: execRoll, chance: execChance, triggered: false }
                    });
                }
            } else {
                consequences.push({
                    type: AR.CONSEQUENCE.EXECUTION,
                    success: false,
                    details: { reason: 'ExecutionCommands_unavailable' }
                });
            }
        }

        // Persist the consequence summary
        var types = [];
        for (var i = 0; i < consequences.length; i++) types.push(consequences[i].type);

        RC.update(relationshipId, {
            metadata: {
                consequencesTriggered: true,
                consequences: types
            }
        });

        return _ok({ consequences: consequences });
    }

    // -------------------------------------------------------------------------
    // SCANDAL / BREAKUP HELPERS
    // -------------------------------------------------------------------------

    function _computeScandal(rec) {
        var charA = _getCharacter(rec.participantA);
        var charB = _getCharacter(rec.participantB);

        function _rankPriority(c) {
            if (!c || !c.activeRankId) return 5;
            if (typeof window.getRankById !== 'function') return 5;
            var r = window.getRankById(c.activeRankId);
            return (r && typeof r.priority === 'number') ? r.priority : 5;
        }

        return AR.calculateScandalImpact({
            affairType: (rec.metadata && rec.metadata.affairType) || AR.AFFAIR_TYPE.SECRET,
            discovered: !!(rec.metadata && rec.metadata.discovered),
            participants: [
                {
                    id: rec.participantA,
                    rankPriority: _rankPriority(charA),
                    hasActivePartners: _otherCommittedPartners(rec.participantA, rec.id).length > 0
                },
                {
                    id: rec.participantB,
                    rankPriority: _rankPriority(charB),
                    hasActivePartners: _otherCommittedPartners(rec.participantB, rec.id).length > 0
                }
            ]
        });
    }

    function _otherCommittedPartners(characterId, excludeRelId) {
        var list = RoQ.getActiveCommittedPartners(characterId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].relationshipId !== excludeRelId) {
                out.push(list[i]);
            }
        }
        return out;
    }

    function _applyBreakups(rec, partnersA, partnersB, roll, chance) {
        var ended = [];
        if (roll >= chance) {
            return { count: 0, ended: ended, roll: roll, chance: chance };
        }

        var year = rec.metadata && typeof rec.metadata.discoveryYear === 'number'
            ? rec.metadata.discoveryYear
            : _getCurrentYear();

        var i;
        for (i = 0; i < partnersA.length; i++) {
            var r = RoC.breakUp(partnersA[i].relationshipId, {
                endYear: year,
                reason: 'affair discovered'
            });
            if (r.success) ended.push(partnersA[i].relationshipId);
        }
        for (i = 0; i < partnersB.length; i++) {
            var r2 = RoC.breakUp(partnersB[i].relationshipId, {
                endYear: year,
                reason: 'affair discovered'
            });
            if (r2.success) ended.push(partnersB[i].relationshipId);
        }

        return { count: ended.length, ended: ended, roll: roll, chance: chance };
    }

    // -------------------------------------------------------------------------
    // END AFFAIR
    //
    // options: { endYear?, reason? }
    // -------------------------------------------------------------------------

    function endAffair(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) return _fail('NOT_AFFAIR', 'not committed');
        if (!RR.isAffair(rec.attributes)) return _fail('NOT_AFFAIR', 'not an affair');
        if (rec.status !== STATUS.ONGOING) return _fail('NOT_ACTIVE', 'not ongoing');

        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = (typeof options.reason === 'string' && options.reason.length > 0)
            ? options.reason
            : 'affair ended';

        var result = RC.end(relationshipId, year, reason);
        if (!result.success) return result;

        _logEvent('affair', 'Affair Ended',
            'An affair ended in ' + year + ' (' + reason + ')',
            [_getCharacter(rec.participantA), _getCharacter(rec.participantB)]);

        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------
    // LEGITIMIZE AFFAIR
    //
    // Removes SECRET, adds PUBLIC, optionally merges extra attributes.
    // Cultural gating applies if extras include cultural attributes.
    //
    // options: {
    //   legitimizationYear?,
    //   extraAttributes?: string[]
    // }
    // -------------------------------------------------------------------------

    function legitimizeAffair(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) return _fail('NOT_AFFAIR', 'not committed');

        var check = AR.canLegitimize({
            status: rec.status,
            attributes: rec.attributes
        });
        if (!check.valid) return _fail('CANNOT_LEGITIMIZE', check.reason);

        var resolved = AR.resolveLegitimizedAttributes({
            currentAttributes: rec.attributes,
            extraAttributes: options.extraAttributes || []
        });

        // Structural validation
        var structural = RR.validateAttributes(COMMITTED, resolved);
        if (!structural.valid) {
            return _fail('INVALID_ATTRIBUTES', structural.errors.join('; '));
        }

        // Cultural gating for any cultural attributes in the resolved set.
        var hasCultural = false;
        for (var i = 0; i < resolved.length; i++) {
            if (window.RELATIONSHIP_TYPES.isCulturalAttribute(resolved[i])) {
                hasCultural = true;
                break;
            }
        }
        if (hasCultural) {
            var charA = _getCharacter(rec.participantA);
            var charB = _getCharacter(rec.participantB);
            var cultureA = (charA && typeof charA.cultureId === 'string') ? charA.cultureId : null;
            var cultureB = (charB && typeof charB.cultureId === 'string') ? charB.cultureId : null;
            var cultureCheck = RR.validateAttributesForCulture({
                attributes: resolved,
                cultureA: cultureA,
                cultureB: cultureB
            });
            if (!cultureCheck.valid) {
                return _fail('CULTURAL_ATTRIBUTE_REJECTED', cultureCheck.errors.join('; '));
            }
        }

        var year = options.legitimizationYear !== undefined
            ? options.legitimizationYear
            : _getCurrentYear();

        var updateResult = RC.update(relationshipId, {
            attributes: resolved,
            metadata: {
                legitimizedFromAffair: true,
                legitimizationYear: year
            }
        });
        if (!updateResult.success) return updateResult;

        _logEvent('affair', 'Affair Legitimized',
            'An affair was legitimized in ' + year,
            [_getCharacter(rec.participantA), _getCharacter(rec.participantB)]);

        return _ok({ relationship: window.RelationshipQueries.getById(relationshipId) });
    }

    // -------------------------------------------------------------------------
    // RECONCILE AFTER AFFAIR
    //
    // Records a decision by the wronged party to accept the adulterer
    // back. This is a decision record; the actual ending of affairs and
    // partnerships is the caller's responsibility (RomanceCommands.breakUp
    // is the canonical path).
    //
    // options: { roll?, year?, hasChildren? }
    // -------------------------------------------------------------------------

    function reconcileAfterAffair(relationshipId, wrongedPartyId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }
        if (typeof wrongedPartyId !== 'string' || wrongedPartyId.length === 0) {
            return _fail('MISSING_ID', 'wrongedPartyId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');

        var wronged = _getCharacter(wrongedPartyId);
        if (!wronged) return _fail('MISSING_CHARACTER', 'wronged party not found');

        var duration = 0;
        if (typeof rec.startYear === 'number') {
            var endY = typeof rec.endYear === 'number' ? rec.endYear : _getCurrentYear();
            duration = Math.max(0, endY - rec.startYear);
        }

        var roll = (typeof options.roll === 'number') ? options.roll : _roll();

        var affairType = (rec.metadata && typeof rec.metadata.affairType === 'string')
            ? rec.metadata.affairType
            : AR.AFFAIR_TYPE.SECRET;

        var evaluated = AR.evaluateReconciliation({
            wrongedPartyId: wrongedPartyId,
            affairType: affairType,
            durationYears: duration,
            hasChildren: !!options.hasChildren,
            wrongedPartyRankPriority: _rankPriority(wronged),
            roll: roll
        });
        if (!evaluated.valid) {
            return _fail('INVALID_RECONCILIATION', 'evaluation failed');
        }

        _logEvent('affair', 'Reconciliation',
            (evaluated.reconciled ? 'Successful' : 'Failed') +
            ' reconciliation attempt by ' +
            (wronged.name ? wronged.name : wrongedPartyId),
            [wronged]);

        return _ok({
            reconciled: evaluated.reconciled,
            chance: evaluated.chance,
            roll: roll,
            wrongedPartyId: wrongedPartyId
        });
    }

    // -------------------------------------------------------------------------
    // BULK END
    //
    // options: { endYear?, reason? }
    // -------------------------------------------------------------------------

    function endAllAffairsForCharacter(characterId, options) {
        options = options || {};

        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }

        var affairs = RoQ.getActiveAffairs(characterId);
        var ended = 0;
        var failed = [];
        var year = options.endYear !== undefined ? options.endYear : _getCurrentYear();

        for (var i = 0; i < affairs.length; i++) {
            var r = endAffair(affairs[i].relationshipId, {
                endYear: year,
                reason: options.reason
            });
            if (r.success) ended++;
            else failed.push({ id: affairs[i].relationshipId, code: r.code, message: r.message });
        }

        return _ok({
            ended: ended,
            failed: failed,
            count: ended,
            failedCount: failed.length
        });
    }

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    function _rankPriority(character) {
        if (!character || !character.activeRankId) return 5;
        if (typeof window.getRankById !== 'function') return 5;
        var r = window.getRankById(character.activeRankId);
        return (r && typeof r.priority === 'number') ? r.priority : 5;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
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
