/**
 * relationship-integrations.js
 *
 * Cross-domain wiring owned by the relationship domain.
 *
 * The relationship domain is composed of many pieces; this file is the
 * single place where it exposes lifecycle hooks that other domains
 * call. It contains no policy of its own: every function delegates to
 * the appropriate domain command or query.
 *
 * DISPATCH MODEL:
 *   The character subsystem dispatches directly. It does NOT route
 *   through a listener registry.
 *
 *     CharacterLifecycle.killCharacter
 *         -> RelationshipIntegrations.handleCharacterDeath
 *
 *     CharacterDeletionCommands.deleteCharacter
 *         -> RelationshipIntegrations.removeAllReferencesTo
 *
 *   Both call sites live in the character subsystem. This module is a
 *   plain library: it exposes the functions, the caller invokes them.
 *   There is no registerLifecycleHook mechanism.
 *
 * Owns:
 *   - death termination: end every active relationship for a deceased
 *     character, across romance, friendship, rivalry, and professional
 *   - hard-delete cleanup: remove every relationship record that
 *     references a deleted character
 *   - marriage / institutional projections consumed by MortalityQueries
 *     and CharacterQueries (so that non-romance domains do not reach
 *     into relationship attributes directly)
 *   - annual affair discovery pass over the whole population, for
 *     callers that want a single entry point
 *
 * Does NOT own:
 *   - state access (goes through commands and queries)
 *   - policy
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness (the annual affair pass uses window.Random)
 *
 * CONTRACT
 *   Every hook returns { success: true, ... } or
 *   { success: false, code, message }. Never throws for domain errors.
 *   Missing subordinate modules are a load-time failure: this file
 *   requires everything it delegates to.
 *
 * Load order: after every other relationships/*.js file. Before
 * relationships-bootstrap.js.
 */

(function() {
    'use strict';

    var RC   = window.RelationshipCommands;
    var RoC  = window.RomanceCommands;
    var RoQ  = window.RomanceQueries;
    var FrC  = window.FriendshipCommands;
    var FQ   = window.FriendshipQueries;
    var RvC  = window.RivalryCommands;
    var RvQ  = window.RivalryQueries;
    var PrC  = window.ProfessionalCommands;
    var PQ   = window.ProfessionalQueries;
    var AQ   = window.AffairQueries;
    var AC   = window.AffairCommands;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RoC || !RoQ || !FrC || !FQ || !RvC || !RvQ ||
        !PrC || !PQ || !AQ || !AC || !A || !STATUS) {
        throw new Error('relationship-integrations.js: all relationship domain modules must load first');
    }

    var ROMANTIC_ARCHETYPES = {};
    ROMANTIC_ARCHETYPES[A.CASUAL_DATING]   = true;
    ROMANTIC_ARCHETYPES[A.ONE_NIGHT_STAND] = true;
    ROMANTIC_ARCHETYPES[A.COMMITTED]       = true;

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS
    // -------------------------------------------------------------------------

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('relationship-integrations.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('relationship-integrations.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('relationship-integrations.js: getCharacters required');
        }
        return window.getCharacters();
    }

    function _roll() {
        if (window.Random && typeof window.Random.next === 'function') {
            return window.Random.next();
        }
        if (typeof window.randomNext === 'function') {
            return window.randomNext();
        }
        throw new Error('relationship-integrations.js: Random.next or randomNext required');
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // -------------------------------------------------------------------------
    // DEATH TERMINATION
    //
    // Called by CharacterLifecycle.killCharacter (via
    // CharacterLifecycle._notifyCrossDomainDeath). Ends every active
    // relationship the deceased character participates in, across every
    // archetype.
    //
    // Romance: widowed if the relationship is committed; ended otherwise.
    // Friendship, rivalry, enmity, professional: ended with reason
    // 'death_of_participant'.
    //
    // One commit per domain; the whole operation is not atomic across
    // domains because the domain commands each own their own state.
    // This matches the project's rule that a single logical mutation is
    // one command, and life-death is a multi-domain event.
    //
    // options: { deathYear? }
    // -------------------------------------------------------------------------

    function handleCharacterDeath(characterId, options) {
        options = options || {};

        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }

        var deathYear = options.deathYear !== undefined
            ? options.deathYear
            : _getCurrentYear();

        var summary = {
            characterId: characterId,
            deathYear: deathYear,
            romance: { widowed: [], ended: [], failed: [] },
            friendship: { ended: [], failed: [] },
            rivalry: { ended: [], failed: [] },
            professional: { ended: [], failed: [] }
        };

        // ---- ROMANCE ----
        var romantic = RoQ.getActiveRomanticRelationships(characterId);
        for (var i = 0; i < romantic.length; i++) {
            var r = romantic[i];
            var result;
            if (r.isCommitted) {
                result = RoC.deathEndsRelationship(r.relationshipId, {
                    deathYear: deathYear
                });
                if (result.success) summary.romance.widowed.push(r.relationshipId);
                else summary.romance.failed.push({ id: r.relationshipId, code: result.code, message: result.message });
            } else {
                result = RoC.breakUp(r.relationshipId, {
                    endYear: deathYear,
                    reason: 'death_of_participant'
                });
                if (result.success) summary.romance.ended.push(r.relationshipId);
                else summary.romance.failed.push({ id: r.relationshipId, code: result.code, message: result.message });
            }
        }

        // ---- FRIENDSHIP ----
        var friends = FQ.getFriendshipsForCharacter(characterId);
        for (var j = 0; j < friends.length; j++) {
            var fr = friends[j];
            var otherId = fr.friendId;
            if (!otherId) continue;
            var fResult = FrC.removeFriendship(characterId, otherId, {
                endYear: deathYear,
                reason: 'death_of_participant'
            });
            if (fResult.success) summary.friendship.ended.push(fr.relationshipId);
            else summary.friendship.failed.push({ id: fr.relationshipId, code: fResult.code, message: fResult.message });
        }

        // ---- RIVALRY / ENMITY ----
        var rivals = RvQ.getRivalries(characterId);
        for (var k = 0; k < rivals.length; k++) {
            var rv = rivals[k];
            if (!rv.otherId) continue;
            var rvResult = RvC.endRivalry(characterId, rv.otherId, {
                endYear: deathYear,
                reason: 'death_of_participant'
            });
            if (rvResult.success) summary.rivalry.ended.push(rv.relationshipId);
            else summary.rivalry.failed.push({ id: rv.relationshipId, code: rvResult.code, message: rvResult.message });
        }

        var enemies = RvQ.getEnmities(characterId);
        for (var m = 0; m < enemies.length; m++) {
            var en = enemies[m];
            if (!en.otherId) continue;
            var enResult = RvC.endEnmity(characterId, en.otherId, {
                endYear: deathYear,
                reason: 'death_of_participant'
            });
            if (enResult.success) summary.rivalry.ended.push(en.relationshipId);
            else summary.rivalry.failed.push({ id: en.relationshipId, code: enResult.code, message: enResult.message });
        }

        // ---- PROFESSIONAL ----
        var professional = PQ.getProfessionalRelationships(characterId);
        for (var n = 0; n < professional.length; n++) {
            var p = professional[n];
            var endResult;
            if (p.type === A.APPRENTICESHIP) {
                endResult = PrC.endApprenticeship(p.participantA, p.participantB, {
                    endYear: deathYear,
                    reason: 'death_of_participant'
                });
            } else if (p.type === A.MASTERSHIP) {
                endResult = PrC.endMastership(p.participantA, p.participantB, {
                    endYear: deathYear,
                    reason: 'death_of_participant'
                });
            } else if (p.type === A.EMPLOYMENT) {
                endResult = PrC.endEmployment(p.participantA, p.participantB, {
                    endYear: deathYear,
                    reason: 'death_of_participant'
                });
            } else if (p.type === A.GUILD_MEMBERSHIP) {
                endResult = PrC.removeGuildMembership(p.participantA, p.participantB, {
                    endYear: deathYear,
                    reason: 'death_of_participant'
                });
            } else {
                endResult = { success: false, code: 'UNSUPPORTED_TYPE', message: 'unsupported professional type' };
            }
            if (endResult.success) summary.professional.ended.push(p.relationshipId);
            else summary.professional.failed.push({ id: p.relationshipId, code: endResult.code, message: endResult.message });
        }

        var totalEnded =
            summary.romance.widowed.length +
            summary.romance.ended.length +
            summary.friendship.ended.length +
            summary.rivalry.ended.length +
            summary.professional.ended.length;

        if (totalEnded > 0) {
            _logEvent('relationship', 'Death Cascade',
                totalEnded + ' relationship(s) ended by death of ' +
                (function() {
                    var c = _getCharacter(characterId);
                    return c && c.name ? c.name : characterId;
                })(),
                [_getCharacter(characterId)]);
        }

        return _ok(summary);
    }

    // -------------------------------------------------------------------------
    // HARD-DELETE CLEANUP
    //
    // Called by CharacterDeletionCommands.deleteCharacter and by
    // CharacterDeletionCommands.purgeSoftDeletedCharacters. Removes
    // every relationship record referencing the character. This is a
    // hard remove, not an end; the record ceases to exist.
    //
    // One State batch, one markDataDirty, one subscriber notification.
    // -------------------------------------------------------------------------

    function removeAllReferencesTo(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) {
            return _fail('MISSING_ID', 'characterId required');
        }
        var result = RC.removeAllReferencesTo(characterId);
        if (!result.success) return result;
        return _ok({
            removed: result.removed,
            count: result.count
        });
    }

    // -------------------------------------------------------------------------
    // MARRIAGE PROJECTIONS
    //
    // Consumed by MortalityQueries, CharacterQueries, and any other
    // domain that needs a character's institutional partnership state
    // without reaching into relationship attributes directly.
    //
    // The relationship domain answers:
    //   "What institutional markers does this character's current
    //    committed relationship carry, if any?"
    //
    // It does NOT answer:
    //   "Is this character married?" — that is culture-dependent and
    //   the caller must consult CultureRules if the answer needs legal
    //   weight.
    // -------------------------------------------------------------------------

    function getPartnershipProjection(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) {
            return {
                characterId: null,
                primaryInstitution: null,
                institutions: [],
                committedPartnerIds: [],
                hasActiveAffair: false
            };
        }

        var committed = RoQ.getActiveCommittedPartners(characterId);
        var institutions = [];
        var partnerIds = [];

        for (var i = 0; i < committed.length; i++) {
            if (committed[i].institution) {
                institutions.push(committed[i].institution);
            }
            if (committed[i].partnerId) {
                partnerIds.push(committed[i].partnerId);
            }
        }

        var primary = RoQ.getPrimaryInstitution(characterId);

        return {
            characterId: characterId,
            primaryInstitution: primary,
            institutions: institutions,
            committedPartnerIds: partnerIds,
            hasActiveAffair: AQ.isHavingAffair(characterId)
        };
    }

    /**
     * Bulk variant for every character. Used by mortality statistics
     * and any aggregate that needs the whole population.
     */
    function getAllPartnershipProjections() {
        var all = _getCharacters();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (!all[i] || !all[i].id) continue;
            out.push(getPartnershipProjection(all[i].id));
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // ANNUAL AFFAIR DISCOVERY PASS
    //
    // Rolls discovery for every active affair in the population. Called
    // by the annual tick, if one exists, or by any caller that wants a
    // single entry point.
    //
    // options: {
    //   year?: number,
    //   rollProvider?: () => number,
    //   maxDiscoveries?: number
    // }
    // -------------------------------------------------------------------------

    function processAnnualAffairDiscovery(options) {
        options = options || {};

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var rollFn = (typeof options.rollProvider === 'function')
            ? options.rollProvider
            : _roll;
        var maxDiscoveries = (typeof options.maxDiscoveries === 'number')
            ? options.maxDiscoveries
            : 50;

        var all = _getCharacters();
        var discoveries = [];
        var attempts = [];

        for (var i = 0; i < all.length; i++) {
            var char = all[i];
            if (!char || char.isDeceased || !char.id) continue;

            var affairs = AQ.getActiveAffairs(char.id);
            for (var j = 0; j < affairs.length; j++) {
                var affair = affairs[j];
                if (affair.discovered) continue;

                var roll = rollFn();
                var result = AC.rollDiscovery(affair.relationshipId, {
                    roll: roll,
                    year: year
                });

                if (result.success && result.discovered) {
                    discoveries.push(result);
                } else if (result.success) {
                    attempts.push({
                        relationshipId: affair.relationshipId,
                        roll: roll,
                        chance: result.chance
                    });
                }

                if (discoveries.length >= maxDiscoveries) break;
            }
            if (discoveries.length >= maxDiscoveries) break;
        }

        if (discoveries.length > 0) {
            _logEvent('affair', 'Annual Discovery',
                discoveries.length + ' affair(s) discovered in ' + year,
                []);
        }

        return _ok({
            year: year,
            discoveries: discoveries,
            attempts: attempts,
            discoveryCount: discoveries.length,
            attemptCount: attempts.length
        });
    }

    // -------------------------------------------------------------------------
    // ANNUAL LIFECYCLE AGGREGATE
    //
    // One call for the annual tick that covers relationship-driven
    // annual processing: jealousy confrontations and affair discovery.
    // Designed so the caller does not need to know which submodules to
    // invoke individually.
    //
    // options: {
    //   year?: number,
    //   rollProvider?: () => number,
    //   maxConfrontations?: number,
    //   maxDiscoveries?: number
    // }
    // -------------------------------------------------------------------------

    function processAnnualLifecycle(options) {
        options = options || {};

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var rollFn = (typeof options.rollProvider === 'function')
            ? options.rollProvider
            : _roll;

        // Jealousy
        var jealousy = { confrontations: [], skipped: [], confrontationCount: 0, skippedCount: 0 };
        if (window.JealousyCommands &&
            typeof window.JealousyCommands.processAnnualJealousy === 'function') {
            var j = window.JealousyCommands.processAnnualJealousy({
                year: year,
                rollProvider: rollFn,
                maxConfrontations: options.maxConfrontations
            });
            if (j && j.success) {
                jealousy = {
                    confrontations: j.confrontations || [],
                    skipped: j.skipped || [],
                    confrontationCount: j.confrontationCount || 0,
                    skippedCount: j.skippedCount || 0
                };
            }
        }

        // Affairs
        var affairs = processAnnualAffairDiscovery({
            year: year,
            rollProvider: rollFn,
            maxDiscoveries: options.maxDiscoveries
        });

        return _ok({
            year: year,
            jealousy: jealousy,
            affairs: affairs.success ? affairs : { discoveries: [], attempts: [], discoveryCount: 0, attemptCount: 0 }
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipIntegrations = {
        handleCharacterDeath: handleCharacterDeath,
        removeAllReferencesTo: removeAllReferencesTo,

        getPartnershipProjection: getPartnershipProjection,
        getAllPartnershipProjections: getAllPartnershipProjections,

        processAnnualAffairDiscovery: processAnnualAffairDiscovery,
        processAnnualLifecycle: processAnnualLifecycle
    };

    // -------------------------------------------------------------------------
    // DISPATCH MODEL
    //
    // This module does not register itself anywhere. The character
    // subsystem calls the two lifecycle functions directly:
    //
    //   CharacterLifecycle.killCharacter
    //       -> RelationshipIntegrations.handleCharacterDeath(characterId, { deathYear })
    //
    //   CharacterDeletionCommands.deleteCharacter
    //       -> RelationshipIntegrations.removeAllReferencesTo(characterId)
    //
    // There is no listener registry. Adding a new cross-domain
    // consequence means editing the character subsystem's dispatch
    // table, which is exactly where the knowledge of "what happens when
    // a character dies" belongs.
    // -------------------------------------------------------------------------

})();
