/**
 * =============================================================================
 * STILL WATERS - RANK COMMANDS (rank-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-commands.js
 * 
 * This file contains ALL write operations for ranks.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankCommands.createRank(rankData)
 *   - RankCommands.updateRank(rankId, updates)
 *   - RankCommands.deleteRank(rankId)
 *   - RankCommands.addInheritanceRule(parentRankId, childRankId, minChildAge, order)
 *   - RankCommands.removeInheritanceRule(parentRankId, ruleIndex)
 *   - RankCommands.assignRankToCharacter(characterId, rankId, options)
 *   - RankCommands.deprecateRankAssignment(characterId, rankId)
 *   - RankCommands.renumberRankHolders(rankId)
 *   - RankCommands.updateRankSurnameRule(rankId, ruleSettings)
 *   - RankCommands.applySpouseInheritanceFixes(fixes)
 *   - RankCommands.bulkAssignRank(characterIds, rankId, options)
 *   - RankCommands.bulkDeprecateRank(characterIds, rankId)
 *   - RankCommands.rebuildAllRankNumbering()
 *   - RankCommands.getCharactersDirect()
 *   - RankCommands.forceSave()
 *   - RankCommands.hasRankDirect(character, rankId)
 *   - RankCommands.addRankToCharacterDirect(characterId, rankId, notes)
 *   - RankCommands.deprecateRankForCharacterDirect(characterId, rankId)
 * 
 * DEPENDENCIES:
 *   - rank-state.js: RankState
 *   - rank-queries.js: RankQueries
 *   - rank-assignment.js: RankAssignment
 *   - accessors.js: getCharacterById, getCharacters
 *   - time.js: getCurrentYearSafe
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons.
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 2. RANK CRUD COMMANDS (Wrappers around RankState)
    // =========================================================================

    function createRank(rankData) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankState.addRank(rankData);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to create rank' };
        } finally {
            _processingCommand = false;
        }
    }

    function updateRank(rankId, updates) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankState.updateRank(rankId, updates);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to update rank' };
        } finally {
            _processingCommand = false;
        }
    }

    function deleteRank(rankId) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            // Check if rank has holders
            var holders = window.RankQueries.getCharactersWithRank(rankId, false);
            if (holders && holders.length > 0) {
                return { 
                    success: false, 
                    error: 'Cannot delete rank with ' + holders.length + ' active holder(s). Remove or deprecate assignments first.' 
                };
            }

            var result = window.RankState.deleteRank(rankId);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to delete rank' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 3. INHERITANCE COMMANDS (Wrappers around RankState)
    // =========================================================================

    function addInheritanceRule(parentRankId, childRankId, minChildAge, order) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankState.addInheritanceRule(parentRankId, childRankId, minChildAge, order);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to add inheritance rule' };
        } finally {
            _processingCommand = false;
        }
    }

    function removeInheritanceRule(parentRankId, ruleIndex) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankState.removeInheritanceRule(parentRankId, ruleIndex);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to remove inheritance rule' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 4. ASSIGNMENT COMMANDS (Wrappers around RankAssignment)
    // =========================================================================

    function assignRankToCharacter(characterId, rankId, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankAssignment.assignRankToCharacter(characterId, rankId, options);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to assign rank' };
        } finally {
            _processingCommand = false;
        }
    }

    function deprecateRankAssignment(characterId, rankId) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankAssignment.deprecateRankAssignment(characterId, rankId);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to deprecate rank assignment' };
        } finally {
            _processingCommand = false;
        }
    }

    function renumberRankHolders(rankId) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankAssignment.renumberRankHolders(rankId);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to renumber rank holders' };
        } finally {
            _processingCommand = false;
        }
    }

    function updateRankSurnameRule(rankId, ruleSettings) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankAssignment.updateRankSurnameRule(rankId, ruleSettings);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to update surname rule' };
        } finally {
            _processingCommand = false;
        }
    }

    function applySpouseInheritanceFixes(fixes) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var result = window.RankAssignment.applySpouseInheritanceFixes(fixes);
            return result;
        } catch (e) {
            return { success: false, error: e.message || 'Failed to apply spouse inheritance fixes' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. BULK OPERATIONS
    // =========================================================================

    function bulkAssignRank(characterIds, rankId, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var results = [];
            var errors = [];

            for (var i = 0; i < characterIds.length; i++) {
                var result = assignRankToCharacter(characterIds[i], rankId, options);
                if (result.success) {
                    results.push(result.data);
                } else {
                    errors.push({
                        characterId: characterIds[i],
                        error: result.error
                    });
                }
            }

            return {
                success: errors.length === 0,
                results: results,
                errors: errors,
                totalProcessed: characterIds.length,
                successful: results.length,
                failed: errors.length
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to bulk assign ranks' };
        } finally {
            _processingCommand = false;
        }
    }

    function bulkDeprecateRank(characterIds, rankId) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var results = [];
            var errors = [];

            for (var i = 0; i < characterIds.length; i++) {
                var result = deprecateRankAssignment(characterIds[i], rankId);
                if (result.success) {
                    results.push(characterIds[i]);
                } else {
                    errors.push({
                        characterId: characterIds[i],
                        error: result.error
                    });
                }
            }

            return {
                success: errors.length === 0,
                results: results,
                errors: errors,
                totalProcessed: characterIds.length,
                successful: results.length,
                failed: errors.length
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to bulk deprecate ranks' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. REBUILD COMMANDS
    // =========================================================================

    function rebuildAllRankNumbering() {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var ranks = window.RankQueries.getAllRanks();
            var fixedCounts = {};
            var totalFixed = 0;

            for (var i = 0; i < ranks.length; i++) {
                var rank = ranks[i];
                if (rank.numbered) {
                    var result = renumberRankHolders(rank.id);
                    if (result.success && result.fixedCount > 0) {
                        fixedCounts[rank.id] = result.fixedCount;
                        totalFixed += result.fixedCount;
                    }
                }
            }

            return {
                success: true,
                fixedCounts: fixedCounts,
                totalFixed: totalFixed
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to rebuild numbering' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. DIRECT HELPER FUNCTIONS (Legacy Compatibility from rankSystem.js)
    // =========================================================================

    /**
     * Gets characters directly from masterData (bypasses accessors)
     * WARNING: Use RankQueries.getCharactersWithRank() instead when possible
     * @returns {Array} Array of character objects
     */
    function getCharactersDirect() {
        if (window.masterData && window.masterData.data && window.masterData.data.characters) {
            return window.masterData.data.characters;
        }
        return [];
    }

    /**
     * Forces a save to localStorage
     * WARNING: Use saveMasterData() instead when possible
     */
    function forceSave() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    /**
     * Checks if a character has a specific rank (direct access)
     * @param {Object} character - Character object
     * @param {string} rankId - Rank ID to check
     * @returns {boolean} True if character has the rank
     */
    function hasRankDirect(character, rankId) {
        if (!character || !character.rankAssignments) return false;
        return character.rankAssignments.some(function(ra) {
            return ra.rankId === rankId && !ra.isDeprecated;
        });
    }

    /**
     * Adds a rank to a character directly (bypasses validation)
     * WARNING: Use RankCommands.assignRankToCharacter() instead
     * @param {string} characterId - Character ID
     * @param {string} rankId - Rank ID
     * @param {string} notes - Optional notes
     * @returns {boolean} True if successful
     */
    function addRankToCharacterDirect(characterId, rankId, notes) {
        var characters = getCharactersDirect();
        var character = characters.find(function(c) { return c.id === characterId; });
        if (!character) return false;
        
        var rank = window.RankQueries.getRank(rankId);
        if (!rank) return false;
        
        // Check gender restriction
        if (rank.genderRestriction !== 'either' && character.gender !== rank.genderRestriction) {
            return false;
        }
        
        // Check if already has rank
        if (hasRankDirect(character, rankId)) return true;
        
        if (!character.rankAssignments) character.rankAssignments = [];
        
        var currentYear = _getCurrentYear();
        
        // Get next number if numbered
        var numberInfo = null;
        if (rank.numbered) {
            numberInfo = window.RankAssignment.getNextRankNumber(rankId, characterId, character.name, character.gender);
        }
        
        character.rankAssignments.push({
            rankId: rankId,
            customTitle: null,
            address: null,
            number: numberInfo,
            order: character.rankAssignments.length * 10 + 10,
            isActive: character.rankAssignments.length === 0,
            isDeprecated: false,
            assignedYear: currentYear,
            notes: notes || 'Added by rank manager'
        });
        
        if (character.rankAssignments.length === 1) {
            character.activeRankId = rankId;
        }
        
        forceSave();
        return true;
    }

    /**
     * Deprecates a rank for a character directly (bypasses validation)
     * WARNING: Use RankCommands.deprecateRankAssignment() instead
     * @param {string} characterId - Character ID
     * @param {string} rankId - Rank ID
     * @returns {boolean} True if successful
     */
    function deprecateRankForCharacterDirect(characterId, rankId) {
        var characters = getCharactersDirect();
        var character = characters.find(function(c) { return c.id === characterId; });
        if (!character || !character.rankAssignments) return false;
        
        var assignment = character.rankAssignments.find(function(a) {
            return a.rankId === rankId && !a.isDeprecated;
        });
        if (!assignment) return false;
        
        assignment.isDeprecated = true;
        
        if (character.activeRankId === rankId) {
            var nextActive = character.rankAssignments.find(function(a) {
                return !a.isDeprecated && a.rankId !== rankId;
            });
            character.activeRankId = nextActive ? nextActive.rankId : null;
        }
        
        forceSave();
        return true;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RankCommands = {
        // Rank CRUD
        createRank: createRank,
        updateRank: updateRank,
        deleteRank: deleteRank,

        // Inheritance
        addInheritanceRule: addInheritanceRule,
        removeInheritanceRule: removeInheritanceRule,

        // Assignment
        assignRankToCharacter: assignRankToCharacter,
        deprecateRankAssignment: deprecateRankAssignment,
        renumberRankHolders: renumberRankHolders,

        // Surname rules
        updateRankSurnameRule: updateRankSurnameRule,

        // Spouse inheritance
        applySpouseInheritanceFixes: applySpouseInheritanceFixes,

        // Bulk operations
        bulkAssignRank: bulkAssignRank,
        bulkDeprecateRank: bulkDeprecateRank,

        // Rebuild
        rebuildAllRankNumbering: rebuildAllRankNumbering,

        // Direct helpers (legacy compatibility)
        getCharactersDirect: getCharactersDirect,
        forceSave: forceSave,
        hasRankDirect: hasRankDirect,
        addRankToCharacterDirect: addRankToCharacterDirect,
        deprecateRankForCharacterDirect: deprecateRankForCharacterDirect
    };

    // Legacy aliases
    window._rankCommands = window.RankCommands;

    // Also expose individual functions at window level for backward compatibility
    window.getCharactersDirect = getCharactersDirect;
    window.forceSave = forceSave;
    window.hasRankDirect = hasRankDirect;
    window.addRankToCharacterDirect = addRankToCharacterDirect;
    window.deprecateRankForCharacterDirect = deprecateRankForCharacterDirect;

})();