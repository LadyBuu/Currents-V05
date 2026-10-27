/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP INTEGRATIONS (relationship-integrations.js)
 * =============================================================================
 *
 * LOCATION: js/social/relationship-integrations.js
 *
 * Cross-domain wiring owned by the relationship domain.
 *
 * The relationship domain is composed of many pieces; this file is the
 * single place where it exposes lifecycle hooks that other domains
 * call. It contains no policy of its own: every function delegates to
 * the appropriate domain command or query.
 *
 * DISPATCH MODEL
 *
 *   Two dispatch paths reach this module on death and hard-delete:
 *
 *     1. Direct dispatch from the character subsystem.
 *        CharacterLifecycle.killCharacter calls
 *        RelationshipIntegrations.handleCharacterDeath directly, if
 *        the module is present.
 *        CharacterDeletionCommands.deleteCharacter calls
 *        RelationshipIntegrations.removeAllReferencesTo directly, if
 *        the module is present.
 *
 *     2. Registration hook (Phase 3.13).
 *        This file calls window.registerDeathHandler and
 *        window.registerDeleteHandler at load time. The character
 *        subsystem's handlers invoke them on every death and every
 *        hard-delete, regardless of load order.
 *
 *   Path 1 is a no-op under the documented load order, because
 *   character-lifecycle.js and character-deletion-commands.js load
 *   before this file. Path 2 is the load-order-independent path.
 *
 *   The two paths are additive, not redundant. If the character
 *   subsystem ever changed its load order so that this file loads
 *   first, path 1 would fire and path 2 would too — the handlers are
 *   idempotent per character id (the command returns early if the
 *   relationship is already ended), so double-dispatch is safe.
 *
 *   The registration functions are exposed by the character subsystem
 *   (see character-lifecycle.js's registerDeathHandler and
 *   character-deletion-commands.js's registerDeleteHandler). If either
 *   is absent — for example, on a build where Phase 3.13 hasn't landed
 *   yet — this file skips the corresponding registration with a
 *   console warning. It does not throw.
 *
 * Owns:
 *   - death termination: end every active relationship for a deceased
 *     character, across romance, friendship, rivalry, and professional
 *   - hard-delete cleanup: remove every relationship record that
 *     references a deleted character
 *   - partnership projections available for cross-domain consumers
 *     (see PARTNERSHIP PROJECTIONS below)
 *   - annual affair discovery pass over the whole population, for
 *     callers that want a single entry point
 *   - annual lifecycle aggregate covering jealousy and affair discovery
 *   - registration of the death and delete handlers with the
 *     character subsystem (Phase 3.13)
 *
 * Does NOT own:
 *   - state access (goes through commands and queries)
 *   - policy
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness (the annual affair pass uses window.Random)
 *
 * APPRENTICESHIP CLEANUP (Phase 3.9 fix):
 *   Apprenticeship lifecycle — creation, progression, completion,
 *   termination — is owned by ApprenticeshipCommands, not
 *   ProfessionalCommands. ProfessionalCommands owns the professional
 *   EDGE primitive; it uses createEdge / endEdge internally, but does
 *   not expose createApprenticeship / endApprenticeship /
 *   progressApprenticeship / completeApprenticeship.
 *
 *   The prior revision of handleCharacterDeath called
 *   ProfessionalCommands.endApprenticeship, which does not exist. The
 *   first character death with an active apprenticeship threw
 *   TypeError inside handleCharacterDeath, which
 *   character-lifecycle.js swallowed. The result: the relationship
 *   domain never ended the apprenticeship, so the dead character kept
 *   holding one — a silent data-integrity problem.
 *
 *   This revision calls window.ApprenticeshipCommands.endApprenticeship
 *   when the module is loaded. If ApprenticeshipCommands is not loaded,
 *   the cleanup reports { success: false, code: 'APPRENTICESHIP_COMMANDS_UNAVAILABLE' }
 *   for that edge, which surfaces in the per-character report. It does
 *   not throw.
 *
 * PARTNERSHIP PROJECTIONS
 *
 *   getPartnershipProjection(characterId) and
 *   getAllPartnershipProjections() expose a character's current
 *   institutional partnership state without requiring the caller to
 *   reach into relationship attributes directly. The projection answers:
 *
 *       "What institutional markers does this character's current
 *        committed relationship carry, if any?"
 *
 *   It does NOT answer:
 *
 *       "Is this character married?"
 *
 *   Marriage is culture-dependent; a caller that needs legal weight
 *   must consult CultureRules in addition to the projection. The
 *   projection returns institution ids (e.g. 'married', 'handfasted'),
 *   not legal-status answers.
 *
 *   These functions are AVAILABLE FOR CONSUMPTION, not currently
 *   consumed by any module in the tree. The intended consumers are
 *   MortalityQueries (for widow status on death records) and
 *   CharacterQueries (for a partnership block in getCharacterSummary).
 *   Neither consumes the projection today because:
 *
 *     - character-queries.js loads before the relationship domain; a
 *       direct call from getCharacterSummary would invert the load
 *       order. Wiring it in requires either lazy dispatch through
 *       window.RelationshipIntegrations (weakens the fail-loud
 *       contract) or a new character-ui module that composes both
 *       domains after load. That is a design decision deferred to the
 *       UI layer.
 *
 *     - mortality-queries.js does not currently have a use case for
 *       the projection beyond what it already derives from the
 *       character record. Widow-state queries, if added, would
 *       consume it.
 *
 *   Until a consumer exists, the doc says "available for consumption"
 *   rather than "consumed by". If you wire a consumer in, update this
 *   section to name it.
 *
 * CONTRACT
 *
 *   Every hook returns { success: true, ... } or
 *   { success: false, code, message }. Never throws for domain errors.
 *   Missing subordinate modules are a load-time failure: this file
 *   requires everything it delegates to, except ApprenticeshipCommands
 *   (see APPRENTICESHIP CLEANUP).
 *
 * Load order: after every other relationships/*.js file. Before
 * relationships-bootstrap.js.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3.9 + Phase 3.13):
 *     - handleCharacterDeath's apprenticeship branch now calls
 *       window.ApprenticeshipCommands.endApprenticeship (where the
 *       method actually lives) instead of
 *       ProfessionalCommands.endApprenticeship (which does not exist
 *       and threw on every death with an active apprenticeship).
 *       When ApprenticeshipCommands is not loaded, the branch reports
 *       { code: 'APPRENTICESHIP_COMMANDS_UNAVAILABLE' } in the
 *       cleanup report.
 *     - handleCharacterDeath's death-cascade log now caches the
 *       character projection once instead of calling _getCharacter
 *       twice (once for the name, once for the subjects array).
 *     - Added Phase 3.13 registration hooks: at load time, this module
 *       registers a death handler with window.registerDeathHandler and
 *       a delete handler with window.registerDeleteHandler (both
 *       exposed by the character subsystem). Registration is a no-op
 *       when the register function is absent; a warning is printed.
 *     - Header DISPATCH MODEL section added, documenting the two
 *       dispatch paths (direct + hook) and why they coexist.
 *     - Header APPRENTICESHIP CLEANUP section added, documenting the
 *       ownership boundary that caused the prior crash.
 *     - No other behavioural change.
 * =============================================================================
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
        throw new Error(
            'relationship-integrations.js: all relationship domain ' +
            'modules must load first'
        );
    }

    var ROMANTIC_ARCHETYPES = {};
    ROMANTIC_ARCHETYPES[A.CASUAL_DATING]   = true;
    ROMANTIC_ARCHETYPES[A.ONE_NIGHT_STAND] = true;
    ROMANTIC_ARCHETYPES[A.COMMITTED]       = true;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('relationship-integrations.js: getCurrentYear required');
        }
        return window.getCurrentYear();
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

    // =========================================================================
    // 2. APPRENTICESHIP COMMANDS ACCESSOR
    // =========================================================================
    //
    // ApprenticeshipCommands is not a hard dependency of this module
    // (see APPRENTICESHIP CLEANUP in the header). It is loaded
    // conditionally by the character subsystem's bootstrap. When
    // present, the death cascade calls it to end the dead character's
    // apprenticeships. When absent, the cascade records a structured
    // failure for each apprenticeship edge instead of throwing.
    //
    // The accessor isolates the availability check so the death
    // cascade can express its intent once and the accessor decides
    // how to satisfy it.

    function _getApprenticeshipCommands() {
        if (window.ApprenticeshipCommands
            && typeof window.ApprenticeshipCommands.endApprenticeship === 'function') {
            return window.ApprenticeshipCommands;
        }
        return null;
    }

    // =========================================================================
    // 3. DEATH TERMINATION
    //
    // Called by CharacterLifecycle.killCharacter (via
    // CharacterLifecycle._notifyCrossDomainDeath, or via the death
    // handler registered at load time — see section 11). Ends every
    // active relationship the deceased character participates in,
    // across every archetype.
    //
    // ROMANCE
    //   Delegates the whole loop to RomanceCommands.endAllRomanticForCharacter
    //   with widowedInstead: true. That command ends every active
    //   romantic relationship the character participates in, using
    //   widowed for committed and ended for casual/one-night. The
    //   aggregate report is then reshaped from that command's
    //   { ended, failed, count, failedCount, mode } into this module's
    //   per-domain { widowed, ended, failed } shape.
    //
    // FRIENDSHIP / RIVALRY / PROFESSIONAL
    //   Each ends its active records individually. These domains do
    //   not expose a batch command for death, and their
    //   per-archetype end functions are already the natural unit of
    //   work.
    //
    // APPRENTICESHIP
    //   Routed through ApprenticeshipCommands.endApprenticeship (not
    //   ProfessionalCommands). See APPRENTICESHIP CLEANUP in the header.
    //
    // ONE COMMIT PER DOMAIN
    //   The whole operation is not atomic across domains because each
    //   domain command owns its own state. This matches the project's
    //   rule that a single logical mutation is one command, and
    //   life-death is a multi-domain event.
    //
    // options: { deathYear? }
    // =========================================================================

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
        //
        // Delegate the whole romantic-cascade to the domain command.
        // Reshape the result. The command distinguishes committed
        // (widowed) from non-committed (ended) internally; the split
        // is not exposed on its return value, so we re-derive it by
        // projecting each ended id's record type. That is a cheap
        // projection: getById on the relationship query.
        var romanceActive = RoQ.getActiveRomanticRelationships(characterId);
        if (romanceActive.length > 0) {
            var romanceBatch = RoC.endAllRomanticForCharacter(characterId, {
                endYear: deathYear,
                reason: 'death_of_participant',
                widowedInstead: true
            });

            if (!romanceBatch.success) {
                summary.romance.failed.push({
                    id: null,
                    code: romanceBatch.code || 'ROMANCE_BATCH_FAILED',
                    message: romanceBatch.message || 'unknown'
                });
            } else {
                // The batch command reports which relationship ids it
                // ended. Classify each one into the widowed vs ended
                // buckets by looking up its archetype (committed →
                // widowed, anything else → ended).
                for (var i = 0; i < romanceBatch.ended.length; i++) {
                    var relId = romanceBatch.ended[i];
                    var relRecord = window.RelationshipQueries.getById(relId);
                    if (relRecord && relRecord.type === A.COMMITTED) {
                        summary.romance.widowed.push(relId);
                    } else {
                        summary.romance.ended.push(relId);
                    }
                }
                for (var f = 0; f < romanceBatch.failed.length; f++) {
                    summary.romance.failed.push(romanceBatch.failed[f]);
                }
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
            else summary.friendship.failed.push({
                id: fr.relationshipId,
                code: fResult.code,
                message: fResult.message
            });
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
            else summary.rivalry.failed.push({
                id: rv.relationshipId,
                code: rvResult.code,
                message: rvResult.message
            });
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
            else summary.rivalry.failed.push({
                id: en.relationshipId,
                code: enResult.code,
                message: enResult.message
            });
        }

        // ---- PROFESSIONAL ----
        var apprenticeshipCommands = _getApprenticeshipCommands();
        var professional = PQ.getProfessionalRelationships(characterId);
        for (var n = 0; n < professional.length; n++) {
            var p = professional[n];
            var endResult;

            if (p.type === A.APPRENTICESHIP) {
                // Apprenticeship lifecycle lives on ApprenticeshipCommands,
                // not ProfessionalCommands. See APPRENTICESHIP CLEANUP in
                // the header for the ownership boundary.
                if (apprenticeshipCommands) {
                    endResult = apprenticeshipCommands.endApprenticeship(
                        p.participantA,
                        p.participantB,
                        {
                            endYear: deathYear,
                            reason: 'death_of_participant'
                        }
                    );
                } else {
                    endResult = {
                        success: false,
                        code: 'APPRENTICESHIP_COMMANDS_UNAVAILABLE',
                        message: 'ApprenticeshipCommands.endApprenticeship required to end apprenticeships on death'
                    };
                }
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
                endResult = {
                    success: false,
                    code: 'UNSUPPORTED_TYPE',
                    message: 'unsupported professional type'
                };
            }
            if (endResult.success) summary.professional.ended.push(p.relationshipId);
            else summary.professional.failed.push({
                id: p.relationshipId,
                code: endResult.code,
                message: endResult.message
            });
        }

        var totalEnded =
            summary.romance.widowed.length +
            summary.romance.ended.length +
            summary.friendship.ended.length +
            summary.rivalry.ended.length +
            summary.professional.ended.length;

        if (totalEnded > 0) {
            // Phase 3.9: cache the character projection once. The prior
            // revision called _getCharacter twice (once for the name,
            // once for the subjects array). Each call returns a
            // defensive projection from CharacterState._project, which
            // is a deep clone of the character record. One call is
            // enough.
            var deceasedChar = _getCharacter(characterId);
            _logEvent('relationship', 'Death Cascade',
                totalEnded + ' relationship(s) ended by death of ' +
                (deceasedChar && deceasedChar.name ? deceasedChar.name : characterId),
                [deceasedChar]);
        }

        return _ok(summary);
    }

    // =========================================================================
    // 4. HARD-DELETE CLEANUP
    //
    // Called by CharacterDeletionCommands.deleteCharacter and by
    // CharacterDeletionCommands.purgeSoftDeletedCharacters, either
    // directly or through the delete handler registered at load time
    // (see section 11). Removes every relationship record referencing
    // the character. This is a hard remove, not an end; the record
    // ceases to exist.
    //
    // One State batch, one markDataDirty, one subscriber notification.
    // =========================================================================

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

    // =========================================================================
    // 5. PARTNERSHIP PROJECTIONS
    //
    // See PARTNERSHIP PROJECTIONS in the module header for the current
    // consumption status and the load-order constraint that prevents
    // CharacterQueries from consuming this projection directly.
    // =========================================================================

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

    // =========================================================================
    // 6. ANNUAL AFFAIR DISCOVERY PASS
    // =========================================================================

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

    // =========================================================================
    // 7. ANNUAL LIFECYCLE AGGREGATE
    // =========================================================================

    function processAnnualLifecycle(options) {
        options = options || {};

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var rollFn = (typeof options.rollProvider === 'function')
            ? options.rollProvider
            : _roll;

        // Jealousy
        var jealousy = {
            confrontations: [],
            skipped: [],
            confrontationCount: 0,
            skippedCount: 0
        };
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
            affairs: affairs.success
                ? affairs
                : {
                    discoveries: [],
                    attempts: [],
                    discoveryCount: 0,
                    attemptCount: 0
                }
        });
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RelationshipIntegrations = {
        handleCharacterDeath: handleCharacterDeath,
        removeAllReferencesTo: removeAllReferencesTo,

        getPartnershipProjection: getPartnershipProjection,
        getAllPartnershipProjections: getAllPartnershipProjections,

        processAnnualAffairDiscovery: processAnnualAffairDiscovery,
        processAnnualLifecycle: processAnnualLifecycle
    };

    // =========================================================================
    // 9. REGISTRATION HOOKS (Phase 3.13)
    // =========================================================================
    //
    // The character subsystem loads before this file. Its direct
    // dispatch to RelationshipIntegrations.handleCharacterDeath (in
    // character-lifecycle.js) and to
    // RelationshipIntegrations.removeAllReferencesTo (in
    // character-deletion-commands.js) is therefore a no-op under the
    // documented load order: the module isn't loaded yet when the
    // caller tries to reach it.
    //
    // Phase 3.13 adds registerDeathHandler and registerDeleteHandler
    // to the character subsystem. Calling them here, at load time,
    // installs the hooks that make the dispatch reach this module on
    // every death and every hard-delete, regardless of load order.
    //
    // Registration is a no-op when the register function is absent.
    // The character subsystem's direct dispatch remains in place, so
    // a deployment that hasn't yet applied Phase 3.13 still functions
    // for the domains that load first, just not for this one.

    if (typeof window.registerDeathHandler === 'function') {
        try {
            window.registerDeathHandler(function (characterId, options) {
                return handleCharacterDeath(characterId, options);
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'relationship-integrations.js: registerDeathHandler threw', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'relationship-integrations.js: registerDeathHandler is not ' +
                'available; the death cascade will not reach this module ' +
                'under the documented load order. Apply Phase 3.13 to ' +
                'character-lifecycle.js to enable it.'
            );
        }
    }

    if (typeof window.registerDeleteHandler === 'function') {
        try {
            window.registerDeleteHandler(function (characterId) {
                return removeAllReferencesTo(characterId);
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'relationship-integrations.js: registerDeleteHandler threw', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'relationship-integrations.js: registerDeleteHandler is not ' +
                'available; the hard-delete cleanup will not reach this module ' +
                'under the documented load order. Apply Phase 3.13 to ' +
                'character-deletion-commands.js to enable it.'
            );
        }
    }

    // =========================================================================
    // 10. DISPATCH MODEL
    //
    // Two dispatch paths reach this module (see DISPATCH MODEL in the
    // header):
    //
    //   1. Direct dispatch from character-lifecycle.js and
    //      character-deletion-commands.js. A no-op under the documented
    //      load order.
    //
    //   2. Registration hooks installed above. The character subsystem
    //      invokes them on every death and every hard-delete.
    //
    // The two paths are additive. Double-dispatch is safe because the
    // command layer is idempotent per relationship id (end() refuses
    // non-ongoing records; remove() refuses missing ids).
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RelationshipIntegrations;
    }

})();
