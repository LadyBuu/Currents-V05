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
 *   - Relationship termination logic   -> relationship-integration.js
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
 *   After CharacterCommands.markDeceased succeeds, three subsystems are
 *   notified, in this order:
 *
 *     1. FamilyCommands.handleCharacterDeath
 *     2. RelationshipIntegrations.handleCharacterDeath
 *     3. RankIssues.handleCharacterDeath
 *
 *   Each is called if and only if the module and method are present.
 *   Failures are swallowed; the death has already been written and the
 *   cascade proceeds. The death operation is NOT transactional across
 *   domains. This is deliberate: each domain owns its own state, and a
 *   failure in one subsystem's cleanup must not prevent another's.
 *
 *   NAMING:
 *     The relationship domain's cross-domain hook is exported by
 *     js/relationships/relationship-integration.js under the namespace
 *     "RelationshipIntegrations" (PLURAL). Earlier revisions referenced
 *     the singular form, which does not exist and silently skipped
 *     relationship cleanup on every death.
 *
 *   The dispatch is centralised in _dispatchDeathEffects, which is
 *   called from both _die (simulation path) and killCharacter (command
 *   path). This ensures the two paths cannot drift.
 *
 *   LEADER-TERM CLEANUP:
 *     The location domain's leader assignments are stored on place
 *     records (place.leaderAssignments). A character who is an active
 *     leader in one or more places must have those assignments ended
 *     when they die; otherwise LocationQueries.getCurrentLeader
 *     returns the dead character as the settlement's current leader
 *     indefinitely, and downstream consumers (settlement prosperity,
 *     settlement leader-modifier, UI leader displays) read stale data.
 *
 *     This module does NOT call LocationCommands.handleCharacterDeath
 *     directly. Instead, location-commands.js registers itself via
 *     window.registerDeathHandler at load (see CROSS-DOMAIN LEADER
 *     CLEANUP in location-commands.js), and _invokeDeathHandlers
 *     (below) fires it alongside every other registered handler.
 *
 *     This keeps the character-lifecycle module free of a hard
 *     load-time dependency on location-commands.js and preserves the
 *     "optional cross-domain cleanup" contract: if
 *     location-commands.js is not loaded, leader-term cleanup is
 *     skipped, and the character domain still functions normally.
 *     Under the documented load order, location-commands.js loads
 *     before character-lifecycle.js's auto-bootstrap runs, so the
 *     registration is present when deaths occur.
 *
 *     See CROSS-DOMAIN LEADER CLEANUP in location-commands.js for the
 *     other side of this contract.
 *
 * DEATH HANDLER HOOK (Phase 3.13):
 *   The named dispatch above only reaches the domains that load
 *   before this file. Under the documented load order, that means
 *   FamilyCommands and RankIssues, but NOT RelationshipIntegrations
 *   (which loads after character-lifecycle.js) and NOT
 *   LocationCommands (which registers via the hook rather than via
 *   the named dispatch, because the location domain prefers the
 *   registration path).
 *
 *   To close that gap, this module exposes registerDeathHandler(fn).
 *   Any module that loads after character-lifecycle.js may register a
 *   handler. Every successful death invokes every registered handler
 *   exactly once, after the named dispatch and after the death has
 *   been written.
 *
 *   RelationshipIntegrations registers itself at load time (see
 *   relationship-integrations.js's REGISTRATION HOOKS section).
 *   LocationCommands registers itself at load time (see
 *   location-commands.js's DEATH HANDLER REGISTRATION section).
 *
 *   Handler contract:
 *     fn(characterId, { deathYear }) -> any
 *   The return value is ignored. Exceptions are caught and logged. A
 *   throwing handler does not prevent subsequent handlers from
 *   running, and does not propagate out of the death dispatch.
 *
 *   The handler registration is additive with the named dispatch: a
 *   domain that registers via the hook AND is present in the named
 *   dispatch (e.g. a hypothetical future state where the load order
 *   changes) will be called twice. That is safe because the command
 *   layer is idempotent per character id (see
 *   LocationCommands.handleCharacterDeath's isActive guard, for
 *   example).
 *
 *   Registration returns an unregister function. Callers who need to
 *   tear down (test harnesses, hot reload) should call it. In a
 *   normal browser session nothing calls unregister; the handler lives
 *   for the lifetime of the page.
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
 *   - relationships/relationship-integration.js:
 *                                       RelationshipIntegrations.handleCharacterDeath
 *   - ranks/rank-issues.js:            RankIssues.handleCharacterDeath
 *   - location/location-commands.js:   LocationCommands.handleCharacterDeath
 *                                      (registered via registerDeathHandler)
 *   - event-log.js:                    logEvent
 *   - settlement-annual-processor.js:  processAllSettlementsAnnual
 *                                      (see SETTLEMENT ANNUAL PROCESSING)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header CROSS-DOMAIN DEATH DISPATCH gains a LEADER-TERM CLEANUP
 *       subsection. Documents that location-commands.js registers
 *       LocationCommands.handleCharacterDeath via registerDeathHandler
 *       at load, that _invokeDeathHandlers fires it alongside every
 *       other registered handler, and that this module does NOT call
 *       LocationCommands.handleCharacterDeath directly (which would
 *       introduce a load-time dependency the character domain does
 *       not need).
 *     - SCOPE and OUT OF SCOPE updated to name the leader-term cleanup
 *       and its owner.
 *     - Header DEATH HANDLER HOOK updated to name location-commands.js
 *       as one of the modules that registers a handler.
 *     - No behavioural change. No code changes. Header documentation
 *       only. The registration path already exists — location-commands.js
 *       now opts into it — and the handler fires through the existing
 *       _invokeDeathHandlers call.
 *   Previous revision:
 *     - advanceMortality now runs the settlement domain's annual
 *       financial effects once per simulated year, via
 *       SettlementAnnualProcessor.processAllSettlementsAnnual({ year }).
 *       The step runs after the character mortality pass for each year,
 *       using the same year that character mortality used. Settlement
 *       failures are collected into result.settlementFailures, logged,
 *       and do NOT abort the character mortality loop.
 *     - result.settlementFailures added to advanceMortality's return
 *       shape. Empty array when no failures occurred, or when the
 *       settlement processor is not loaded.
 *     - The settlement step is optional and area-guarded. When
 *       SettlementAnnualProcessor is absent, the step is skipped. When
 *       it is present but throws, the exception is caught, logged, and
 *       recorded as a single settlement failure.
 *     - Header SETTLEMENT ANNUAL PROCESSING section added, and CLOCK
 *       CONTRACT updated to document the settlement step's year
 *       semantics.
 *     - DEPENDENCIES updated: settlement-annual-processor.js listed
 *       under OPTIONAL.
 *     - No behavioural change to the character-mortality portion of the
 *       loop. Every existing field of the return shape is unchanged
 *       and keeps its existing semantics. `result.deaths`,
 *       `result.skipped`, and `result.finalYear` are unaffected by the
 *       new settlement step.
 *   Previous revision:
 *     - advanceMortality now catches per-character death failures
 *       (markDeceased returning { success: false }) and records them
 *       in result.skipped instead of throwing and aborting the loop.
 *     - _die now returns a structured { ok, reason?, deathResult? }
 *       result instead of throwing. killCharacter wraps the same
 *       primitive and converts a non-ok result into a thrown Error.
 *     - result.skipped added to advanceMortality's return shape.
 *   Earlier revisions:
 *     - registerDeathHandler(fn) added (Phase 3.13).
 *     - randomness.js (window.random) is now a HARD load-time
 *       dependency.
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
        if (_deathHandlers.length === 0) return;
        var snapshot = _deathHandlers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](characterId, { deathYear: year });
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'character-lifecycle.js: death handler threw:', e
                    );
                }
            }
        }
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
        if (!_hasId(characterId)) return;
        if (typeof year !== 'number' || !isFinite(year)) {
            year = window.getCurrentYear();
        }

        // Family: structural parentage edges. Notified first because
        // parent-child edges are structural and unrelated to the
        // relationship or rank state.
        if (window.FamilyCommands
            && typeof window.FamilyCommands.handleCharacterDeath === 'function') {
            try {
                window.FamilyCommands.handleCharacterDeath(characterId, year);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'character-lifecycle.js: FamilyCommands.handleCharacterDeath threw',
                        e
                    );
                }
            }
        }

        // Relationship: end every active edge. Committed relationships
        // become widowed; others end. Notified before rank because rank
        // inheritance sources may resolve through a spouse who has just
        // died.
        //
        // NOTE: this branch is a no-op under the documented load order
        // (relationship-integrations.js loads after character-lifecycle.js).
        // See LOAD ORDER NOTE above and DEATH HANDLER HOOK in the header.
        if (window.RelationshipIntegrations
            && typeof window.RelationshipIntegrations.handleCharacterDeath === 'function') {
            try {
                window.RelationshipIntegrations.handleCharacterDeath(characterId, {
                    deathYear: year
                });
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'character-lifecycle.js: RelationshipIntegrations.handleCharacterDeath threw',
                        e
                    );
                }
            }
        }

        // Rank: deprecate any rank assignment with deprecateOnDeath, then
        // renumber the affected ranks. Notified last so it reads the
        // freshest relationship state.
        if (window.RankIssues
            && typeof window.RankIssues.handleCharacterDeath === 'function') {
            try {
                window.RankIssues.handleCharacterDeath(characterId, {
                    deathYear: year
                });
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'character-lifecycle.js: RankIssues.handleCharacterDeath threw',
                        e
                    );
                }
            }
        }

        // LocationCommands.handleCharacterDeath is NOT dispatched here.
        // It is registered by location-commands.js via
        // registerDeathHandler and runs via _invokeDeathHandlers below.
        // See LEADER-TERM CLEANUP in the module header.
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

        _notifyCrossDomainDeath(character.id, year);

        // Phase 3.13: invoke registered handlers. These reach the
        // domains that load after this file (notably the relationship
        // domain) and the domains that prefer the registration hook
        // (notably LocationCommands.handleCharacterDeath) via the
        // registration hook. The named dispatch above reaches the
        // domains that load before it.
        _invokeDeathHandlers(character.id, year);
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

        _dispatchDeathEffects(
            character,
            year,
            evaluation.cause,
            evaluation.causeDetail
        );

        return { ok: true, deathResult: deathResult };
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

        _dispatchDeathEffects(
            character,
            year,
            deathData.deathCause,
            deathData.deathCauseDetail
        );

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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }
})();
