/**
 * =============================================================================
 * STILL WATERS - MORTALITY COMMANDS (js/core/mortality/mortality-commands.js)
 * =============================================================================
 * 
 * All write operations for mortality management.
 * 
 * FEATURES:
 *   - Record death (natural, disease, accident, etc.)
 *   - Record murder with motive and method
 *   - Record execution with reason and method
 *   - Update death records
 *   - Recursion guard
 *   - Event emission
 * 
 * DEPENDENCIES:
 *   - mortality-state.js (MortalityState)
 *   - character-commands.js (CharacterCommands)
 *   - character-queries.js (CharacterQueries)
 *   - character-lifecycle.js (CharacterLifecycle)
 *   - accessors.js (getCharacterById, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.MortalityState !== 'undefined' ? window.MortalityState : null;
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

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _invalidateCaches() {
        if (typeof window.clearFamilyCache === 'function') {
            window.clearFamilyCache();
        }
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. KILL CHARACTER
    // =========================================================================

    function killCharacter(character, deathYear, deathCause, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!character || character.isDeceased) {
                return { success: false, reason: 'Character already deceased' };
            }

            // Use CharacterLifecycle if available
            if (typeof window.CharacterLifecycle !== 'undefined') {
                var result = window.CharacterLifecycle.killCharacter(character, deathYear, deathCause, {
                    notes: options.notes || '',
                    skipInheritance: options.skipInheritance || false
                });

                if (result && result.success) {
                    // Add murder/execution metadata
                    if (options.killerId) {
                        character.isMurder = true;
                        character.killerId = options.killerId;
                        character.murderMotive = options.murderMotive || 'Unknown';
                        character.murderMethod = options.murderMethod || 'Unknown';
                        
                        var state = _getState();
                        if (state) {
                            state._addMurderRecord({
                                victimId: character.id,
                                victimName: character.name,
                                killerId: options.killerId,
                                killerName: _getCharacterById(options.killerId)?.name || 'Unknown',
                                year: deathYear,
                                motive: options.murderMotive || 'Unknown',
                                method: options.murderMethod || 'Unknown',
                                notes: options.notes || ''
                            });
                        }
                    }

                    if (options.executionReason) {
                        character.isExecution = true;
                        character.executionReason = options.executionReason;
                        character.executionMethod = options.executionMethod || 'Unknown';
                        character.executionLocation = options.executionLocation || 'Unknown';

                        var state = _getState();
                        if (state) {
                            state._addExecutionRecord({
                                condemnedId: character.id,
                                condemnedName: character.name,
                                year: deathYear,
                                reason: options.executionReason,
                                method: options.executionMethod || 'Unknown',
                                location: options.executionLocation || 'Unknown',
                                notes: options.notes || ''
                            });
                        }
                    }

                    _saveMasterData();
                    _invalidateCaches();
                }

                return result;
            }

            // Fallback: manual kill
            character.isDeceased = true;
            character.deathYear = deathYear;
            character.deathCause = deathCause || 'Unknown';
            if (options.notes) character.deathNotes = options.notes;

            if (options.killerId) {
                character.isMurder = true;
                character.killerId = options.killerId;
                character.murderMotive = options.murderMotive || 'Unknown';
                character.murderMethod = options.murderMethod || 'Unknown';
            }

            if (options.executionReason) {
                character.isExecution = true;
                character.executionReason = options.executionReason;
                character.executionMethod = options.executionMethod || 'Unknown';
                character.executionLocation = options.executionLocation || 'Unknown';
            }

            _saveMasterData();
            _invalidateCaches();

            var state = _getState();
            if (state) {
                state._setDeathRecord(character.id, {
                    characterId: character.id,
                    name: character.name,
                    surname: character.surname || '',
                    gender: character.gender || 'unknown',
                    birthYear: character.birthYear,
                    deathYear: deathYear,
                    deathCause: deathCause || 'Unknown',
                    deathNotes: options.notes || '',
                    ageAtDeath: _calculateAge(character.birthYear, true, deathYear),
                    isMurder: !!options.killerId,
                    isExecution: !!options.executionReason,
                    killerId: options.killerId || null,
                    killerName: options.killerId ? (_getCharacterById(options.killerId)?.name || 'Unknown') : null,
                    murderMotive: options.murderMotive || null,
                    murderMethod: options.murderMethod || null,
                    executionReason: options.executionReason || null,
                    executionMethod: options.executionMethod || null,
                    executionLocation: options.executionLocation || null
                });
            }

            _logEvent('death', 'Death',
                character.name + ' died of ' + (deathCause || 'Unknown') + ' in ' + deathYear,
                [character]);

            return {
                success: true,
                character: character,
                deathYear: deathYear,
                deathCause: deathCause || 'Unknown'
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. RECORD MURDER
    // =========================================================================

    function recordMurder(victim, killer, year, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!victim || victim.isDeceased) {
                return { success: false, reason: 'Victim already deceased' };
            }

            if (!killer) {
                return { success: false, reason: 'Killer not found' };
            }

            var result = killCharacter(victim, year, 'Murder: ' + (options.method || 'Unknown'), {
                killerId: killer.id,
                murderMotive: options.motive || 'Unknown',
                murderMethod: options.method || 'Unknown',
                notes: options.notes || ''
            });

            if (result && result.success) {
                _logEvent('murder', 'Murder',
                    killer.name + ' murdered ' + victim.name + ' in ' + year + ' (Motive: ' + (options.motive || 'Unknown') + ')',
                    [killer, victim]);

                if (!options.killerGotAway && typeof window.triggerExecution === 'function') {
                    _showToast(killer.name + ' faces consequences for the murder', 'warning');
                }
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. RECORD EXECUTION
    // =========================================================================

    function recordExecution(condemned, year, reason, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!condemned || condemned.isDeceased) {
                return { success: false, reason: 'Condemned already deceased' };
            }

            var result = killCharacter(condemned, year, 'Execution: ' + reason, {
                executionReason: reason,
                executionMethod: options.method || 'Unknown',
                executionLocation: options.location || 'Unknown',
                notes: options.notes || ''
            });

            if (result && result.success) {
                _logEvent('execution', 'Execution',
                    condemned.name + ' was executed in ' + year + ' (Reason: ' + reason + ')',
                    [condemned]);
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. UPDATE DEATH RECORD
    // =========================================================================

    function updateDeathRecord(characterId, updates) {
        if (_processing) {
            return null;
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            var character = _getCharacterById(characterId);
            if (!character) return null;

            if (updates.deathYear !== undefined) character.deathYear = updates.deathYear;
            if (updates.deathCause !== undefined) character.deathCause = updates.deathCause;
            if (updates.deathNotes !== undefined) character.deathNotes = updates.deathNotes;
            if (updates.isMurder !== undefined) character.isMurder = updates.isMurder;
            if (updates.isExecution !== undefined) character.isExecution = updates.isExecution;
            if (updates.killerId !== undefined) character.killerId = updates.killerId;
            if (updates.murderMotive !== undefined) character.murderMotive = updates.murderMotive;
            if (updates.murderMethod !== undefined) character.murderMethod = updates.murderMethod;
            if (updates.executionReason !== undefined) character.executionReason = updates.executionReason;
            if (updates.executionMethod !== undefined) character.executionMethod = updates.executionMethod;
            if (updates.executionLocation !== undefined) character.executionLocation = updates.executionLocation;

            var record = state._updateDeathRecord(characterId, updates);

            _saveMasterData();
            _invalidateCaches();

            return record;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.MortalityCommands = {
        killCharacter: killCharacter,
        recordMurder: recordMurder,
        recordExecution: recordExecution,
        updateDeathRecord: updateDeathRecord
    };

    // Legacy aliases
    window.killCharacter = killCharacter;
    window.triggerMurder = recordMurder;
    window.triggerExecution = recordExecution;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityCommands;
    }

})();