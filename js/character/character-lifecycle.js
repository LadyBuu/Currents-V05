/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE (js/character/character-lifecycle.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-lifecycle.js
 *
 * Time progression, mortality orchestration, age classification, and
 * lifespan estimation for the character domain.
 *
 * SCOPE:
 *   - Advance mortality evaluation by N years
 *   - Evaluate mortality per year per character
 *   - Choose a death cause (from a caller-supplied selector, or the
 *     MortalityRules catalogue)
 *   - Build a canonical death transition
 *   - Delegate the mutation to CharacterCommands.markDeceased
 *   - Dispatch cross-domain consequences:
 *       - family consequences via FamilyCommands.handleCharacterDeath
 *       - relationship consequences via
 *         RelationshipIntegrations.handleCharacterDeath
 *       - rank consequences via RankIssues.handleCharacterDeath
 *       - location leader-term cleanup via LocationCommands.handleCharacterDeath
 *         (registered by location-commands.js via registerDeathHandler)
 *       - any other registered death handler (see DEATH HANDLER HOOK)
 *   - Orchestrate the settlement annual processing step (see
 *     SETTLEMENT ANNUAL PROCESSING below)
 *   - Life stage classification
 *   - Age group classification
 *   - Elderly check
 *   - Group characters by age band
 *   - Death wrappers (natural, accidental, random-cause)
 *   - Lifespan estimation (deterministic)
 *
 * OUT OF SCOPE:
 *   - Mortality policy                 -> mortality-rules.js
 *   - Canonical character mutation     -> character-commands.js
 *   - Death reads                      -> mortality-queries.js
 *   - Aggregate statistics             -> mortality-statistics.js
 *   - Childbirth orchestration         -> children-commands.js
 *   - Succession / inheritance         -> future succession domain
 *   - Relationship termination logic   -> relationship-integrations.js
 *   - Rank deprecation logic           -> rank-issues.js
 *   - Location leader-term cleanup     -> location-commands.js
 *                                         (LocationCommands.handleCharacterDeath,
 *                                          registered via registerDeathHandler)
 *   - Settlement financial effects     -> settlement-annual-processor.js
 *   - CURRENT YEAR OWNERSHIP           -> time.js (getCurrentYear)
 *   - CLOCK ADVANCEMENT                -> the caller (see CLOCK below)
 *
 * CLOCK CONTRACT
 * --------------
 *   This module does NOT advance the simulation clock. It evaluates
 *   mortality against explicit years. Two functions take an explicit
 *   "now" year:
 *
 *     advanceMortality(yearsAdvanced, options)
 *       options.startYear   required when deterministic simulation is
 *                           desired; defaults to getCurrentYear() for
 *                           convenience.
 *       result.finalYear    the last simulated year.
 *
 *     killCharacter(characterId, deathData)
 *       deathData.deathYear used as both the death year AND the reference
 *                           year for validation. Falls back to
 *                           getCurrentYear() when omitted.
 *
 *   After advanceMortality returns, if the caller wants the clock to
 *   reflect the passage of time, the caller sets
 *   masterData.data.currentYear = result.finalYear and persists. This
 *   module deliberately does not touch masterData.data.currentYear —
 *   time progression is the caller's concern (a UI "Advance Time"
 *   button, a simulation driver, or a bootstrap).
 *
 * SETTLEMENT ANNUAL PROCESSING
 * ----------------------------
 *   advanceMortality ALSO advances the settlement domain's annual
 *   financial effects, once per simulated year. The step is:
 *
 *     window.SettlementAnnualProcessor.processAllSettlementsAnnual({
 *         year: year
 *     })
 *
 *   It runs INSIDE the existing per-year loop, after the character
 *   mortality pass for that year. The year passed to the settlement
 *   processor is the SAME year used for character mortality — the loop
 *   is the clock, and both subsystems see the same year.
 *
 *   Settlement failures do NOT abort the character-mortality loop.
 *   Each settlement is its own transaction (see
 *   settlement-annual-processor.js's PER-SETTLEMENT FAILURE ISOLATION).
 *   A failure on one settlement is collected into
 *   result.settlementFailures, logged with console.warn, and the loop
 *   proceeds to the next year and the next character.
 *
 *   The settlement step is OPTIONAL. When SettlementAnnualProcessor is
 *   not loaded, the step is silently skipped. This preserves the
 *   character domain's ability to run in a reduced harness where the
 *   settlement domain is absent. A missing settlement module is a
 *   legitimate configuration, not a load-order bug; the character
 *   domain does not own the settlement domain.
 *
 *   The step is AREA-GUARDED as well: if the processor exists but its
 *   internal query layer throws (e.g. masterData.data.settlementData
 *   was corrupted mid-run), the exception is caught, logged, and
 *   recorded as a single settlement failure covering all settlements —
 *   without aborting the character loop. A settlement-domain explosion
 *   is not a reason to stop killing characters.
 *
 * RANDOMNESS
 * ----------
 *   Every random draw routes through window.random from randomness.js.
 *   randomness.js is a HARD load-time dependency: character-lifecycle.js
 *   throws at load if window.random is not a function.
 *
 *   options.random is an OVERRIDE, not a substitute. Callers that need
 *   deterministic replay (tests, scripted runs) pass options.random to
 *   the specific call; the rest of the module continues to use
 *   window.random. The override exists so that a single call can be
 *   made deterministic without reseeding the global stream. It does
 *   NOT let the module load without randomness.js.
 *
 *   Math.random is never called directly.
 *
 * CROSS-DOMAIN DEATH DISPATCH:
 *   After CharacterCommands.markDeceased succeeds, required cleanup
 *   handlers are invoked and their results are inspected:
 *
 *     1. FamilyCommands.handleCharacterDeath (named dispatch)
 *     2. RankIssues.handleCharacterDeath (named dispatch)
 *     3. Registered handlers, including RelationshipIntegrations and
 *        LocationCommands.
 *
 *   RelationshipIntegrations is intentionally NOT in the named list:
 *   it registers through registerDeathHandler. This prevents the prior
 *   double invocation when both the namespace and registration were
 *   available at dispatch time.
 *
 *   Every handler must return an object with success:true. Missing,
 *   malformed, unsuccessful, or throwing results are collected. The
 *   remaining handlers still run so the caller receives a complete
 *   failure report rather than an arbitrary first failure.
 *
 *   IMPORTANT LIMITATION:
 *   This dispatch is not yet atomic across domains. The character's
 *   deceased flag and any successful domain cleanup may already be
 *   committed when another handler fails. In that case _die and
 *   killCharacter return DEATH_CASCADE_PARTIAL_FAILURE with
 *   deathRecorded:true and per-handler details. They do not claim the
 *   death was rolled back. A later transaction phase must add snapshots
 *   and rollback support for every participating domain before this
 *   workflow can be described as atomic.
 *
 *   The dispatch is centralised in _dispatchDeathEffects, shared by
 *   _die (simulation path) and killCharacter (command path).
 *
 *   LEADER-TERM CLEANUP:
 *     Location leader assignments are stored on place records. A dead
 *     active leader must have those assignments ended. LocationCommands
 *     registers through registerDeathHandler and its registration
 *     wrapper returns the actual command result so failures propagate.
 *
 * DEATH HANDLER HOOK:
 *   Any module loaded after character-lifecycle.js may register a
 *   handler. Each registered handler runs once for every death.
 *
 *   Handler contract:
 *     fn(characterId, { deathYear }) -> { success: true, ... }
 *   A handler that returns nothing is a failure, not an implicit
 *   success. Exceptions are captured and reported; they do not prevent
 *   subsequent handlers from running.
 *
 *   Registration returns an unregister function for tests and hot
 *   reload. Normal browser sessions retain handlers for page lifetime.
 *
 * PER-CHARACTER DEATH FAILURES (advanceMortality):
 *   When a death evaluation produces a result, the mutation is
 *   delegated to CharacterCommands.markDeceased. That call can fail
 *   for per-character reasons (invalid year, already-deceased race,
 *   invalid cause id) that are NOT load-order bugs and do NOT indicate
 *   that the simulation should stop.
 *
 *   advanceMortality therefore catches per-character death failures,
 *   records them in result.skipped, and CONTINUES evaluating the
 *   remaining characters and years. This is a change from the previous
 *   behaviour, which threw and aborted the entire multi-year loop on
 *   the first such failure.
 *
 *   The throw contract is preserved for the failure modes that ARE
 *   load-order bugs: missing CharacterLifecycle dependency, missing
 *   randomness.js, and — via the dependency guards — anything else the
 *   module cannot proceed without. Only per-character death validation
 *   failures are absorbed into the result.
 *
 *   killCharacter retains the throw-through contract: it is a single
 *   explicit death command, and a caller asking it to kill one
 *   character wants to know if that character could not be killed.
 *   advanceMortality is a simulation driver, and a single bad character
 *   should not stop the simulation.
 *
 * AGE CLASSIFICATION:
 *   LIFE_STAGES comes from constants/age-constants.js. It maps stage
 *   keys to { min, max, name, group }. AGE_GROUPS is an ordered array
 *   of band keys such as '0-10', '11-20', ..., '91+'. Both are read
 *   from global scope at call time; if either is missing, the
 *   corresponding helper returns null rather than fabricating.
 *
 * LIFESPAN ESTIMATION:
 *   predictLifespan computes a deterministic estimate from the
 *   character's identity hash and rank priority. It does not use
 *   MortalityRules bands, because the bands describe annual risk and
 *   the estimate is a policy-light heuristic. If you want a
 *   mortality-model-driven estimate, iterate simulateRemainingYears.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - character-state.js:        CharacterState
 *   - character-commands.js:     CharacterCommands (markDeceased)
 *   - mortality-rules.js:        MortalityRules
 *   - time.js:                   getCurrentYear, isValidYear
 *   - randomness.js:             random
 *
 * DEPENDENCIES (OPTIONAL, called only if loaded):
 *   - family-commands.js:              FamilyCommands.handleCharacterDeath
 *   - relationships/relationship-integrations.js:
 *                                       RelationshipIntegrations.handleCharacterDeath
 *   - ranks/rank-issues.js:            RankIssues.handleCharacterDeath
 *   - location/location-commands.js:   LocationCommands.handleCharacterDeath
 *                                      (registered via registerDeathHandler)
 *   - event-log.js:                    logEvent
 *   - settlement-annual-processor.js:  processAllSettlementsAnnual
 *                                      (see SETTLEMENT ANNUAL PROCESSING)
 *
 * FLAT-GLOBAL ALIASES:
 *   This module's public functions are exposed on the
 *   window.CharacterLifecycle namespace AND as flat globals
 *   (window.killCharacter, window.killCharacterRandomCause,
 *   window.triggerNaturalDeath, window.triggerAccidentalDeath,
 *   window.advanceMortality). The flat globals exist because several
 *   consumers read them directly at load time:
 *
 *     - crime-commands.js:189     window.killCharacter
 *     - crime-bootstrap.js        window.killCharacter
 *
 *   The namespace form remains authoritative; the flat globals are
 *   one-way compatibility aliases. Callers that need the namespace
 *   (registerDeathHandler, age classification, lifespan estimation)
 *   continue to use window.CharacterLifecycle.*.
 *
 *   Note: createRelationship is NOT exported here. It belongs to the
 *   relationship domain (RelationshipCommands.createRelationship);
 *   household-servant.js reads it from that namespace.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Flat-global aliases added (window.killCharacter,
 *       window.killCharacterRandomCause, window.triggerNaturalDeath,
 *       window.triggerAccidentalDeath, window.advanceMortality) so
 *       load-time consumers that read those names directly — notably
 *       crime-commands.js:189 and crime-bootstrap.js — resolve.
 *       Prior revisions exposed only the CharacterLifecycle namespace,
 *       which crime-commands.js does not consult. See FLAT-GLOBAL
 *       ALIASES in the header.
 *     - No other behavioural change. The namespace export is
 *       unchanged; the aliases are additive.
 *   Previous revision:
 *     - Header CROSS-DOMAIN DEATH DISPATCH gains a LEADER-TERM CLEANUP
 *       subsection.
 *     - SCOPE and OUT OF SCOPE updated to name the leader-term cleanup
 *       and its owner.
 *     - Header DEATH HANDLER HOOK updated to name location-commands.js
 *       as one of the modules that registers a handler.
 *     - No behavioural change. Header documentation only.
 *   Earlier revisions:
 *     - advanceMortality now runs the settlement domain's annual
 *       financial effects once per simulated year via
 *       SettlementAnnualProcessor.processAllSettlementsAnnual({ year }).
 *       Settlement failures collected in result.settlementFailures.
 *     - advanceMortality catches per-character death failures into
 *       result.skipped instead of throwing.
 *     - registerDeathHandler(fn) added (Phase 3.13).
 *     - randomness.js (window.random) is a HARD load-time dependency.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECKS
    // =========================================================================

    if (!window.CharacterState) {
        throw new Error(
            'character-lifecycle.js: character-state.js must load first.'
        );
    }
    if (!window.CharacterCommands) {
        throw new Error(
            'character-lifecycle.js: character-commands.js must load first.'
        );
    }
    if (!window.MortalityRules) {
        throw new Error(
            'character-lifecycle.js: mortality-rules.js must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'character-lifecycle.js: time.js (getCurrentYear) must load first.'
        );
    }
    if (typeof window.isValidYear !== 'function') {
        throw new Error(
            'character-lifecycle.js: time.js (isValidYear) must load first.'
        );
    }
    if (typeof window.random !== 'function') {
        throw new Error(
            'character-lifecycle.js: randomness.js must load first ' +
            '(window.random missing). If you need a test-only override, ' +
            'pass options.random to the specific call — but randomness.js ' +
            'must still be loaded.'
        );
    }

    var CS = window.CharacterState;
    var CC = window.CharacterCommands;
    var MR = window.MortalityRules;

    if (typeof CC.markDeceased !== 'function') {
        throw new Error(
            'character-lifecycle.js: CharacterCommands.markDeceased is required.'
        );
    }

    // =========================================================================
    // 0b. DEATH HANDLER REGISTRY (Phase 3.13)
    // =========================================================================
    //
    // See DEATH HANDLER HOOK in the module header. Handlers registered
    // here run after the named cross-domain dispatch, on every
    // successful death.

    var _deathHandlers = [];

    /**
     * Registers a function to be called on every successful death.
     *
     * @param {Function} fn - called as fn(characterId, { deathYear })
     * @returns {Function} unregister function
     * @throws {Error} if fn is not a function
     */
    function registerDeathHandler(fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'character-lifecycle.js: registerDeathHandler requires a function.'
            );
        }
        _deathHandlers.push(fn);
        return function unregister() {
            var idx = _deathHandlers.indexOf(fn);
            if (idx !== -1) _deathHandlers.splice(idx, 1);
        };
    }

    /**
     * Invokes every registered death handler with (characterId,
     * { deathYear }). Handler exceptions are caught and logged. A
     * throwing handler does not prevent subsequent handlers from
     * running.
     *
     * @private
     */
    function _invokeDeathHandlers(characterId, year) {
        var outcomes = [];
        var snapshot = _deathHandlers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                var result = snapshot[i](characterId, { deathYear: year });
                if (!result || result.success !== true) {
                    outcomes.push({
                        handlerIndex: i,
                        success: false,
                        reason: result && result.reason
                            ? result.reason
                            : 'Death handler returned no explicit success result.',
                        code: result && result.code ? result.code : 'INVALID_HANDLER_RESULT'
                    });
                } else {
                    outcomes.push({ handlerIndex: i, success: true, result: result });
                }
            } catch (e) {
                outcomes.push({
                    handlerIndex: i,
                    success: false,
                    code: 'HANDLER_THROWN',
                    reason: e && e.message ? e.message : String(e)
                });
            }
        }
        return outcomes;
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isValidAge(v) {
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }

    function _isValidYear(v) {
        return window.isValidYear(v) === true;
    }

    /**
     * Returns the random function to use for a specific call.
     *
     * Precedence:
     *   1. options.random (caller-supplied override)
     *   2. window.random (from randomness.js)
     *
     * The second branch's throw is unreachable at runtime because the
     * module load guard guarantees window.random exists. It is kept as
     * defense in depth against a runtime that deletes window.random
     * after load (which would be a bug, not a load condition).
     *
     * Do not use Math.random as a fallback here: it would silently
     * break seeded simulations.
     */
    function _getRandomFn(options) {
        if (options && typeof options.random === 'function') {
            return options.random;
        }
        if (typeof window.random === 'function') {
            return window.random;
        }
        throw new Error(
            'character-lifecycle.js: no random source available. ' +
            'This should be unreachable — randomness.js is a required ' +
            'load-time dependency. Check that nothing deleted window.random.'
        );
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    /**
     * Resolves an age from a character projection, a character id, or a
     * numeric age. Returns null for anything else.
     */
    function _resolveAge(input) {
        if (input === null || input === undefined) return null;

        if (typeof input === 'number') {
            return _isValidAge(input) ? input : null;
        }

        if (typeof input === 'string') {
            var projection = CS.getCharacter(input);
            if (!projection) return null;
            return _ageOfProjection(projection);
        }

        if (typeof input === 'object') {
            return _ageOfProjection(input);
        }

        return null;
    }

    function _ageOfProjection(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        if (character.isDeceased === true && typeof character.deathYear === 'number') {
            return character.deathYear - character.birthYear;
        }
        var currentYear = window.getCurrentYear();
        var age = currentYear - character.birthYear;
        return age >= 0 ? age : null;
    }

    // =========================================================================
    // 2. CROSS-DOMAIN DEATH DISPATCH
    // =========================================================================
    //
    // Called exactly once per successful death, from _die and
    // killCharacter. Family is notified first, then relationship, then
    // rank. Each call is guarded: if the module or method is absent, that
    // subsystem is skipped.
    //
    // Failures inside a sub-dispatch are swallowed. Each subsystem owns
    // its own state; a failure in one must not prevent the others from
    // running.
    //
    // LOAD ORDER NOTE:
    //   This module loads before relationship-integrations.js in the
    //   documented load order, so the RelationshipIntegrations branch
    //   below is a no-op on any page that follows the documented load
    //   order. It remains as a defensive dispatch in case the load
    //   order is ever changed to put relationship-integrations.js
    //   first. The Phase 3.13 registerDeathHandler hook is the
    //   load-order-independent path; relationship-integrations.js
    //   registers itself there.
    //
    //   LocationCommands.handleCharacterDeath is NOT in the named
    //   dispatch below. location-commands.js registers itself via
    //   registerDeathHandler at load. See LEADER-TERM CLEANUP in the
    //   module header for the rationale (no load-time dependency from
    //   character-lifecycle to location-commands).

    function _notifyCrossDomainDeath(characterId, year) {
        var outcomes = [];
        if (!_hasId(characterId)) {
            return { success: false, failures: [{ handler: 'validation', reason: 'Invalid character id.' }] };
        }
        if (typeof year !== 'number' || !isFinite(year)) year = window.getCurrentYear();

        var dispatches = [
            ['family', window.FamilyCommands, 'handleCharacterDeath', [characterId, year]],
            ['ranks', window.RankIssues, 'handleCharacterDeath', [characterId, { deathYear: year }]]
        ];
        for (var i = 0; i < dispatches.length; i++) {
            var item = dispatches[i];
            if (!item[1] || typeof item[1][item[2]] !== 'function') continue;
            try {
                var result = item[1][item[2]].apply(item[1], item[3]);
                if (!result || result.success !== true) {
                    outcomes.push({
                        handler: item[0],
                        success: false,
                        code: result && result.code ? result.code : 'INVALID_HANDLER_RESULT',
                        reason: result && (result.reason || result.message)
                            ? (result.reason || result.message)
                            : 'Handler did not return success:true.'
                    });
                } else {
                    outcomes.push({ handler: item[0], success: true });
                }
            } catch (e) {
                outcomes.push({
                    handler: item[0],
                    success: false,
                    code: 'HANDLER_THROWN',
                    reason: e && e.message ? e.message : String(e)
                });
            }
        }
        return {
            success: outcomes.every(function (o) { return o.success === true; }),
            outcomes: outcomes,
            failures: outcomes.filter(function (o) { return o.success !== true; })
        };
    }

    /**
     * Logs the death event and dispatches cross-domain consequences.
     * Shared by the simulation path (_die) and the command path
     * (killCharacter).
     *
     * The death itself must already have been written via markDeceased
     * before this is called.
     */
    function _dispatchDeathEffects(character, year, cause, causeDetail) {
        if (!character) return;
        if (typeof year !== 'number' || !isFinite(year)) {
            year = window.getCurrentYear();
        }

        var name = typeof character.name === 'string' ? character.name : '';
        var causeStr = typeof cause === 'string' && cause.length > 0
            ? cause
            : 'unknown';
        var detailStr = typeof causeDetail === 'string' && causeDetail.length > 0
            ? ' (' + causeDetail + ')'
            : '';

        _logEvent('death', 'Death',
            name + ' died of ' + causeStr + detailStr + ' in ' + year,
            [character]);

        var named = _notifyCrossDomainDeath(character.id, year);
        var registered = _invokeDeathHandlers(character.id, year);
        var failures = (named.failures || []).slice();
        for (var i = 0; i < registered.length; i++) {
            if (registered[i].success !== true) {
                failures.push({
                    handler: 'registered:' + registered[i].handlerIndex,
                    code: registered[i].code,
                    reason: registered[i].reason
                });
            }
        }
        return {
            success: failures.length === 0,
            failures: failures,
            namedOutcomes: named.outcomes || [],
            registeredOutcomes: registered
        };
    }

    /**
     * Calls CharacterCommands.markDeceased with the referenceYear option
     * set to the simulated (or explicit) death year. This is the ONLY
     * path from this module to markDeceased; it exists so we cannot
     * accidentally omit referenceYear and re-introduce the multi-year
     * validation bug.
     */
    function _markDeceasedWithReferenceYear(characterId, deathData, referenceYear) {
        return CC.markDeceased(characterId, deathData, {
            referenceYear: referenceYear
        });
    }

    // =========================================================================
    // 3. LIFE STAGE CLASSIFICATION
    // =========================================================================

    function getLifeStage(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var stages = window.LIFE_STAGES;
        if (!stages || typeof stages !== 'object') return null;

        var keys = Object.keys(stages);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var stage = stages[key];
            if (!stage || typeof stage !== 'object') continue;
            if (typeof stage.min !== 'number') continue;
            // ANCIENT has max: null — treat as open-ended.
            var max = stage.max === null ? Infinity : stage.max;
            if (typeof max !== 'number') continue;
            if (age >= stage.min && age <= max) {
                return {
                    key: key,
                    name: stage.name || key,
                    min: stage.min,
                    max: stage.max,
                    group: stage.group || null
                };
            }
        }
        return null;
    }

    function getLifeStageName(charOrAge) {
        var stage = getLifeStage(charOrAge);
        return stage ? stage.name : null;
    }

    // =========================================================================
    // 4. AGE GROUP CLASSIFICATION
    // =========================================================================

    function getAgeGroup(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var groups = window.AGE_GROUPS;
        if (!Array.isArray(groups)) return null;

        for (var i = 0; i < groups.length; i++) {
            var group = groups[i];
            if (typeof group !== 'string') continue;
            var parts = group.split('-');
            if (parts.length !== 2) continue;

            var min = parseInt(parts[0], 10);
            var maxPart = parts[1];
            var max = maxPart === '+' ? Infinity : parseInt(maxPart, 10);

            if (isNaN(min)) continue;
            if (maxPart !== '+' && isNaN(max)) continue;

            if (age >= min && age <= max) return group;
        }
        return null;
    }

    function getAllAgeGroups() {
        if (!Array.isArray(window.AGE_GROUPS)) return [];
        return window.AGE_GROUPS.slice();
    }

    function getAgeGroupIndex(group) {
        if (typeof group !== 'string') return -1;
        if (!Array.isArray(window.AGE_GROUPS)) return -1;
        return window.AGE_GROUPS.indexOf(group);
    }

    function isElderly(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;
        return age >= 60;
    }

    function groupCharactersByAgeGroup(characters, excludeDeceased) {
        if (!Array.isArray(characters)) return {};
        if (excludeDeceased === undefined) excludeDeceased = true;

        var groups = {};
        var ageGroups = window.AGE_GROUPS;
        if (Array.isArray(ageGroups)) {
            for (var i = 0; i < ageGroups.length; i++) {
                groups[ageGroups[i]] = [];
            }
        }

        for (var j = 0; j < characters.length; j++) {
            var character = characters[j];
            if (!character) continue;
            if (excludeDeceased === true && character.isDeceased === true) continue;

            var age = _ageOfProjection(character);
            if (age === null) continue;

            var group = getAgeGroup(age);
            if (!group) continue;
            if (!groups[group]) groups[group] = [];
            groups[group].push(character);
        }

        var keys = Object.keys(groups);
        for (var k = 0; k < keys.length; k++) {
            groups[keys[k]].sort(function (a, b) {
                var aAge = _ageOfProjection(a);
                var bAge = _ageOfProjection(b);
                if (aAge === null && bAge === null) return 0;
                if (aAge === null) return 1;
                if (bAge === null) return -1;
                return aAge - bAge;
            });
        }

        return groups;
    }

    // =========================================================================
    // 5. DEATH CAUSE SELECTION
    // =========================================================================

    function _chooseDeathCause(character, age, year, options) {
        if (typeof options.chooseDeathCause === 'function') {
            var custom = options.chooseDeathCause(character, age, year);
            if (custom && MR.isValidDeathCause(custom.deathCause)) {
                return {
                    cause: custom.deathCause,
                    detail: typeof custom.deathCauseDetail === 'string'
                        ? custom.deathCauseDetail
                        : ''
                };
            }
        }

        var random = _getRandomFn(options);
        var roll = random();
        var picked = MR.pickRandomCause(
            { age: age, gender: character.gender },
            roll
        );
        if (picked) {
            return { cause: picked.cause, detail: picked.detail };
        }
        return { cause: MR.DEATH_CAUSE.UNKNOWN, detail: 'Cause not recorded' };
    }

    // =========================================================================
    // 6. MORTALITY RATE
    // =========================================================================

    function _getRateForCharacter(character, age, year, options) {
        if (typeof options.getMortalityRate === 'function') {
            var custom = options.getMortalityRate(character, age, year);
            if (typeof custom === 'number'
                && isFinite(custom)
                && custom >= 0
                && custom <= 1) {
                return custom;
            }
        }
        return MR.getDefaultMortalityRate(age);
    }

    // =========================================================================
    // 7. PER-CHARACTER MORTALITY EVALUATION
    // =========================================================================

    function _evaluateCharacterForYear(character, year, options) {
        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { died: false, reason: 'invalid_birth_year' };
        }

        var rate = _getRateForCharacter(character, age, year, options);
        if (typeof rate !== 'number') {
            return { died: false, reason: 'no_rate' };
        }

        var random = _getRandomFn(options);
        var roll = random();

        var result = MR.evaluateMortalityRoll(
            { age: age, mortalityRate: rate },
            roll
        );
        if (!result.valid) {
            return { died: false, reason: 'invalid_evaluation' };
        }
        if (!result.dies) {
            return { died: false };
        }

        var choice = _chooseDeathCause(character, age, year, options);

        return {
            died: true,
            cause: choice.cause,
            causeDetail: choice.detail,
            ageAtDeath: age
        };
    }

    // =========================================================================
    // 8. DEATH TRANSITION (INTERNAL PRIMITIVE)
    // =========================================================================
    //
    // _die returns a structured result:
    //
    //   { ok: true,  deathResult: <markDeceased result> }
    //   { ok: false, reason: <string> }
    //
    // It does NOT throw. Per-character death failures are a data problem
    // (invalid year, already-deceased race, invalid cause), not a
    // load-order bug. The caller decides how to surface them:
    //
    //   - advanceMortality records failures in result.skipped and
    //     continues (see PER-CHARACTER DEATH FAILURES in the header).
    //   - killCharacter converts a non-ok result into a thrown Error,
    //     preserving its explicit-command throw-through contract.
    //
    // _die assumes the death is being applied because mortality
    // evaluation already decided the character dies; the only failure
    // modes are the ones markDeceased itself refuses.

    function _die(character, year, evaluation) {
        var deathData = {
            deathYear: year,
            deathCause: evaluation.cause,
            deathCauseDetail: evaluation.causeDetail,
            deathNotes: '',
            isMurder: evaluation.cause === MR.DEATH_CAUSE.MURDER,
            killerId: null,
            murderMotive: null,
            murderMethod: null,
            isExecution: evaluation.cause === MR.DEATH_CAUSE.EXECUTION,
            executionReason: null,
            executionMethod: null,
            executionLocation: null
        };

        var deathResult = _markDeceasedWithReferenceYear(
            character.id,
            deathData,
            year
        );
        if (!deathResult || deathResult.success !== true) {
            return {
                ok: false,
                reason: (deathResult && deathResult.reason)
                    ? deathResult.reason
                    : 'markDeceased failed with no reason'
            };
        }

        var cascadeResult = _dispatchDeathEffects(
            character,
            year,
            evaluation.cause,
            evaluation.causeDetail
        );
        if (!cascadeResult || cascadeResult.success !== true) {
            return {
                ok: true,
                cascadeFailure: {
                    code: 'DEATH_CASCADE_PARTIAL_FAILURE',
                    reason: 'Character was marked deceased, but one or more death consequences failed.',
                    deathRecorded: true,
                    cascade: cascadeResult
                },
                deathResult: deathResult,
                cascade: cascadeResult
            };
        }

        return { ok: true, deathResult: deathResult, cascade: cascadeResult };
    }

    // =========================================================================
    // 9. SETTLEMENT ANNUAL PROCESSING
    // =========================================================================
    //
    // Runs the settlement domain's annual financial effects for a given
    // year. Called once per simulated year by advanceMortality, after
    // the character mortality pass for that year.
    //
    // The step is optional: when SettlementAnnualProcessor is absent,
    // it is skipped. The character domain does not own the settlement
    // domain; a missing settlement module is a legitimate configuration.
    //
    // The step is area-guarded: if the processor exists but throws, the
    // exception is caught and recorded as a single settlement failure
    // covering all settlements, without aborting the character loop.
    // See SETTLEMENT ANNUAL PROCESSING in the module header.

    function _processSettlementsForYear(year) {
        if (typeof window.SettlementAnnualProcessor === 'undefined'
            || window.SettlementAnnualProcessor === null) {
            return null;
        }

        var processor = window.SettlementAnnualProcessor;
        if (typeof processor.processAllSettlementsAnnual !== 'function') {
            return null;
        }

        var settlementResult;
        try {
            settlementResult = processor.processAllSettlementsAnnual({
                year: year
            });
        } catch (e) {
            // The whole settlement step exploded. Record a single
            // failure covering all settlements and let the character
            // loop continue. A settlement-domain explosion is not a
            // reason to stop killing characters.
            var reason = (e && e.message) ? e.message : String(e);
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'character-lifecycle.js: settlement annual processing ' +
                    'threw for year ' + year + ':', e
                );
            }
            return {
                year: year,
                failures: [{
                    locationId: null,
                    code: 'SETTLEMENT_STEP_THREW',
                    message: reason
                }]
            };
        }

        return settlementResult;
    }

    // =========================================================================
    // 10. TIME PROGRESSION (MORTALITY EVALUATION)
    // =========================================================================
    //
    // This is a MORTALITY evaluator, not a clock. It does not mutate
    // masterData.data.currentYear. It evaluates N future years, using
    // those years' ages and rates, and returns the final simulated year.
    //
    // The caller decides whether to advance the world clock. See the
    // CLOCK CONTRACT in the module header for the rationale.
    //
    // PER-CHARACTER FAILURE ISOLATION:
    //   A per-character death failure (markDeceased returns
    //   { success: false }) is recorded in result.skipped and the loop
    //   continues. The previous behaviour threw and aborted the entire
    //   multi-year simulation on the first such failure.
    //
    //   See PER-CHARACTER DEATH FAILURES in the module header.
    //
    // SETTLEMENT ANNUAL PROCESSING:
    //   Once per year, after the character mortality pass, the settlement
    //   domain's annual processor runs with the same year. See
    //   SETTLEMENT ANNUAL PROCESSING in the module header.
    //
    //   Settlement failures are collected into result.settlementFailures
    //   and logged, but do not abort the character loop.

    /**
     * Evaluates mortality for N years ahead of startYear.
     *
     * options:
     * {
     *   startYear:       number (required if deterministic simulation)
     *                    Defaults to getCurrentYear().
     *   getMortalityRate(character, age, year)  ->  number | null
     *   chooseDeathCause(character, age, year)  ->  { deathCause, deathCauseDetail? }
     *   random()                                ->  number in [0,1)
     *   maxDeaths                               ->  number | undefined
     *   skipSettlements                         ->  boolean | undefined
     *                    When true, the settlement annual step is
     *                    skipped. Useful for callers that want to drive
     *                    settlements separately (e.g. a batch run, a
     *                    test harness). Default false.
     * }
     *
     * @returns {{
     *   success: boolean,
     *   reason?: string,
     *   startYear?: number,
     *   finalYear?: number,
     *   yearsAdvanced?: number,
     *   deaths?: Array,
     *   deathCount?: number,
     *   skipped?: Array<{ characterId, name, year, reason }>,
     *   settlementFailures?: Array<{ locationId: string|null, code: string, message: string }>,
     *   settlementsSkipped?: boolean
     * }}
     */
    function advanceMortality(yearsAdvanced, options) {
        if (typeof yearsAdvanced !== 'number'
            || !isFinite(yearsAdvanced)
            || !Number.isInteger(yearsAdvanced)
            || yearsAdvanced < 0) {
            return {
                success: false,
                reason: 'yearsAdvanced must be a non-negative integer.'
            };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        // Resolve start year: explicit option first, else current year.
        var startYear;
        if (options.startYear !== undefined && options.startYear !== null) {
            if (!_isValidYear(options.startYear)) {
                return {
                    success: false,
                    reason: 'options.startYear must be a valid world year.'
                };
            }
            startYear = options.startYear;
        } else {
            startYear = window.getCurrentYear();
        }

        var deaths = [];
        var skipped = [];
        var cascadeFailures = [];
        var settlementFailures = [];
        var settlementsSkipped = options.skipSettlements === true;
        var maxDeaths = typeof options.maxDeaths === 'number'
            ? options.maxDeaths
            : Infinity;

        var finalYear = startYear;

        for (var offset = 1; offset <= yearsAdvanced; offset++) {
            var year = startYear + offset;
            if (!_isValidYear(year)) break;

            finalYear = year;

            var living = CS.getLivingCharacters();
            for (var i = 0; i < living.length; i++) {
                if (deaths.length >= maxDeaths) break;

                var projection = living[i];
                var live = CS.getLiveCharacterForMutation(projection.id);
                if (!live || live.isDeceased === true) continue;

                var evaluation = _evaluateCharacterForYear(live, year, options);
                if (!evaluation.died) continue;

                var dieResult = _die(live, year, evaluation);
                if (!dieResult.ok) {
                    // Per-character failure: record and continue. See
                    // PER-CHARACTER DEATH FAILURES in the module header.
                    skipped.push({
                        characterId: live.id,
                        name: live.name,
                        year: year,
                        reason: dieResult.reason
                    });
                    continue;
                }

                deaths.push({
                    characterId: live.id,
                    name: live.name,
                    surname: live.surname || '',
                    deathYear: year,
                    deathCause: evaluation.cause,
                    deathCauseDetail: evaluation.causeDetail,
                    ageAtDeath: evaluation.ageAtDeath
                });
                if (dieResult.cascadeFailure) {
                    cascadeFailures.push({
                        characterId: live.id,
                        name: live.name,
                        year: year,
                        code: dieResult.cascadeFailure.code,
                        reason: dieResult.cascadeFailure.reason,
                        cascade: dieResult.cascadeFailure.cascade
                    });
                }
            }

            // Settlement annual step. Runs once per simulated year, after
            // the character mortality pass for that year, using the same
            // year. See SETTLEMENT ANNUAL PROCESSING in the module header.
            //
            // The step is optional (skipped when the processor is absent
            // or options.skipSettlements is true) and area-guarded (a
            // thrown exception becomes a single failure entry, not an
            // aborted loop).
            if (!settlementsSkipped) {
                var settlementResult = _processSettlementsForYear(year);
                if (settlementResult && Array.isArray(settlementResult.failures)
                    && settlementResult.failures.length > 0) {
                    for (var sf = 0; sf < settlementResult.failures.length; sf++) {
                        var failure = settlementResult.failures[sf];
                        settlementFailures.push({
                            locationId: failure.locationId === undefined
                                ? null
                                : failure.locationId,
                            code: failure.code || 'SETTLEMENT_PROCESS_FAILED',
                            message: failure.message || 'unknown',
                            year: year
                        });
                        if (typeof console !== 'undefined' && console.warn) {
                            console.warn(
                                'character-lifecycle.js: settlement annual ' +
                                'processing failed for ' +
                                (failure.locationId || '(batch)') +
                                ' in year ' + year + ': ' +
                                (failure.message || 'unknown')
                            );
                        }
                    }
                }
            }
        }

        return {
            success: true,
            startYear: startYear,
            finalYear: finalYear,
            yearsAdvanced: yearsAdvanced,
            deaths: deaths,
            deathCount: deaths.length,
            skipped: skipped,
            cascadeFailures: cascadeFailures,
            settlementFailures: settlementFailures,
            settlementsSkipped: settlementsSkipped
        };
    }

    // =========================================================================
    // 11. PUBLIC DEATH COMMANDS
    // =========================================================================

    /**
     * Kills a specific character with explicit death data.
     *
     * Thin wrapper around CharacterCommands.markDeceased that:
     *   - passes the death year as referenceYear (so simulation-driven
     *     deaths from children-commands work correctly),
     *   - dispatches cross-domain consequences (family + relationship
     *     + rank + registered handlers, including the location domain's
     *     leader-term cleanup registered by location-commands.js),
     *   - logs the death event.
     *
     * THROW CONTRACT:
     *   A per-character failure (markDeceased returns
     *   { success: false }) is converted into a thrown Error. This is
     *   the opposite of advanceMortality, which absorbs the same
     *   failure into result.skipped. Rationale: killCharacter is an
     *   explicit "kill this one character" command; a caller asking
     *   it wants to know the outcome. advanceMortality is a simulation
     *   driver; a single bad character should not stop it.
     */
    function killCharacter(characterId, deathData) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (!_isPlainObject(deathData)) {
            return { success: false, reason: 'deathData must be a plain object.' };
        }

        var character = CS.getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }
        if (character.isDeceased === true) {
            return { success: false, reason: 'Character is already deceased.' };
        }

        var year = typeof deathData.deathYear === 'number'
            ? deathData.deathYear
            : window.getCurrentYear();

        var result = _markDeceasedWithReferenceYear(characterId, deathData, year);
        if (!result || result.success !== true) {
            return {
                success: false,
                reason: result && result.reason ? result.reason : 'markDeceased failed.'
            };
        }

        var cascadeResult = _dispatchDeathEffects(
            character,
            year,
            deathData.deathCause,
            deathData.deathCauseDetail
        );
        if (!cascadeResult || cascadeResult.success !== true) {
            return {
                success: false,
                code: 'DEATH_CASCADE_PARTIAL_FAILURE',
                reason: 'Character was marked deceased, but one or more death consequences failed.',
                deathRecorded: true,
                deathResult: result,
                cascade: cascadeResult
            };
        }

        result.cascade = cascadeResult;
        return result;
    }

    function killCharacterRandomCause(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        var character = CS.getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }
        if (character.isDeceased === true) {
            return { success: false, reason: 'Character is already deceased.' };
        }

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { success: false, reason: 'Character has no determinable age.' };
        }

        var random = _getRandomFn(options);
        var picked = MR.pickRandomCause(
            { age: age, gender: character.gender },
            random(),
            options.catalogue
        );
        if (!picked) {
            return { success: false, reason: 'No eligible death cause.' };
        }

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: picked.cause,
            deathCauseDetail: picked.detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    /**
     * Retries domain cleanup for a character whose death was already
     * recorded but whose first cascade returned partial failure.
     *
     * Cleanup handlers are required to be idempotent. This method does
     * not rewrite the death record or emit a second death log entry.
     */
    function retryDeathCascade(characterId) {
        if (!_hasId(characterId)) {
            return { success: false, code: 'INVALID_CHARACTER_ID', reason: 'characterId is required.' };
        }
        var character = CS.getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, code: 'CHARACTER_NOT_FOUND', reason: 'Character not found.' };
        }
        if (character.isDeceased !== true) {
            return { success: false, code: 'CHARACTER_NOT_DECEASED', reason: 'Character must already be deceased.' };
        }
        if (typeof character.deathYear !== 'number' || !isFinite(character.deathYear)) {
            return { success: false, code: 'INVALID_DEATH_YEAR', reason: 'Deceased character has no valid deathYear.' };
        }

        var named = _notifyCrossDomainDeath(characterId, character.deathYear);
        var registered = _invokeDeathHandlers(characterId, character.deathYear);
        var failures = (named.failures || []).slice();
        for (var i = 0; i < registered.length; i++) {
            if (registered[i].success !== true) {
                failures.push({
                    handler: 'registered:' + registered[i].handlerIndex,
                    code: registered[i].code,
                    reason: registered[i].reason
                });
            }
        }
        return {
            success: failures.length === 0,
            code: failures.length ? 'DEATH_CASCADE_PARTIAL_FAILURE' : 'DEATH_CASCADE_REPAIRED',
            characterId: characterId,
            deathYear: character.deathYear,
            failures: failures,
            namedOutcomes: named.outcomes || [],
            registeredOutcomes: registered
        };
    }

    function triggerNaturalDeath(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};

        var character = CS.getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { success: false, reason: 'Character has no determinable age.' };
        }

        var detail = age >= 60 ? 'Old age' : 'Natural causes';

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: MR.DEATH_CAUSE.NATURAL,
            deathCauseDetail: detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    function triggerAccidentalDeath(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        var defaults = [
            'Fell from a height',
            'Drowning',
            'Fire',
            'Hunting accident',
            'Crushed by falling object',
            'Animal attack',
            'Cart accident',
            'Building collapse'
        ];

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var detail;
        if (typeof options.accidentType === 'string' && options.accidentType.length > 0) {
            detail = options.accidentType;
        } else {
            var random = _getRandomFn(options);
            var idx = Math.floor(random() * defaults.length);
            if (idx < 0) idx = 0;
            if (idx >= defaults.length) idx = defaults.length - 1;
            detail = defaults[idx];
        }

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: MR.DEATH_CAUSE.ACCIDENT,
            deathCauseDetail: detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    // =========================================================================
    // 12. LIFESPAN ESTIMATION (DETERMINISTIC)
    // =========================================================================

    function predictLifespan(character) {
        if (!character || typeof character !== 'object') return null;

        var base = character.gender === 'female' ? 45 : 40;

        if (_hasId(character.activeRankId)
            && typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && typeof rank.priority === 'number') {
                if (rank.priority <= 2) base += 10;
                else if (rank.priority <= 3) base += 5;
            }
        }

        if (_hasId(character.id)) {
            var hash = 0;
            for (var i = 0; i < character.id.length; i++) {
                hash = (hash * 31 + character.id.charCodeAt(i)) | 0;
            }
            var offset = (hash % 21) - 10;
            base += offset;
        }

        if (base < 1) base = 1;
        if (base > 95) base = 95;
        return base;
    }

    function getExpectedRemainingYears(character) {
        if (!character || character.isDeceased === true) return null;
        var age = _ageOfProjection(character);
        if (age === null) return null;
        var predicted = predictLifespan(character);
        if (predicted === null) return null;
        return Math.max(0, predicted - age);
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        getLifeStage: getLifeStage,
        getLifeStageName: getLifeStageName,
        getAgeGroup: getAgeGroup,
        getAllAgeGroups: getAllAgeGroups,
        getAgeGroupIndex: getAgeGroupIndex,
        isElderly: isElderly,
        groupCharactersByAgeGroup: groupCharactersByAgeGroup,

        advanceMortality: advanceMortality,

        killCharacter: killCharacter,
        retryDeathCascade: retryDeathCascade,
        killCharacterRandomCause: killCharacterRandomCause,
        triggerNaturalDeath: triggerNaturalDeath,
        triggerAccidentalDeath: triggerAccidentalDeath,

        predictLifespan: predictLifespan,
        getExpectedRemainingYears: getExpectedRemainingYears,

        // Phase 3.13: register a death handler. Exposed on the
        // CharacterLifecycle namespace AND on window (below) so a
        // caller can reach it either way.
        registerDeathHandler: registerDeathHandler
    };

    // Phase 3.13: expose registerDeathHandler on window so that
    // modules that load after this file (notably
    // relationship-integrations.js and location-commands.js) can
    // register without assuming the CharacterLifecycle namespace is
    // populated. Both paths are equivalent; the window global is the
    // one the registration blocks check for.
    window.registerDeathHandler = registerDeathHandler;

    // -------------------------------------------------------------------------
    // Flat-global aliases.
    //
    // Load-time consumers that read these names directly:
    //   - crime-commands.js:189     window.killCharacter
    //   - crime-bootstrap.js        window.killCharacter (via _verifyGlobals)
    //
    // The CharacterLifecycle namespace remains authoritative; these are
    // one-way compatibility aliases. See FLAT-GLOBAL ALIASES in the
    // header.
    // -------------------------------------------------------------------------
    window.killCharacter = killCharacter;
    window.killCharacterRandomCause = killCharacterRandomCause;
    window.triggerNaturalDeath = triggerNaturalDeath;
    window.triggerAccidentalDeath = triggerAccidentalDeath;
    window.advanceMortality = advanceMortality;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }
})();
