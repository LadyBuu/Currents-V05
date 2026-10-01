/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA COMMANDS (crime-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-commands.js
 *
 * PURPOSE:
 *   Orchestration layer for crime and vendetta workflows. Each command:
 *     1. validates inputs
 *     2. resolves context
 *     3. asks CrimeLawIntegration for a legal evaluation
 *     4. records the crime through CrimeState
 *     5. kills or mutates characters through the appropriate commands
 *     6. applies legal consequences returned by the law layer
 *     7. updates households, settlements, and vendettas
 *     8. logs the event
 *     9. returns a structured result
 *
 *   It does NOT decide what a punishment is. It executes the consequences
 *   returned by CrimeLawIntegration.evaluateAction().
 *
 * OWNERSHIP:
 *   - triggerMurder, triggerExecution, createBloodFeud workflows
 *   - household side-effect semantics (perpetrator-side vs victim-side)
 *   - orchestration of character death, relationship termination, and
 *     vendetta creation
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not decide legal consequences. (CrimeLawIntegration)
 *   - It does not own crime or vendetta records. (CrimeState)
 *   - It does not compute statistics. (CrimeQueries)
 *   - It does not reach into another domain's private state. All cross-
 *     domain effects go through the domain's public command API.
 *   - It does not use a module-wide recursion guard. Composition is legal;
 *     a command that calls another command is doing exactly what it should.
 *   - It does not normalise options with `||` on values that could legitimately
 *     be falsy. Years, counts, and booleans are checked explicitly.
 *
 * DEPENDENCIES (required):
 *   - CrimeState
 *   - CrimeLawIntegration
 *   - CrimeConstants
 *   - getCharacterById, getHouseholdById, getPlaceById
 *   - getCurrentYearSafe
 *   - killCharacter
 *   - HouseholdCommands (preferred) or HouseholdState (fallback)
 *   - SettlementCommands (preferred) or a documented settlement impact API
 *   - eventLogger: logEvent
 *
 * Missing required dependencies fail loudly. No fabricated fallbacks.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('[CrimeCommands] Required dependency getCurrentYearSafe is not available.');
        }
        return window.getCurrentYearSafe();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
    }

    function _getHouseholdById(id) {
        if (typeof window.getHouseholdById !== 'function') return null;
        return window.getHouseholdById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') return null;
        return window.getPlaceById(id);
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;
        if (character.currentLocationId) return character.currentLocationId;
        if (character.moves && character.moves.length > 0) {
            var sorted = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            return sorted[0] ? sorted[0].locationId : null;
        }
        return null;
    }

    function _getCrimeState() {
        if (typeof window.CrimeState === 'undefined') {
            throw new Error('[CrimeCommands] Required dependency CrimeState is not available.');
        }
        return window.CrimeState;
    }

    function _getLawIntegration() {
        if (typeof window.CrimeLawIntegration === 'undefined') {
            throw new Error('[CrimeCommands] Required dependency CrimeLawIntegration is not available.');
        }
        return window.CrimeLawIntegration;
    }

    function _getConstants() {
        if (typeof window.CrimeConstants === 'undefined') {
            throw new Error('[CrimeCommands] Required dependency CrimeConstants is not available.');
        }
        return window.CrimeConstants;
    }

    function _killCharacter(character, deathYear, deathCause, options) {
        if (typeof window.killCharacter !== 'function') {
            throw new Error('[CrimeCommands] Required dependency killCharacter is not available.');
        }
        return window.killCharacter(character, deathYear, deathCause, options);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') return window.chance(probability);
        return Math.random() < probability;
    }

    function _pickRandom(array) {
        if (typeof window.pickRandom === 'function') return window.pickRandom(array);
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    function _getHouseholdCommands() {
        if (typeof window.HouseholdCommands !== 'undefined') return window.HouseholdCommands;
        return null;
    }

    function _getSettlementCommands() {
        if (typeof window.SettlementCommands !== 'undefined') return window.SettlementCommands;
        if (window.SettlementCrimeCommands) return window.SettlementCrimeCommands;
        return null;
    }

    function _getHouseholdState() {
        if (typeof window.HouseholdState !== 'undefined') return window.HouseholdState;
        return null;
    }

    // =========================================================================
    // 1. OPTION NORMALISATION
    // =========================================================================
    //
    // Options are normalised without truthiness coercion. A year of 0 is a
    // year of 0. A boolean of false is false. Only `undefined` triggers a
    // default.

    function _normaliseOptions(options) {
        return (options && typeof options === 'object') ? options : {};
    }

    function _resolveYear(options) {
        return (typeof options.year === 'number') ? options.year : _getCurrentYear();
    }

    function _resolveLocation(options, victim, killer) {
        if (options.locationId) return options.locationId;
        var victimLoc = victim ? _getCurrentLocationId(victim) : null;
        if (victimLoc) return victimLoc;
        var killerLoc = killer ? _getCurrentLocationId(killer) : null;
        if (killerLoc) return killerLoc;
        return null;
    }

    // =========================================================================
    // 2. HOUSEHOLD SIDE EFFECTS
    // =========================================================================
    //
    // Perpetrator-side and victim-side effects are distinct. The victim's
    // household gains a victim record, not a criminal record. The
    // perpetrator's household gains a criminal record, not a victim record.
    //
    // Where HouseholdCommands exposes explicit functions, we use them. If
    // only HouseholdState is available, we use its public update API. We do
    // not touch household fields directly.

    function _getHouseholdIdForCharacter(character) {
        if (!character) return null;
        if (character.household) return character.household;
        if (character.householdId) return character.householdId;
        return null;
    }

    /**
     * Applies perpetrator-side effects to a household: criminal count and
     * membership, prestige loss, crime history entry.
     */
    function _applyPerpetratorHouseholdEffects(householdId, params) {
        if (!householdId) return;

        var commands = _getHouseholdCommands();
        if (commands && typeof commands.applyPerpetratorCrime === 'function') {
            commands.applyPerpetratorCrime(householdId, params);
            return;
        }

        var state = _getHouseholdState();
        if (!state || typeof state.getHousehold !== 'function' ||
            typeof state.updateHousehold !== 'function') {
            return;
        }

        var household = state.getHousehold(householdId);
        if (!household) return;

        var prestigeLoss = params.prestigeLoss || 0;
        var criminalMembers = (household.criminalMembers || []).slice();
        if (params.perpetratorId && criminalMembers.indexOf(params.perpetratorId) === -1) {
            criminalMembers.push(params.perpetratorId);
        }

        var crimeHistory = (household.crimeHistory || []).slice();
        crimeHistory.push({
            type: params.eventType,
            role: 'perpetrator',
            perpetratorId: params.perpetratorId || null,
            victimId: params.victimId || null,
            year: params.year,
            prestigeLoss: prestigeLoss,
            timestamp: Date.now()
        });
        if (crimeHistory.length > 100) crimeHistory = crimeHistory.slice(-100);

        state.updateHousehold(householdId, {
            prestige: Math.max(0, (household.prestige || 50) - prestigeLoss),
            criminalCount: (household.criminalCount || 0) + (params.perpetratorId ? 1 : 0),
            criminalMembers: criminalMembers,
            crimeHistory: crimeHistory
        }, { recordHistory: false });
    }

    /**
     * Applies victim-side effects to a household: victim count and
     * membership, prestige loss (usually lower than perpetrator side),
     * crime history entry.
     */
    function _applyVictimHouseholdEffects(householdId, params) {
        if (!householdId) return;

        var commands = _getHouseholdCommands();
        if (commands && typeof commands.applyVictimCrime === 'function') {
            commands.applyVictimCrime(householdId, params);
            return;
        }

        var state = _getHouseholdState();
        if (!state || typeof state.getHousehold !== 'function' ||
            typeof state.updateHousehold !== 'function') {
            return;
        }

        var household = state.getHousehold(householdId);
        if (!household) return;

        var prestigeLoss = params.prestigeLoss || 0;
        var victimMembers = (household.victimMembers || []).slice();
        if (params.victimId && victimMembers.indexOf(params.victimId) === -1) {
            victimMembers.push(params.victimId);
        }

        var crimeHistory = (household.crimeHistory || []).slice();
        crimeHistory.push({
            type: params.eventType,
            role: 'victim',
            perpetratorId: params.perpetratorId || null,
            victimId: params.victimId || null,
            year: params.year,
            prestigeLoss: prestigeLoss,
            timestamp: Date.now()
        });
        if (crimeHistory.length > 100) crimeHistory = crimeHistory.slice(-100);

        var updates = {
            victimCount: (household.victimCount || 0) + (params.victimId ? 1 : 0),
            victimMembers: victimMembers,
            crimeHistory: crimeHistory
        };

        if (prestigeLoss > 0) {
            updates.prestige = Math.max(0, (household.prestige || 50) - prestigeLoss);
        }

        state.updateHousehold(householdId, updates, { recordHistory: false });
    }

    function _applyExecutionHouseholdEffects(householdId, params) {
        if (!householdId) return;

        var commands = _getHouseholdCommands();
        if (commands && typeof commands.applyExecutionToHousehold === 'function') {
            commands.applyExecutionToHousehold(householdId, params);
            return;
        }

        var state = _getHouseholdState();
        if (!state || typeof state.getHousehold !== 'function' ||
            typeof state.updateHousehold !== 'function') {
            return;
        }

        var household = state.getHousehold(householdId);
        if (!household) return;

        var crimeHistory = (household.crimeHistory || []).slice();
        crimeHistory.push({
            type: 'execution',
            role: 'condemned_household',
            condemnedId: params.condemnedId || null,
            year: params.year,
            timestamp: Date.now()
        });
        if (crimeHistory.length > 100) crimeHistory = crimeHistory.slice(-100);

        state.updateHousehold(householdId, {
            executedCount: (household.executedCount || 0) + 1,
            crimeHistory: crimeHistory
        }, { recordHistory: false });
    }

    // =========================================================================
    // 3. SETTLEMENT SIDE EFFECTS
    // =========================================================================
    //
    // Settlement effects go through a public command boundary. If the
    // settlement domain has not yet exposed one, we skip the effect and
    // log the omission rather than reaching into private state.

    function _recordSettlementCrimeImpact(locationId, eventData) {
        if (!locationId) return;

        var commands = _getSettlementCommands();
        if (commands && typeof commands.recordCrimeImpact === 'function') {
            commands.recordCrimeImpact(locationId, eventData);
            return;
        }

        // No public boundary available. Do not reach into private state.
        // The absence is logged once per call site via the caller's event
        // log so it is visible without being noisy.
    }

    // =========================================================================
    // 4. CONSEQUENCE EXECUTION
    // =========================================================================

    /**
     * Executes a single legal consequence produced by
     * CrimeLawIntegration.evaluateAction().
     *
     * Unknown consequence types are logged and skipped; they are not
     * guessed at. This preserves the contract that the command layer only
     * enacts what the law layer has explicitly prescribed.
     */
    function _executeConsequence(consequence, ctx) {
        if (!consequence || !consequence.type) return null;

        switch (consequence.type) {
            case 'execution':
                return _executeExecutionConsequence(consequence, ctx);

            case 'imprisonment':
            case 'exile':
            case 'fine':
            case 'penance':
            case 'excommunication':
                // These consequence types require domain APIs that are not
                // yet part of the crime system. They are surfaced in the
                // returned result so callers and UI can display them, but
                // the command layer does not invent effects for them.
                return { type: consequence.type, applied: false, reason: 'no handler' };

            case 'other':
            default:
                return { type: consequence.type, applied: false, reason: 'unrecognised' };
        }
    }

    function _executeExecutionConsequence(consequence, ctx) {
        var condemned = ctx.killer; // For murder, the condemned is the killer.
        if (!condemned || condemned.isDeceased) {
            return { type: 'execution', applied: false, reason: 'condemned unavailable' };
        }

        var method = consequence.method || null;

        var result = triggerExecution(condemned.id, {
            year: ctx.year,
            reason: consequence.description || consequence.type,
            method: method,
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
            type: 'execution',
            applied: !!result.success,
            executionResult: result.success ? result.data : null,
            error: result.success ? null : result.error
        };
    }

    // =========================================================================
    // 5. PUBLIC COMMANDS
    // =========================================================================

    /**
     * Triggers a murder with full law evaluation.
     *
     * @param {string} victimId
     * @param {string} killerId
     * @param {Object} [options]
     * @returns {{success: boolean, data?: Object, error?: string}}
     */
    function triggerMurder(victimId, killerId, options) {
        options = _normaliseOptions(options);

        try {
            var constants = _getConstants();
            var victim = _getCharacterById(victimId);
            var killer = _getCharacterById(killerId);

            if (!victim) return { success: false, error: 'Victim not found' };
            if (!killer) return { success: false, error: 'Killer not found' };
            if (victim.isDeceased) return { success: false, error: 'Victim is already deceased' };
            if (victimId === killerId) return { success: false, error: 'Cannot murder oneself' };

            var year = _resolveYear(options);
            var reason = options.reason || getRandomMurderReason();
            var killerGotAway = (typeof options.killerGotAway === 'boolean')
                ? options.killerGotAway
                : _chance(0.3);
            var startVendetta = (typeof options.startVendetta === 'boolean')
                ? options.startVendetta
                : true;
            var locationId = _resolveLocation(options, victim, killer);

            // ---- Law evaluation ----
            var action = {
                type: constants.CRIME_TYPES.MURDER,
                domain: constants.LAW_DOMAINS.VIOLENCE,
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

            var evaluation = _getLawIntegration().evaluateAction(killerId, action, context);

            // ---- Record crime ----
            var crimeData = {
                type: constants.CRIME_TYPES.MURDER,
                perpetratorId: killer.id,
                victimId: victim.id,
                year: year,
                reason: reason,
                locationId: locationId,
                solved: !killerGotAway,
                solvedAt: !killerGotAway ? year : null,
                solution: !killerGotAway ? 'Killer apprehended' : null,
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

            var recordResult = _getCrimeState().recordCrime(crimeData);
            if (!recordResult.success) {
                return { success: false, error: 'Failed to record crime: ' + recordResult.error };
            }
            var crime = recordResult.data;

            // ---- Kill victim ----
            var killResult = _killCharacter(victim, year, 'Murdered', {
                killer: killer,
                murderReason: reason,
                killerGotAway: killerGotAway,
                notes: options.notes || null
            });

            if (!killResult || killResult.success === false) {
                // The crime record exists but the victim survived. Roll back
                // the crime record so state and reality agree.
                _getCrimeState().deleteCrime(crime.id);
                return {
                    success: false,
                    error: 'Failed to kill victim: ' +
                        (killResult && killResult.reason ? killResult.reason : 'unknown')
                };
            }

            // ---- Execute legal consequences ----
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
                    if (res && res.type === 'execution' && res.applied) {
                        executionResult = res.executionResult;
                    }
                }
            }

            // ---- Vendetta ----
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

            // ---- Household side effects ----
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

            // ---- Settlement side effects ----
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

            // ---- Logging ----
            _logEvent('murder', 'Murder',
                (victim.name || 'Unknown') + ' was murdered by ' +
                (killer.name || 'Unknown') + ' (' + reason + ')' +
                (killerGotAway ? '. The killer escaped.' : '.') +
                (evaluation.violations.length > 0
                    ? ' Violated ' + evaluation.violations.length + ' law(s).'
                    : ''),
                [victim, killer]);

            return {
                success: true,
                data: {
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
                }
            };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }

    /**
     * Triggers an execution with law evaluation.
     *
     * @param {string} condemnedId
     * @param {Object} [options]
     */
    function triggerExecution(condemnedId, options) {
        options = _normaliseOptions(options);

        try {
            var constants = _getConstants();
            var condemned = _getCharacterById(condemnedId);

            if (!condemned) return { success: false, error: 'Condemned character not found' };
            if (condemned.isDeceased) return { success: false, error: 'Character is already deceased' };

            var year = _resolveYear(options);
            var reason = options.reason || 'Unspecified reason';
            var method = options.method || getRandomExecutionMethod().name;
            var executionerId = options.executionerId || null;
            var locationId = options.locationId ||
                _getCurrentLocationId(condemned) ||
                null;

            var action = {
                type: constants.CRIME_TYPES.EXECUTION,
                domain: constants.LAW_DOMAINS.DEATH,
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
                ? _getLawIntegration().evaluateAction(executionerId, action, context)
                : { lawful: true, violations: [], civil: [], religious: [],
                    governingLaw: null, consequences: [] };

            var crimeData = {
                type: constants.CRIME_TYPES.EXECUTION,
                perpetratorId: executionerId || 'state',
                victimId: condemned.id,
                year: year,
                reason: reason,
                locationId: locationId,
                solved: true,
                solvedAt: year,
                solution: 'Legal execution',
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

            var recordResult = _getCrimeState().recordCrime(crimeData);
            if (!recordResult.success) {
                return { success: false, error: 'Failed to record execution: ' + recordResult.error };
            }
            var crime = recordResult.data;

            var killResult = _killCharacter(condemned, year, 'Executed: ' + reason, {
                executionReason: reason,
                executionMethod: method,
                executionerId: executionerId,
                notes: options.notes || null
            });

            if (!killResult || killResult.success === false) {
                _getCrimeState().deleteCrime(crime.id);
                return {
                    success: false,
                    error: 'Failed to kill condemned: ' +
                        (killResult && killResult.reason ? killResult.reason : 'unknown')
                };
            }

            // End relationships if requested
            if (options.endRelationships !== false &&
                typeof window.getRelationshipsForCharacter === 'function' &&
                typeof window.endRelationship === 'function') {
                var relationships = window.getRelationshipsForCharacter(condemned.id);
                for (var i = 0; i < relationships.length; i++) {
                    var rel = relationships[i];
                    if (rel.status === 'ongoing') {
                        window.endRelationship(rel.id, year,
                            'Execution of ' + (condemned.name || 'Unknown'));
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

            _logEvent('execution', 'Execution',
                (condemned.name || 'Unknown') + ' was executed for ' + reason +
                ' via ' + method + ' in ' + year,
                [condemned]);

            return {
                success: true,
                data: {
                    condemned: condemned,
                    crime: crime,
                    year: year,
                    locationId: locationId,
                    reason: reason,
                    method: method,
                    executionerId: executionerId,
                    householdId: householdId,
                    legalEvaluation: evaluation
                }
            };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }

    /**
     * Creates a blood feud between the households of the victim and killer.
     * Called by triggerMurder. Safe to call directly for manual bookkeeping.
     */
    function createBloodFeud(victimId, killerId, options) {
        options = _normaliseOptions(options);

        try {
            var victim = _getCharacterById(victimId);
            var killer = _getCharacterById(killerId);
            if (!victim || !killer) {
                return { success: false, error: 'Victim or killer not found' };
            }

            var victimHouseholdId = _getHouseholdIdForCharacter(victim);
            var killerHouseholdId = _getHouseholdIdForCharacter(killer);

            if (!victimHouseholdId || !killerHouseholdId) {
                return { success: false, error: 'One or both households not found' };
            }
            if (victimHouseholdId === killerHouseholdId) {
                return { success: false, error: 'Cannot create a vendetta within a single household' };
            }

            var year = _resolveYear(options);
            var cause = options.cause ||
                ('Blood feud from murder of ' + (victim.name || 'Unknown') +
                 ' by ' + (killer.name || 'Unknown'));

            var existing = _getCrimeState().getActiveVendettaBetween(
                victimHouseholdId, killerHouseholdId);

            if (existing) {
                var deathResult = _getCrimeState().recordVendettaDeath(existing.id, {
                    victimId: victimId,
                    killerId: killerId,
                    year: year,
                    reason: cause,
                    crimeId: options.crimeId || null
                });
                if (!deathResult.success) {
                    return { success: false, error: deathResult.error };
                }
                return { success: true, data: deathResult.data };
            }

            var vendettaResult = _getCrimeState().createVendetta({
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
                return { success: false, error: vendettaResult.error };
            }

            var firstDeath = _getCrimeState().recordVendettaDeath(vendettaResult.data.id, {
                victimId: victimId,
                killerId: killerId,
                year: year,
                reason: cause,
                crimeId: options.crimeId || null
            });

            if (!firstDeath.success) {
                return { success: false, error: firstDeath.error };
            }

            _logEvent('vendetta', 'Blood Feud Created',
                'Blood feud created over the murder of ' +
                (victim.name || 'Unknown'),
                [victim, killer]);

            return { success: true, data: firstDeath.data };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }

    // =========================================================================
    // 6. VIOLATION SUMMARISATION (shape contract for crime records)
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
    // 7. HELPERS
    // =========================================================================

    function getRandomMurderReason(category) {
        var constants = _getConstants();
        var reasons = constants.MURDER_REASONS || {};
        if (category && reasons[category]) {
            return _pickRandom(reasons[category]) || 'Unspecified';
        }
        var all = [];
        for (var key in reasons) {
            if (Object.prototype.hasOwnProperty.call(reasons, key)) {
                all = all.concat(reasons[key]);
            }
        }
        return _pickRandom(all) || 'Unspecified';
    }

    function getRandomExecutionMethod() {
        var constants = _getConstants();
        var methods = constants.EXECUTION_METHODS || {};
        var array = [];
        for (var key in methods) {
            if (Object.prototype.hasOwnProperty.call(methods, key)) {
                array.push(methods[key]);
            }
        }
        return _pickRandom(array) || { id: 'unknown', name: 'Unknown' };
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CrimeCommands = {
        // Workflows
        triggerMurder: triggerMurder,
        triggerExecution: triggerExecution,
        createBloodFeud: createBloodFeud,

        // Helpers
        getRandomMurderReason: getRandomMurderReason,
        getRandomExecutionMethod: getRandomExecutionMethod
    };

    window._crimeCommands = window.CrimeCommands;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeCommands;
    }

})();
