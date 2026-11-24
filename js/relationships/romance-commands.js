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
 *   - writing the initial affair metadata for affairs created via
 *     startCommittedRelationship, so AffairQueries._projectAffair
 *     always finds a value
 *   - adding and removing committed attributes (with cultural gating)
 *   - breaking up and widowing
 *   - one commit per logical operation
 *
 * UNDERAGE AND AGE-GAP POLICY (CURRENT REVISION)
 *
 *   Underage romance is now WARN + PROCEED, not a hard block.
 *
 *   For every archetype (casual_dating, one_night_stand, committed):
 *
 *     - If either participant is below the archetype's minimum age
 *       at startYear, the command still creates the record, and the
 *       success envelope carries:
 *
 *           warnings: [{ code: 'UNDERAGE', ... }]
 *
 *     - Independently, if the age gap between the participants at
 *       startYear exceeds AGE_GAP_WARN_YEARS (5), the envelope
 *       carries:
 *
 *           warnings: [{ code: 'AGE_GAP_OVER_5_YEARS', ... }]
 *
 *   Both can fire together. warnings is always present on a success
 *   envelope; it is [] when there is nothing to warn about, so
 *   callers can read it unconditionally.
 *
 *   The decision to warn rather than refuse lives HERE, in the
 *   command layer, not in romance-rules.js. romance-rules.js remains
 *   the pure-policy layer: it answers "is this age valid?" and "is
 *   the age gap large?" as facts. This file decides what to do with
 *   those facts. That preserves the existing separation and means
 *   romance-rules.js needs no change for this policy.
 *
 *   Affair classification for committed relationships still runs
 *   through RomanceRules.classifyNewRelationship. Underage does not
 *   make a committed relationship 'blocked' any more — see
 *   _committedBlockedReason below, which filters out the underage
 *   reasons so the classification proceeds. The committed path
 *   therefore still classifies as legitimate / affair / polyamorous
 *   and the metadata written is the same as before for the
 *   non-underage case.
 *
 *   Blocking reasons that are NOT underage (same character, missing
 *   character, already committed, already romantic, cultural
 *   attribute rejection, invalid attributes) are unchanged and still
 *   return success: false.
 *
 *   The age-gap predicate (_isAgeGapOver5) is intentionally local to
 *   this file. It is a UX threshold, not romance policy, and does
 *   not belong on RomanceRules where it would need a bootstrap
 *   manifest entry. If the threshold ever becomes policy, promote it
 *   to romance-rules.js in a separate change.
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
 * AFFAIR METADATA
 *
 *   When classification === 'affair', the RC.create call writes the
 *   initial affair metadata fields (affairType, discovered, etc.) so
 *   that AffairQueries._projectAffair finds an explicit affairType
 *   regardless of which code path created the affair.
 *
 *   AffairCommands.createAffair may subsequently overwrite or augment
 *   this metadata via RelationshipCommands.update (see the COMMIT
 *   SEMANTICS note in affair-commands.js). That second write is the
 *   only place callers can override affairType away from the default
 *   ('secret') or set publicBehavior.
 *
 *   The default affair type is defined as DEFAULT_AFFAIR_TYPE below.
 *   It is a literal string ('secret') rather than
 *   AffairRules.AFFAIR_TYPE.SECRET because affair-rules.js loads
 *   AFTER romance-commands.js in the documented load order — importing
 *   it here would invert the dependency graph. If the affair type
 *   vocabulary ever changes, update BOTH this literal and
 *   AffairRules.AFFAIR_TYPE.
 *
 * COMMIT SEMANTICS
 *
 *   Every command in this file commits exactly once:
 *
 *   startCasualDating                one commit (RC.create)
 *   startOneNightStand               one commit (RC.create as ended;
 *                                    startYear and endYear are equal,
 *                                    and endReason is stored at insert)
 *   startCommittedRelationship       one commit (RC.create)
 *   addCommittedAttribute            one commit (RC.addAttribute, which
 *                                    delegates to RC.update)
 *   removeCommittedAttribute         one commit (RC.removeAttribute, which
 *                                    delegates to RC.update)
 *   breakUp                          one commit (RC.end)
 *   deathEndsRelationship            one commit (RC.setWidowed)
 *   endAllRomanticForCharacter       N commits (one per ended
 *                                    relationship; the loop is not
 *                                    atomic across records — see
 *                                    header of that function)
 *
 *   One-night stands are inserted directly in their terminal state,
 *   so they cannot be stranded as active relationships by a failed
 *   follow-up write.
 *
 * RESULT ENVELOPE
 *
 *   Every command returns { success: true, ... } or
 *   { success: false, code, message }. On success, the envelope also
 *   carries warnings: [] (empty when nothing to warn about). Never
 *   throws for domain errors.
 *
 * Load order: after relationship-commands.js, romance-rules.js,
 * romance-queries.js. RankRules is optional; if loaded before this
 * module, rank policy reads route through it.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Underage romance is warn-and-proceed for ALL archetypes. The
 *       three startX functions no longer early-return _fail('UNDERAGE')
 *       when a participant is below the archetype's minimum age at
 *       startYear. They create the record and attach an UNDERAGE
 *       warning to the success envelope.
 *     - Age gap > AGE_GAP_WARN_YEARS (5) at startYear attaches an
 *       AGE_GAP_OVER_5_YEARS warning to the success envelope,
 *       independently of the underage warning. Both can fire.
 *     - _committedBlockedReason added: filters the underage reasons
 *       out of RomanceRules.classifyNewRelationship's 'blocked'
 *       classification so the committed path can warn-and-proceed
 *       instead of refusing. All other blocking reasons (same
 *       character, already committed, cultural rejection, invalid
 *       attributes) still refuse.
 *     - Result envelopes on success now include warnings: [].
 *       Callers that ignore it are unaffected; callers that read it
 *       see [] on the non-warning paths.
 *     - _isAgeGapOver5 added locally. Not exported, not on
 *       RomanceRules. See UNDERAGE AND AGE-GAP POLICY above for the
 *       rationale.
 *     - No other behavioural change. The affair pipeline, metadata
 *       builder, attribute gating, breakUp, deathEndsRelationship,
 *       endAllRomanticForCharacter, and the rank-policy fallback are
 *       unchanged.
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

    // Default affair type for affairs created via
    // startCommittedRelationship. The literal is used instead of
    // AffairRules.AFFAIR_TYPE.SECRET to avoid inverting the load order
    // (affair-rules.js loads after romance-commands.js because
    // AffairRules depends on RomanceRules). See the AFFAIR METADATA
    // section of the module header.
    var DEFAULT_AFFAIR_TYPE = 'secret';

    // Age gap at startYear beyond which a non-blocking warning is
    // attached to the success envelope. A UX threshold, not policy;
    // see UNDERAGE AND AGE-GAP POLICY in the module header.
    var AGE_GAP_WARN_YEARS = 5;

    // =========================================================================
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // =========================================================================

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

    /**
     * Current year.
     *
     * time.js exports getCurrentYear. The deprecated getCurrentYearSafe
     * alias is not present on every build, and requiring it here would
     * throw on builds that only ship getCurrentYear. This is the same
     * stale-name bug that relationship-finder-queries.js had.
     */
    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('romance-commands.js: getCurrentYear required');
        }
        return window.getCurrentYear();
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

    // =========================================================================
    // WARNINGS
    //
    // _collectWarnings builds the warnings array for a would-be creation.
    // It is called on every success path immediately before the envelope
    // is returned, and its output is warnings: [] on the no-warning path.
    //
    // Warning codes are stable strings. Callers should switch on code,
    // not on message text.
    // =========================================================================

    function _isAgeGapOver5(ageA, ageB) {
        if (typeof ageA !== 'number' || typeof ageB !== 'number') return false;
        if (isNaN(ageA) || isNaN(ageB)) return false;
        return Math.abs(ageA - ageB) > AGE_GAP_WARN_YEARS;
    }

    /**
     * facts: {
     *   archetype,            archetype id
     *   charA, charB,         live character records
     *   ageA, ageB,           ages at startYear (may be null)
     *   startYear
     * }
     *
     * Returns [] or an array of { code, message, ... }.
     */
    function _collectWarnings(facts) {
        var warnings = [];

        var minAge = RR.minimumAge(facts.archetype);
        if (typeof minAge === 'number') {
            if (!RR.isAgeValid(facts.archetype, facts.ageA)) {
                warnings.push({
                    code: 'UNDERAGE',
                    participant: 'A',
                    participantId: facts.charA ? facts.charA.id : null,
                    archetype: facts.archetype,
                    minimumAge: minAge,
                    actualAge: facts.ageA,
                    message: 'Participant A is below the recommended minimum age (' +
                        minAge + ') for this relationship type.'
                });
            }
            if (!RR.isAgeValid(facts.archetype, facts.ageB)) {
                warnings.push({
                    code: 'UNDERAGE',
                    participant: 'B',
                    participantId: facts.charB ? facts.charB.id : null,
                    archetype: facts.archetype,
                    minimumAge: minAge,
                    actualAge: facts.ageB,
                    message: 'Participant B is below the recommended minimum age (' +
                        minAge + ') for this relationship type.'
                });
            }
        }

        if (_isAgeGapOver5(facts.ageA, facts.ageB)) {
            warnings.push({
                code: 'AGE_GAP_OVER_5_YEARS',
                ageA: facts.ageA,
                ageB: facts.ageB,
                ageGap: Math.abs(facts.ageA - facts.ageB),
                threshold: AGE_GAP_WARN_YEARS,
                message: 'The age gap (' +
                    Math.abs(facts.ageA - facts.ageB) +
                    ' years) exceeds the recommended maximum (' +
                    AGE_GAP_WARN_YEARS + ').'
            });
        }

        return warnings;
    }

    // =========================================================================
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
    // =========================================================================

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

        // NOTE: reads character.traits, which is not currently part of
        // the canonical character schema. If/when traits are added to
        // the character record, this branch activates. Until then it is
        // inert. See the deferred traits work item.
        if (Array.isArray(character.traits) &&
            character.traits.indexOf('polygamous') !== -1) {
            facts.allowsMultipleByTrait = true;
        }

        return facts;
    }

    // =========================================================================
    // CULTURE RESOLUTION
    // =========================================================================

    function _resolveCultureId(character) {
        if (!character) return null;
        if (typeof character.cultureId === 'string' && character.cultureId.length > 0) {
            return character.cultureId;
        }
        return null;
    }

    // =========================================================================
    // RESULT HELPERS
    // =========================================================================

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    /**
     * Success envelope. Always includes warnings: [] (or the supplied
     * warnings array), so callers can read it unconditionally.
     */
    function _ok(data) {
        var out = Object.assign({ success: true }, data || {});
        if (!Array.isArray(out.warnings)) out.warnings = [];
        return out;
    }

    // =========================================================================
    // COMMITTED METADATA
    //
    // Builds the metadata object for a newly-created committed relationship.
    //
    // The affair-specific fields (affairType, discovered, etc.) are only
    // written when the relationship is classified as an affair, so that
    // non-affair committed relationships never carry affair metadata.
    //
    // This is the single place in the codebase that decides what metadata
    // a new affair carries at creation time. AffairCommands.createAffair
    // reuses this path by calling startCommittedRelationship and then
    // merging any caller-supplied overrides (affairType, publicBehavior)
    // in a second commit — see the COMMIT SEMANTICS section of
    // affair-commands.js.
    // =========================================================================

    function _buildCommittedMetadata(options, classification) {
        var metadata = {
            notes: typeof options.notes === 'string' ? options.notes : '',
            classification: classification.classification,
            classificationReason: classification.reason
        };

        if (classification.classification === 'affair') {
            metadata.affairType = DEFAULT_AFFAIR_TYPE;
            metadata.discovered = false;
            metadata.discoveryYear = null;
            metadata.discoveryCircumstances = null;
            metadata.discovererId = null;
            metadata.consequencesTriggered = false;
            metadata.consequences = [];
            metadata.publicBehavior = false;
        }

        return metadata;
    }

    // =========================================================================
    // COMMITTED BLOCKED-REASON FILTER
    //
    // RomanceRules.classifyNewRelationship returns 'blocked' for
    // underage committed relationships. Under the warn-and-proceed
    // policy, underage must NOT block. This helper takes the
    // classification and returns:
    //
    //   null                     if the classification is not blocked,
    //                            OR the only block reasons are
    //                            underage (i.e. we proceed with a
    //                            warning).
    //   <reason string>          if the block is for a non-underage
    //                            reason and we must refuse.
    //
    // The reason string is passed back to the caller's _fail so the
    // failure envelope carries the original RomanceRules reason.
    // =========================================================================

    function _committedBlockedReason(classification) {
        if (!classification || classification.classification !== 'blocked') {
            return null;
        }
        var reason = classification.reason || '';
        if (reason === 'participant_a_underage' ||
            reason === 'participant_b_underage') {
            return null; // underage is warn-only now
        }
        return reason || 'blocked';
    }

    // =========================================================================
    // INTERNAL: BASIC ROMANTIC CREATE
    // =========================================================================

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

    // =========================================================================
    // CASUAL DATING
    //
    // Underage and age-gap are warn-only. Both warnings (if any) are
    // attached to the success envelope.
    // =========================================================================

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
        var ageA = _ageAtYear(charA, startYear);
        var ageB = _ageAtYear(charB, startYear);

        if (RoQ.hasActiveRomanticBetween(idA, idB)) {
            return _fail('ALREADY_ROMANTIC', 'active romantic relationship already exists');
        }

        var warnings = _collectWarnings({
            archetype: CASUAL,
            charA: charA,
            charB: charB,
            ageA: ageA,
            ageB: ageB,
            startYear: startYear
        });

        var result = _createSimpleRomantic(CASUAL, idA, idB, startYear, options.notes);
        if (!result.success) return result;

        _logEvent('romance', 'Casual Dating',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' began casual dating in ' + startYear,
            [charA, charB]);

        result.warnings = warnings;
        return result;
    }

    // =========================================================================
    // ONE NIGHT STAND
    //
    // Underage and age-gap are warn-only. Both warnings (if any) are
    // attached to the success envelope. Two commits (create then end);
    // see COMMIT SEMANTICS in the header.
    // =========================================================================

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
        var ageA = _ageAtYear(charA, startYear);
        var ageB = _ageAtYear(charB, startYear);

        var warnings = _collectWarnings({
            archetype: ONE_NIGHT,
            charA: charA,
            charB: charB,
            ageA: ageA,
            ageB: ageB,
            startYear: startYear
        });

        // One-night stands are historical from creation. Store their
        // terminal status and end reason in the initial insert so the
        // record cannot be stranded as an active relationship if a second
        // commit fails.
        var createResult = RC.create({
            participantA: idA,
            participantB: idB,
            type: ONE_NIGHT,
            status: STATUS.ENDED,
            startYear: startYear,
            endYear: startYear,
            attributes: [],
            metadata: {
                notes: typeof options.notes === 'string' ? options.notes : '',
                endReason: 'one_night_stand'
            }
        });
        if (!createResult.success) return createResult;

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

        return _ok({
            relationship: oneNightProjection || createResult.relationship,
            warnings: warnings
        });
    }

    // =========================================================================
    // COMMITTED RELATIONSHIP
    //
    // Full pipeline: gather facts, classify, resolve attributes, validate
    // structurally and culturally, then write.
    //
    // When the classification is 'affair', _buildCommittedMetadata
    // writes the initial affair metadata fields, so AffairQueries sees
    // an explicit affairType regardless of which path created the affair.
    //
    // Underage is warn-only. _committedBlockedReason filters out the
    // underage reasons from classifyNewRelationship's 'blocked' result
    // so the committed path proceeds. All other blocks still refuse.
    //
    // One commit.
    // =========================================================================

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

        // Underage is warn-only. Any other 'blocked' reason still refuses.
        // See _committedBlockedReason and the UNDERAGE AND AGE-GAP POLICY
        // section of the module header.
        var blockedReason = _committedBlockedReason(classification);
        if (blockedReason !== null) {
            return _fail('BLOCKED', blockedReason);
        }

        var warnings = _collectWarnings({
            archetype: COMMITTED,
            charA: charA,
            charB: charB,
            ageA: aAge,
            ageB: bAge,
            startYear: startYear
        });

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
        // RomanceRules.validateAttributesForCulture is the sole
        // cultural-gating entry point; it consults CultureRules at call
        // time and fails loudly if CultureRules is missing.
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
            metadata: _buildCommittedMetadata(options, classification)
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
            reason: classification.reason,
            warnings: warnings
        });
    }

    // =========================================================================
    // ATTRIBUTE MANAGEMENT
    //
    // Adding or removing an attribute on a committed relationship.
    // Structural validation via RomanceRules; cultural gating via
    // RomanceRules.validateAttributesForCulture when the attribute is
    // cultural.
    //
    // One commit (delegates to RC.addAttribute / RC.removeAttribute,
    // both of which delegate to RC.update).
    // =========================================================================

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

    // =========================================================================
    // BREAKUP
    //
    // One commit (RC.end).
    // =========================================================================

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

    // =========================================================================
    // WIDOWING
    //
    // One commit (RC.setWidowed).
    // =========================================================================

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

    // =========================================================================
    // BULK: END ALL ROMANTIC RELATIONSHIPS FOR A CHARACTER
    //
    // Used by life-death integration when the relationship command
    // surface is being invoked from outside romance.
    //
    // COMMIT SEMANTICS: N commits, one per relationship ended (via
    // RC.end / RC.setWidowed). The loop is not atomic across records.
    // Documented in the same spirit as children-commands.js
    // recordPregnancyAttempts. A partial failure leaves some
    // relationships ended and others still active; callers that need
    // atomicity across all records must compose their own batch (which
    // is not currently exposed by the domain).
    // =========================================================================

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

    // =========================================================================
    // EXPORTS
    // =========================================================================

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
