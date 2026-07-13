/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA COMMANDS (crime-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-commands.js
 * 
 * UPDATED: Integrated with Household system
 * UPDATED: Added dynamic law checking via CrimeLawIntegration
 * UPDATED: Removed hardcoded execution reasons (now from laws)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getHouseholdById(id) {
        if (typeof window.getHouseholdById === 'function') {
            return window.getHouseholdById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;
        if (character.currentLocationId) return character.currentLocationId;
        if (character.moves && character.moves.length > 0) {
            var sorted = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            return sorted[0]?.locationId || null;
        }
        return null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _pickRandom(array) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(array);
        }
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    function _killCharacter(character, deathYear, deathCause, options) {
        if (typeof window.killCharacter === 'function') {
            return window.killCharacter(character, deathYear, deathCause, options);
        }
        if (!character || character.isDeceased) {
            return { success: false, reason: 'Character already deceased' };
        }
        character.isDeceased = true;
        character.deathYear = deathYear;
        character.deathCause = deathCause;
        if (options && options.notes) character.deathNotes = options.notes;
        if (options && options.killer) character.killedBy = options.killer.id;
        if (options && options.murderReason) character.murderReason = options.murderReason;
        if (options && options.executionReason) character.executionReason = options.executionReason;
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
        return { success: true };
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getCrimeTypes() {
        return window.CRIME_TYPES || {
            MURDER: 'murder',
            EXECUTION: 'execution',
            THEFT: 'theft',
            ADULTERY: 'adultery',
            TREASON: 'treason'
        };
    }

    function _getMurderReasons() {
        return window.MURDER_REASONS || {
            political: ['Political rivalry', 'Treason', 'Succession dispute'],
            personal: ['Personal vendetta', 'Jealousy', 'Revenge'],
            criminal: ['Robbery gone wrong', 'Contract killing', 'Gang violence'],
            accidental: ['Self-defense gone wrong', 'Accidental killing', 'Mistaken identity'],
            affair: ['Crime of passion', 'Spouse discovered affair'],
            conflict: ['Escalated from argument', 'Escalated from dispute'],
            other: ['Madness or insanity', 'Fear of exposure', 'Unknown']
        };
    }

    function _getExecutionMethods() {
        return window.EXECUTION_METHODS || {
            beheading: { id: 'beheading', name: 'Beheading' },
            hanging: { id: 'hanging', name: 'Hanging' },
            burning: { id: 'burning', name: 'Burning at the Stake' }
        };
    }

    // =========================================================================
    // 2. LAW INTEGRATION (NEW)
    // =========================================================================

    /**
     * Gets applicable laws for a character and action
     * @param {string} characterId - Character ID
     * @param {Object} action - { type, domain, details }
     * @returns {Array} Array of applicable laws with source info
     */
    function _getApplicableLaws(characterId, action) {
        if (typeof window.CrimeLawIntegration !== 'undefined' &&
            typeof window.CrimeLawIntegration.getApplicableLaws === 'function') {
            return window.CrimeLawIntegration.getApplicableLaws(characterId, action?.domain);
        }

        // Fallback: try SettlementQueries
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getApplicableLaws === 'function') {
            var character = _getCharacterById(characterId);
            var locationId = character ? _getCurrentLocationId(character) : null;
            return window.SettlementQueries.getApplicableLaws(locationId, characterId, action?.domain);
        }

        return [];
    }

    /**
     * Checks law violations for an action
     * @param {string} characterId - Character ID
     * @param {Object} action - { type, domain, details }
     * @param {Object} context - { locationId, targetId, ... }
     * @returns {Object} { civil, religious, all }
     */
    function _checkLawViolations(characterId, action, context) {
        if (typeof window.CrimeLawIntegration !== 'undefined' &&
            typeof window.CrimeLawIntegration.checkLawViolations === 'function') {
            return window.CrimeLawIntegration.checkLawViolations(characterId, action, context);
        }

        // Fallback: simple check using SettlementQueries
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getApplicableLaws === 'function') {
            var character = _getCharacterById(characterId);
            var locationId = character ? _getCurrentLocationId(character) : null;
            var laws = window.SettlementQueries.getApplicableLaws(locationId, characterId, action?.domain);
            
            var violations = { civil: [], religious: [], all: [] };
            for (var i = 0; i < laws.length; i++) {
                var item = laws[i];
                // Check if this law applies to this action type
                var law = item.law;
                if (law.crimeMapping && law.crimeMapping.crimeType === action.type) {
                    violations.all.push(item);
                    if (item.source === 'civil') {
                        violations.civil.push(item);
                    } else if (item.source === 'religious') {
                        violations.religious.push(item);
                    }
                }
            }
            return violations;
        }

        return { civil: [], religious: [], all: [] };
    }

    /**
     * Gets punishment for a law violation
     * @param {Object} violation - Law violation object
     * @param {Object} context - { character, victim, ... }
     * @returns {string} Punishment description
     */
    function _getPunishmentForViolation(violation, context) {
        if (!violation || !violation.law) return 'Unknown punishment';
        
        var law = violation.law;
        if (law.crimeMapping && law.crimeMapping.punishment) {
            return law.crimeMapping.punishment;
        }
        
        // Default based on severity
        var defaultPunishments = {
            'minor': 'Fine or Public Shaming',
            'major': 'Exile or Imprisonment',
            'mortal': 'Execution or Life Imprisonment'
        };
        return defaultPunishments[law.severity] || 'Punishment determined by law';
    }

    // =========================================================================
    // 3. HOUSEHOLD STATE WRAPPER
    // =========================================================================

    function _getHouseholdState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getHouseholdIdForCharacter(characterId) {
        var state = _getHouseholdState();
        if (!state) return null;

        var character = _getCharacterById(characterId);
        if (character && (character.household || character.householdId)) {
            return character.household || character.householdId;
        }

        if (typeof state.getCharacterHousehold === 'function') {
            var household = state.getCharacterHousehold(characterId);
            return household ? household.id : null;
        }

        return null;
    }

    /**
     * Updates a household's crime-related fields
     * @param {string} householdId - Household ID
     * @param {string} eventType - 'murder', 'execution', 'vendetta'
     * @param {string} perpetratorId - Perpetrator character ID
     * @param {string} victimId - Victim character ID
     * @param {number} year - Year of event
     */
    function _updateHouseholdFromCrime(householdId, eventType, perpetratorId, victimId, year) {
        var state = _getHouseholdState();
        if (!state || !householdId) return;

        var household = state.getHousehold(householdId);
        if (!household) return;

        var updates = {};
        var changed = false;
        var prestigeLoss = 0;

        // Determine prestige loss based on event type
        switch (eventType) {
            case 'murder':
                prestigeLoss = 15;
                break;
            case 'execution':
                prestigeLoss = 20;
                break;
            case 'vendetta':
                prestigeLoss = 10;
                break;
            default:
                prestigeLoss = 5;
        }

        // Update prestige
        var newPrestige = Math.max(0, (household.prestige || 50) - prestigeLoss);
        updates.prestige = newPrestige;
        changed = true;

        // Update criminal count
        if (perpetratorId && perpetratorId !== 'state') {
            var criminalCount = (household.criminalCount || 0) + 1;
            updates.criminalCount = criminalCount;
            changed = true;

            var criminalMembers = household.criminalMembers || [];
            if (criminalMembers.indexOf(perpetratorId) === -1) {
                criminalMembers.push(perpetratorId);
                updates.criminalMembers = criminalMembers;
                changed = true;
            }
        }

        // Update victim count
        if (victimId) {
            var victimCount = (household.victimCount || 0) + 1;
            updates.victimCount = victimCount;
            changed = true;

            var victimMembers = household.victimMembers || [];
            if (victimMembers.indexOf(victimId) === -1) {
                victimMembers.push(victimId);
                updates.victimMembers = victimMembers;
                changed = true;
            }
        }

        // Track executed count
        if (eventType === 'execution') {
            var executedCount = (household.executedCount || 0) + 1;
            updates.executedCount = executedCount;
            changed = true;
        }

        // Track vendetta count
        if (eventType === 'vendetta') {
            var vendettaCount = (household.vendettaCount || 0) + 1;
            updates.vendettaCount = vendettaCount;
            
            var activeVendettaCount = (household.activeVendettaCount || 0) + 1;
            updates.activeVendettaCount = activeVendettaCount;
            changed = true;
        }

        // Add to crime history
        var crimeHistory = household.crimeHistory || [];
        crimeHistory.push({
            type: eventType,
            perpetratorId: perpetratorId || null,
            victimId: victimId || null,
            year: year || _getCurrentYear(),
            prestigeLoss: prestigeLoss,
            newPrestige: newPrestige,
            timestamp: Date.now()
        });
        if (crimeHistory.length > 100) {
            crimeHistory = crimeHistory.slice(-100);
        }
        updates.crimeHistory = crimeHistory;
        changed = true;

        // Apply updates if changed
        if (changed) {
            if (typeof state.updateHousehold === 'function') {
                state.updateHousehold(householdId, updates, { recordHistory: false });
            } else {
                for (var key in updates) {
                    if (updates.hasOwnProperty(key)) {
                        household[key] = updates[key];
                    }
                }
                _saveMasterData();
            }

            _logEvent('household', 'crime_updated',
                'Household "' + household.name + '" updated from ' + eventType + ': -' + prestigeLoss + ' prestige',
                []);
        }
    }

    // =========================================================================
    // 4. SETTLEMENT UPDATE HELPERS
    // =========================================================================

    function _updateSettlementAfterCrime(locationId, eventType, eventData) {
        if (!locationId) return;
        
        if (typeof SettlementEconomy !== 'undefined' && typeof SettlementState !== 'undefined') {
            try {
                var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                var newProsperity = SettlementEconomy.calculateProsperity(locationId);
                
                var updates = {
                    crimeRate: newCrimeRate,
                    prosperity: newProsperity
                };
                
                var historyEntry = {
                    year: _getCurrentYear(),
                    type: 'crime_event',
                    eventType: eventType,
                    details: eventData || {}
                };
                
                var data = SettlementState.getSettlementData(locationId);
                if (data) {
                    SettlementState._updateSettlementData(locationId, updates);
                    if (typeof SettlementState._addHistoryEntry === 'function') {
                        SettlementState._addHistoryEntry(locationId, historyEntry);
                    }
                }
            } catch(e) {
                // Silent fail
            }
        }
    }

    function _getCrimeLocation(character, fallbackLocationId) {
        if (fallbackLocationId) return fallbackLocationId;
        if (character) {
            var locId = _getCurrentLocationId(character);
            if (locId) return locId;
            if (character.birthplaceId) return character.birthplaceId;
        }
        return null;
    }

    // =========================================================================
    // 5. PUBLIC COMMANDS (UPDATED with Law Integration)
    // =========================================================================

    function triggerMurder(victimId, killerId, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var crimeTypes = _getCrimeTypes();
            var victim = _getCharacterById(victimId);
            var killer = _getCharacterById(killerId);

            if (!victim) {
                return { success: false, error: 'Victim not found' };
            }
            if (!killer) {
                return { success: false, error: 'Killer not found' };
            }
            if (victim.isDeceased) {
                return { success: false, error: 'Victim is already deceased' };
            }
            if (victimId === killerId) {
                return { success: false, error: 'Cannot murder oneself' };
            }

            var year = options.year || _getCurrentYear();
            var reason = options.reason || getRandomMurderReason();
            var killerGotAway = options.killerGotAway !== undefined ? options.killerGotAway : _chance(0.3);
            var startVendetta = options.startVendetta !== undefined ? options.startVendetta : true;
            
            var locationId = options.locationId || _getCrimeLocation(victim, null) || 
                             _getCrimeLocation(killer, null) || 'unknown';

            // ================================================================
            // NEW: Check law violations
            // ================================================================
            var action = {
                type: crimeTypes.MURDER,
                domain: 'violence',
                details: {
                    victimId: victimId,
                    killerId: killerId,
                    reason: reason,
                    premeditated: !options.accidental,
                    selfDefense: options.selfDefense || false
                }
            };
            var context = {
                locationId: locationId,
                victim: victim,
                killer: killer,
                year: year
            };
            
            var violations = _checkLawViolations(killerId, action, context);
            
            // Get punishment descriptions
            var civilPunishment = null;
            var religiousPunishment = null;
            
            if (violations.civil.length > 0) {
                civilPunishment = _getPunishmentForViolation(violations.civil[0], context);
            }
            if (violations.religious.length > 0) {
                religiousPunishment = _getPunishmentForViolation(violations.religious[0], context);
            }
            // ================================================================

            // Record the crime
            var recordResult = window.CrimeState.recordCrime({
                type: crimeTypes.MURDER,
                perpetratorId: killer.id,
                victimId: victim.id,
                year: year,
                reason: reason,
                locationId: locationId,
                solved: !killerGotAway,
                notes: options.notes || null,
                // NEW: Law violation data
                civilViolation: violations.civil.length > 0 ? {
                    lawId: violations.civil[0].law.id,
                    lawName: violations.civil[0].law.name,
                    locationId: locationId,
                    severity: violations.civil[0].law.crimeMapping?.crimeSeverity || violations.civil[0].law.severity,
                    punishment: civilPunishment,
                    sourceId: violations.civil[0].sourceId,
                    sourceName: violations.civil[0].sourceName
                } : null,
                religiousViolation: violations.religious.length > 0 ? {
                    lawId: violations.religious[0].law.id,
                    lawName: violations.religious[0].law.name,
                    religionId: violations.religious[0].sourceId,
                    religionName: violations.religious[0].sourceName,
                    severity: violations.religious[0].law.crimeMapping?.crimeSeverity || violations.religious[0].law.severity,
                    punishment: religiousPunishment
                } : null,
                religionId: killer.religionId || null,
                violatedLaws: violations.all.map(function(item) {
                    return {
                        source: item.source,
                        lawId: item.law.id,
                        lawName: item.law.name,
                        sourceId: item.sourceId,
                        sourceName: item.sourceName
                    };
                })
            });

            if (!recordResult.success) {
                return { success: false, error: 'Failed to record crime: ' + recordResult.error };
            }

            // Kill the victim
            var killResult = _killCharacter(victim, year, 'Murdered', {
                killer: killer,
                murderReason: reason,
                killerGotAway: killerGotAway,
                notes: options.notes || null
            });

            if (!killResult.success) {
                return { success: false, error: 'Failed to kill character: ' + killResult.reason };
            }

            var executionResult = null;

            // Handle consequences for the killer if caught
            if (!killerGotAway && !killer.isDeceased) {
                // Check if murder is illegal (it usually is, but laws define punishment)
                var isIllegal = violations.all.some(function(item) {
                    return item.law.crimeMapping && item.law.crimeMapping.isEnforced;
                });
                
                if (isIllegal) {
                    // Determine execution reason from law
                    var execReason = 'Executed for murdering ' + (victim.name || 'Unknown');
                    if (civilPunishment) {
                        execReason = civilPunishment + ' for murdering ' + (victim.name || 'Unknown');
                    }
                    
                    var execResult = triggerExecution(killer.id, {
                        year: year,
                        reason: execReason,
                        isForMurder: true,
                        victimId: victim.id,
                        murderReason: reason,
                        notes: 'Executed for murdering ' + (victim.name || 'Unknown') + ' (' + reason + ')'
                    });
                    if (execResult.success) {
                        executionResult = execResult.data;
                    }
                    _logEvent('execution', 'Execution',
                        'Execution: ' + (killer.name || 'Unknown') + ' executed for murdering ' + (victim.name || 'Unknown'),
                        [killer, victim]);
                } else {
                    // Murder was not illegal under applicable laws (e.g., legal duel, self-defense)
                    _logEvent('murder', 'Murder',
                        (victim.name || 'Unknown') + ' was killed by ' + (killer.name || 'Unknown') + 
                        ' (' + reason + ') - Not a crime under applicable laws',
                        [victim, killer]);
                }
            }

            // Start vendetta if requested
            var vendettaResult = null;
            if (startVendetta) {
                vendettaResult = createBloodFeud(victimId, killerId, {
                    year: year,
                    notes: options.notes || null
                });
            }

            // Update Household from Murder
            var victimHouseholdId = _getHouseholdIdForCharacter(victimId);
            var killerHouseholdId = _getHouseholdIdForCharacter(killerId);

            if (victimHouseholdId) {
                _updateHouseholdFromCrime(
                    victimHouseholdId,
                    'murder',
                    killerId,
                    victimId,
                    year
                );
            }

            if (killerHouseholdId && killerHouseholdId !== victimHouseholdId) {
                _updateHouseholdFromCrime(
                    killerHouseholdId,
                    'murder',
                    killerId,
                    victimId,
                    year
                );
            }

            // Update settlement
            if (locationId && locationId !== 'unknown') {
                _updateSettlementAfterCrime(locationId, 'murder', {
                    victimId: victimId,
                    killerId: killerId,
                    year: year,
                    reason: reason,
                    solved: !killerGotAway,
                    lawViolations: violations.all.length
                });
            }

            _logEvent('murder', 'Murder',
                (victim.name || 'Unknown') + ' was murdered by ' + (killer.name || 'Unknown') + ' (' + reason + ')' +
                (killerGotAway ? '. The killer escaped.' : '. The killer was executed.') +
                (violations.all.length > 0 ? ' Violated ' + violations.all.length + ' law(s).' : ''),
                [victim, killer]);

            return {
                success: true,
                data: {
                    victim: victim,
                    killer: killer,
                    murderReason: reason,
                    killerGotAway: killerGotAway,
                    year: year,
                    locationId: locationId,
                    crime: recordResult.data,
                    execution: executionResult,
                    vendetta: vendettaResult ? vendettaResult.data : null,
                    lawViolations: violations,
                    civilPunishment: civilPunishment,
                    religiousPunishment: religiousPunishment,
                    householdUpdates: {
                        victimHouseholdId: victimHouseholdId,
                        killerHouseholdId: killerHouseholdId
                    }
                }
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to trigger murder' };
        } finally {
            _processingCommand = false;
        }
    }

    function triggerExecution(condemnedId, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var crimeTypes = _getCrimeTypes();
            var condemned = _getCharacterById(condemnedId);

            if (!condemned) {
                return { success: false, error: 'Condemned character not found' };
            }
            if (condemned.isDeceased) {
                return { success: false, error: 'Character is already deceased' };
            }

            var year = options.year || _getCurrentYear();
            var executionReason = options.reason || 'Unknown reason';
            var executionMethod = options.method || getRandomExecutionMethod().name;
            var executionerId = options.executionerId || null;
            var locationId = options.locationId || _getCrimeLocation(condemned, null) || 'unknown';

            // ================================================================
            // NEW: Check law violations for execution
            // ================================================================
            var action = {
                type: crimeTypes.EXECUTION,
                domain: 'death',
                details: {
                    condemnedId: condemnedId,
                    reason: executionReason,
                    method: executionMethod
                }
            };
            var context = {
                locationId: locationId,
                condemned: condemned,
                year: year,
                executionerId: executionerId
            };
            
            var violations = _checkLawViolations(executionerId || 'state', action, context);
            
            var civilPunishment = null;
            var religiousPunishment = null;
            
            if (violations.civil.length > 0) {
                civilPunishment = _getPunishmentForViolation(violations.civil[0], context);
            }
            if (violations.religious.length > 0) {
                religiousPunishment = _getPunishmentForViolation(violations.religious[0], context);
            }
            // ================================================================

            // Record the execution as a crime
            var recordResult = window.CrimeState.recordCrime({
                type: crimeTypes.EXECUTION,
                perpetratorId: executionerId || 'state',
                victimId: condemned.id,
                year: year,
                reason: executionReason,
                locationId: locationId,
                solved: true,
                punishment: executionMethod,
                notes: options.notes || null,
                metadata: {
                    isForMurder: options.isForMurder || false,
                    victimId: options.victimId || null,
                    murderReason: options.murderReason || null
                },
                // NEW: Law violation data
                civilViolation: violations.civil.length > 0 ? {
                    lawId: violations.civil[0].law.id,
                    lawName: violations.civil[0].law.name,
                    locationId: locationId,
                    severity: violations.civil[0].law.crimeMapping?.crimeSeverity || violations.civil[0].law.severity,
                    punishment: civilPunishment,
                    sourceId: violations.civil[0].sourceId,
                    sourceName: violations.civil[0].sourceName
                } : null,
                religiousViolation: violations.religious.length > 0 ? {
                    lawId: violations.religious[0].law.id,
                    lawName: violations.religious[0].law.name,
                    religionId: violations.religious[0].sourceId,
                    religionName: violations.religious[0].sourceName,
                    severity: violations.religious[0].law.crimeMapping?.crimeSeverity || violations.religious[0].law.severity,
                    punishment: religiousPunishment
                } : null,
                religionId: condemned.religionId || null,
                violatedLaws: violations.all.map(function(item) {
                    return {
                        source: item.source,
                        lawId: item.law.id,
                        lawName: item.law.name,
                        sourceId: item.sourceId,
                        sourceName: item.sourceName
                    };
                })
            });

            if (!recordResult.success) {
                return { success: false, error: 'Failed to record execution: ' + recordResult.error };
            }

            // Kill the condemned
            var killResult = _killCharacter(condemned, year, 'Executed: ' + executionReason, {
                executionReason: executionReason,
                executionMethod: executionMethod,
                executionerId: executionerId,
                notes: options.notes || null
            });

            if (!killResult.success) {
                return { success: false, error: 'Failed to kill character: ' + killResult.reason };
            }

            // End relationships if requested
            if (options.endRelationships !== false) {
                if (typeof window.getRelationshipsForCharacter === 'function') {
                    var relationships = window.getRelationshipsForCharacter(condemned.id);
                    for (var i = 0; i < relationships.length; i++) {
                        var rel = relationships[i];
                        if (rel.status === 'ongoing' && typeof window.endRelationship === 'function') {
                            window.endRelationship(rel.id, year, 'Execution of ' + (condemned.name || 'Unknown'));
                        }
                    }
                }
            }

            // Update Household from Execution
            var householdId = _getHouseholdIdForCharacter(condemnedId);
            if (householdId) {
                _updateHouseholdFromCrime(
                    householdId,
                    'execution',
                    executionerId || 'state',
                    condemnedId,
                    year
                );
            }

            if (locationId && locationId !== 'unknown') {
                _updateSettlementAfterCrime(locationId, 'execution', {
                    condemnedId: condemnedId,
                    year: year,
                    reason: executionReason,
                    method: executionMethod,
                    lawViolations: violations.all.length
                });
            }

            _logEvent('execution', 'Execution',
                (condemned.name || 'Unknown') + ' was executed for ' + executionReason + ' via ' + executionMethod + ' in ' + year +
                (violations.all.length > 0 ? ' Violated ' + violations.all.length + ' law(s).' : ''),
                [condemned]);

            return {
                success: true,
                data: {
                    condemned: condemned,
                    reason: executionReason,
                    method: executionMethod,
                    year: year,
                    locationId: locationId,
                    executionerId: executionerId,
                    crime: recordResult.data,
                    householdId: householdId,
                    lawViolations: violations,
                    civilPunishment: civilPunishment,
                    religiousPunishment: religiousPunishment
                }
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to trigger execution' };
        } finally {
            _processingCommand = false;
        }
    }

    function createBloodFeud(victimId, killerId, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var victim = _getCharacterById(victimId);
            var killer = _getCharacterById(killerId);

            if (!victim || !killer) {
                return { success: false, error: 'Victim or killer not found' };
            }

            var victimHouseholdId = _getHouseholdIdForCharacter(victimId);
            var killerHouseholdId = _getHouseholdIdForCharacter(killerId);

            var victimHousehold = victimHouseholdId ? _getHouseholdById(victimHouseholdId) : null;
            var killerHousehold = killerHouseholdId ? _getHouseholdById(killerHouseholdId) : null;

            if (!victimHousehold || !killerHousehold) {
                return { success: false, error: 'One or both households not found' };
            }

            var currentYear = options.year || _getCurrentYear();
            var cause = options.cause || 'Blood feud from murder of ' + (victim.name || 'Unknown') + ' by ' + (killer.name || 'Unknown');

            // Check if vendetta already exists
            var existing = window.CrimeState.getActiveVendettas(victimHouseholdId);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].householdAId === killerHouseholdId ||
                    existing[i].householdBId === killerHouseholdId) {
                    var recordResult = window.CrimeState.recordVendettaDeath(existing[i].id, {
                        victimId: victimId,
                        killerId: killerId,
                        year: currentYear,
                        reason: 'Initial murder'
                    });
                    if (recordResult.success) {
                        return { success: true, data: recordResult.data };
                    }
                    return { success: false, error: 'Failed to record death in existing vendetta' };
                }
            }

            // Create new vendetta
            var vendettaResult = window.CrimeState.createVendetta({
                householdAId: victimHouseholdId,
                householdBId: killerHouseholdId,
                characterAId: victimId,
                characterBId: killerId,
                cause: cause,
                year: currentYear,
                notes: options.notes || 'Blood feud initiated from murder'
            });

            if (!vendettaResult.success) {
                return { success: false, error: 'Failed to create vendetta: ' + vendettaResult.error };
            }

            // Record the first death
            var deathResult = window.CrimeState.recordVendettaDeath(vendettaResult.data.id, {
                victimId: victimId,
                killerId: killerId,
                year: currentYear,
                reason: 'Initial murder'
            });

            if (!deathResult.success) {
                return { success: false, error: 'Failed to record death in vendetta: ' + deathResult.error };
            }

            // Update Households from Vendetta
            if (victimHouseholdId) {
                _updateHouseholdFromCrime(
                    victimHouseholdId,
                    'vendetta',
                    killerId,
                    victimId,
                    currentYear
                );
            }
            if (killerHouseholdId && killerHouseholdId !== victimHouseholdId) {
                _updateHouseholdFromCrime(
                    killerHouseholdId,
                    'vendetta',
                    killerId,
                    victimId,
                    currentYear
                );
            }

            var locationId = options.locationId || _getCrimeLocation(victim, null) || 
                             _getCrimeLocation(killer, null) || 'unknown';
            if (locationId && locationId !== 'unknown') {
                _updateSettlementAfterCrime(locationId, 'vendetta_death', {
                    victimId: victimId,
                    killerId: killerId,
                    year: currentYear,
                    vendettaId: vendettaResult.data.id,
                    cause: cause
                });
            }

            _logEvent('vendetta', 'Blood Feud Created',
                'Blood feud created between ' + (victimHousehold.name || 'Unknown') + ' and ' + (killerHousehold.name || 'Unknown') + ' over the murder of ' + (victim.name || 'Unknown'),
                [victim, killer]);

            return { success: true, data: deathResult.data };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to create blood feud' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. WRAPPER FUNCTIONS
    // =========================================================================

    function recordCrime(data) {
        return window.CrimeState.recordCrime(data);
    }

    function solveCrime(crimeId, solution) {
        return window.CrimeState.solveCrime(crimeId, solution);
    }

    function createVendetta(data) {
        return window.CrimeState.createVendetta(data);
    }

    function recordVendettaDeath(vendettaId, deathData) {
        return window.CrimeState.recordVendettaDeath(vendettaId, deathData);
    }

    function resolveVendetta(vendettaId, resolutionData) {
        return window.CrimeState.resolveVendetta(vendettaId, resolutionData);
    }

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    function getRandomMurderReason(category) {
        var murderReasons = _getMurderReasons();
        if (category && murderReasons[category]) {
            return _pickRandom(murderReasons[category]) || 'Unknown reason';
        }

        var allReasons = [];
        for (var key in murderReasons) {
            if (murderReasons.hasOwnProperty(key)) {
                allReasons = allReasons.concat(murderReasons[key]);
            }
        }
        return _pickRandom(allReasons) || 'Unknown reason';
    }

    function getRandomExecutionMethod() {
        var methods = _getExecutionMethods();
        var methodArray = [];
        for (var key in methods) {
            if (methods.hasOwnProperty(key)) {
                methodArray.push(methods[key]);
            }
        }
        return _pickRandom(methodArray) || { id: 'unknown', name: 'Unknown' };
    }

    /**
     * Gets applicable laws for a character (PUBLIC - for UI)
     * @param {string} characterId - Character ID
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of applicable laws
     */
    function getApplicableLaws(characterId, domain) {
        if (typeof window.CrimeLawIntegration !== 'undefined' &&
            typeof window.CrimeLawIntegration.getApplicableLaws === 'function') {
            return window.CrimeLawIntegration.getApplicableLaws(characterId, domain);
        }
        
        var character = _getCharacterById(characterId);
        var locationId = character ? _getCurrentLocationId(character) : null;
        
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getApplicableLaws === 'function') {
            return window.SettlementQueries.getApplicableLaws(locationId, characterId, domain);
        }
        
        return [];
    }

    /**
     * Checks if an action violates any laws (PUBLIC - for UI)
     */
    function checkLawViolations(characterId, action, context) {
        return _checkLawViolations(characterId, action, context);
    }

    function getCharacterCombatStrength(character) {
        if (!character) return 50;

        var strength = 50;
        var currentYear = _getCurrentYear();
        var age = _calculateAge(character.birthYear, false, null);

        if (age >= 20 && age <= 40) strength += 20;
        else if (age >= 15 && age <= 50) strength += 10;
        else if (age > 60) strength -= 20;
        else if (age < 15) strength -= 30;

        if (character.activeRankId) {
            var rank = typeof window.getRankById === 'function' ? window.getRankById(character.activeRankId) : null;
            if (rank) {
                var rankName = (rank.name || '').toLowerCase();
                if (rankName.includes('knight')) strength += 20;
                else if (rankName.includes('guard') || rankName.includes('soldier')) strength += 15;
                else if (rank.priority <= 2) strength += 10;
            }
        }

        if (character.traits) {
            if (character.traits.includes('strong')) strength += 15;
            if (character.traits.includes('weak')) strength -= 10;
            if (character.traits.includes('trained_fighter')) strength += 25;
        }

        return Math.min(100, Math.max(0, strength));
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CrimeCommands = {
        triggerMurder: triggerMurder,
        triggerExecution: triggerExecution,
        createBloodFeud: createBloodFeud,

        recordCrime: recordCrime,
        solveCrime: solveCrime,

        createVendetta: createVendetta,
        recordVendettaDeath: recordVendettaDeath,
        resolveVendetta: resolveVendetta,

        // NEW: Law integration
        getApplicableLaws: getApplicableLaws,
        checkLawViolations: checkLawViolations,

        // Helpers
        getRandomMurderReason: getRandomMurderReason,
        getRandomExecutionMethod: getRandomExecutionMethod,
        getCharacterCombatStrength: getCharacterCombatStrength
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeCommands;
    }

})();