/**
 * =============================================================================
 * STILL WATERS - RANK ISSUES SYSTEM (WITH AUTO-FIX)
 * =============================================================================
 * 
 * LOCATION: js/ranks/rank-issues.js
 * 
 * This file uses the REAL relationship system:
 *   - RomanceLogic.getPrimaryPartner() for spouse detection
 *   - FamilyLogic.getParents() / getChildren() for family relationships
 * 
 * ISSUE TYPES CHECKED:
 *   1. Spouse Inheritance - Spouse not receiving rank upon marriage
 *   2. Child Inheritance - Children not receiving parent's rank
 *   3. Gender Mismatch - Wrong gender holding restricted ranks
 *   4. Numbering Issues - Incorrect birth order numbering
 *   5. Deprecation Issues - Ranks not deprecating when they should
 *   6. Broken Inheritance Rules - Rules referencing non-existent ranks
 * 
 * AUTO-FIX: Each issue includes a fix function that can be called
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingIssues = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
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

    function _getInheritanceRules() {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getInheritanceRules === 'function') {
            return window.RankQueries.getInheritanceRules();
        }
        if (typeof window.getInheritanceRules === 'function') {
            return window.getInheritanceRules();
        }
        return {};
    }

    function _getCharactersWithRank(rankId, includeDeprecated) {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getCharactersWithRank === 'function') {
            return window.RankQueries.getCharactersWithRank(rankId, includeDeprecated);
        }
        return [];
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        }
    }

    // =========================================================================
    // 2. RELATIONSHIP SYSTEM WRAPPERS
    // =========================================================================

    function _getPrimaryPartner(characterId) {
        if (typeof window.RomanceLogic !== 'undefined' && 
            typeof window.RomanceLogic.getPrimaryPartner === 'function') {
            return window.RomanceLogic.getPrimaryPartner(characterId);
        }
        if (typeof window.getPrimaryPartner === 'function') {
            return window.getPrimaryPartner(characterId);
        }
        return null;
    }

    function _getActiveRomanticRelationships(characterId) {
        if (typeof window.RomanceLogic !== 'undefined' && 
            typeof window.RomanceLogic.getActiveRomanticRelationships === 'function') {
            return window.RomanceLogic.getActiveRomanticRelationships(characterId);
        }
        if (typeof window.getActiveRomanticRelationships === 'function') {
            return window.getActiveRomanticRelationships(characterId);
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

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    // =========================================================================
    // 3. RANK COMMANDS WRAPPERS
    // =========================================================================

    function _assignRankToCharacter(characterId, rankId, options) {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.assignRankToCharacter === 'function') {
            return window.RankCommands.assignRankToCharacter(characterId, rankId, options);
        }
        if (typeof window.assignRankToCharacter === 'function') {
            return window.assignRankToCharacter(characterId, rankId, options);
        }
        return null;
    }

    function _deprecateRankAssignment(characterId, rankId) {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.deprecateRankAssignment === 'function') {
            return window.RankCommands.deprecateRankAssignment(characterId, rankId);
        }
        if (typeof window.deprecateRankAssignment === 'function') {
            return window.deprecateRankAssignment(characterId, rankId);
        }
        return null;
    }

    function _renumberRankHolders(rankId) {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.renumberRankHolders === 'function') {
            return window.RankCommands.renumberRankHolders(rankId);
        }
        if (typeof window.renumberRankHolders === 'function') {
            return window.renumberRankHolders(rankId);
        }
        return null;
    }

    function _removeInheritanceRule(parentRankId, ruleIndex) {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.removeInheritanceRule === 'function') {
            return window.RankCommands.removeInheritanceRule(parentRankId, ruleIndex);
        }
        if (typeof window.removeInheritanceRule === 'function') {
            return window.removeInheritanceRule(parentRankId, ruleIndex);
        }
        return null;
    }

    function _updateRank(rankId, updates) {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.updateRank === 'function') {
            return window.RankCommands.updateRank(rankId, updates);
        }
        if (typeof window.updateRank === 'function') {
            return window.updateRank(rankId, updates);
        }
        return null;
    }

    // =========================================================================
    // 4. HELPER FUNCTIONS
    // =========================================================================

    function _hasRankAssignment(characterId, rankId) {
        var char = _getCharacterById(characterId);
        if (!char || !char.rankAssignments) return false;
        
        for (var i = 0; i < char.rankAssignments.length; i++) {
            if (char.rankAssignments[i].rankId === rankId && 
                !char.rankAssignments[i].isDeprecated) {
                return true;
            }
        }
        return false;
    }

    function _getInheritanceSource(characterId, rankId) {
        var char = _getCharacterById(characterId);
        if (!char) return null;
        
        var parents = _getParents(characterId);
        if (parents.father && parents.father.activeRankId === rankId) {
            return parents.father.id;
        }
        if (parents.mother && parents.mother.activeRankId === rankId) {
            return parents.mother.id;
        }
        
        var spouse = _getPrimaryPartner(characterId);
        if (spouse && spouse.activeRankId === rankId) {
            return spouse.id;
        }
        
        return null;
    }

    function _toOrdinal(n) {
        if (n === 1) return '1st';
        if (n === 2) return '2nd';
        if (n === 3) return '3rd';
        return n + 'th';
    }

    function _getOrdinalSuffix(n) {
        if (n === 1) return 'st';
        if (n === 2) return 'nd';
        if (n === 3) return 'rd';
        return 'th';
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =========================================================================
    // 5. ISSUE CLASS WITH AUTO-FIX
    // =========================================================================

    function RankIssue(type, severity, message, rankId, characterId, fixFn, fixData) {
        this.type = type;
        this.severity = severity;
        this.message = message;
        this.rankId = rankId || null;
        this.characterId = characterId || null;
        this.fix = fixFn || null;  // Function that actually fixes the issue
        this.fixData = fixData || null;
        this.fixLabel = null;  // Human-readable fix label
        this.rankName = null;
        this.characterName = null;
        
        if (rankId) {
            var rank = _getRankById(rankId);
            if (rank) this.rankName = rank.name;
        }
        if (characterId) {
            var char = _getCharacterById(characterId);
            if (char) this.characterName = char.name + (char.surname ? ' ' + char.surname : '');
        }
    }

    // =========================================================================
    // 6. MAIN ISSUE CHECKER
    // =========================================================================

    function checkAllRankIssues() {
        if (_processingIssues) {
            return { success: false, error: 'Already processing issues' };
        }
        _processingIssues = true;

        try {
            var issues = [];
            
            issues = issues.concat(_checkSpouseInheritance());
            issues = issues.concat(_checkChildInheritance());
            issues = issues.concat(_checkGenderMismatch());
            issues = issues.concat(_checkNumberingIssues());
            issues = issues.concat(_checkDeprecationIssues());
            issues = issues.concat(_checkBrokenInheritanceRules());
            
            return {
                success: true,
                issues: issues,
                count: issues.length,
                bySeverity: {
                    error: issues.filter(function(i) { return i.severity === 'error'; }),
                    warning: issues.filter(function(i) { return i.severity === 'warning'; }),
                    info: issues.filter(function(i) { return i.severity === 'info'; })
                }
            };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to check issues' };
        } finally {
            _processingIssues = false;
        }
    }

    // =========================================================================
    // 7. SPOUSE INHERITANCE CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkSpouseInheritance() {
        var issues = [];
        var characters = _getCharacters();
        var ranks = _getAllRanks();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.isDeceased) continue;
            
            var spouse = _getPrimaryPartner(char.id);
            if (!spouse) continue;
            
            if (!spouse.activeRankId) continue;
            
            var spouseRank = rankMap[spouse.activeRankId];
            if (!spouseRank) continue;
            
            if (!spouseRank.spouseInheritance) continue;
            
            var inheritedRankId = spouseRank.spouseInheritance;
            var inheritedRank = rankMap[inheritedRankId];
            if (!inheritedRank) continue;
            
            var hasRank = _hasRankAssignment(char.id, inheritedRankId);
            if (!hasRank) {
                // Create auto-fix function
                var fixFn = function(charId, rankId, spouseId, spouseName) {
                    return function() {
                        var result = _assignRankToCharacter(charId, rankId, {
                            notes: 'Inherited from spouse ' + spouseName,
                            assignedYear: _getCurrentYear()
                        });
                        if (result && result.success !== false) {
                            _saveMasterData();
                            _showToast('Added ' + _getRankById(rankId).name + ' to ' + _getCharacterById(charId).name, 'success');
                            return true;
                        }
                        _showToast('Failed to add rank', 'error');
                        return false;
                    };
                }(char.id, inheritedRankId, spouse.id, spouse.name);
                
                var issue = new RankIssue(
                    'Spouse Inheritance',
                    'error',
                    char.name + ' is married to ' + spouse.name + ' (who holds "' + spouseRank.name + '") but does not have the inherited rank "' + inheritedRank.name + '"',
                    inheritedRankId,
                    char.id,
                    fixFn,
                    { spouseId: spouse.id, rankId: inheritedRankId }
                );
                issue.fixLabel = 'Add "' + inheritedRank.name + '" to ' + char.name;
                issues.push(issue);
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 8. CHILD INHERITANCE CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkChildInheritance() {
        var issues = [];
        var characters = _getCharacters();
        var ranks = _getAllRanks();
        var inheritanceRules = _getInheritanceRules();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        for (var i = 0; i < characters.length; i++) {
            var child = characters[i];
            if (child.isDeceased) continue;
            
            var parents = _getParents(child.id);
            var parentRanks = [];
            
            if (parents.father && parents.father.activeRankId) {
                parentRanks.push({ parent: parents.father, rankId: parents.father.activeRankId });
            }
            if (parents.mother && parents.mother.activeRankId) {
                parentRanks.push({ parent: parents.mother, rankId: parents.mother.activeRankId });
            }
            
            for (var j = 0; j < parentRanks.length; j++) {
                var parentInfo = parentRanks[j];
                var parentRank = rankMap[parentInfo.rankId];
                if (!parentRank) continue;
                
                var rules = inheritanceRules[parentRank.id] || [];
                
                for (var k = 0; k < rules.length; k++) {
                    var rule = rules[k];
                    var childRankId = rule.childRankId;
                    
                    if (rule.childRankIdFemale && child.gender === 'female') {
                        childRankId = rule.childRankIdFemale;
                    }
                    
                    if (!childRankId) continue;
                    
                    var childRank = rankMap[childRankId];
                    if (!childRank) continue;
                    
                    var hasRank = _hasRankAssignment(child.id, childRankId);
                    if (!hasRank) {
                        // Create auto-fix function
                        var fixFn = function(childId, rankId, parentId, parentName) {
                            return function() {
                                var result = _assignRankToCharacter(childId, rankId, {
                                    notes: 'Inherited from parent ' + parentName,
                                    assignedYear: _getCharacterById(childId)?.birthYear || _getCurrentYear()
                                });
                                if (result && result.success !== false) {
                                    _saveMasterData();
                                    _showToast('Added ' + _getRankById(rankId).name + ' to ' + _getCharacterById(childId).name, 'success');
                                    return true;
                                }
                                _showToast('Failed to add rank', 'error');
                                return false;
                            };
                        }(child.id, childRankId, parentInfo.parent.id, parentInfo.parent.name);
                        
                        var issue = new RankIssue(
                            'Child Inheritance',
                            'warning',
                            child.name + ' is a child of ' + parentInfo.parent.name + ' (who holds "' + parentRank.name + '") but does not have the inherited rank "' + childRank.name + '"',
                            childRankId,
                            child.id,
                            fixFn,
                            { parentId: parentInfo.parent.id, rankId: childRankId }
                        );
                        issue.fixLabel = 'Add "' + childRank.name + '" to ' + child.name;
                        issues.push(issue);
                    }
                }
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 9. GENDER MISMATCH CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkGenderMismatch() {
        var issues = [];
        var characters = _getCharacters();
        var ranks = _getAllRanks();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!char.rankAssignments) continue;
            
            for (var j = 0; j < char.rankAssignments.length; j++) {
                var assignment = char.rankAssignments[j];
                if (assignment.isDeprecated) continue;
                
                var rank = rankMap[assignment.rankId];
                if (!rank) continue;
                
                if (rank.genderRestriction && rank.genderRestriction !== 'either') {
                    if (char.gender !== rank.genderRestriction) {
                        // Create auto-fix function - deprecate the rank
                        var fixFn = function(charId, rankId, rankName) {
                            return function() {
                                var result = _deprecateRankAssignment(charId, rankId);
                                if (result && result.success !== false) {
                                    _saveMasterData();
                                    _showToast('Deprecated "' + rankName + '" for ' + _getCharacterById(charId).name, 'success');
                                    return true;
                                }
                                _showToast('Failed to deprecate rank', 'error');
                                return false;
                            };
                        }(char.id, rank.id, rank.name);
                        
                        var issue = new RankIssue(
                            'Gender Mismatch',
                            'error',
                            char.name + ' holds "' + rank.name + '" but is ' + char.gender + ' (rank requires ' + rank.genderRestriction + ')',
                            rank.id,
                            char.id,
                            fixFn,
                            { correctGender: rank.genderRestriction }
                        );
                        issue.fixLabel = 'Deprecate "' + rank.name + '" from ' + char.name;
                        issues.push(issue);
                    }
                }
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 10. NUMBERING ISSUES CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkNumberingIssues() {
        var issues = [];
        var characters = _getCharacters();
        var ranks = _getAllRanks();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        var holdersByGroup = {};
        
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!char.rankAssignments) continue;
            
            for (var j = 0; j < char.rankAssignments.length; j++) {
                var assignment = char.rankAssignments[j];
                if (assignment.isDeprecated) continue;
                
                var rank = rankMap[assignment.rankId];
                if (!rank || !rank.numbered) continue;
                
                var inheritedFrom = _getInheritanceSource(char.id, rank.id);
                var key = rank.id + '|' + (char.gender || 'unknown') + '|' + (inheritedFrom || 'none');
                
                if (!holdersByGroup[key]) {
                    holdersByGroup[key] = [];
                }
                
                holdersByGroup[key].push({
                    character: char,
                    assignment: assignment,
                    inheritedFrom: inheritedFrom,
                    birthYear: char.birthYear || 0
                });
            }
        }
        
        for (var key in holdersByGroup) {
            if (!holdersByGroup.hasOwnProperty(key)) continue;
            
            var parts = key.split('|');
            var rankId = parts[0];
            var gender = parts[1];
            var inheritedFrom = parts[2] === 'none' ? null : parts[2];
            
            var holders = holdersByGroup[key];
            
            holders.sort(function(a, b) {
                return (a.birthYear || 9999) - (b.birthYear || 9999);
            });
            
            for (var i = 0; i < holders.length; i++) {
                var holder = holders[i];
                var expectedNumber = i + 1;
                var expectedDisplay = _toOrdinal(expectedNumber);
                var inheritedFromName = inheritedFrom ? 
                    (_getCharacterById(inheritedFrom)?.name || 'unknown') : 'unknown';
                var rank = rankMap[rankId];
                
                if (holder.assignment.number) {
                    var currentDisplay = holder.assignment.number.display;
                    
                    if (currentDisplay !== expectedDisplay) {
                        // Create auto-fix function - renumber all holders
                        var fixFn = function(rId) {
                            return function() {
                                var result = _renumberRankHolders(rId);
                                if (result && result.success !== false) {
                                    _saveMasterData();
                                    _showToast('Renumbered holders for ' + _getRankById(rId).name, 'success');
                                    return true;
                                }
                                _showToast('Failed to renumber', 'error');
                                return false;
                            };
                        }(rankId);
                        
                        var issue = new RankIssue(
                            'Numbering Error',
                            'error',
                            holder.character.name + ' has number "' + currentDisplay + '" for "' + rank.name + '" but should be "' + expectedDisplay + '" (birth order: ' + expectedNumber + _getOrdinalSuffix(expectedNumber) + ' ' + gender + ' child of ' + inheritedFromName + ')',
                            rankId,
                            holder.character.id,
                            fixFn,
                            { correctNumber: expectedDisplay, correctRaw: expectedNumber }
                        );
                        issue.fixLabel = 'Re-number all "' + rank.name + '" holders';
                        issues.push(issue);
                        break; // Only one issue per group
                    }
                } else {
                    // Create auto-fix function - renumber all holders
                    var fixFn = function(rId) {
                        return function() {
                            var result = _renumberRankHolders(rId);
                            if (result && result.success !== false) {
                                _saveMasterData();
                                _showToast('Renumbered holders for ' + _getRankById(rId).name, 'success');
                                return true;
                            }
                            _showToast('Failed to renumber', 'error');
                            return false;
                        };
                    }(rankId);
                    
                    var issue = new RankIssue(
                        'Numbering Error',
                        'warning',
                        holder.character.name + ' has no number for "' + rank.name + '" (should be ' + expectedDisplay + ' as ' + expectedNumber + _getOrdinalSuffix(expectedNumber) + ' ' + gender + ' child of ' + inheritedFromName + ')',
                        rankId,
                        holder.character.id,
                        fixFn,
                        { correctNumber: expectedDisplay, correctRaw: expectedNumber }
                    );
                    issue.fixLabel = 'Re-number all "' + rank.name + '" holders';
                    issues.push(issue);
                    break; // Only one issue per group
                }
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 11. DEPRECATION ISSUES CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkDeprecationIssues() {
        var issues = [];
        var characters = _getCharacters();
        var ranks = _getAllRanks();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            
            if (!char.isDeceased) continue;
            if (!char.rankAssignments) continue;
            
            for (var j = 0; j < char.rankAssignments.length; j++) {
                var assignment = char.rankAssignments[j];
                if (assignment.isDeprecated) continue;
                
                var rank = rankMap[assignment.rankId];
                if (!rank || !rank.deprecateOnDeath) continue;
                
                // Create auto-fix function
                var fixFn = function(charId, rankId, rankName) {
                    return function() {
                        var result = _deprecateRankAssignment(charId, rankId);
                        if (result && result.success !== false) {
                            _saveMasterData();
                            _showToast('Deprecated "' + rankName + '" for deceased ' + _getCharacterById(charId).name, 'success');
                            return true;
                        }
                        _showToast('Failed to deprecate rank', 'error');
                        return false;
                    };
                }(char.id, rank.id, rank.name);
                
                var issue = new RankIssue(
                    'Deprecation Error',
                    'error',
                    char.name + ' has died but "' + rank.name + '" has not been deprecated (rank is set to deprecate on death)',
                    rank.id,
                    char.id,
                    fixFn,
                    { shouldDeprecate: true }
                );
                issue.fixLabel = 'Deprecate "' + rank.name + '" from ' + char.name;
                issues.push(issue);
                break; // Only one deprecation issue per character
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 12. BROKEN INHERITANCE RULES CHECKS WITH AUTO-FIX
    // =========================================================================

    function _checkBrokenInheritanceRules() {
        var issues = [];
        var ranks = _getAllRanks();
        var inheritanceRules = _getInheritanceRules();
        
        var rankMap = {};
        for (var i = 0; i < ranks.length; i++) {
            rankMap[ranks[i].id] = ranks[i];
        }
        
        for (var parentId in inheritanceRules) {
            if (!inheritanceRules.hasOwnProperty(parentId)) continue;
            
            var parentRank = rankMap[parentId];
            if (!parentRank) {
                // Can't auto-fix this - need manual intervention
                var issue = new RankIssue(
                    'Broken Inheritance Rule',
                    'error',
                    'Inheritance rule references non-existent parent rank (ID: ' + parentId + ')',
                    null,
                    null,
                    null,
                    null
                );
                issue.fixLabel = 'Manual fix required - remove broken rule';
                issues.push(issue);
                continue;
            }
            
            var rules = inheritanceRules[parentId];
            var rulesToRemove = [];
            
            for (var j = 0; j < rules.length; j++) {
                var rule = rules[j];
                
                if (rule.childRankId) {
                    var childRank = rankMap[rule.childRankId];
                    if (!childRank) {
                        rulesToRemove.push(j);
                    }
                }
                
                if (rule.childRankIdFemale) {
                    var childRankFemale = rankMap[rule.childRankIdFemale];
                    if (!childRankFemale) {
                        if (rulesToRemove.indexOf(j) === -1) {
                            rulesToRemove.push(j);
                        }
                    }
                }
            }
            
            if (rulesToRemove.length > 0) {
                // Create auto-fix function - remove broken rules
                var fixFn = function(pId, indices) {
                    return function() {
                        var success = true;
                        // Remove from end to avoid index shifting
                        indices.sort(function(a, b) { return b - a; });
                        for (var idx = 0; idx < indices.length; idx++) {
                            var result = _removeInheritanceRule(pId, indices[idx]);
                            if (!result || result.success === false) {
                                success = false;
                            }
                        }
                        if (success) {
                            _saveMasterData();
                            _showToast('Removed broken inheritance rules from "' + _getRankById(pId).name + '"', 'success');
                            return true;
                        }
                        _showToast('Failed to remove broken rules', 'error');
                        return false;
                    };
                }(parentId, rulesToRemove.slice());
                
                var issue = new RankIssue(
                    'Broken Inheritance Rule',
                    'error',
                    'Inheritance rule from "' + parentRank.name + '" has ' + rulesToRemove.length + ' broken child rank reference(s)',
                    parentId,
                    null,
                    fixFn,
                    { brokenIndices: rulesToRemove }
                );
                issue.fixLabel = 'Remove broken rules from "' + parentRank.name + '"';
                issues.push(issue);
            }
        }
        
        return issues;
    }

    // =========================================================================
    // 13. GET CURRENT YEAR
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

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.RankIssues = {
        checkAll: checkAllRankIssues,
        checkSpouseInheritance: _checkSpouseInheritance,
        checkChildInheritance: _checkChildInheritance,
        checkGenderMismatch: _checkGenderMismatch,
        checkNumberingIssues: _checkNumberingIssues,
        checkDeprecationIssues: _checkDeprecationIssues,
        checkBrokenInheritanceRules: _checkBrokenInheritanceRules,
        RankIssue: RankIssue
    };

    window._rankIssues = window.RankIssues;

})();