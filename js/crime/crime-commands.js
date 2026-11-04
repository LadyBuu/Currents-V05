/**
 * =============================================================================
 * STILL WATERS - CRIME COMMANDS (crime-commands.js)
 * =============================================================================
 *
 * LOCATION: js/crime/crime-commands.js
 *
 * PURPOSE:
 *   Orchestration layer for crime and vendetta workflows. Each command:
 *     1. validates inputs
 *     2. resolves context
 *     3. asks CrimeLawIntegration for a legal evaluation
 *     4. records the crime through CrimeState (unsolved)
 *     5. solves it via solveCrime when the outcome is legally determined
 *     6. kills or mutates characters through CharacterCommands / globals
 *     7. applies the legal consequences returned by the law layer
 *     8. updates households and settlements through their public command
 *        boundaries
 *     9. commits the transaction (hydrate + markDirty + publish + dispatch)
 *    10. returns a structured result
 *
 *   It does NOT decide what a punishment is. It executes the consequences
 *   returned by CrimeLawIntegration.evaluateAction().
 *
 * COMMAND SURFACE:
 *
 *   recordCrime(locationId, data)
 *       Generic crime recording. Records a NON-murder, NON-execution
 *       crime unsolved (or optionally solved via data.solved). Applies
 *       law evaluation, household side effects, and settlement crime
 *       impact. Does NOT kill anyone. Does NOT start a vendetta.
 *
 *       Murder and execution are REJECTED:
 *         type === 'murder'    → { code: 'MURDER_USES_TRIGGER' }
 *             Murder has mandatory side effects (kill, vendetta,
 *             household effects, law consequence execution). A
 *             "murder" crime whose victim is still alive would be a
 *             data-integrity hole. Use triggerMurder.
 *         type === 'execution' → { code: 'EXECUTION_IS_A_CONSEQUENCE' }
 *             Execution is a consequence emitted by the law layer
 *             inside triggerMurder (via _executeConsequence →
 *             triggerExecution). It is not created by the user.
 *
 *   triggerMurder(victimId, killerId, options)
 *       Murder-specific. Records the murder, kills the victim, starts
 *       a vendetta if the two households differ, applies household
 *       and settlement effects, and executes whatever law consequence
 *       the evaluation returned (which may include execution via
 *       triggerExecution).
 *
 *   triggerExecution(condemnedId, options)
 *       Execution-specific. INTERNAL. Called only by triggerMurder's
 *       _executeConsequence path. Public export retained for the
 *       consequence-execution chain, not for user-initiated
 *       execution recording (there is no such action).
 *
 *   escalateVendetta(vendettaId, options)
 *       Explicit vendetta escalation. Also fires automatically inside
 *       recordVendettaDeath when the threshold is reached.
 *
 *   createBloodFeud(victimId, killerId, options)
 *       Creates or extends a blood feud between the victim and killer
 *       households. Called by triggerMurder; also exposed for manual
 *       bookkeeping.
 *
 *   persist()
 *       The single saveMasterData site in this domain.
 *
 * RESULT CONTRACT:
 *   { success: true, data: {...} }
 *   { success: false, reason: string, code?: string }
 *
 * COMMIT TAIL (_commit):
 *   1. CrimeState.hydrateFromMasterData(true)
 *   2. markDataDirty()
 *   3. CrimeState.publish()
 *   4. dispatchEvent(CustomEvent)
 *
 *   No saveMasterData inside a command. Persistence is
 *   CrimeCommands.persist(), called by the UI once per modal action.
 *
 * DEATH SIGNATURE CONTRACT:
 *   killCharacter calls use the two-argument form
 *   killCharacter(characterId, deathData) matching markDeceased's
 *   payload contract. See triggerMurder and triggerExecution.
 *
 * PERSISTENCE CONTRACT:
 *   persist() inspects the boolean return value of saveMasterData().
 *   On false, reads getLastSaveError(). Pattern A from storage.js's
 *   DOMAIN PERSIST CONTRACT. Pattern C (discard, report success) is
 *   banned.
 *
 * OWNERSHIP:
 *   - recordCrime, triggerMurder, triggerExecution, escalateVendetta,
 *     createBloodFeud
 *   - orchestration of character death, relationship termination,
 *     vendetta creation, and household side effects
 *   - the persist boundary
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not decide legal consequences. (CrimeLawIntegration)
 *   - It does not own crime or vendetta records. (CrimeState)
 *   - It does not compute statistics. (CrimeQueries)
 *   - It does not reach into another domain's private state.
 *   - It does not use a module-wide recursion guard.
 *   - It does not unwrap results into bare objects.
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants, CrimeState, CrimeLawIntegration
 *   - getCurrentYear, generateId, killCharacter, logEvent
 *   - getCharacterById, getHouseholdById, getCurrentLocationId
 *   - getRelationshipsForCharacter, endRelationship
 *   - HouseholdCommands (applyPerpetratorCrime, applyVictimCrime,
 *                       applyExecutionToHousehold)
 *   - SettlementGovernmentCommands.recordCrimeImpact (optional; absence
 *     warns once and skips settlement effects)
 *
 * KNOWN HAZARD (external, not fixable from this file):
 *   CrimeLawIntegration._getCivilLaws resolves through
 *   SettlementLawQueries.getCivilLaws(locationId). That function
 *   returns null when the settlement record does not exist (see
 *   settlement-law-queries.js::_getLawsArray →
 *   SettlementQueries.getSettlementData → null → getCivilLaws
 *   returns null). CrimeLawIntegration.getApplicableLaws does
 *   civilLaws.length without a null guard, so evaluateAction throws
 *   TypeError when the locationId resolves to a place that has no
 *   settlement record. The try/catch that wraps every command here
 *   catches that, and the command returns { success: false, reason:
 *   'Cannot read ...' }. The fix belongs in crime-law-integration.js
 *   (return [] instead of null, or guard the caller) and is out of
 *   scope for this file.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added recordCrime(locationId, data). Generic crime recording
 *       for every crime type that is not murder and not execution.
 *       Rejects type === 'murder' (MURDER_USES_TRIGGER) and
 *       type === 'execution' (EXECUTION_IS_A_CONSEQUENCE). Runs
 *       CrimeLawIntegration.evaluateAction against the perpetrator
 *       (when supplied); records unsolved via CrimeState.recordCrime;
 *       optionally solves via CrimeState.solveCrime when
 *       data.solved === true; applies household side effects through
 *       the same helpers triggerMurder uses; applies settlement crime
 *       impact; commits via _commit.
 *     - Added _domainForCrimeType and _humanizeCrimeType helpers.
 *       Pure; used by recordCrime only.
 *     - triggerMurder and triggerExecution unchanged. They still call
 *       killCharacter with the two-argument form and still use
 *       _executeConsequence → triggerExecution for law-prescribed
 *       execution.
 *     - persist() unchanged (Pattern A + getLastSaveError).
 *     - No other behavioural change to any command.
 *   Previous revisions:
 *     - triggerMurder / triggerExecution migrated to the two-argument
 *       killCharacter form (P1-8).
 *     - persist() migrated to Pattern A (P1-8).
 *     - escalateVendetta added as a first-class command.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.CrimeConstants;
    var State = window.CrimeState;
    var Law = window.CrimeLawIntegration;

    if (!C)     throw new Error('crime-commands.js requires CrimeConstants');
    if (!State) throw new Error('crime-commands.js requires CrimeState');
    if (!Law)   throw new Error('crime-commands.js requires CrimeLawIntegration');

    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('crime-commands.js requires getCurrentYear');
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('crime-commands.js requires generateId');
    }
    if (typeof window.killCharacter !== 'function') {
        throw new Error('crime-commands.js requires killCharacter');
    }
    if (typeof window.logEvent !== 'function') {
        throw new Error('crime-commands.js requires logEvent');
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error('crime-commands.js requires getCharacterById');
    }
    if (typeof window.getHouseholdById !== 'function') {
        throw new Error('crime-commands.js requires getHouseholdById');
    }
    if (typeof window.getCurrentLocationId !== 'function') {
        throw new Error('crime-commands.js requires getCurrentLocationId');
    }
    if (typeof window.getRelationshipsForCharacter !== 'function') {
        throw new Error('crime-commands.js requires getRelationshipsForCharacter');
    }
    if (typeof window.endRelationship !== 'function') {
        throw new Error('crime-commands.js requires endRelationship');
    }

    if (typeof window.HouseholdCommands === 'undefined') {
        throw new Error('crime-commands.js requires HouseholdCommands');
    }
    if (typeof window.HouseholdCommands.applyPerpetratorCrime !== 'function') {
        throw new Error('crime-commands.js requires HouseholdCommands.applyPerpetratorCrime');
    }
    if (typeof window.HouseholdCommands.applyVictimCrime !== 'function') {
        throw new Error('crime-commands.js requires HouseholdCommands.applyVictimCrime');
    }
    if (typeof window.HouseholdCommands.applyExecutionToHousehold !== 'function') {
        throw new Error('crime-commands.js requires HouseholdCommands.applyExecutionToHousehold');
    }

    var _warnedSettlement = false;
    function _getSettlementRecordImpact() {
        if (typeof window.SettlementGovernmentCommands !== 'undefined' &&
            typeof window.SettlementGovernmentCommands.recordCrimeImpact === 'function') {
            return window.SettlementGovernmentCommands.recordCrimeImpact;
        }
        if (!_warnedSettlement && typeof console !== 'undefined' && console.warn) {
            _warnedSettlement = true;
            console.warn(
                'crime-commands.js: SettlementGovernmentCommands.recordCrimeImpact ' +
                'is not available — settlement crime impacts will be skipped.'
            );
        }
        return null;
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _now() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'crime-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) { return { success: false, reason: reason, code: code || null }; }

    function _normaliseOptions(options) {
        return (options && typeof options === 'object') ? options : {};
    }

    function _resolveYear(options) {
        return (typeof options.year === 'number') ? options.year : _now();
    }

    // =========================================================================
    // 2. COMMIT TAIL
    // =========================================================================
    //
    // Runs after every successful command. Rebuilds indexes over whatever
    // mutations the command performed, marks the data dirty, publishes the
    // in-process event, and dispatches a CustomEvent for cross-domain
    // consumers.
    //
    // This is the transaction boundary. It does NOT save. Callers that
    // need persistence call CrimeCommands.persist() once after the command
    // returns.

    function _commit(eventName, payload) {
        State.hydrateFromMasterData(true);
        window.markDataDirty();
        State.publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, detail) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: detail || null }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('crime-commands.js: dispatch failed', eventName, e);
            }
        }
    }

    // =========================================================================
    // 3. PERSISTENCE BOUNDARY
    // =========================================================================
    //
    // See PERSISTENCE CONTRACT in the header. Pattern A from storage.js's
    // DOMAIN PERSIST CONTRACT: inspect the boolean return value; on
    // failure, read getLastSaveError() for the reason.

    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return _fail('saveMasterData unavailable', C.CODES.PERSIST_FAILED);
        }

        try {
            var ok = window.saveMasterData();
            if (ok === true) {
                return _ok(null);
            }

            var err = (typeof window.getLastSaveError === 'function')
                ? window.getLastSaveError()
                : null;

            return _fail(
                (err && err.message) ? err.message : 'saveMasterData returned false',
                C.CODES.PERSIST_FAILED
            );
        } catch (e) {
            return _fail(e.message || String(e), C.CODES.PERSIST_FAILED);
        }
    }

    // =========================================================================
    // 4. LOGGING
    // =========================================================================

    function _log(category, type, message, subjects) {
        window.logEvent(category, type, message, subjects || []);
    }

    // =========================================================================
    // 5. CONTEXT RESOLUTION
    // =========================================================================

    function _resolveLocation(options, victim, killer) {
        if (options.locationId) return options.locationId;
        if (victim) {
            var victimLoc = window.getCurrentLocationId(victim);
            if (victimLoc) return victimLoc;
        }
        if (killer) {
            var killerLoc = window.getCurrentLocationId(killer);
            if (killerLoc) return killerLoc;
        }
        return null;
    }

    function _getHouseholdIdForCharacter(character) {
        if (!character) return null;
        if (character.household) return character.household;
        if (character.householdId) return character.householdId;
        return null;
    }

    // =========================================================================
    // 6. HOUSEHOLD SIDE EFFECTS
    // =========================================================================

    function _applyPerpetratorHouseholdEffects(householdId, params) {
        if (!householdId) return;
        window.HouseholdCommands.applyPerpetratorCrime(householdId, params);
    }

    function _applyVictimHouseholdEffects(householdId, params) {
        if (!householdId) return;
        window.HouseholdCommands.applyVictimCrime(householdId, params);
    }

    function _applyExecutionHouseholdEffects(householdId, params) {
        if (!householdId) return;
        window.HouseholdCommands.applyExecutionToHousehold(householdId, params);
    }

    // =========================================================================
    // 7. SETTLEMENT SIDE EFFECTS
    // =========================================================================

    function _recordSettlementCrimeImpact(locationId, eventData) {
        if (!locationId) return;
        var impact = _getSettlementRecordImpact();
        if (!impact) return;
        try {
            impact(locationId, eventData);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('crime-commands.js: recordCrimeImpact threw', e);
            }
        }
    }

    // =========================================================================
    // 8. CONSEQUENCE EXECUTION
    // =========================================================================

    function _executeConsequence(consequence, ctx) {
        if (!consequence || !consequence.type) {
            return { type: 'unknown', applied: false, reason: 'no-type' };
        }

        switch (consequence.type) {
            case C.CONSEQUENCE_TYPES.EXECUTION:
                return _executeExecutionConsequence(consequence, ctx);

            case C.CONSEQUENCE_TYPES.IMPRISONMENT:
            case C.CONSEQUENCE_TYPES.EXILE:
            case C.CONSEQUENCE_TYPES.FINE:
            case C.CONSEQUENCE_TYPES.PENANCE:
            case C.CONSEQUENCE_TYPES.EXCOMMUNICATION:
                return { type: consequence.type, applied: false, reason: 'no-handler' };

            case C.CONSEQUENCE_TYPES.OTHER:
            default:
                return { type: consequence.type, applied: false, reason: 'unrecognised' };
        }
    }

    function _executeExecutionConsequence(consequence, ctx) {
        var condemned = ctx.killer;
        if (!condemned || condemned.isDeceased) {
            return { type: C.CONSEQUENCE_TYPES.EXECUTION, applied: false, reason: 'condemned-unavailable' };
        }

        var result = triggerExecution(condemned.id, {
            year: ctx.year,
            reason: consequence.description || consequence.type,
            method: consequence.method || null,
            locationId: ctx.locationId,
            isForMurder: !!ctx.isForMurder,
            victimId: ctx.victim ? ctx.victim.id : null,
            murderReason: ctx.murderReason || null,
            notes: 'Executed under law: ' +
                (consequence.source && consequence.source.lawName
                    ? consequence.source.lawName
                    : 'unspecified')
        });

        return {
            type: C.CONSEQUENCE_TYPES.EXECUTION,
            applied: !!result.success,
            executionResult: result.success ? result.data : null,
            reason: result.success ? null : result.reason
        };
    }

    // =========================================================================
    // 9. GENERIC CRIME RECORDING
    // =========================================================================
    //
    // recordCrime(locationId, data) — the generic path. Records a
    // non-murder, non-execution crime unsolved (or optionally solved via
    // data.solved). Applies law evaluation, household side effects, and
    // settlement crime impact. Does NOT kill anyone. Does NOT start a
    // vendetta.
    //
    // Murder and execution are rejected:
    //   murder    → use triggerMurder (kill + vendetta + household +
    //               law consequences are mandatory for murder)
    //   execution → use triggerMurder, which emits the execution as a
    //               law consequence (execution is not created by the
    //               user)
    //
    // The locationId is the settlement location the tab is scoped to.
    // It is used for:
    //   - the crime record's locationId field
    //   - the settlement crime impact
    // It is NOT used to resolve the perpetrator's own current location
    // (that is separate context); the caller is expected to supply
    // data.locationId when the crime happened somewhere other than the
    // settlement's own location.
    //
    // Returns { success: true, data: { crime, legalEvaluation,
    //           consequenceResults, householdUpdates } } or
    //         { success: false, reason, code }.

    function recordCrime(locationId, data) {
        try {
            if (typeof locationId !== 'string' || locationId.length === 0) {
                return _fail(
                    'locationId is required',
                    C.CODES.VALIDATION
                );
            }

            data = _normaliseOptions(data);

            if (typeof data.type !== 'string' || data.type.length === 0) {
                return _fail(
                    'Crime type is required',
                    C.CODES.VALIDATION
                );
            }

            var knownTypes = C.getAllCrimeTypes();
            if (knownTypes.indexOf(data.type) === -1) {
                return _fail(
                    'Unknown crime type: ' + data.type,
                    C.CODES.VALIDATION
                );
            }

            if (data.type === C.CRIME_TYPES.MURDER) {
                return _fail(
                    'Murder must use CrimeCommands.triggerMurder so the ' +
                    'kill, vendetta, household effects, and law consequences ' +
                    'are applied.',
                    'MURDER_USES_TRIGGER'
                );
            }

            if (data.type === C.CRIME_TYPES.EXECUTION) {
                return _fail(
                    'Execution is a consequence emitted by the law layer ' +
                    'inside triggerMurder, not a creatable crime type.',
                    'EXECUTION_IS_A_CONSEQUENCE'
                );
            }

            var year = (typeof data.year === 'number') ? data.year : _now();
            if (!isFinite(year)) {
                return _fail('Invalid year', C.CODES.VALIDATION);
            }

            var perpetrator = data.perpetratorId
                ? window.getCharacterById(data.perpetratorId)
                : null;
            if (data.perpetratorId && !perpetrator) {
                return _fail(
                    'Perpetrator not found',
                    C.CODES.NOT_FOUND
                );
            }

            var victim = data.victimId
                ? window.getCharacterById(data.victimId)
                : null;
            if (data.victimId && !victim) {
                return _fail(
                    'Victim not found',
                    C.CODES.NOT_FOUND
                );
            }

            var crimeLocationId = data.locationId
                ? data.locationId
                : locationId;

            var reason = data.reason || 'Unknown reason';

            // ---- Law evaluation (optional perpetrator) -----------------
            var evaluation;
            if (perpetrator) {
                var action = {
                    type: data.type,
                    domain: _domainForCrimeType(data.type),
                    details: {
                        victimId: data.victimId || null,
                        perpetratorId: data.perpetratorId || null,
                        reason: reason
                    }
                };
                var context = {
                    locationId: crimeLocationId,
                    victim: victim,
                    killer: perpetrator,
                    year: year
                };
                evaluation = Law.evaluateAction(perpetrator.id, action, context);
            } else {
                evaluation = {
                    lawful: true,
                    violations: [],
                    civil: [],
                    religious: [],
                    governingLaw: null,
                    consequences: []
                };
            }

            // ---- Record crime ------------------------------------------
            var crimeData = {
                type: data.type,
                perpetratorId: data.perpetratorId || null,
                victimId: data.victimId || null,
                year: year,
                reason: reason,
                locationId: crimeLocationId,
                method: data.method || null,
                notes: data.notes || null,
                civilViolation: evaluation.civil.length > 0
                    ? _summariseViolation(evaluation.civil[0], 'civil', crimeLocationId)
                    : null,
                religiousViolation: evaluation.religious.length > 0
                    ? _summariseViolation(evaluation.religious[0], 'religious', null)
                    : null,
                religionId: perpetrator && perpetrator.religionId
                    ? perpetrator.religionId
                    : null,
                violatedLaws: evaluation.violations.map(_summariseViolationItem)
            };

            var recordResult = State.recordCrime(crimeData);
            if (!recordResult.success) {
                return _fail(
                    'Failed to record crime: ' + recordResult.reason,
                    C.CODES.VALIDATION
                );
            }
            var crime = recordResult.data;

            // ---- Optional solve ----------------------------------------
            if (data.solved === true) {
                var solution = (typeof data.solution === 'string' && data.solution.length > 0)
                    ? data.solution
                    : 'Solved';
                var solveResult = State.solveCrime(crime.id, solution, year);
                if (!solveResult.success) {
                    State.deleteCrime(crime.id);
                    return _fail(
                        'Failed to solve crime: ' + solveResult.reason,
                        C.CODES.VALIDATION
                    );
                }
                crime = solveResult.data;
            }

            // ---- Household side effects --------------------------------
            var vHouseholdId = _getHouseholdIdForCharacter(victim);
            var kHouseholdId = _getHouseholdIdForCharacter(perpetrator);

            if (vHouseholdId) {
                _applyVictimHouseholdEffects(vHouseholdId, {
                    eventType: data.type,
                    perpetratorId: data.perpetratorId || null,
                    victimId: data.victimId || null,
                    year: year,
                    prestigeLoss: 5
                });
            }
            if (kHouseholdId && kHouseholdId !== vHouseholdId) {
                _applyPerpetratorHouseholdEffects(kHouseholdId, {
                    eventType: data.type,
                    perpetratorId: data.perpetratorId || null,
                    victimId: data.victimId || null,
                    year: year,
                    prestigeLoss: 5
                });
            }

            // ---- Settlement side effects -------------------------------
            _recordSettlementCrimeImpact(crimeLocationId, {
                type: data.type,
                victimId: data.victimId || null,
                killerId: data.perpetratorId || null,
                year: year,
                reason: reason,
                solved: data.solved === true,
                lawViolations: evaluation.violations.length
            });

            // ---- Logging -----------------------------------------------
            var subjects = [];
            if (perpetrator) subjects.push(perpetrator);
            if (victim) subjects.push(victim);
            var typeLabel = _humanizeCrimeType(data.type);
            var description = typeLabel;
            if (victim && victim.name) {
                description += ' against ' + victim.name;
            }
            if (perpetrator && perpetrator.name) {
                description += ' by ' + perpetrator.name;
            }
            _log('crime', typeLabel, description + ' (' + reason + ')', subjects);

            _commit(C.EVENTS.CRIME_RECORDED, {
                crimeId: crime.id,
                type: data.type,
                victimId: data.victimId || null,
                killerId: data.perpetratorId || null
            });

            return _ok({
                crime: crime,
                year: year,
                locationId: crimeLocationId,
                legalEvaluation: evaluation,
                householdUpdates: {
                    victimHouseholdId: vHouseholdId,
                    perpetratorHouseholdId: kHouseholdId
                }
            });

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        }
    }

    /**
     * Maps a crime type to a Law domain for evaluation. Best-effort;
     * the mapping is a hint, not a validator. Unknown crime types map
     * to VIOLENCE (the catch-all).
     */
    function _domainForCrimeType(type) {
        if (!type) return C.LAW_DOMAINS.VIOLENCE;
        var domains = C.LAW_DOMAINS;
        switch (type) {
            case C.CRIME_TYPES.MURDER:
            case C.CRIME_TYPES.ASSAULT:
            case C.CRIME_TYPES.VIOLENCE:
            case C.CRIME_TYPES.ROBBERY:
            case C.CRIME_TYPES.VENDETTA:
            case C.CRIME_TYPES.CRIME_OF_PASSION:
                return domains.VIOLENCE;
            case C.CRIME_TYPES.ADULTERY:
                return domains.SEXUAL;
            case C.CRIME_TYPES.TREASON:
            case C.CRIME_TYPES.ESPIONAGE:
                return domains.POLITICAL;
            case C.CRIME_TYPES.THEFT:
            case C.CRIME_TYPES.FRAUD:
            case C.CRIME_TYPES.FORGERY:
            case C.CRIME_TYPES.SMUGGLING:
                return domains.ECONOMIC;
            case C.CRIME_TYPES.HERESY:
            case C.CRIME_TYPES.BLASPHEMY:
            case C.CRIME_TYPES.APOSTASY:
            case C.CRIME_TYPES.SACRILEGE:
            case C.CRIME_TYPES.WITCHCRAFT:
            case C.CRIME_TYPES.IDOLATRY:
            case C.CRIME_TYPES.SCHISM:
            case C.CRIME_TYPES.EXCOMMUNICATION_VIOLATION:
            case C.CRIME_TYPES.RELIGIOUS_IMPERSONATION:
            case C.CRIME_TYPES.FALSE_PROPHECY:
            case C.CRIME_TYPES.DESECRATION:
                return domains.WORSHIP;
            default:
                return domains.VIOLENCE;
        }
    }

    function _humanizeCrimeType(type) {
        if (!type) return 'Crime';
        return String(type)
            .split('_')
            .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1); })
            .join(' ');
    }

    // =========================================================================
    // 10. MURDER
    // =========================================================================

    function triggerMurder(victimId, killerId, options) {
        options = _normaliseOptions(options);

        try {
            var victim = window.getCharacterById(victimId);
            var killer = window.getCharacterById(killerId);

            if (!victim) return _fail('Victim not found', C.CODES.NOT_FOUND);
            if (!killer) return _fail('Killer not found', C.CODES.NOT_FOUND);
            if (victim.isDeceased) return _fail('Victim is already deceased', C.CODES.ALREADY_DECEASED);
            if (victimId === killerId) return _fail('Cannot murder oneself', C.CODES.SAME_CHARACTER);

            var year = _resolveYear(options);
            var reason = options.reason || getRandomMurderReason();
            var killerGotAway = (typeof options.killerGotAway === 'boolean')
                ? options.killerGotAway
                : (typeof window.chance === 'function'
                    ? window.chance(0.3)
                    : Math.random() < 0.3);
            var startVendetta = (typeof options.startVendetta === 'boolean')
                ? options.startVendetta
                : true;
            var locationId = _resolveLocation(options, victim, killer);

            var action = {
                type: C.CRIME_TYPES.MURDER,
                domain: C.LAW_DOMAINS.VIOLENCE,
                details: {
                    victimId: victimId,
                    killerId: killerId,
                    reason: reason,
                    premeditated: !options.accidental,
                    selfDefense: !!options.selfDefense
                }
            };
            var context = {
                locationId: locationId,
                victim: victim,
                killer: killer,
                year: year
            };

            var evaluation = Law.evaluateAction(killerId, action, context);

            var crimeData = {
                type: C.CRIME_TYPES.MURDER,
                perpetratorId: killer.id,
                victimId: victim.id,
                year: year,
                reason: reason,
                locationId: locationId,
                notes: options.notes || null,
                civilViolation: evaluation.civil.length > 0
                    ? _summariseViolation(evaluation.civil[0], 'civil', locationId)
                    : null,
                religiousViolation: evaluation.religious.length > 0
                    ? _summariseViolation(evaluation.religious[0], 'religious', null)
                    : null,
                religionId: killer.religionId || null,
                violatedLaws: evaluation.violations.map(_summariseViolationItem)
            };

            var recordResult = State.recordCrime(crimeData);
            if (!recordResult.success) {
                return _fail('Failed to record crime: ' + recordResult.reason, C.CODES.VALIDATION);
            }
            var crime = recordResult.data;

            if (!killerGotAway) {
                var solveResult = State.solveCrime(crime.id, 'Killer apprehended', year);
                if (!solveResult.success) {
                    State.deleteCrime(crime.id);
                    return _fail('Failed to solve crime: ' + solveResult.reason, C.CODES.VALIDATION);
                }
                crime = solveResult.data;
            }

            // CORRECT SIGNATURE (see DEATH SIGNATURE CONTRACT):
            //   killCharacter(characterId, deathData)
            var killResult = window.killCharacter(victim.id, {
                deathYear: year,
                deathCause: 'murder',
                deathCauseDetail: reason,
                deathNotes: options.notes || '',
                isMurder: true,
                killerId: killer.id,
                murderMotive: options.murderMotive || reason,
                murderMethod: options.murderMethod || 'unknown'
            });

            if (!killResult || killResult.success === false) {
                State.deleteCrime(crime.id);
                return _fail(
                    'Failed to kill victim: ' +
                    (killResult && (killResult.reason || killResult.error)
                        ? (killResult.reason || killResult.error)
                        : 'unknown'),
                    C.CODES.KILL_FAILED
                );
            }

            var consequenceResults = [];
            var executionResult = null;
            if (!killerGotAway && !killer.isDeceased) {
                for (var i = 0; i < evaluation.consequences.length; i++) {
                    var res = _executeConsequence(evaluation.consequences[i], {
                        killer: killer,
                        victim: victim,
                        year: year,
                        locationId: locationId,
                        isForMurder: true,
                        murderReason: reason
                    });
                    consequenceResults.push(res);
                    if (res && res.type === C.CONSEQUENCE_TYPES.EXECUTION && res.applied) {
                        executionResult = res.executionResult;
                    }
                }
            }

            var vendettaResult = null;
            if (startVendetta) {
                var victimHouseholdId = _getHouseholdIdForCharacter(victim);
                var killerHouseholdId = _getHouseholdIdForCharacter(killer);
                if (victimHouseholdId && killerHouseholdId &&
                    victimHouseholdId !== killerHouseholdId) {
                    vendettaResult = createBloodFeud(victimId, killerId, {
                        year: year,
                        notes: options.notes || null,
                        crimeId: crime.id,
                        locationId: locationId
                    });
                }
            }

            var vHouseholdId = _getHouseholdIdForCharacter(victim);
            var kHouseholdId = _getHouseholdIdForCharacter(killer);

            if (vHouseholdId) {
                _applyVictimHouseholdEffects(vHouseholdId, {
                    eventType: 'murder',
                    perpetratorId: killerId,
                    victimId: victimId,
                    year: year,
                    prestigeLoss: 10
                });
            }
            if (kHouseholdId && kHouseholdId !== vHouseholdId) {
                _applyPerpetratorHouseholdEffects(kHouseholdId, {
                    eventType: 'murder',
                    perpetratorId: killerId,
                    victimId: victimId,
                    year: year,
                    prestigeLoss: 15
                });
            }

            if (locationId) {
                _recordSettlementCrimeImpact(locationId, {
                    type: 'murder',
                    victimId: victimId,
                    killerId: killerId,
                    year: year,
                    reason: reason,
                    solved: !killerGotAway,
                    lawViolations: evaluation.violations.length
                });
            }

            _log('murder', 'Murder',
                (victim.name || 'Unknown') + ' was murdered by ' +
                (killer.name || 'Unknown') + ' (' + reason + ')' +
                (killerGotAway ? '. The killer escaped.' : '.') +
                (evaluation.violations.length > 0
                    ? ' Violated ' + evaluation.violations.length + ' law(s).'
                    : ''),
                [victim, killer]);

            _commit(C.EVENTS.CRIME_RECORDED, {
                crimeId: crime.id,
                type: C.CRIME_TYPES.MURDER,
                victimId: victimId,
                killerId: killerId
            });

            return _ok({
                victim: victim,
                killer: killer,
                crime: crime,
                year: year,
                locationId: locationId,
                killerGotAway: killerGotAway,
                legalEvaluation: evaluation,
                consequenceResults: consequenceResults,
                execution: executionResult,
                vendetta: vendettaResult && vendettaResult.success
                    ? vendettaResult.data
                    : null,
                householdUpdates: {
                    victimHouseholdId: vHouseholdId,
                    killerHouseholdId: kHouseholdId
                }
            });

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        }
    }

    // =========================================================================
    // 11. EXECUTION
    // =========================================================================

    function triggerExecution(condemnedId, options) {
        options = _normaliseOptions(options);

        try {
            var condemned = window.getCharacterById(condemnedId);

            if (!condemned) return _fail('Condemned character not found', C.CODES.NOT_FOUND);
            if (condemned.isDeceased) return _fail('Character is already deceased', C.CODES.ALREADY_DECEASED);

            var year = _resolveYear(options);
            var reason = options.reason || 'Unspecified reason';
            var method = options.method || _randomExecutionMethod().name;
            var executionerId = options.executionerId || null;
            var locationId = options.locationId || window.getCurrentLocationId(condemned) || null;

            var action = {
                type: C.CRIME_TYPES.EXECUTION,
                domain: C.LAW_DOMAINS.DEATH,
                details: {
                    condemnedId: condemnedId,
                    reason: reason,
                    method: method
                }
            };
            var context = {
                locationId: locationId,
                condemned: condemned,
                year: year,
                executionerId: executionerId
            };

            var evaluation = executionerId
                ? Law.evaluateAction(executionerId, action, context)
                : {
                    lawful: true,
                    violations: [],
                    civil: [],
                    religious: [],
                    governingLaw: null,
                    consequences: []
                };

            var crimeData = {
                type: C.CRIME_TYPES.EXECUTION,
                perpetratorId: executionerId || 'state',
                victimId: condemned.id,
                year: year,
                reason: reason,
                locationId: locationId,
                method: method,
                notes: options.notes || null,
                metadata: {
                    isForMurder: !!options.isForMurder,
                    victimId: options.victimId || null,
                    murderReason: options.murderReason || null
                },
                civilViolation: evaluation.civil.length > 0
                    ? _summariseViolation(evaluation.civil[0], 'civil', locationId)
                    : null,
                religiousViolation: evaluation.religious.length > 0
                    ? _summariseViolation(evaluation.religious[0], 'religious', null)
                    : null,
                religionId: condemned.religionId || null,
                violatedLaws: evaluation.violations.map(_summariseViolationItem)
            };

            var recordResult = State.recordCrime(crimeData);
            if (!recordResult.success) {
                return _fail('Failed to record execution: ' + recordResult.reason, C.CODES.VALIDATION);
            }
            var crime = recordResult.data;

            var solveResult = State.solveCrime(crime.id, 'Legal execution', year);
            if (!solveResult.success) {
                State.deleteCrime(crime.id);
                return _fail('Failed to solve execution record: ' + solveResult.reason, C.CODES.VALIDATION);
            }
            crime = solveResult.data;

            // CORRECT SIGNATURE (see DEATH SIGNATURE CONTRACT):
            //   killCharacter(characterId, deathData)
            var killResult = window.killCharacter(condemned.id, {
                deathYear: year,
                deathCause: 'execution',
                deathCauseDetail: method,
                deathNotes: options.notes || '',
                isExecution: true,
                executionReason: reason,
                executionMethod: method,
                executionLocation: options.executionLocation || null
            });

            if (!killResult || killResult.success === false) {
                State.deleteCrime(crime.id);
                return _fail(
                    'Failed to kill condemned: ' +
                    (killResult && (killResult.reason || killResult.error)
                        ? (killResult.reason || killResult.error)
                        : 'unknown'),
                    C.CODES.KILL_FAILED
                );
            }

            if (options.endRelationships !== false) {
                try {
                    var relationships = window.getRelationshipsForCharacter(condemned.id);
                    for (var i = 0; i < relationships.length; i++) {
                        var rel = relationships[i];
                        if (rel.status === 'ongoing') {
                            window.endRelationship(
                                rel.id,
                                year,
                                'Execution of ' + (condemned.name || 'Unknown')
                            );
                        }
                    }
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error('crime-commands.js: endRelationship flow threw', e);
                    }
                }
            }

            var householdId = _getHouseholdIdForCharacter(condemned);
            if (householdId) {
                _applyExecutionHouseholdEffects(householdId, {
                    condemnedId: condemnedId,
                    year: year
                });
            }

            if (locationId) {
                _recordSettlementCrimeImpact(locationId, {
                    type: 'execution',
                    condemnedId: condemnedId,
                    year: year,
                    reason: reason,
                    method: method,
                    lawViolations: evaluation.violations.length
                });
            }

            _log('execution', 'Execution',
                (condemned.name || 'Unknown') + ' was executed for ' + reason +
                ' via ' + method + ' in ' + year,
                [condemned]);

            _commit(C.EVENTS.CRIME_RECORDED, {
                crimeId: crime.id,
                type: C.CRIME_TYPES.EXECUTION,
                condemnedId: condemnedId
            });

            return _ok({
                condemned: condemned,
                crime: crime,
                year: year,
                locationId: locationId,
                reason: reason,
                method: method,
                executionerId: executionerId,
                householdId: householdId,
                legalEvaluation: evaluation
            });

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        }
    }

    // =========================================================================
    // 12. VENDETTA ESCALATION
    // =========================================================================

    function escalateVendetta(vendettaId, options) {
        options = _normaliseOptions(options);

        try {
            var vendetta = State._getVendettaCanonical(vendettaId);
            if (!vendetta) return _fail('Vendetta not found', C.CODES.NOT_FOUND);

            var statuses = C.VENDETTA_STATUS;
            if (vendetta.status === statuses.RESOLVED) {
                return _fail('Vendetta is resolved', C.CODES.ALREADY_RESOLVED);
            }
            if (vendetta.status === statuses.ESCALATED) {
                return _ok({ vendetta: vendetta, escalated: false });
            }

            var year = _resolveYear(options);

            if (options.force === true) {
                if (!options.reason) {
                    return _fail('Force escalation requires a reason', C.CODES.VALIDATION);
                }

                var setResult = State._setVendettaStatus(vendettaId, statuses.ESCALATED, {
                    escalatedAt: year,
                    reason: options.reason
                });
                if (!setResult.success) {
                    return _fail(setResult.reason, setResult.code || C.CODES.ESCALATION_FAILED);
                }

                _log('vendetta', 'Vendetta Escalated (forced)',
                    'Vendetta ' + vendettaId + ' escalated by force: ' + options.reason,
                    []);

                _commit(C.EVENTS.VENDETTA_ESCALATED, {
                    vendettaId: vendettaId,
                    forced: true,
                    reason: options.reason
                });

                return _ok({ vendetta: setResult.data, escalated: true });
            }

            var threshold = C.VENDETTA_ESCALATION_THRESHOLD;
            var deathCount = Array.isArray(vendetta.deaths) ? vendetta.deaths.length : 0;
            if (deathCount < threshold) {
                return _fail(
                    'Vendetta has not reached the escalation threshold (' +
                    deathCount + '/' + threshold + ' deaths); use force: true with a reason to override',
                    C.CODES.ESCALATION_FAILED
                );
            }

            var retryResult = State._setVendettaStatus(vendettaId, statuses.ESCALATED, {
                escalatedAt: year,
                reason: 'Automatic escalation retry'
            });
            if (!retryResult.success) {
                return _fail(retryResult.reason, retryResult.code || C.CODES.ESCALATION_FAILED);
            }

            _log('vendetta', 'Vendetta Escalated',
                'Vendetta ' + vendettaId + ' escalated after reaching ' + threshold + ' deaths',
                []);

            _commit(C.EVENTS.VENDETTA_ESCALATED, {
                vendettaId: vendettaId,
                forced: false
            });

            return _ok({ vendetta: retryResult.data, escalated: true });

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        }
    }

    // =========================================================================
    // 13. BLOOD FEUD CREATION
    // =========================================================================

    function createBloodFeud(victimId, killerId, options) {
        options = _normaliseOptions(options);

        try {
            var victim = window.getCharacterById(victimId);
            var killer = window.getCharacterById(killerId);
            if (!victim || !killer) {
                return _fail('Victim or killer not found', C.CODES.NOT_FOUND);
            }

            var victimHouseholdId = _getHouseholdIdForCharacter(victim);
            var killerHouseholdId = _getHouseholdIdForCharacter(killer);

            if (!victimHouseholdId || !killerHouseholdId) {
                return _fail('One or both households not found', C.CODES.NO_HOUSEHOLD);
            }
            if (victimHouseholdId === killerHouseholdId) {
                return _fail(
                    'Cannot create a vendetta within a single household',
                    C.CODES.SAME_HOUSEHOLD
                );
            }

            var year = _resolveYear(options);
            var cause = options.cause ||
                ('Blood feud from murder of ' + (victim.name || 'Unknown') +
                 ' by ' + (killer.name || 'Unknown'));

            var existing = State.getActiveVendettaBetween(victimHouseholdId, killerHouseholdId);
            if (existing) {
                var deathResult = State.recordVendettaDeath(existing.id, {
                    victimId: victimId,
                    killerId: killerId,
                    year: year,
                    reason: cause,
                    crimeId: options.crimeId || null
                });
                if (!deathResult.success) {
                    return _fail(deathResult.reason, deathResult.code);
                }
                _commit(C.EVENTS.VENDETTA_DEATH, {
                    vendettaId: existing.id,
                    victimId: victimId,
                    killerId: killerId
                });
                return _ok(deathResult.data);
            }

            var vendettaResult = State.createVendetta({
                householdAId: victimHouseholdId,
                householdBId: killerHouseholdId,
                characterAId: victimId,
                characterBId: killerId,
                cause: cause,
                year: year,
                originCrimeId: options.crimeId || null,
                notes: options.notes || 'Blood feud initiated from murder'
            });

            if (!vendettaResult.success) {
                return _fail(vendettaResult.reason, vendettaResult.code);
            }

            var firstDeath = State.recordVendettaDeath(vendettaResult.data.id, {
                victimId: victimId,
                killerId: killerId,
                year: year,
                reason: cause,
                crimeId: options.crimeId || null
            });

            if (!firstDeath.success) {
                return _fail(firstDeath.reason, firstDeath.code);
            }

            _log('vendetta', 'Blood Feud Created',
                'Blood feud created over the murder of ' +
                (victim.name || 'Unknown'),
                [victim, killer]);

            _commit(C.EVENTS.VENDETTA_CREATED, {
                vendettaId: vendettaResult.data.id,
                victimId: victimId,
                killerId: killerId
            });

            return _ok(firstDeath.data);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        }
    }

    // =========================================================================
    // 14. VIOLATION SUMMARISATION
    // =========================================================================

    function _summariseViolationItem(violation) {
        return {
            source: violation.source,
            lawId: violation.law ? violation.law.id : null,
            lawName: violation.law ? violation.law.name : null,
            sourceId: violation.sourceId || null,
            sourceName: violation.sourceName || null
        };
    }

    function _summariseViolation(violation, source, locationId) {
        var law = violation.law || {};
        var mapping = law.crimeMapping || {};
        return {
            lawId: law.id || null,
            lawName: law.name || null,
            locationId: locationId || null,
            severity: mapping.crimeSeverity || law.severity || null,
            punishment: mapping.punishment || mapping.consequence || null,
            sourceId: violation.sourceId || null,
            sourceName: violation.sourceName || null
        };
    }

    // =========================================================================
    // 15. RANDOM HELPERS
    // =========================================================================

    function getRandomMurderReason(category) {
        var reasons = C.MURDER_REASONS || {};
        if (category && reasons[category]) {
            var picked = (typeof window.pickRandom === 'function')
                ? window.pickRandom(reasons[category])
                : null;
            return picked || 'Unspecified';
        }
        var all = [];
        for (var key in reasons) {
            if (Object.prototype.hasOwnProperty.call(reasons, key)) {
                all = all.concat(reasons[key]);
            }
        }
        var picked2 = (typeof window.pickRandom === 'function')
            ? window.pickRandom(all)
            : null;
        return picked2 || 'Unspecified';
    }

    function _randomExecutionMethod() {
        var methods = C.EXECUTION_METHODS || {};
        var array = [];
        for (var key in methods) {
            if (Object.prototype.hasOwnProperty.call(methods, key)) {
                array.push(methods[key]);
            }
        }
        var picked = (typeof window.pickRandom === 'function')
            ? window.pickRandom(array)
            : null;
        return picked || { id: 'unknown', name: 'Unknown' };
    }

    function getRandomExecutionMethod() {
        return _randomExecutionMethod();
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.CrimeCommands = {
        // Workflows
        recordCrime: recordCrime,
        triggerMurder: triggerMurder,
        triggerExecution: triggerExecution,
        escalateVendetta: escalateVendetta,
        createBloodFeud: createBloodFeud,

        // Persistence
        persist: persist,

        // Helpers
        getRandomMurderReason: getRandomMurderReason,
        getRandomExecutionMethod: getRandomExecutionMethod
    };

    window._crimeCommands = window.CrimeCommands;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeCommands;
    }

})();
