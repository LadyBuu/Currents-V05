/**
 * romance-commands.js
 *
 * Mutation and transaction boundary for romantic relationships.
 * Orchestrates queries, rules, and RelationshipCommands.
 * Owns event logging and (optionally) persistence via commit callback.
 *
 * CONTRACT:
 *   - Every public command returns { success, ... }
 *   - Never throws for domain errors
 *   - Orchestration only: no direct state mutation
 *   - One logical operation = one commit boundary (caller-provided)
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var RR = window.RomanceRules;
    var RoQ = window.RomanceQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !RR || !RoQ || !A || !ATTR || !STATUS) {
        throw new Error('romance-commands.js: relationship-* and romance-* must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _characterExists(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('romance-commands.js: getCharacterById required');
        }
        return !!window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('romance-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error('romance-commands.js: calculateAge required');
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }

    function _ageAtYear(character, year) {
        if (!character || !character.birthYear) return 0;
        if (character.isDeceased && character.deathYear && character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _getExternalMultiPartnerFacts(character) {
        if (!character) return {};
        var facts = {};

        if (character.activeRankId && typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && rank.allowsMultipleSpouses) {
                facts.allowsMultipleByRank = true;
            }
        }

        if (character.traits && character.traits.indexOf('polygamous') !== -1) {
            facts.allowsMultipleByTrait = true;
        }

        return facts;
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
    // FACT GATHERING (queries only, no mutation)
    // -------------------------------------------------------------------------

    function _gatherFacts(characterAId, characterBId, startYear) {
        var charA = window.getCharacterById(characterAId);
        var charB = window.getCharacterById(characterBId);
        if (!charA || !charB) return null;

        var aFacts = RoQ.getMultiPartnerFacts(
            characterAId, _getExternalMultiPartnerFacts(charA)
        );
        aFacts.ageAtStart = _ageAtYear(charA, startYear);

        var bFacts = RoQ.getMultiPartnerFacts(
            characterBId, _getExternalMultiPartnerFacts(charB)
        );
        bFacts.ageAtStart = _ageAtYear(charB, startYear);

        return { charA: charA, charB: charB, aFacts: aFacts, bFacts: bFacts };
    }

    // -------------------------------------------------------------------------
    // CREATE HELPERS
    // -------------------------------------------------------------------------

    function _createSimpleRomantic(archetype, idA, idB, startYear, notes) {
        var result = RC.create({
            participantA: idA,
            participantB: idB,
            type: archetype,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: { notes: notes || '' }
        });
        if (!result.success) return result;

        var charA = window.getCharacterById(idA);
        var charB = window.getCharacterById(idB);
        _logEvent('romance', 'Relationship Formed',
            (charA && charA.name) + ' and ' + (charB && charB.name) +
            ' began a ' + archetype + ' relationship in ' + startYear,
            [charA, charB]);

        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------
    // PUBLIC COMMANDS
    // -------------------------------------------------------------------------

    function startCasualDating(characterAId, characterBId, options) {
        options = options || {};
        if (!_characterExists(characterAId) || !_characterExists(characterBId)) {
            return _fail('MISSING_CHARACTER', 'Character not found');
        }
        if (characterAId === characterBId) {
            return _fail('SAME_CHARACTER', 'Cannot date oneself');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear : _getCurrentYear();

        var result = _createSimpleRomantic(
            A.CASUAL_DATING, characterAId, characterBId, startYear, options.notes
        );
        if (result.success) _commit();
        return result;
    }

    function startOneNightStand(characterAId, characterBId, options) {
        options = options || {};
        if (!_characterExists(characterAId) || !_characterExists(characterBId)) {
            return _fail('MISSING_CHARACTER', 'Character not found');
        }
        if (characterAId === characterBId) {
            return _fail('SAME_CHARACTER', 'Cannot have a one night stand with oneself');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear : _getCurrentYear();

        var createResult = RC.create({
            participantA: characterAId,
            participantB: characterBId,
            type: A.ONE_NIGHT_STAND,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: { notes: options.notes || '' }
        });
        if (!createResult.success) return createResult;

        // End immediately in same transaction
        var endResult = RC.end(
            createResult.relationship.id,
            startYear,
            'One night stand'
        );
        if (!endResult.success) return endResult;

        var charA = window.getCharacterById(characterAId);
        var charB = window.getCharacterById(characterBId);
        _logEvent('romance', 'One Night Stand',
            (charA && charA.name) + ' and ' + (charB && charB.name) +
            ' had a one night stand in ' + startYear,
            [charA, charB]);

        _commit();
        return _ok({ relationship: endResult.relationship });
    }

    /**
     * Starts a committed relationship. Applies automatic affair
     * classification when one party is monogamous with an existing partner.
     */
    function startCommittedRelationship(characterAId, characterBId, options) {
        options = options || {};
        if (!_characterExists(characterAId) || !_characterExists(characterBId)) {
            return _fail('MISSING_CHARACTER', 'Character not found');
        }
        if (characterAId === characterBId) {
            return _fail('SAME_CHARACTER', 'Cannot commit to oneself');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear : _getCurrentYear();

        // Already in a committed relationship with each other?
        if (RoQ.hasActiveCommittedBetween(characterAId, characterBId)) {
            return _fail('ALREADY_COMMITTED', 'These characters are already committed');
        }

        var facts = _gatherFacts(characterAId, characterBId, startYear);
        if (!facts) return _fail('MISSING_CHARACTER', 'Character not found');

        var classification = RR.classifyNewRelationship({
            archetype: A.COMMITTED,
            participantAFacts: facts.aFacts,
            participantBFacts: facts.bFacts,
            startYear: startYear,
            forceAffair: !!options.forceAffair,
            explicitSecret: !!options.isSecret
        });

        if (classification.classification === 'blocked') {
            return _fail('BLOCKED', classification.reason);
        }

        var resolvedAttrs = RR.resolveAttributes({
            classification: classification.classification,
            userAttributes: options.attributes || [],
            isScandalous: !!options.isScandalous
        });

        var attrCheck = RR.validateAttributes(A.COMMITTED, resolvedAttrs);
        if (!attrCheck.valid) {
            return _fail('INVALID_ATTRIBUTES', attrCheck.conflicts.join('; '));
        }

        var createResult = RC.create({
            participantA: characterAId,
            participantB: characterBId,
            type: A.COMMITTED,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: resolvedAttrs,
            metadata: { notes: options.notes || '' }
        });
        if (!createResult.success) return createResult;

        _logEvent('romance',
            classification.classification === 'affair'
                ? 'Affair Formed'
                : 'Committed Relationship Formed',
            facts.charA.name + ' and ' + facts.charB.name +
            ' began a committed relationship in ' + startYear,
            [facts.charA, facts.charB]);

        _commit();

        return _ok({
            relationship: createResult.relationship,
            classification: classification.classification,
            reason: classification.reason
        });
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE MANAGEMENT
    // -------------------------------------------------------------------------

    function addRelationshipAttribute(relationshipId, attribute) {
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'Relationship not found');

        var check = RR.canAddAttribute({
            archetype: rel.type,
            currentAttributes: rel.attributes,
            attribute: attribute
        });
        if (!check.valid) return _fail('INVALID_ATTRIBUTE', check.reason);

        var result = RC.addAttribute(relationshipId, attribute);
        if (result.success) _commit();
        return result;
    }

    function removeRelationshipAttribute(relationshipId, attribute) {
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'Relationship not found');

        var check = RR.canRemoveAttribute({
            archetype: rel.type,
            currentAttributes: rel.attributes,
            attribute: attribute
        });
        if (!check.valid) return _fail('INVALID_ATTRIBUTE', check.reason);

        var result = RC.removeAttribute(relationshipId, attribute);
        if (result.success) _commit();
        return result;
    }

    // -------------------------------------------------------------------------
    // BREAKUP
    // -------------------------------------------------------------------------

    function breakUp(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'Relationship not found');

        var check = RR.canBreakUp({ status: rel.status });
        if (!check.valid) return _fail('NOT_ACTIVE', check.reason);

        var endYear = options.endYear !== undefined
            ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'Breakup';

        var result = RC.end(relationshipId, endYear, reason);
        if (!result.success) return result;

        var charA = window.getCharacterById(rel.participantA);
        var charB = window.getCharacterById(rel.participantB);
        _logEvent('romance', 'Breakup',
            (charA && charA.name) + ' and ' + (charB && charB.name) +
            ' ended their relationship in ' + endYear + ' (' + reason + ')',
            [charA, charB]);

        _commit();
        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------
    // DEATH OF PARTNER
    // -------------------------------------------------------------------------

    function deathEndsRelationship(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return _fail('NOT_FOUND', 'Relationship not found');

        var check = RR.canBeWidowed({ status: rel.status });
        if (!check.valid) return _fail('NOT_ACTIVE', check.reason);

        var deathYear = options.deathYear !== undefined
            ? options.deathYear : _getCurrentYear();

        var result = RC.setWidowed(relationshipId, deathYear);
        if (!result.success) return result;

        _logEvent('romance', 'Partner Died',
            'Relationship between ' + rel.participantA + ' and ' + rel.participantB +
            ' ended by death in ' + deathYear,
            []);

        _commit();
        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------

    window.RomanceCommands = {
        startCasualDating: startCasualDating,
        startOneNightStand: startOneNightStand,
        startCommittedRelationship: startCommittedRelationship,
        addRelationshipAttribute: addRelationshipAttribute,
        removeRelationshipAttribute: removeRelationshipAttribute,
        breakUp: breakUp,
        deathEndsRelationship: deathEndsRelationship
    };

})();
