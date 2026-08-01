/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE js/character/character-lifecycle.js
 * =============================================================================
 * 
 * Business logic for character lifecycle (birth, aging, death, inheritance).
 * 
 * FEATURES:
 *   - Full life stage constants (AGE_GROUPS, LIFE_STAGES, DEATH_CAUSES)
 *   - getLifeStage(), getAgeGroup() functions
 *   - killCharacter() with household inheritance integration
 *   - applyAgingMortality() with age-based risk
 *   - predictLifespan() with rank-based modifiers
 *   - triggerNaturalDeath(), triggerAccidentalDeath()
 *   - processAllPendingInheritance() with recursion guard
 *   - getLifeStageName(), isElderly()
 *   - groupCharactersByAgeGroup()
 *   - getExpectedRemainingYears()
 *   - FAMILY ACCESSORS - Uses FamilyAccessors for heir finding
 * 
 * ICON STYLE: Uses SVG icons from icons.js - NO EMOJIS
 * 
 * DEPENDENCIES:
 *   - character-state.js (CharacterState)
 *   - character-commands.js (CharacterCommands)
 *   - character-queries.js (CharacterQueries)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - constants.js (AGE_GROUPS, LIFE_STAGES, DEATH_CAUSES)
 *   - family-accessors.js (FamilyAccessors) - NEW
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS - Use from constants.js if available
    // =========================================================================

    // Use AGE_GROUPS from constants.js
    if (typeof window.AGE_GROUPS === 'undefined') {
        window.AGE_GROUPS = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    // Use AGE_GROUPS_MAP from constants.js if available (without emojis)
    if (typeof window.AGE_GROUPS_MAP === 'undefined') {
        window.AGE_GROUPS_MAP = {
            '0-10': { label: '0-10 years' },
            '11-20': { label: '11-20 years' },
            '21-30': { label: '21-30 years' },
            '31-40': { label: '31-40 years' },
            '41-50': { label: '41-50 years' },
            '51-60': { label: '51-60 years' },
            '61-70': { label: '61-70 years' },
            '71-80': { label: '71-80 years' },
            '81-90': { label: '81-90 years' },
            '91+': { label: '91+ years' }
        };
    }

    // Use LIFE_STAGES from constants.js if available (without emojis)
    if (typeof window.LIFE_STAGES === 'undefined') {
        window.LIFE_STAGES = {
            INFANT: { min: 0, max: 10, name: 'Child', group: '0-10' },
            YOUTH: { min: 11, max: 20, name: 'Youth', group: '11-20' },
            YOUNG_ADULT: { min: 21, max: 30, name: 'Young Adult', group: '21-30' },
            ADULT: { min: 31, max: 40, name: 'Adult', group: '31-40' },
            MIDDLE_ADULT: { min: 41, max: 50, name: 'Middle Adult', group: '41-50' },
            MATURE: { min: 51, max: 60, name: 'Mature', group: '51-60' },
            SENIOR: { min: 61, max: 70, name: 'Senior', group: '61-70' },
            ELDER: { min: 71, max: 80, name: 'Elder', group: '71-80' },
            AGED: { min: 81, max: 90, name: 'Aged', group: '81-90' },
            ANCIENT: { min: 91, max: 150, name: 'Ancient', group: '91+' }
        };
    }

    // Use DEATH_CAUSES from constants.js if available
    if (typeof window.DEATH_CAUSES === 'undefined') {
        window.DEATH_CAUSES = [
            { text: "Old age", weight: 25, minAge: 60 },
            { text: "Old age, natural causes", weight: 15, minAge: 60 },
            { text: "Fever", weight: 12 },
            { text: "Consumption (tuberculosis)", weight: 10 },
            { text: "Pneumonia", weight: 8 },
            { text: "Infection", weight: 6 },
            { text: "Plague", weight: 8 },
            { text: "Dysentery", weight: 5 },
            { text: "Drowning", weight: 5 },
            { text: "Fell from a height", weight: 4 },
            { text: "Hunting accident", weight: 3 },
            { text: "Fire", weight: 3 },
            { text: "Animal attack", weight: 3 },
            { text: "Accident", weight: 5 },
            { text: "Childbed fever", weight: 4, minAge: 14, maxAge: 45 }
        ];
    }

    // =========================================================================
    // 2. ICON HELPERS - Using SVG icons from icons.js
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.getIcon === 'function') {
            return window.getIcon(name, fallback);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getAgeGroupIcon(group) {
        var iconMap = {
            '0-10': 'CHILD',
            '11-20': 'YOUTH',
            '21-30': 'YOUNG_ADULT',
            '31-40': 'ADULT',
            '41-50': 'MIDDLE_ADULT',
            '51-60': 'MATURE',
            '61-70': 'SENIOR',
            '71-80': 'ELDER',
            '81-90': 'AGED',
            '91+': 'ANCIENT'
        };
        var iconName = iconMap[group] || 'PERSON';
        return _getIcon(iconName, '●');
    }

    function _getAgeGroupEmoji(group) {
        // NO EMOJIS - return the icon SVG instead
        return _getAgeGroupIcon(group);
    }

    // =========================================================================
    // 3. FAMILY ACCESSORS WRAPPER (NEW)
    // =========================================================================

    function _getFamilyAccessors() {
        return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
    }

    function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getAllChildren === 'function') {
            var result = fa.getAllChildren(parentId, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getParentsViaFamilyAccessors(childId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getParents === 'function') {
            return fa.getParents(childId);
        }
        return null;
    }

    function _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSiblings === 'function') {
            var result = fa.getSiblings(childId, includeHalfSiblings !== false, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getFamilyStatisticsViaFamilyAccessors(characterId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getFamilyStatistics === 'function') {
            return fa.getFamilyStatistics(characterId);
        }
        return null;
    }

    // =========================================================================
    // 4. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.CharacterState !== 'undefined' ? window.CharacterState : null;
    }

    function _getCommands() {
        return typeof window.CharacterCommands !== 'undefined' ? window.CharacterCommands : null;
    }

    function _getQueries() {
        return typeof window.CharacterQueries !== 'undefined' ? window.CharacterQueries : null;
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

    function _getAllHouseholds() {
        if (typeof window.getAllHouseholds === 'function') {
            return window.getAllHouseholds();
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

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _pickRandom(array) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(array);
        }
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    function _random() {
        if (typeof window.random === 'function') {
            return window.random();
        }
        return Math.random();
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
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

    function _getRankById(rankId) {
        if (typeof window.getRankById === 'function') {
            return window.getRankById(rankId);
        }
        return null;
    }

    // =========================================================================
    // 5. RECURSION GUARD
    // =========================================================================

    var _processing = false;
    var _processingInheritance = false;

    // =========================================================================
    // 6. DEATH CAUSES
    // =========================================================================

    var DEATH_CAUSES = window.DEATH_CAUSES;

    function getRandomDeathCause(age, gender) {
        var eligible = DEATH_CAUSES.filter(function(cause) {
            if (cause.minAge && age < cause.minAge) return false;
            if (cause.maxAge && age > cause.maxAge) return false;
            if (cause.text === "Childbed fever" && gender !== 'female') return false;
            return true;
        });

        if (eligible.length === 0) eligible = [{ text: "Natural causes", weight: 100 }];

        var totalWeight = 0;
        for (var i = 0; i < eligible.length; i++) {
            totalWeight += eligible[i].weight;
        }

        var random = _random() * totalWeight;
        var accumulated = 0;

        for (var i = 0; i < eligible.length; i++) {
            accumulated += eligible[i].weight;
            if (random <= accumulated) return eligible[i].text;
        }

        return "Natural causes";
    }

    // =========================================================================
    // 7. LIFE STAGES FUNCTIONS
    // =========================================================================

    function getLifeStage(charOrAge) {
        var age;
        if (typeof charOrAge === 'object' && charOrAge !== null) {
            age = _calculateAge(charOrAge.birthYear, charOrAge.isDeceased, charOrAge.deathYear);
        } else {
            age = charOrAge;
        }

        var stages = window.LIFE_STAGES;
        for (var key in stages) {
            var stage = stages[key];
            if (age >= stage.min && age <= stage.max) {
                return { key: key, ...stage };
            }
        }
        return { key: 'ANCIENT', name: 'Ancient', min: 91, max: 150, group: '91+' };
    }

    function getLifeStageName(charOrAge) {
        return getLifeStage(charOrAge).name;
    }

    function getAgeGroup(charOrAge) {
        var age;
        if (typeof charOrAge === 'object' && charOrAge !== null) {
            age = _calculateAge(charOrAge.birthYear, charOrAge.isDeceased, charOrAge.deathYear);
        } else {
            age = charOrAge;
        }

        var groups = window.AGE_GROUPS || ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0]);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
            if (age >= min && age <= max) {
                return groups[i];
            }
        }
        return groups[groups.length - 1];
    }

    function getAgeGroupIcon(group) {
        return _getAgeGroupIcon(group);
    }

    function getAgeGroupEmoji(group) {
        return _getAgeGroupIcon(group);
    }

    function getAllAgeGroups() {
        return window.AGE_GROUPS ? window.AGE_GROUPS.slice() : ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    function getAgeGroupIndex(group) {
        var groups = window.AGE_GROUPS || ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
        return groups.indexOf(group);
    }

    function isElderly(charOrAge) {
        var age;
        if (typeof charOrAge === 'object') {
            age = _calculateAge(charOrAge.birthYear, charOrAge.isDeceased, charOrAge.deathYear);
        } else {
            age = charOrAge;
        }
        return age >= 60;
    }

    function groupCharactersByAgeGroup(characters, excludeDeceased) {
        excludeDeceased = (excludeDeceased !== undefined) ? excludeDeceased : true;
        var groups = {};
        var ageGroups = window.AGE_GROUPS || ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];

        for (var i = 0; i < ageGroups.length; i++) {
            groups[ageGroups[i]] = [];
        }

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (excludeDeceased && char.isDeceased) continue;
            var age = _calculateAge(char.birthYear, false, null);
            var group = getAgeGroup(age);
            if (groups[group]) {
                groups[group].push(char);
            } else {
                groups['0-10'].push(char);
            }
        }

        // Sort each group by age
        for (var i = 0; i < ageGroups.length; i++) {
            var group = ageGroups[i];
            groups[group].sort(function(a, b) {
                var ageA = _calculateAge(a.birthYear, false, null);
                var ageB = _calculateAge(b.birthYear, false, null);
                return ageA - ageB;
            });
        }

        return groups;
    }

    // =========================================================================
    // 8. KILL CHARACTER (Unified with inheritance)
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

            var currentYear = _getCurrentYear();
            var finalDeathYear = deathYear || currentYear;
            var characterId = character.id;
            var characterName = character.name;

            // 1. Mark as deceased
            character.isDeceased = true;
            character.deathYear = finalDeathYear;
            character.deathCause = deathCause || "Unknown";
            if (options.notes) character.deathNotes = options.notes;

            // 2. Update relationships to widowed
            if (character.relationships) {
                for (var i = 0; i < character.relationships.length; i++) {
                    var rel = character.relationships[i];
                    if (rel.status === 'ongoing' || rel.status === 'active') {
                        rel.status = 'widowed';
                        if (!rel.details) rel.details = {};
                        rel.details.endYear = finalDeathYear;
                        if (options.notes) rel.details.notes = options.notes;
                    }
                }
            }

            // 3. Deprecate ranks that should deprecate on death
            if (character.rankAssignments && _getRankById) {
                for (var i = 0; i < character.rankAssignments.length; i++) {
                    var assignment = character.rankAssignments[i];
                    var rank = _getRankById(assignment.rankId);
                    if (rank && rank.deprecateOnDeath) {
                        assignment.isDeprecated = true;
                        assignment.isActive = false;
                    }
                }
            }

            // Save character
            var state = _getState();
            if (state) {
                var characters = state.getAllCharacters();
                var idx = -1;
                for (var j = 0; j < characters.length; j++) {
                    if (characters[j].id === character.id) {
                        idx = j;
                        break;
                    }
                }
                if (idx !== -1) {
                    characters[idx] = character;
                    state._setCharacters(characters);
                    state._emitCharacterChange('update', character);
                }
            } else {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }

            // 4. PROCESS HOUSEHOLD INHERITANCE (UPDATED - Uses FamilyAccessors)
            var inheritanceResults = null;
            if (!options.skipInheritance) {
                inheritanceResults = processHouseholdInheritance(characterId);
            }

            // 5. Log inheritance results
            if (inheritanceResults && inheritanceResults.length > 0) {
                for (var i = 0; i < inheritanceResults.length; i++) {
                    var result = inheritanceResults[i];
                    if (result.success && result.heir) {
                        var heirChar = _getCharacterById(result.heir);
                        _logEvent('inheritance', 'Household Inherited',
                            result.heir + ' inherited ' + result.household + ' after ' + characterName + '\'s death',
                            [character, heirChar]);
                    } else if (!result.success && result.reason) {
                        _logEvent('inheritance', 'Household Abandoned',
                            result.household + ' was abandoned after ' + characterName + '\'s death (' + result.reason + ')',
                            [character]);
                    }
                }
            }

            // 6. Invalidate caches
            _invalidateCaches();

            // 7. Log the death
            _logEvent('death', 'Death',
                characterName + ' died of ' + deathCause.toLowerCase() + ' in ' + finalDeathYear,
                [character]);

            return {
                success: true,
                character: character,
                deathYear: finalDeathYear,
                deathCause: deathCause,
                inheritance: inheritanceResults
            };

        } finally {
            _processing = false;
        }
    }

    function killCharacterRandomCause(character, deathYear) {
        var age = _calculateAge(character.birthYear, false, null);
        var cause = getRandomDeathCause(age, character.gender);
        return killCharacter(character, deathYear, cause);
    }

    // =========================================================================
    // 9. HOUSEHOLD INHERITANCE (UPDATED - Uses FamilyAccessors)
    // =========================================================================

    function processHouseholdInheritance(characterId) {
        if (_processingInheritance) {
            console.warn('processHouseholdInheritance: already running, skipping');
            return null;
        }
        _processingInheritance = true;

        try {
            var results = [];

            // Try using the household assignment system if available
            if (typeof window.processHouseholdInheritanceOnDeath === 'function') {
                var result = window.processHouseholdInheritanceOnDeath(characterId);
                if (result) return result;
            }

            // Fallback implementation - UPDATED to use FamilyAccessors
            var households = _getAllHouseholds();
            var character = _getCharacterById(characterId);

            if (!character) return null;

            for (var i = 0; i < households.length; i++) {
                var household = households[i];
                var isHead = false;

                if (household.members) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === characterId && household.members[j].isHead) {
                            isHead = true;
                            break;
                        }
                    }
                }

                if (isHead) {
                    // ============================================================
                    // UPDATED: Find heirs using FamilyAccessors
                    // ============================================================
                    var heirs = [];

                    // Try FamilyAccessors first
                    var fa = _getFamilyAccessors();
                    if (fa && typeof fa.getAllChildren === 'function') {
                        var childrenResult = fa.getAllChildren(characterId, false);
                        if (childrenResult) {
                            // Children are already sorted by birth year (eldest first)
                            for (var c = 0; c < childrenResult.length; c++) {
                                var child = childrenResult[c].character;
                                if (!child.isDeceased) {
                                    heirs.push({ character: child, relationship: childrenResult[c].type });
                                }
                            }
                        }
                    }

                    // Fallback: use CharacterQueries
                    if (heirs.length === 0 && typeof window.CharacterQueries !== 'undefined') {
                        var queries = window.CharacterQueries;
                        if (typeof queries.getCharacterChildren === 'function') {
                            var childChars = queries.getCharacterChildren(characterId, false);
                            for (var c = 0; c < childChars.length; c++) {
                                heirs.push({ character: childChars[c], relationship: 'biological' });
                            }
                        }
                    }

                    // Ultimate fallback: direct data access
                    if (heirs.length === 0) {
                        var allChars = _getCharacters();
                        for (var c = 0; c < allChars.length; c++) {
                            if (allChars[c].motherId === characterId || allChars[c].fatherId === characterId) {
                                if (!allChars[c].isDeceased) {
                                    heirs.push({ character: allChars[c], relationship: 'biological' });
                                }
                            }
                        }
                        // Sort by birth year (eldest first)
                        heirs.sort(function(a, b) {
                            return (a.character.birthYear || 0) - (b.character.birthYear || 0);
                        });
                    }

                    // Additional: Check for adopted children
                    if (character.adoptedChildren) {
                        for (var c = 0; c < character.adoptedChildren.length; c++) {
                            var adopted = _getCharacterById(character.adoptedChildren[c].childId);
                            if (adopted && !adopted.isDeceased) {
                                var exists = false;
                                for (var h = 0; h < heirs.length; h++) {
                                    if (heirs[h].character.id === adopted.id) {
                                        exists = true;
                                        break;
                                    }
                                }
                                if (!exists) {
                                    heirs.push({ character: adopted, relationship: 'adopted' });
                                }
                            }
                        }
                        // Re-sort after adding adopted children
                        heirs.sort(function(a, b) {
                            return (a.character.birthYear || 0) - (b.character.birthYear || 0);
                        });
                    }

                    if (heirs.length > 0) {
                        var heir = heirs[0].character;
                        if (heir && typeof window.transferHouseholdToHeir === 'function') {
                            var transferResult = window.transferHouseholdToHeir(household.id, heir.id);
                            results.push({
                                household: household.name,
                                heir: heir.name,
                                relationship: heirs[0].relationship || 'unknown',
                                success: transferResult ? true : false
                            });
                        } else {
                            // Attempt to add heir as household head directly
                            if (typeof window.addHouseholdMember === 'function') {
                                var added = window.addHouseholdMember(household.id, heir.id, 'family', {
                                    role: 'Head of Household',
                                    isHead: true,
                                    joinedYear: _getCurrentYear(),
                                    notes: 'Inherited from ' + character.name
                                });
                                results.push({
                                    household: household.name,
                                    heir: heir.name,
                                    success: added ? true : false,
                                    reason: added ? null : 'Failed to transfer'
                                });
                            } else {
                                results.push({
                                    household: household.name,
                                    heir: heir.name,
                                    success: false,
                                    reason: 'Transfer function not available'
                                });
                            }
                        }
                    } else {
                        // No heirs - mark as abandoned
                        household.status = 'abandoned';
                        household.abandonedYear = _getCurrentYear();
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData();
                        }
                        results.push({
                            household: household.name,
                            heir: null,
                            success: false,
                            reason: 'No eligible heirs found - household abandoned'
                        });
                    }
                }
            }

            return results;

        } finally {
            _processingInheritance = false;
        }
    }

    function processAllPendingInheritance(showNotifications) {
        showNotifications = (showNotifications !== undefined) ? showNotifications : true;

        if (_processingInheritance) {
            console.warn('processAllPendingInheritance: already running, skipping');
            return null;
        }
        _processingInheritance = true;

        try {
            if (typeof window.processAllPendingInheritance === 'function' &&
                window.processAllPendingInheritance !== processAllPendingInheritance) {
                var results = window.processAllPendingInheritance(showNotifications);
                return results;
            }

            var households = _getAllHouseholds();
            var results = [];
            var successCount = 0;
            var failCount = 0;

            for (var i = 0; i < households.length; i++) {
                var household = households[i];

                var deceasedHead = null;
                for (var j = 0; j < (household.members || []).length; j++) {
                    var member = household.members[j];
                    if (member.isHead) {
                        var character = _getCharacterById(member.characterId);
                        if (character && character.isDeceased) {
                            deceasedHead = character;
                            break;
                        }
                    }
                }

                if (deceasedHead) {
                    // ============================================================
                    // UPDATED: Find heirs using FamilyAccessors
                    // ============================================================
                    var heirs = [];

                    // Try FamilyAccessors first
                    var fa = _getFamilyAccessors();
                    if (fa && typeof fa.getAllChildren === 'function') {
                        var childrenResult = fa.getAllChildren(deceasedHead.id, false);
                        if (childrenResult) {
                            for (var c = 0; c < childrenResult.length; c++) {
                                var child = childrenResult[c].character;
                                if (!child.isDeceased) {
                                    heirs.push({ character: child, relationship: childrenResult[c].type });
                                }
                            }
                        }
                    }

                    // Fallback: use CharacterQueries
                    if (heirs.length === 0 && typeof window.CharacterQueries !== 'undefined') {
                        var queries = window.CharacterQueries;
                        if (typeof queries.getCharacterChildren === 'function') {
                            var childChars = queries.getCharacterChildren(deceasedHead.id, false);
                            for (var c = 0; c < childChars.length; c++) {
                                heirs.push({ character: childChars[c], relationship: 'biological' });
                            }
                        }
                    }

                    // Ultimate fallback: direct data access
                    if (heirs.length === 0) {
                        var allChars = _getCharacters();
                        for (var c = 0; c < allChars.length; c++) {
                            if (allChars[c].motherId === deceasedHead.id || allChars[c].fatherId === deceasedHead.id) {
                                if (!allChars[c].isDeceased) {
                                    heirs.push({ character: allChars[c], relationship: 'biological' });
                                }
                            }
                        }
                        heirs.sort(function(a, b) {
                            return (a.character.birthYear || 0) - (b.character.birthYear || 0);
                        });
                    }

                    if (heirs && heirs.length > 0) {
                        var heir = heirs[0].character;
                        if (typeof window.transferHouseholdToHeir === 'function') {
                            var transferResult = window.transferHouseholdToHeir(household.id, heir.id);
                            if (transferResult) {
                                successCount++;
                                results.push({
                                    household: household.name,
                                    heir: heir.name,
                                    success: true,
                                    reason: 'Succession complete'
                                });
                            } else {
                                failCount++;
                                results.push({
                                    household: household.name,
                                    heir: heir.name,
                                    success: false,
                                    reason: 'Failed to transfer'
                                });
                            }
                        } else {
                            // Attempt to add heir as household head directly
                            if (typeof window.addHouseholdMember === 'function') {
                                var added = window.addHouseholdMember(household.id, heir.id, 'family', {
                                    role: 'Head of Household',
                                    isHead: true,
                                    joinedYear: _getCurrentYear(),
                                    notes: 'Inherited from ' + deceasedHead.name
                                });
                                if (added) {
                                    successCount++;
                                    results.push({
                                        household: household.name,
                                        heir: heir.name,
                                        success: true,
                                        reason: 'Succession complete'
                                    });
                                } else {
                                    failCount++;
                                    results.push({
                                        household: household.name,
                                        heir: heir.name,
                                        success: false,
                                        reason: 'Failed to transfer'
                                    });
                                }
                            } else {
                                failCount++;
                                results.push({
                                    household: household.name,
                                    heir: heir.name,
                                    success: false,
                                    reason: 'Transfer function not available'
                                });
                            }
                        }
                    } else {
                        household.status = 'abandoned';
                        household.abandonedYear = _getCurrentYear();
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData();
                        }
                        failCount++;
                        results.push({
                            household: household.name,
                            heir: null,
                            success: false,
                            reason: 'No eligible heirs found - household abandoned'
                        });
                    }
                }
            }

            if (showNotifications && (successCount > 0 || failCount > 0)) {
                var icon = _getIcon('CHECK', '✓');
                _showToast(icon + ' Inheritance: ' + successCount + ' transferred, ' + failCount + ' abandoned',
                    successCount > 0 ? 'success' : 'warning');
            }

            return results;

        } finally {
            _processingInheritance = false;
        }
    }

    function hasPendingInheritance(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.isDeceased) return false;

        var households = _getAllHouseholds();
        for (var i = 0; i < households.length; i++) {
            var household = households[i];
            if (household.members && household.members.some(function(m) { return m.characterId === characterId; })) {
                if (typeof window.getHouseholdHead === 'function') {
                    var head = window.getHouseholdHead(household.id);
                    if (head && head.id === characterId) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // =========================================================================
    // 10. AGING MORTALITY
    // =========================================================================

    function applyAgingMortality(character, yearsAdvanced) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            if (!character || character.isDeceased) {
                return { success: false, reason: 'Character already deceased' };
            }

            var currentYear = _getCurrentYear();
            var endAge = _calculateAge(character.birthYear, false, null);

            if (endAge < 0) {
                return { success: false, reason: 'Invalid age' };
            }

            var mortalityRisk = 0;
            if (endAge < 1) mortalityRisk = 0.02;
            else if (endAge < 5) mortalityRisk = 0.01;
            else if (endAge < 18) mortalityRisk = 0.005;
            else if (endAge < 45) mortalityRisk = 0.01 * (yearsAdvanced || 1);
            else if (endAge < 60) mortalityRisk = 0.02 * (yearsAdvanced || 1);
            else if (endAge < 75) mortalityRisk = 0.05 * (yearsAdvanced || 1);
            else mortalityRisk = 0.10 * (yearsAdvanced || 1);

            mortalityRisk = Math.min(mortalityRisk, 0.95);

            if (_chance(mortalityRisk)) {
                return killCharacterRandomCause(character, currentYear);
            }

            return { success: false, reason: 'Survived' };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. LIFESPAN PREDICTION
    // =========================================================================

    function predictLifespan(character) {
        if (!character) return 0;

        var gender = character.gender;
        var baseExpectancy = gender === 'female' ? 45 : 40;

        if (character.activeRankId && _getRankById) {
            var rank = _getRankById(character.activeRankId);
            if (rank && rank.priority <= 2) baseExpectancy += 10;
            else if (rank && rank.priority <= 3) baseExpectancy += 5;
        }

        var variation = Math.floor((_random() * 25) - 10);
        var predictedAge = baseExpectancy + variation;

        return Math.max(1, Math.min(predictedAge, 95));
    }

    function getExpectedRemainingYears(character) {
        if (!character || character.isDeceased) return 0;

        var currentAge = _calculateAge(character.birthYear, false, null);
        var predictedAge = predictLifespan(character);

        return Math.max(0, predictedAge - currentAge);
    }

    // =========================================================================
    // 12. DEATH EVENT WRAPPERS (Natural & Accidental)
    // =========================================================================

    function triggerNaturalDeath(character, deathYear, options) {
        deathYear = deathYear || null;
        options = options || {};

        if (!character || character.isDeceased) {
            return { success: false, reason: 'Character already deceased' };
        }

        var year = deathYear || _getCurrentYear();
        var age = _calculateAge(character.birthYear, false, null);
        var cause = getRandomDeathCause(age, character.gender);

        var result = killCharacter(character, year, cause, options);

        _logEvent('death', 'Natural Death',
            character.name + ' died of ' + cause.toLowerCase() + ' at age ' + age + ' in ' + year,
            [character]);

        return result;
    }

    function triggerAccidentalDeath(character, deathYear, accidentType, options) {
        deathYear = deathYear || null;
        accidentType = accidentType || null;
        options = options || {};

        if (!character || character.isDeceased) {
            return { success: false, reason: 'Character already deceased' };
        }

        var accidentTypes = [
            'Fell from a height', 'Drowning', 'Fire', 'Hunting accident',
            'Crushed by falling object', 'Animal attack', 'Cart accident',
            'Building collapse', 'Tools accident', 'Poisoning accident'
        ];

        var type = accidentType || _pickRandom(accidentTypes);
        var year = deathYear || _getCurrentYear();
        var age = _calculateAge(character.birthYear, false, null);

        var result = killCharacter(character, year, type, {
            notes: options.notes || 'Accidental death: ' + type.toLowerCase()
        });

        _logEvent('accident', 'Accidental Death',
            character.name + ' died in a ' + type.toLowerCase() + ' accident at age ' + age + ' in ' + year,
            [character]);

        return result;
    }

    // =========================================================================
    // 13. FAMILY STATISTICS HELPERS (NEW - Using FamilyAccessors)
    // =========================================================================

    /**
     * Gets family statistics for a character (using FamilyAccessors if available)
     * @param {string} characterId - Character ID
     * @returns {Object|null} Family statistics
     */
    function getCharacterFamilyStatistics(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getFamilyStatistics === 'function') {
                return fa.getFamilyStatistics(characterId);
            }

            // Fallback: use CharacterQueries
            if (typeof window.CharacterQueries !== 'undefined' &&
                typeof window.CharacterQueries.getCharacterFamilyStatistics === 'function') {
                return window.CharacterQueries.getCharacterFamilyStatistics(characterId);
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the primary heir for a character (using FamilyAccessors)
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @param {boolean} options.includeAdopted - Include adopted children (default: true)
     * @param {boolean} options.onlyLegitimate - Only legitimate children (default: false)
     * @param {string} options.genderPreference - 'male', 'female', or null
     * @returns {Object|null} Heir character or null
     */
    function getPrimaryHeir(characterId, options) {
        if (_processing) return null;
        _processing = true;

        try {
            options = options || {};
            var fa = _getFamilyAccessors();

            // Use FamilyAccessors if available
            if (fa && typeof fa.getAllChildren === 'function') {
                var children = fa.getAllChildren(characterId, false);
                if (!children) return null;

                // Filter by legitimacy
                if (options.onlyLegitimate) {
                    children = children.filter(function(c) { return c.character.isLegitimate !== false; });
                }

                // Filter by gender preference
                if (options.genderPreference) {
                    children = children.filter(function(c) { return c.character.gender === options.genderPreference; });
                }

                // Filter adopted if needed
                if (!options.includeAdopted) {
                    children = children.filter(function(c) { return c.type === 'biological'; });
                }

                if (children.length === 0) return null;

                // Return eldest living child
                for (var i = 0; i < children.length; i++) {
                    if (!children[i].character.isDeceased) {
                        return children[i].character;
                    }
                }

                // If all deceased, return eldest
                return children[0].character;
            }

            // Fallback: use CharacterQueries
            if (typeof window.CharacterQueries !== 'undefined' &&
                typeof window.CharacterQueries.getCharacterChildren === 'function') {
                var children = window.CharacterQueries.getCharacterChildren(characterId, false);
                if (!children || children.length === 0) return null;

                // Filter by legitimacy
                if (options.onlyLegitimate) {
                    children = children.filter(function(c) { return c.isLegitimate !== false; });
                }

                // Filter by gender preference
                if (options.genderPreference) {
                    children = children.filter(function(c) { return c.gender === options.genderPreference; });
                }

                // Filter adopted if needed
                if (!options.includeAdopted) {
                    children = children.filter(function(c) {
                        return c.motherId === characterId || c.fatherId === characterId;
                    });
                }

                // Return eldest living child
                for (var i = 0; i < children.length; i++) {
                    if (!children[i].isDeceased) {
                        return children[i];
                    }
                }

                return children[0];
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all potential heirs for a character (including siblings and extended family)
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @returns {Array} Array of potential heir characters with relationship info
     */
    function getPotentialHeirs(characterId, options) {
        if (_processing) return [];
        _processing = true;

        try {
            options = options || {};
            var fa = _getFamilyAccessors();
            var heirs = [];

            // 1. Primary heirs: children
            var children = [];
            if (fa && typeof fa.getAllChildren === 'function') {
                var childrenResult = fa.getAllChildren(characterId, false);
                if (childrenResult) {
                    children = childrenResult.map(function(c) { return { character: c.character, relationship: c.type }; });
                }
            } else if (typeof window.CharacterQueries !== 'undefined' &&
                typeof window.CharacterQueries.getCharacterChildren === 'function') {
                var childChars = window.CharacterQueries.getCharacterChildren(characterId, false);
                children = childChars.map(function(c) { return { character: c, relationship: 'biological' }; });
            }

            // Filter children
            if (options.onlyLegitimate) {
                children = children.filter(function(c) { return c.character.isLegitimate !== false; });
            }
            if (options.genderPreference) {
                children = children.filter(function(c) { return c.character.gender === options.genderPreference; });
            }
            if (!options.includeAdopted) {
                children = children.filter(function(c) { return c.relationship !== 'adopted'; });
            }

            for (var i = 0; i < children.length; i++) {
                heirs.push({
                    character: children[i].character,
                    relationship: children[i].relationship === 'biological' ? 'Child' : 'Adopted Child',
                    priority: 1
                });
            }

            // 2. Secondary heirs: siblings (if no children)
            if (heirs.length === 0 || options.includeSiblings) {
                var siblings = [];
                if (fa && typeof fa.getSiblings === 'function') {
                    var siblingsResult = fa.getSiblings(characterId, true, false);
                    if (siblingsResult) {
                        siblings = siblingsResult.map(function(s) { return s.character; });
                    }
                } else if (typeof window.CharacterQueries !== 'undefined' &&
                    typeof window.CharacterQueries.getCharacterSiblings === 'function') {
                    siblings = window.CharacterQueries.getCharacterSiblings(characterId, true, false);
                }

                for (var i = 0; i < siblings.length; i++) {
                    heirs.push({
                        character: siblings[i],
                        relationship: 'Sibling',
                        priority: 2
                    });
                }
            }

            // 3. Tertiary heirs: parents (if no children or siblings)
            if (heirs.length === 0 || options.includeParents) {
                var parents = [];
                if (fa && typeof fa.getParents === 'function') {
                    var parentsResult = fa.getParents(characterId);
                    if (parentsResult) {
                        if (parentsResult.father) parents.push(parentsResult.father);
                        if (parentsResult.mother) parents.push(parentsResult.mother);
                    }
                } else if (typeof window.CharacterQueries !== 'undefined' &&
                    typeof window.CharacterQueries.getCharacterParents === 'function') {
                    var parentsResult = window.CharacterQueries.getCharacterParents(characterId, false);
                    if (parentsResult.father) parents.push(parentsResult.father);
                    if (parentsResult.mother) parents.push(parentsResult.mother);
                }

                for (var i = 0; i < parents.length; i++) {
                    heirs.push({
                        character: parents[i],
                        relationship: 'Parent',
                        priority: 3
                    });
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueHeirs = [];
            for (var i = 0; i < heirs.length; i++) {
                if (heirs[i].character && !seenIds[heirs[i].character.id]) {
                    seenIds[heirs[i].character.id] = true;
                    uniqueHeirs.push(heirs[i]);
                }
            }

            // Sort by priority then birth year
            uniqueHeirs.sort(function(a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return (a.character.birthYear || 0) - (b.character.birthYear || 0);
            });

            return uniqueHeirs;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        // Life stages
        getLifeStage: getLifeStage,
        getLifeStageName: getLifeStageName,
        isElderly: isElderly,
        getAgeGroup: getAgeGroup,
        getAgeGroupIcon: getAgeGroupIcon,
        getAgeGroupEmoji: getAgeGroupEmoji,
        getAllAgeGroups: getAllAgeGroups,
        getAgeGroupIndex: getAgeGroupIndex,
        groupCharactersByAgeGroup: groupCharactersByAgeGroup,

        // Death causes
        getRandomDeathCause: getRandomDeathCause,

        // Death execution
        killCharacter: killCharacter,
        killCharacterRandomCause: killCharacterRandomCause,
        applyAgingMortality: applyAgingMortality,

        // Lifespan
        predictLifespan: predictLifespan,
        getExpectedRemainingYears: getExpectedRemainingYears,

        // Death event wrappers
        triggerNaturalDeath: triggerNaturalDeath,
        triggerAccidentalDeath: triggerAccidentalDeath,

        // Inheritance
        processHouseholdInheritance: processHouseholdInheritance,
        processAllPendingInheritance: processAllPendingInheritance,
        hasPendingInheritance: hasPendingInheritance,

        // Family Statistics (NEW)
        getCharacterFamilyStatistics: getCharacterFamilyStatistics,
        getPrimaryHeir: getPrimaryHeir,
        getPotentialHeirs: getPotentialHeirs
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }

})();