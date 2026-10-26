/**
 * =============================================================================
 * STILL WATERS - CRIME COMMANDS (crime-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-commands.js
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
 * RESULT CONTRACT:
 *   { success: true, data: {...} }
 *   { success: false, reason: string, code?: string }
 *
 * COMMIT TAIL (_commit):
 *   1. CrimeState.hydrateFromMasterData()   — rebuild indexes over mutations
 *   2. markDataDirty()                      — flag for the next save
 *   3. CrimeState.publish()                 — in-process subscribers
 *   4. dispatchEvent(CustomEvent)           — cross-domain consumers
 *
 *   No saveMasterData inside a command. Persistence is CrimeCommands.persist(),
 *   called by the UI once per modal action.
 *
 * OWNERSHIP:
 *   - triggerMurder, triggerExecution, escalateVendetta, createBloodFeud
 *   - orchestration of character death, relationship termination, vendetta
 *     creation, and household side effects
 *   - the persist boundary
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not decide legal consequences. (CrimeLawIntegration)
 *   - It does not own crime or vendetta records. (CrimeState)
 *   - It does not compute statistics. (CrimeQueries)
 *   - It does not reach into another domain's private state. All cross-
 *     domain effects go through that domain's public command API.
 *   - It does not use a module-wide recursion guard. Commands compose freely.
 *   - It does not unwrap results into bare objects. Everything structured.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants, CrimeState, CrimeLawIntegration
 *   - getCurrentYearSafe, generateId, killCharacter, logEvent
 *   - getCharacterById, getHouseholdById, getCurrentLocationId
 *   - getRelationshipsForCharacter, endRelationship
 *   - HouseholdCommands (applyPerpetratorCrime, applyVictimCrime,
 *                       applyExecutionToHousehold)
 *   - SettlementGovernmentCommands.recordCrimeImpact (optional; absence
 *     warns once and skips settlement effects)
 *
 * ICON POLICY: No emojis. No icons.
 *
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

    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('crime-commands.js requires getCurrentYearSafe');
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

    // HouseholdCommands.apply* are hard requirements under the refactor.
    // If these are missing, the load fails. The bootstrap verifies the
    // same surface, but this local check ensures the module is unusable
    // if loaded without them, regardless of whether bootstrap ran.
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

    // SettlementGovernmentCommands.recordCrimeImpact is optional. Warn once
    // on first use if it's absent so the skipped side effect is visible.
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

    function _now() { return window.getCurrentYearSafe(); }
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
    // Note: this is the transaction boundary. It does NOT save. Callers
    // that need persistence call CrimeCommands.persist() once after the
    // command returns.

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

    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return _fail('saveMasterData unavailable', C.CODES.PERSIST_FAILED);
        }
        try {
            window.saveMasterData();
            return _ok(null);
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
    //
    // Every household effect goes through HouseholdCommands. No fallback to
    // HouseholdState. If HouseholdCommands is missing, the load failed
    // earlier and this code never runs.

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
    //
    // Executes a single legal consequence produced by
    // CrimeLawIntegration.evaluateAction().
    //
    // Unknown consequence types are returned as { applied: false } and
    // surfaced to the caller. They are not guessed at.

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
    // 9. PUBLIC COMMANDS
    // =========================================================================

    /**
     * Triggers a murder with full law evaluation.
     *
     * @param {string} victimId
     * @param {string} killerId
     * @param {Object} [options]
     * @returns {{success: true, data: Object}|{success: false, reason: string, code?: string}}
     */
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

            // ---- Law evaluation -----------------------------------------
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

            // ---- Record crime (unsolved) --------------------------------
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

            // ---- Solve if the killer was apprehended -------------------
            if (!killerGotAway) {
                var solveResult = State.solveCrime(crime.id, 'Killer apprehended', year);
                if (!solveResult.success) {
                    State.deleteCrime(crime.id);
                    return _fail('Failed to solve crime: ' + solveResult.reason, C.CODES.VALIDATION);
                }
                crime = solveResult.data;
            }

            // ---- Kill victim -------------------------------------------
            var killResult = window.killCharacter(victim, year, 'Murdered', {
                killer: killer,
                murderReason: reason,
                killerGotAway: killerGotAway,
                notes: options.notes || null
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

            // ---- Execute legal consequences ----------------------------
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

            // ---- Vendetta ----------------------------------------------
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

            // ---- Household side effects --------------------------------
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

            // ---- Settlement side effects -------------------------------
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

            // ---- Logging + commit --------------------------------------
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

    /**
     * Triggers an execution with law evaluation. Records the crime unsolved,
     * solves it immediately (the outcome is legally determined), then kills
     * the condemned.
     */
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

            // ---- Law evaluation -----------------------------------------
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

            // ---- Record crime (unsolved) --------------------------------
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

            // ---- Solve immediately -------------------------------------
            var solveResult = State.solveCrime(crime.id, 'Legal execution', year);
            if (!solveResult.success) {
                State.deleteCrime(crime.id);
                return _fail('Failed to solve execution record: ' + solveResult.reason, C.CODES.VALIDATION);
            }
            crime = solveResult.data;

            // ---- Kill condemned ----------------------------------------
            var killResult = window.killCharacter(condemned, year, 'Executed: ' + reason, {
                executionReason: reason,
                executionMethod: method,
                executionerId: executionerId,
                notes: options.notes || null
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

            // ---- End relationships -------------------------------------
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

            // ---- Household side effects --------------------------------
            var householdId = _getHouseholdIdForCharacter(condemned);
            if (householdId) {
                _applyExecutionHouseholdEffects(householdId, {
                    condemnedId: condemnedId,
                    year: year
                });
            }

            // ---- Settlement side effects -------------------------------
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

    /**
     * Explicitly escalates a vendetta. Escalation normally happens
     * automatically inside recordVendettaDeath when the death count reaches
     * C.VENDETTA_ESCALATION_THRESHOLD. This command is the explicit override:
     *
     *   - Without options.force, it succeeds only if the vendetta has already
     *     reached the threshold. This is a retry path for automatic escalation
     *     that somehow didn't fire.
     *   - With options.force === true and options.reason, it escalates
     *     regardless of the death count. Requires a reason for audit trail.
     *
     * Returns { success: true, data: { vendetta, escalated } } where
     * `escalated` is true if this call transitioned the vendetta from ACTIVE
     * to ESCALATED, false if it was already ESCALATED.
     *
     * @param {string} vendettaId
     * @param {Object} [options]  { force, reason, year }
     */
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

            // Non-force path: retry automatic escalation if the vendetta
            // has reached the threshold but is still ACTIVE.
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

    /**
     * Creates a blood feud between the households of the victim and killer.
     * Called by triggerMurder. Safe to call directly for manual bookkeeping.
     */
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

            // Existing vendetta? Record the death on the existing one.
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

            // New vendetta.
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

            // First death on the new vendetta.
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
    // 10. VIOLATION SUMMARISATION (shape contract for crime records)
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
    // 11. HELPERS
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
    // 12. EXPORTS
    // =========================================================================

    window.CrimeCommands = {
        // Workflows
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
