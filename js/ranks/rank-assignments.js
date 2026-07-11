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
 *   - RankAssignment.getNextRankNumber(rankId, characterId, characterName, gender)
 *   - RankAssignment.renumberRankHolders(rankId)
 *   - RankAssignment.fixAllNumberingForCharacter(characterId)
 *   - RankAssignment.toOrdinal(n)
 *   - RankAssignment.toRoman(n)
 *   - RankAssignment.generateSurnameFromRankRule(character, context)
 *   - RankAssignment.updateRankSurnameRule(rankId, ruleSettings)
 *   - RankAssignment.checkAndFixSpouseInheritance()
 *   - RankAssignment.applySpouseInheritanceFixes(fixes)
 * 
 * DEPENDENCIES:
 *   - rank-state.js: RankState
 *   - rank-queries.js: RankQueries
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
    // 3. GET NEXT RANK NUMBER
    // =========================================================================

    function getNextRankNumber(rankId, characterId, characterName, gender) {
        var rank = window.RankQueries.getRank(rankId);
        if (!rank || !rank.numbered) return null;

        var characters = _getCharacters();

        var holders = characters.filter(function(c) {
            if (c.id === characterId) return false;
            var assignment = c.rankAssignments ? c.rankAssignments.find(function(ra) {
                return ra.rankId === rankId && !ra.isDeprecated;
            }) : undefined;
            return assignment !== undefined;
        });

        if (rank.numberingType === 'reign') {
            var firstName = characterName ? characterName.split(' ')[0] : '';
            var sameNameHolders = holders.filter(function(c) {
                var cFirstName = c.name ? c.name.split(' ')[0] : '';
                return cFirstName === firstName;
            });

            var holdersWithYear = [];
            for (var i = 0; i < sameNameHolders.length; i++) {
                var c = sameNameHolders[i];
                var assignment = c.rankAssignments ? c.rankAssignments.find(function(ra) {
                    return ra.rankId === rankId && !ra.isDeprecated;
                }) : null;
                if (assignment) {
                    holdersWithYear.push({
                        character: c,
                        assignment: assignment
                    });
                }
            }

            holdersWithYear.sort(function(a, b) {
                return (a.assignment.assignedYear || 0) - (b.assignment.assignedYear || 0);
            });

            var nextNumber = holdersWithYear.length + 1;

            return {
                rawNumber: nextNumber,
                display: toRoman(nextNumber),
                type: 'roman'
            };
        } else {
            var filteredHolders = holders;

            if (rank.genderRestriction === 'male') {
                filteredHolders = holders.filter(function(c) { return c.gender === 'male'; });
            } else if (rank.genderRestriction === 'female') {
                filteredHolders = holders.filter(function(c) { return c.gender === 'female'; });
            } else if (gender) {
                filteredHolders = holders.filter(function(c) { return c.gender === gender; });
            }

            filteredHolders.sort(function(a, b) {
                return (a.birthYear || 9999) - (b.birthYear || 9999);
            });

            var nextNumber = filteredHolders.length + 1;

            return {
                rawNumber: nextNumber,
                display: toOrdinal(nextNumber),
                type: 'ordinal'
            };
        }
    }

    // =========================================================================
    // 4. ASSIGN RANK TO CHARACTER
    // =========================================================================

    function assignRankToCharacter(characterId, rankId, options) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var character = _getCharacterById(characterId);
            var rank = window.RankQueries.getRank(rankId);

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

            var numberInfo = null;
            if (rank.numbered && options.number === undefined) {
                numberInfo = getNextRankNumber(rankId, characterId, character.name, character.gender);
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
                notes: options.notes || ''
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
    // 5. DEPRECATE RANK ASSIGNMENT
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
    // 6. RENUMBER RANK HOLDERS
    // =========================================================================

    function renumberRankHolders(rankId) {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var rank = window.RankQueries.getRank(rankId);
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
                var holdersToNumber = holders;

                if (rank.genderRestriction === 'male') {
                    holdersToNumber = holders.filter(function(c) { return c.gender === 'male'; });
                } else if (rank.genderRestriction === 'female') {
                    holdersToNumber = holders.filter(function(c) { return c.gender === 'female'; });
                }

                holdersToNumber.sort(function(a, b) {
                    return (a.birthYear || 9999) - (b.birthYear || 9999);
                });

                for (var k = 0; k < holdersToNumber.length; k++) {
                    var assignment = holdersToNumber[k].rankAssignments ? holdersToNumber[k].rankAssignments.find(function(ra) {
                        return ra.rankId === rankId && !ra.isDeprecated;
                    }) : null;
                    if (assignment) {
                        var expectedNumber = k + 1;
                        var expectedDisplay = toOrdinal(expectedNumber);
                        var currentDisplay = assignment.number ? assignment.number.display : null;

                        if (currentDisplay !== expectedDisplay) {
                            assignment.number = {
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
    // 7. FIX ALL NUMBERING FOR CHARACTER
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
                var rank = window.RankQueries.getRank(assignment.rankId);
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
    // 8. SURNAME RULE FUNCTIONS
    // =========================================================================

    function generateSurnameFromRankRule(character, context) {
        if (!character || !character.activeRankId) return null;

        var rank = window.RankQueries.getRank(character.activeRankId);
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
            var rank = window.RankQueries.getRank(rankId);
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
    // 9. SPOUSE INHERITANCE
    // =========================================================================

    function checkAndFixSpouseInheritance() {
        if (_processingAssignment) {
            return { success: false, error: 'Already processing assignment' };
        }
        _processingAssignment = true;

        try {
            var characters = _getCharacters();
            var fixes = [];

            for (var i = 0; i < characters.length; i++) {
                var c = characters[i];
                if (c.isDeceased) continue;

                var inheritanceRanks = window.RankQueries.getSpouseInheritanceRanks(c.id);
                for (var j = 0; j < inheritanceRanks.length; j++) {
                    var inheritedRank = inheritanceRanks[j];
                    var alreadyHas = c.rankAssignments && c.rankAssignments.some(function(ra) {
                        return ra.rankId === inheritedRank.id && !ra.isDeprecated;
                    });
                    if (!alreadyHas) {
                        var spouseName = 'Unknown';
                        if (c.relationships) {
                            for (var k = 0; k < c.relationships.length; k++) {
                                if (c.relationships[k].status === 'ongoing') {
                                    var spouse = _getCharacterById(c.relationships[k].partnerId);
                                    if (spouse) {
                                        spouseName = spouse.name;
                                        break;
                                    }
                                }
                            }
                        }
                        fixes.push({
                            character: c,
                            rank: inheritedRank,
                            spouseName: spouseName
                        });
                    }
                }
            }

            return { success: true, fixes: fixes };

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
                var result = assignRankToCharacter(fix.character.id, fix.rank.id, {
                    notes: 'Inherited from spouse ' + fix.spouseName,
                    assignedYear: currentYear
                });
                if (result.success) {
                    applied++;
                }
            }

            return { success: true, applied: applied };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to apply spouse inheritance fixes' };
        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
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
        applySpouseInheritanceFixes: applySpouseInheritanceFixes
    };

    // Legacy aliases
    window._rankAssignment = window.RankAssignment;

})();