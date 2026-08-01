/**
 * =============================================================================
 * STILL WATERS - RANK ASSIGNMENT (rank-assignment.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-assignment.js
 * 
 * This file contains complex rank assignment and numbering logic.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankAssignment.assignRankToCharacter(characterId, rankId, options)
 *   - RankAssignment.deprecateRankAssignment(characterId, rankId)
 *   - RankAssignment.getNextRankNumber(rankId, characterId, characterName, gender, sourceCharacterId)
 *   - RankAssignment.renumberRankHolders(rankId)
 *   - RankAssignment.fixAllNumberingForCharacter(characterId)
 *   - RankAssignment.toOrdinal(n)
 *   - RankAssignment.toRoman(n)
 *   - RankAssignment.generateSurnameFromRankRule(character, context)
 *   - RankAssignment.updateRankSurnameRule(rankId, ruleSettings)
 *   - RankAssignment.checkAndFixSpouseInheritance()
 *   - RankAssignment.applySpouseInheritanceFixes(fixes)
 *   - RankAssignment.getInheritanceSource(characterId, rankId)
 * 
 * DEPENDENCIES:
 *   - rank-state.js: RankState
 *   - rank-queries.js: RankQueries
 *   - accessors.js: getCharacterById, getCharacters
 *   - time.js: getCurrentYearSafe
 *   - storage.js: saveMasterData
 *   - relationship system: RomanceLogic, FamilyLogic
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

    var _processingAssignment = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _getRankById(id) {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getRank === 'function') {
            return window.RankQueries.getRank(id);
        }
        if (typeof window.getRankById === 'function') {
            return window.getRankById(id);
        }
        return null;
    }

    function _getAllRanks() {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getAllRanks === 'function') {
            return window.RankQueries.getAllRanks();
        }
        if (typeof window.getRanks === 'function') {
            return window.getRanks();
        }
        return [];
    }

    function _getParents(characterId) {
        if (typeof window.FamilyLogic !== 'undefined' && 
            typeof window.FamilyLogic.getParents === 'function') {
            return window.FamilyLogic.getParents(characterId);
        }
        if (typeof window.getParents === 'function') {
            return window.getParents(characterId);
        }
        return { father: null, mother: null };
    }

    function _getChildren(characterId, activeOnly) {
        if (typeof window.FamilyLogic !== 'undefined' && 
            typeof window.FamilyLogic.getChildren === 'function') {
            return window.FamilyLogic.getChildren(characterId, activeOnly !== false);
        }
        if (typeof window.getChildren === 'function') {
            return window.getChildren(characterId, activeOnly !== false);
        }
        return [];
    }

    function _getPrimaryPartner(characterId) {
        if (typeof window.RomanceLogic !== 'undefined' && 
            typeof window.RomanceLogic.getPrimaryPartner === 'function') {
            return window.RomanceLogic.getPrimaryPartner(characterId);
        }
        if (typeof window.FamilyLogic !== 'undefined' && 
            typeof window.FamilyLogic.getCurrentSpouse === 'function') {
            return window.FamilyLogic.getCurrentSpouse(characterId);
        }
        if (typeof window.getCurrentSpouse === 'function') {
            return window.getCurrentSpouse(characterId);
        }
        return null;
    }

    function _getSpouses(characterId) {
        if (typeof window.FamilyLogic !== 'undefined' && 
            typeof window.FamilyLogic.getSpouses === 'function') {
            return window.FamilyLogic.getSpouses(characterId, true);
        }
        if (typeof window.getSpouses === 'function') {
            return window.getSpouses(characterId);
        }
        return [];
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
        }
    }

    // =========================================================================
    // 2. NUMBERING HELPERS
    // =========================================================================

    /**
     * Converts a number to ordinal (1st, 2nd, 3rd, 4th...)
     */
    function toOrdinal(n) {
        if (n === 1) return '1st';
        if (n === 2) return '2nd';
        if (n === 3) return '3rd';
        return n + 'th';
    }

    /**
     * Converts a number to Roman numeral (1=I, 2=II, 3=III, 4=IV...)
     */
    function toRoman(n) {
        var roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        if (n <= 10) return roman[n];
        return n.toString();
    }

    // =========================================================================
    // 3. GET INHERITANCE SOURCE - USING RELATIONSHIP SYSTEM
    // =========================================================================

    function getInheritanceSource(characterId, rankId) {
        var char = _getCharacterById(characterId);
        if (!char) return null;
        
        var rank = _getRankById(rankId);
        if (!rank) return null;
        
        // Check if rank is inherited from spouse
        if (rank.inheritanceSource === 'spouse' || rank.spouseInheritance) {
            var spouse = _getPrimaryPartner(characterId);
            if (spouse) {
                // Check if spouse has the source rank
                if (spouse.activeRankId === rank.sourceRankId) {
                    return spouse.id;
                }
                // Legacy: check spouseInheritance field
                if (rank.spouseInheritance && spouse.activeRankId === rank.spouseInheritance) {
                    return spouse.id;
                }
            }
        }
        
        // Check if rank is inherited from parent
        if (rank.inheritanceSource === 'parent') {
            var parents = _getParents(characterId);
            if (parents.father && parents.father.activeRankId === rank.sourceRankId) {
                return parents.father.id;
            }
            if (parents.mother && parents.mother.activeRankId === rank.sourceRankId) {
                return parents.mother.id;
            }
        }
        
        return null;
    }

    // =========================================================================
    // 4. GET NEXT RANK NUMBER - WITH GROUPING
    // =========================================================================

    function getNextRankNumber(rankId, characterId, characterName, gender, sourceCharacterId) {
        var rank = _getRankById(rankId);
        if (!rank || !rank.numbered) return null;

        var characters = _getCharacters();

        // Get all holders of this rank (non-deprecated)
        var holders = characters.filter(function(c) {
            if (c.id === characterId) return false;
            var assignment = c.rankAssignments ? c.rankAssignments.find(function(ra) {
                return ra.rankId === rankId && !ra.isDeprecated;
            }) : undefined;
            return assignment !== undefined;
        });

        var numberingGroup = rank.numberingGroup || 'global';

        // Filter holders by numbering group
        var filteredHolders = holders;
        
        if (numberingGroup === 'parent' && sourceCharacterId) {
            // Only holders with the same parent/source
            filteredHolders = holders.filter(function(c) {
                var parents = _getParents(c.id);
                return parents.father?.id === sourceCharacterId || parents.mother?.id === sourceCharacterId;
            });
        } else if (numberingGroup === 'spouse' && sourceCharacterId) {
            // Only holders married to the same person
            filteredHolders = holders.filter(function(c) {
                var spouse = _getPrimaryPartner(c.id);
                return spouse?.id === sourceCharacterId;
            });
        } else if (numberingGroup === 'source' && sourceCharacterId) {
            // Only holders inheriting from the same source
            filteredHolders = holders.filter(function(c) {
                var source = getInheritanceSource(c.id, rankId);
                return source === sourceCharacterId;
            });
        }
        // 'global' - no filtering

        // Sort by birth year (ordinal) or assignment year (reign)
        if (rank.numberingType === 'reign') {
            filteredHolders.sort(function(a, b) {
                var aAssign = a.rankAssignments ? a.rankAssignments.find(function(ra) { return ra.rankId === rankId && !ra.isDeprecated; }) : null;
                var bAssign = b.rankAssignments ? b.rankAssignments.find(function(ra) { return ra.rankId === rankId && !ra.isDeprecated; }) : null;
                return (aAssign?.assignedYear || 0) - (bAssign?.assignedYear || 0);
            });
        } else {
            // Ordinal - sort by birth year
            filteredHolders.sort(function(a, b) {
                return (a.birthYear || 9999) - (b.birthYear || 9999);
            });
        }

        var nextNumber = filteredHolders.length + 1;
        var display = rank.numberingType === 'roman' ? toRoman(nextNumber) : toOrdinal(nextNumber);

        return {
            rawNumber: nextNumber,
            display: display,
            type: rank.numberingType === 'roman' ? 'roman' : 'ordinal',
            groupId: sourceCharacterId || 'global',
            holdersInGroup: filteredHolders.length
        };
    }

    // =========================================================================
    // 5. ASSIGN RANK TO CHARACTER
    // =========================================================================

    function assignRankToCharacter(characterId, rankId, options) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var character = _getCharacterById(characterId);
            var rank = _getRankById(rankId);

            if (!character) {
                return { success: false, error: 'Character not found' };
            }
            if (!rank) {
                return { success: false, error: 'Rank not found' };
            }

            // Check gender restriction
            if (rank.genderRestriction !== 'either' && character.gender !== rank.genderRestriction) {
                return { success: false, error: 'Gender restriction does not match' };
            }

            if (!character.rankAssignments) {
                character.rankAssignments = [];
            }

            // Check if already has this rank
            var existing = character.rankAssignments.find(function(ra) {
                return ra.rankId === rankId && !ra.isDeprecated;
            });
            if (existing) {
                return { success: false, error: 'Character already has this rank' };
            }

            var currentYear = _getCurrentYear();

            // Get inheritance source for numbering group
            var sourceId = null;
            if (rank.numbered && (rank.numberingGroup === 'parent' || rank.numberingGroup === 'spouse' || rank.numberingGroup === 'source')) {
                sourceId = getInheritanceSource(characterId, rankId);
            }

            var numberInfo = null;
            if (rank.numbered && options.number === undefined) {
                numberInfo = getNextRankNumber(rankId, characterId, character.name, character.gender, sourceId);
            } else if (options.number) {
                if (typeof options.number === 'object') {
                    numberInfo = options.number;
                } else {
                    numberInfo = {
                        rawNumber: options.number,
                        display: options.number.toString(),
                        type: 'custom'
                    };
                }
            }

            var newAssignment = {
                rankId: rankId,
                customTitle: options.customTitle || null,
                address: options.address || null,
                number: numberInfo,
                order: options.order || (character.rankAssignments.length * 10 + 10),
                isActive: character.rankAssignments.length === 0,
                isDeprecated: false,
                assignedYear: options.assignedYear || currentYear,
                notes: options.notes || '',
                inheritedFrom: sourceId || null
            };

            character.rankAssignments.push(newAssignment);

            // Set as active if first rank
            if (character.rankAssignments.length === 1) {
                character.activeRankId = rankId;
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            return {
                success: true,
                data: {
                    character: character,
                    assignment: newAssignment
                }
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to assign rank' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 6. DEPRECATE RANK ASSIGNMENT
    // =========================================================================

    function deprecateRankAssignment(characterId, rankId) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.rankAssignments) {
                return { success: false, error: 'Character or rank assignments not found' };
            }

            var assignment = character.rankAssignments.find(function(a) {
                return a.rankId === rankId && !a.isDeprecated;
            });

            if (!assignment) {
                return { success: false, error: 'Rank assignment not found' };
            }

            assignment.isDeprecated = true;

            if (character.activeRankId === rankId) {
                var nextActive = character.rankAssignments.find(function(a) {
                    return !a.isDeprecated && a.rankId !== rankId;
                });
                character.activeRankId = nextActive ? nextActive.rankId : null;
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to deprecate rank assignment' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 7. RENUMBER RANK HOLDERS - WITH GROUPING
    // =========================================================================

    function renumberRankHolders(rankId) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var rank = _getRankById(rankId);
            if (!rank || !rank.numbered) {
                return { success: false, error: 'Rank is not numbered' };
            }

            var characters = _getCharacters();
            var holders = characters.filter(function(c) {
                var hasRank = c.rankAssignments && c.rankAssignments.some(function(ra) {
                    return ra.rankId === rankId && !ra.isDeprecated;
                });
                return hasRank;
            });

            var fixedCount = 0;

            if (rank.numberingType === 'reign') {
                var byFirstName = new Map();

                for (var i = 0; i < holders.length; i++) {
                    var holder = holders[i];
                    var firstName = holder.name ? holder.name.split(' ')[0] : '';
                    if (!byFirstName.has(firstName)) {
                        byFirstName.set(firstName, []);
                    }

                    var assignment = holder.rankAssignments ? holder.rankAssignments.find(function(ra) {
                        return ra.rankId === rankId && !ra.isDeprecated;
                    }) : null;
                    if (assignment) {
                        byFirstName.get(firstName).push({ holder: holder, assignment: assignment });
                    }
                }

                for (var entry of byFirstName) {
                    var items = entry[1];
                    items.sort(function(a, b) {
                        return (a.assignment.assignedYear || 0) - (b.assignment.assignedYear || 0);
                    });

                    for (var j = 0; j < items.length; j++) {
                        var expectedNumber = j + 1;
                        var expectedDisplay = toRoman(expectedNumber);
                        var currentDisplay = items[j].assignment.number ? items[j].assignment.number.display : null;

                        if (currentDisplay !== expectedDisplay) {
                            items[j].assignment.number = {
                                rawNumber: expectedNumber,
                                display: expectedDisplay,
                                type: 'roman'
                            };
                            fixedCount++;
                        }
                    }
                }
            } else {
                // Group by inheritance source for ordinal numbering
                var groups = new Map();
                
                for (var i = 0; i < holders.length; i++) {
                    var holder = holders[i];
                    var assignment = holder.rankAssignments ? holder.rankAssignments.find(function(ra) {
                        return ra.rankId === rankId && !ra.isDeprecated;
                    }) : null;
                    if (!assignment) continue;
                    
                    // Determine group key based on numbering group
                    var groupKey = 'global';
                    if (rank.numberingGroup === 'parent' || rank.numberingGroup === 'spouse' || rank.numberingGroup === 'source') {
                        var sourceId = getInheritanceSource(holder.id, rankId);
                        groupKey = sourceId || 'unknown';
                    }
                    
                    if (!groups.has(groupKey)) {
                        groups.set(groupKey, []);
                    }
                    groups.get(groupKey).push({
                        holder: holder,
                        assignment: assignment,
                        sourceId: groupKey
                    });
                }
                
                // Sort each group by birth year
                for (var entry of groups) {
                    var items = entry[1];
                    items.sort(function(a, b) {
                        return (a.holder.birthYear || 9999) - (b.holder.birthYear || 9999);
                    });
                    
                    // Apply numbers
                    for (var j = 0; j < items.length; j++) {
                        var expectedNumber = j + 1;
                        var expectedDisplay = toOrdinal(expectedNumber);
                        var currentDisplay = items[j].assignment.number ? items[j].assignment.number.display : null;
                        
                        if (currentDisplay !== expectedDisplay) {
                            items[j].assignment.number = {
                                rawNumber: expectedNumber,
                                display: expectedDisplay,
                                type: 'ordinal'
                            };
                            fixedCount++;
                        }
                    }
                }
            }

            if (fixedCount > 0) {
                _saveMasterData();
                _invalidateAccessorCaches();
            }

            return { success: true, fixedCount: fixedCount };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to renumber rank holders' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 8. FIX ALL NUMBERING FOR CHARACTER
    // =========================================================================

    function fixAllNumberingForCharacter(characterId) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.rankAssignments) {
                return { success: false, error: 'Character not found' };
            }

            var fixedCount = 0;
            var rankGroups = new Map();

            for (var i = 0; i < character.rankAssignments.length; i++) {
                var assignment = character.rankAssignments[i];
                if (assignment.isDeprecated) continue;
                var rank = _getRankById(assignment.rankId);
                if (rank && rank.numbered) {
                    if (!rankGroups.has(assignment.rankId)) {
                        rankGroups.set(assignment.rankId, []);
                    }
                    rankGroups.get(assignment.rankId).push(assignment);
                }
            }

            for (var entry of rankGroups) {
                var result = renumberRankHolders(entry[0]);
                if (result.success) {
                    fixedCount += result.fixedCount || 0;
                }
            }

            return { success: true, fixedCount: fixedCount };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to fix numbering' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 9. SURNAME RULE FUNCTIONS
    // =========================================================================

    function generateSurnameFromRankRule(character, context) {
        if (!character || !character.activeRankId) return null;

        var rank = _getRankById(character.activeRankId);
        if (!rank || !rank.customSurnameRule) return null;

        var locationName = context && context.locationName ? context.locationName : null;
        if (!locationName) return null;

        var result = locationName;

        // Apply connector
        if (rank.surnameConnector && rank.surnameConnector !== 'none') {
            result = rank.surnameConnector + ' ' + result;
        }

        // Apply prefix
        if (rank.surnamePrefix) {
            result = rank.surnamePrefix + result;
        }

        // Apply suffix
        if (rank.surnameSuffix) {
            result = result + rank.surnameSuffix;
        }

        // Capitalize first letter
        if (typeof window.capitalizeFirstLetter === 'function') {
            result = window.capitalizeFirstLetter(result);
        } else if (result) {
            result = result.charAt(0).toUpperCase() + result.slice(1);
        }

        return result;
    }

    function updateRankSurnameRule(rankId, ruleSettings) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var rank = _getRankById(rankId);
            if (!rank) {
                return { success: false, error: 'Rank not found' };
            }

            var updates = {
                customSurnameRule: ruleSettings.enabled || false,
                surnameConnector: ruleSettings.connector || 'of',
                surnamePrefix: ruleSettings.prefix || '',
                surnameSuffix: ruleSettings.suffix || ''
            };

            var result = window.RankState.updateRank(rankId, updates);
            return result;

        } catch (e) {
            return { success: false, error: e.message || 'Failed to update surname rule' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 10. SPOUSE INHERITANCE - USING RELATIONSHIP SYSTEM
    // =========================================================================

    function checkAndFixSpouseInheritance() {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var characters = _getCharacters();
            var fixes = [];
            var ranks = _getAllRanks();
            
            var rankMap = {};
            for (var i = 0; i < ranks.length; i++) {
                rankMap[ranks[i].id] = ranks[i];
            }

            for (var i = 0; i < characters.length; i++) {
                var c = characters[i];
                if (c.isDeceased) continue;

                // Get spouse using relationship system
                var spouse = _getPrimaryPartner(c.id);
                if (!spouse) continue;

                // Get spouse's active rank
                if (!spouse.activeRankId) continue;
                
                var spouseRank = rankMap[spouse.activeRankId];
                if (!spouseRank) continue;

                // Check if spouse's rank grants inheritance
                var inheritedRankId = null;
                
                // Check spouseInheritance field
                if (spouseRank.spouseInheritance) {
                    inheritedRankId = spouseRank.spouseInheritance;
                }
                
                // Check inheritanceSource with sourceRankId
                if (spouseRank.inheritanceSource === 'spouse' && spouseRank.sourceRankId) {
                    inheritedRankId = spouseRank.sourceRankId;
                }

                if (!inheritedRankId) continue;
                
                var inheritedRank = rankMap[inheritedRankId];
                if (!inheritedRank) continue;

                // Check if character already has the inherited rank
                var alreadyHas = c.rankAssignments && c.rankAssignments.some(function(ra) {
                    return ra.rankId === inheritedRankId && !ra.isDeprecated;
                });
                
                if (!alreadyHas) {
                    fixes.push({
                        character: c,
                        characterId: c.id,
                        characterName: c.name + (c.surname ? ' ' + c.surname : ''),
                        rank: inheritedRank,
                        rankId: inheritedRankId,
                        rankName: inheritedRank.name,
                        spouseName: spouse.name + (spouse.surname ? ' ' + spouse.surname : ''),
                        sourceRankName: spouseRank.name
                    });
                }
            }

            return { success: true, fixes: fixes, count: fixes.length };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to check spouse inheritance' };
        } finally {
            _processingAssignment = false;
        }
    }

    function applySpouseInheritanceFixes(fixes) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var applied = 0;
            var currentYear = _getCurrentYear();

            for (var i = 0; i < fixes.length; i++) {
                var fix = fixes[i];
                var result = assignRankToCharacter(fix.characterId, fix.rankId, {
                    notes: 'Inherited from spouse ' + fix.spouseName + ' via ' + fix.sourceRankName,
                    assignedYear: currentYear
                });
                if (result.success) {
                    applied++;
                }
            }

            if (applied > 0) {
                _saveMasterData();
                _invalidateAccessorCaches();
                _showToast('Applied ' + applied + ' spouse inheritance fixes', 'success');
            }

            return { success: true, applied: applied };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to apply spouse inheritance fixes' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.RankAssignment = {
        assignRankToCharacter: assignRankToCharacter,
        deprecateRankAssignment: deprecateRankAssignment,
        getNextRankNumber: getNextRankNumber,
        renumberRankHolders: renumberRankHolders,
        fixAllNumberingForCharacter: fixAllNumberingForCharacter,
        toOrdinal: toOrdinal,
        toRoman: toRoman,
        generateSurnameFromRankRule: generateSurnameFromRankRule,
        updateRankSurnameRule: updateRankSurnameRule,
        checkAndFixSpouseInheritance: checkAndFixSpouseInheritance,
        applySpouseInheritanceFixes: applySpouseInheritanceFixes,
        getInheritanceSource: getInheritanceSource
    };

    // Legacy aliases
    window._rankAssignment = window.RankAssignment;

})();