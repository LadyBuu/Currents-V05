/**
 * =============================================================================
 * STILL WATERS - ROMANCE COMMANDS (romance-commands.js)
 * =============================================================================
 *
 * LOCATION: js/social/romance-commands.js
 *
 * Mutation boundary for romantic relationships.
 *
 * Owns:
 *   - starting casual dating, one-night stands, and committed
 *     relationships
 *   - affair classification at creation time (via RomanceRules and
 *     CultureRules)
 *   - adding and removing committed attributes (with cultural gating)
 *   - breaking up and widowing
 *   - one commit per logical operation
 *
 * Depends on:
 *   - RomanceRules for policy
 *   - RomanceQueries for existence and facts
 *   - CultureRules for cultural attribute gating (required at call
 *     time only, via RomanceRules.validateAttributesForCulture — not
 *     required at module load)
 *   - RelationshipCommands for the state write
 *   - Character accessors for ages, names, traits, rank
 *   - RankRules for rank policy reads (optional, falls back to direct
 *     field reads if absent)
 *
 * Does NOT own:
 *   - direct state access (goes through RelationshipCommands)
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness (no rolls here; discovery/consequence rolls live in
 *     affair-commands.js)
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, romance-rules.js,
 * romance-queries.js. RankRules is optional; if loaded before this
 * module, rank policy reads route through it.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RR = window.RomanceRules;
    var RoQ = window.RomanceQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RR || !RoQ || !A || !ATTR || !STATUS) {
        throw new Error(
            'romance-commands.js: relationship-commands.js, ' +
            'romance-rules.js, romance-queries.js must load first'
        );
    }

    var CASUAL    = A.CASUAL_DATING;
    var ONE_NIGHT = A.ONE_NIGHT_STAND;
    var COMMITTED = A.COMMITTED;

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('romance-commands.js: getCharacterById required');
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
        if (!character || typeof character.birthYear !== 'number') return null;
        if (character.isDeceased && typeof character.deathYear === 'number' &&
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

    // -------------------------------------------------------------------------
    // RANK POLICY
    //
    // The rank domain exports RankRules.allowsMultipleSpouses(rank) as the
    // semantic query for "does this rank permit its holder to have multiple
    // spouses." Romance routes through it when RankRules is present.
    //
    // If RankRules is absent (rank domain not loaded, or loaded after this
    // module), the same answer is produced by reading the field directly.
    // The direct read is a fallback, not an alternate source of truth —
    // the field is the same field RankRules reads.
    // -------------------------------------------------------------------------

    function _rankAllowsMultipleSpouses(rank) {
        if (!rank || typeof rank !== 'object') return false;
        if (window.RankRules
            && typeof window.RankRules.allowsMultipleSpouses === 'function') {
            return window.RankRules.allowsMultipleSpouses(rank) === true;
        }
        return rank.allowsMultipleSpouses === true;
    }

    function _getExternalMultiPartnerFacts(character) {
        var facts = {};
        if (!character) return facts;

        if (character.activeRankId && typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && _rankAllowsMultipleSpouses(rank)) {
                facts.allowsMultipleByRank = true;
            }
        }

        if (Array.isArray(character.traits) &&
            character.traits.indexOf('polygamous') !== -1) {
            facts.allowsMultipleByTrait = true;
        }

        return facts;
    }

    // -------------------------------------------------------------------------
    // CULTURE RESOLUTION
    // -------------------------------------------------------------------------

    function _resolveCultureId(character) {
        if (!character) return null;
        if (typeof character.cultureId === 'string' && character.cultureId.length > 0) {
            return character.cultureId;
        }
        return null;
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
    // INTERNAL: BASIC ROMANTIC CREATE
    // -------------------------------------------------------------------------

    function _createSimpleRomantic(archetype, idA, idB, startYear, notes) {
        var createResult = RC.create({
            participantA: idA,
            participantB: idB,
            type: archetype,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: { notes: typeof notes === 'string' ? notes : '' }
        });
        if (!createResult.success) return createResult;

        var projection = RoQ.getRomanticRelationshipsBetween(idA, idB, { activeOnly: true });
        var rel = projection.length > 0 ? projection[0] : createResult.relationship;

        return _ok({ relationship: rel });
    }

    // -------------------------------------------------------------------------
    // CASUAL DATING
    // -------------------------------------------------------------------------

    function startCasualDating(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot date oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var charA = _getCharacter(idA);
        var charB = _getCharacter(idB);

        if (!RR.isAgeValid(CASUAL, _ageAtYear(charA, startYear))) {
            return _fail('UNDERAGE', 'participant A below minimum age');
        }
        if (!RR.isAgeValid(CASUAL, _ageAtYear(charB, startYear))) {
            return _fail('UNDERAGE', 'participant B below minimum age');
        }

        if (RoQ.hasActiveRomanticBetween(idA, idB)) {
            return _fail('ALREADY_ROMANTIC', 'active romantic relationship already exists');
        }

        var result = _createSimpleRomantic(CASUAL, idA, idB, startYear, options.notes);
        if (!result.success) return result;

        _logEvent('romance', 'Casual Dating',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' began casual dating in ' + startYear,
            [charA, charB]);

        return result;
    }

    // -------------------------------------------------------------------------
    // ONE NIGHT STAND
    // -------------------------------------------------------------------------

    function startOneNightStand(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot have a one night stand with oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var charA = _getCharacter(idA);
        var charB = _getCharacter(idB);

        if (!RR.isAgeValid(ONE_NIGHT, _ageAtYear(charA, startYear))) {
            return _fail('UNDERAGE', 'participant A below minimum age');
        }
        if (!RR.isAgeValid(ONE_NIGHT, _ageAtYear(charB, startYear))) {
            return _fail('UNDERAGE', 'participant B below minimum age');
        }

        var createResult = RC.create({
            participantA: idA,
            participantB: idB,
            type: ONE_NIGHT,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: { notes: typeof options.notes === 'string' ? options.notes : '' }
        });
        if (!createResult.success) return createResult;

        // One-night stands end immediately; the record is historical from
        // the start. This is a single logical operation.
        var endResult = RC.end(
            createResult.relationship.relationshipId || createResult.relationship.id,
            startYear,
            'one_night_stand'
        );
        if (!endResult.success) return endResult;

        _logEvent('romance', 'One Night Stand',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' had a one night stand in ' + startYear,
            [charA, charB]);

        var all = RoQ.getRomanticRelationshipsBetween(idA, idB);
        var oneNightProjection = null;
        for (var i = 0; i < all.length; i++) {
            if (all[i].type === ONE_NIGHT && all[i].startYear === startYear) {
                oneNightProjection = all[i];
                break;
            }
        }

        return _ok({ relationship: oneNightProjection || endResult.relationship });
    }

    // -------------------------------------------------------------------------
    // COMMITTED RELATIONSHIP
    //
    // Full pipeline: gather facts, classify, resolve attributes, validate
    // structurally and culturally, then write.
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   startYear?,
     *   attributes?: string[],
     *   forceAffair?: boolean,
     *   isSecret?: boolean,
     *   isScandalous?: boolean,
     *   notes?: string
     * }
     */
    function startCommittedRelationship(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot commit to oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var charA = _getCharacter(idA);
        var charB = _getCharacter(idB);

        if (RoQ.hasActiveCommittedBetween(idA, idB)) {
            return _fail('ALREADY_COMMITTED', 'these characters are already committed');
        }

        var aAge = _ageAtYear(charA, startYear);
        var bAge = _ageAtYear(charB, startYear);

        var aFacts = RoQ.getMultiPartnerFacts(idA, _getExternalMultiPartnerFacts(charA));
        aFacts.ageAtStart = aAge;

        var bFacts = RoQ.getMultiPartnerFacts(idB, _getExternalMultiPartnerFacts(charB));
        bFacts.ageAtStart = bAge;

        var classification = RR.classifyNewRelationship({
            archetype: COMMITTED,
            participantAFacts: aFacts,
            participantBFacts: bFacts,
            startYear: startYear,
            forceAffair: !!options.forceAffair,
            explicitSecret: !!options.isSecret
        });

        if (classification.classification === 'blocked') {
            return _fail('BLOCKED', classification.reason);
        }

        var resolved = RR.resolveAttributes({
            classification: classification.classification,
            userAttributes: options.attributes || [],
            isScandalous: !!options.isScandalous
        });

        var attrCheck = RR.validateAttributes(COMMITTED, resolved);
        if (!attrCheck.valid) {
            return _fail('INVALID_ATTRIBUTES', attrCheck.errors.join('; '));
        }

        // Cultural gating: only consulted if any cultural attribute is
        // present. Universal-only requests skip CultureRules entirely.
        var hasCultural = false;
        for (var i = 0; i < resolved.length; i++) {
            if (window.RELATIONSHIP_TYPES.isCulturalAttribute(resolved[i])) {
                hasCultural = true;
                break;
            }
        }
        if (hasCultural) {
            var cultureA = _resolveCultureId(charA);
            var cultureB = _resolveCultureId(charB);
            var cultureCheck = RR.validateAttributesForCulture({
                attributes: resolved,
                cultureA: cultureA,
                cultureB: cultureB
            });
            if (!cultureCheck.valid) {
                return _fail('CULTURAL_ATTRIBUTE_REJECTED', cultureCheck.errors.join('; '));
            }
        }

        var createResult = RC.create({
            participantA: idA,
            participantB: idB,
            type: COMMITTED,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: resolved,
            metadata: {
                notes: typeof options.notes === 'string' ? options.notes : '',
                classification: classification.classification,
                classificationReason: classification.reason
            }
        });
        if (!createResult.success) return createResult;

        var projection = RoQ.getActiveCommittedBetween(idA, idB);
        var rel = projection.length > 0 ? projection[0] : createResult.relationship;

        _logEvent('romance',
            classification.classification === 'affair'
                ? 'Affair Formed'
                : 'Committed Relationship Formed',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' began a committed relationship in ' + startYear,
            [charA, charB]);

        return _ok({
            relationship: rel,
            classification: classification.classification,
            reason: classification.reason
        });
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE MANAGEMENT
    //
    // Adding or removing an attribute on a committed relationship.
    // Structural validation via RomanceRules; cultural gating via
    // RomanceRules.validateAttributesForCulture when the attribute is
    // cultural.
    // -------------------------------------------------------------------------

    function addCommittedAttribute(relationshipId, attribute, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) {
            return _fail('NOT_COMMITTED', 'relationship is not committed');
        }
        if (rec.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'relationship is not ongoing');
        }

        var check = RR.canAddAttribute({
            archetype: COMMITTED,
            currentAttributes: rec.attributes,
            attribute: attribute
        });
        if (!check.valid) {
            return _fail('INVALID_ATTRIBUTE', check.reason);
        }

        // Cultural gating if applicable. RomanceRules.validateAttributesForCulture
        // is the sole cultural-gating entry point; it consults CultureRules
        // at call time and fails loudly if CultureRules is missing.
        if (window.RELATIONSHIP_TYPES.isCulturalAttribute(attribute)) {
            var charA = _getCharacter(rec.participantA);
            var charB = _getCharacter(rec.participantB);
            var cultureA = _resolveCultureId(charA);
            var cultureB = _resolveCultureId(charB);
            var cultureCheck = RR.validateAttributesForCulture({
                attributes: [attribute],
                cultureA: cultureA,
                cultureB: cultureB
            });
            if (!cultureCheck.valid) {
                return _fail('CULTURAL_ATTRIBUTE_REJECTED', cultureCheck.errors.join('; '));
            }
        }

        var result = RC.addAttribute(relationshipId, attribute);
        if (!result.success) return result;

        var refreshed = window.RelationshipQueries.getById(relationshipId);
        return _ok({ relationship: refreshed });
    }

    function removeCommittedAttribute(relationshipId, attribute) {
        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (rec.type !== COMMITTED) {
            return _fail('NOT_COMMITTED', 'relationship is not committed');
        }
        if (rec.status !== STATUS.ONGOING) {
            return _fail('NOT_ACTIVE', 'relationship is not ongoing');
        }

        var check = RR.canRemoveAttribute({
            archetype: COMMITTED,
            currentAttributes: rec.attributes,
            attribute: attribute
        });
        if (!check.valid) {
            return _fail('INVALID_ATTRIBUTE', check.reason);
        }

        var result = RC.removeAttribute(relationshipId, attribute);
        if (!result.success) return result;

        var refreshed = window.RelationshipQueries.getById(relationshipId);
        return _ok({ relationship: refreshed });
    }

    // -------------------------------------------------------------------------
    // BREAKUP
    // -------------------------------------------------------------------------

    /**
     * options: { endYear?, reason? }
     */
    function breakUp(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (!RR.isRomanticArchetype(rec.type)) {
            return _fail('NOT_ROMANTIC', 'relationship is not romantic');
        }

        var check = RR.canBreakUp({ status: rec.status });
        if (!check.valid) {
            return _fail('NOT_ACTIVE', check.reason);
        }

        var endYear = options.endYear !== undefined
            ? options.endYear
            : _getCurrentYear();
        var reason = options.reason !== undefined && options.reason !== null
            ? options.reason
            : 'breakup';

        var result = RC.end(relationshipId, endYear, reason);
        if (!result.success) return result;

        _logEvent('romance', 'Breakup',
            _getCharacterName(rec.participantA) + ' and ' +
            _getCharacterName(rec.participantB) +
            ' ended their relationship in ' + endYear + ' (' + reason + ')',
            [_getCharacter(rec.participantA), _getCharacter(rec.participantB)]);

        return _ok({ relationship: window.RelationshipQueries.getById(relationshipId) });
    }

    // -------------------------------------------------------------------------
    // WIDOWING
    // -------------------------------------------------------------------------

    /**
     * options: { deathYear? }
     */
    function deathEndsRelationship(relationshipId, options) {
        options = options || {};

        if (typeof relationshipId !== 'string' || relationshipId.length === 0) {
            return _fail('MISSING_ID', 'relationshipId required');
        }

        var rec = window.RelationshipQueries.getById(relationshipId);
        if (!rec) return _fail('NOT_FOUND', 'relationship not found');
        if (!RR.isRomanticArchetype(rec.type)) {
            return _fail('NOT_ROMANTIC', 'relationship is not romantic');
        }

        var check = RR.canBeWidowed({ status: rec.status });
        if (!check.valid) {
            return _fail('NOT_ACTIVE', check.reason);
        }

        var deathYear = options.deathYear !== undefined
            ? options.deathYear
            : _getCurrentYear();

        var result = RC.setWidowed(relationshipId, deathYear);
        if (!result.success) return result;

        _logEvent('romance', 'Partner Died',
            _getCharacterName(rec.participantA) + ' and ' +
            _getCharacterName(rec.participantB) +
            ' ended by death in ' + deathYear,
            [_getCharacter(rec.participantA), _getCharacter(rec.participantB)]);

        return _ok({ relationship: window.RelationshipQueries.getById(relationshipId) });
    }

    // -------------------------------------------------------------------------
    // BULK: END ALL ROMANTIC RELATIONSHIPS FOR A CHARACTER
    //
    // Used by life-death integration when the relationship command
    // surface is being invoked from outside romance. One commit per
    // relationship ended (via RC.end / RC.setWidowed); the loop is not
    // atomic across records. Documented in the same spirit as
    // children-commands.js recordPregnancyAttempts.
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   endYear,
     *   reason?,
     *   widowedInstead?: boolean
     * }
     */
    function endAllRomanticForCharacter(characterId, options) {
        options = options || {};

        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }
        if (typeof options.endYear !== 'number') {
            return _fail('MISSING_END_YEAR', 'endYear required');
        }

        var active = RoQ.getActiveRomanticRelationships(characterId);
        if (active.length === 0) {
            return _ok({ ended: [], count: 0, mode: 'none' });
        }

        var ended = [];
        var failed = [];
        var mode = options.widowedInstead === true ? 'widowed' : 'ended';

        for (var i = 0; i < active.length; i++) {
            var r = active[i];
            var res = mode === 'widowed'
                ? RC.setWidowed(r.relationshipId, options.endYear)
                : RC.end(r.relationshipId, options.endYear, options.reason || 'ended_by_character_event');
            if (res.success) ended.push(r.relationshipId);
            else failed.push({ id: r.relationshipId, code: res.code, message: res.message });
        }

        if (ended.length > 0) {
            _logEvent('romance', 'Romantic Relationships Ended',
                ended.length + ' romantic relationship(s) ended for ' +
                _getCharacterName(characterId) + ' (' + mode + ')',
                [_getCharacter(characterId)]);
        }

        return _ok({
            ended: ended,
            failed: failed,
            count: ended.length,
            failedCount: failed.length,
            mode: mode
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RomanceCommands = {
        startCasualDating: startCasualDating,
        startOneNightStand: startOneNightStand,
        startCommittedRelationship: startCommittedRelationship,

        addCommittedAttribute: addCommittedAttribute,
        removeCommittedAttribute: removeCommittedAttribute,

        breakUp: breakUp,
        deathEndsRelationship: deathEndsRelationship,

        endAllRomanticForCharacter: endAllRomanticForCharacter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RomanceCommands;
    }

})();
