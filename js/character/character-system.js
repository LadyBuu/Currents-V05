/**
 * =============================================================================
 * STILL WATERS - CHARACTER SYSTEM COMPATIBILITY SHIM
 * (js/character/character-system.js)
 * =============================================================================
 *
 * Purpose: expose the pre-refactor global API as one-way aliases onto the
 * canonical modules, for the remaining callers that have not yet been
 * migrated.
 *
 * LOAD THIS FILE LAST, after every other character subsystem file.
 *
 * This file:
 *   - declares NO constants
 *   - provides NO fallback implementations
 *   - returns NO fake empty data
 *   - contains NO business logic
 *   - defines NO domain behaviour
 *   - does NOT re-export deleted modules
 *
 * If a canonical module is missing, this file throws. Silent degradation is
 * not a compatibility feature. Every alias here points at a function that
 * already exists on a canonical namespace.
 *
 * MIGRATION POLICY:
 *   Every alias below is one-way. New code must call the canonical
 *   namespaces directly:
 *
 *     CharacterState
 *     CharacterCommands
 *     CharacterQueries
 *     CharacterCreationCommands
 *     CharacterDeletionCommands
 *     CharacterLifecycle
 *     FamilyRules, FamilyState, FamilyQueries, FamilyCommands
 *     MortalityRules, MortalityQueries, MortalityStatistics
 *
 *   The aliases exist so existing call sites keep working during the
 *   transition. Each alias should be removed once no caller references it.
 *
 *   To find remaining consumers:  grep -rn "window\.getCharacterById\b" js/
 *   (repeat for each alias; delete the alias when the count reaches zero.)
 *
 * DELETED MODULES (NOT aliased here):
 *   The following domains were deleted during the character refactor. Their
 *   global names are deliberately absent, not silently restored:
 *
 *     RelationshipState, RelationshipQueries, RelationshipCommands,
 *     RelationshipRules, RelationshipTypes, RelationshipUI
 *     RomanceRules, RomanceQueries, RomanceCommands
 *     FriendshipRules, FriendshipQueries, FriendshipCommands
 *     JealousyRules, JealousyQueries, JealousyCommands
 *     AffairRules, AffairQueries, AffairCommands
 *     MatchmakingRules, MatchmakingQueries
 *     ProfessionalRules, ProfessionalQueries, ProfessionalCommands
 *     ChildrenState, ChildrenCommands, ChildrenQueries,
 *     ChildrenLifecycle, PregnancyService, SurrogacyService,
 *     AdoptionService
 *     MortalityState, MortalityCommands
 *
 *   If any caller still references those names, they will receive
 *   `undefined`. That is a bug, not a shim failure. Fix the caller.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['CharacterState',             'character-state.js'],
        ['CharacterCommands',          'character-commands.js'],
        ['CharacterQueries',           'character-queries.js'],
        ['CharacterCreationCommands',  'character-creation-commands.js'],
        ['CharacterDeletionCommands',  'character-deletion-commands.js'],
        ['CharacterLifecycle',         'character-lifecycle.js'],
        ['FamilyRules',                'family-rules.js'],
        ['FamilyState',                'family-state.js'],
        ['FamilyQueries',              'family-queries.js'],
        ['FamilyCommands',             'family-commands.js'],
        ['MortalityRules',             'mortality-rules.js'],
        ['MortalityQueries',           'mortality-queries.js'],
        ['MortalityStatistics',        'mortality-statistics.js']
    ];

    var missing = [];
    for (var i = 0; i < REQUIRED.length; i++) {
        if (typeof window[REQUIRED[i][0]] === 'undefined') {
            missing.push(REQUIRED[i][0] + ' (' + REQUIRED[i][1] + ')');
        }
    }
    if (missing.length > 0) {
        throw new Error(
            'character-system.js cannot install legacy aliases. ' +
            'Missing canonical modules: ' + missing.join(', ')
        );
    }

    var CS  = window.CharacterState;
    var CC  = window.CharacterCommands;
    var CQ  = window.CharacterQueries;
    var CCC = window.CharacterCreationCommands;
    var CDC = window.CharacterDeletionCommands;
    var CL  = window.CharacterLifecycle;

    // =========================================================================
    // 2. STATE ALIASES
    // =========================================================================
    //
    // Read side of CharacterState. Existing callers that used accessors.js
    // continue to work; accessors.js is free to disappear once nothing
    // references it.

    /**
     * Returns all characters as projections.
     */
    window.getCharacters = function () {
        return CS.getAllCharacters();
    };

    /**
     * Returns a character projection by id, or null.
     *
     * Historically returned a live canonical object. Now returns a
     * projection. Callers that mutated the result through this function
     * were relying on removed behaviour; those callers must migrate to
     * CharacterCommands.
     */
    window.getCharacterById = function (id) {
        return CS.getCharacter(id);
    };

    window.getTotalCharacterCount = function () {
        return CS.getTotalCharacterCount();
    };

    window.hasCharacter = function (id) {
        return CS.hasCharacter(id);
    };

    // State indexes

    window.getLivingCharacters = function () {
        return CS.getLivingCharacters();
    };

    window.getDeceasedCharacters = function () {
        return CS.getDeceasedCharacters();
    };

    window.getCharactersByCurrentLocation = function (locationId) {
        return CS.getCharactersByCurrentLocation(locationId);
    };

    window.getCharactersByBirthplace = function (locationId) {
        return CS.getCharactersByBirthplace(locationId);
    };

    window.getCharactersByHousehold = function (householdId) {
        return CS.getCharactersByHousehold(householdId);
    };

    window.getCharactersByStatus = function (status) {
        return CS.getCharactersByStatus(status);
    };

    window.getCharactersByGender = function (gender) {
        return CS.getCharactersByGender(gender);
    };

    window.getCharactersByProfession = function (roleId) {
        return CS.getCharactersByProfession(roleId);
    };

    window.getCharactersByRank = function (rankId) {
        return CS.getCharactersByRank(rankId);
    };

    window.getCharactersByBirthDecade = function (decadeStartYear) {
        return CS.getCharactersByBirthDecade(decadeStartYear);
    };

    window.getCharactersByReligion = function (religionId) {
        return CS.getCharactersByReligion(religionId);
    };

    window.getCharactersByCulture = function (cultureId) {
        return CS.getCharactersByCulture(cultureId);
    };

    window.searchCharactersByName = function (query) {
        return CS.searchByName(query);
    };

    // Subscriptions

    window.subscribeCharacters = function (callback) {
        return CS.subscribe(callback);
    };

    // =========================================================================
    // 3. QUERY ALIASES
    // =========================================================================

    window.searchCharacters = function (query) {
        return CQ.searchCharacters(query);
    };

    window.readCharactersByName = function (name) {
        return CQ.readCharactersByName(name);
    };

    window.getCharacterSummary = function (id) {
        return CQ.getCharacterSummary(id);
    };

    window.getCharacterFacts = function (id) {
        return CQ.getCharacterFacts(id);
    };

    window.getAllCharacterFacts = function () {
        return CQ.getAllCharacterFacts();
    };

    window.getCharacterDisplayName = function (id) {
        return CQ.getCharacterDisplayName(id);
    };

    window.getCharactersInLocations = function (locationIds) {
        return CQ.getCharactersInLocations(locationIds);
    };

    window.getCharacterProfessions = function (id) {
        return CQ.getCharacterProfessions(id);
    };

    window.getPrimaryProfession = function (id) {
        return CQ.getPrimaryProfession(id);
    };

    window.getCharacterChildren = function (characterId) {
        return CQ.getCharacterChildren(characterId);
    };

    window.getCharacterParents = function (characterId) {
        return CQ.getCharacterParents(characterId);
    };

    window.getCharacterSiblings = function (characterId) {
        return CQ.getCharacterSiblings(characterId);
    };

    window.getCharacterGrandparents = function (characterId, generation) {
        return CQ.getCharacterGrandparents(characterId, generation);
    };

    window.getCharacterGrandchildren = function (characterId, generation) {
        return CQ.getCharacterGrandchildren(characterId, generation);
    };

    window.getCharacterKinship = function (charId1, charId2) {
        return CQ.getCharacterKinship(charId1, charId2);
    };

    window.getCharacterKinshipCloseness = function (charId1, charId2) {
        return CQ.getCharacterKinshipCloseness(charId1, charId2);
    };

    // =========================================================================
    // 4. COMMAND ALIASES
    // =========================================================================

    window.updateCharacterFields = function (characterId, updates) {
        return CC.updateCharacterFields(characterId, updates);
    };

    window.updateCharactersFields = function (changes) {
        return CC.updateCharactersFields(changes);
    };

    window.markCharacterDeceased = function (characterId, deathData) {
        return CC.markDeceased(characterId, deathData);
    };

    // Professions

    window.getCharacterProfession = function (characterId, professionId) {
        return CC.getProfession(characterId, professionId);
    };

    window.getCharacterProfessionsList = function (characterId) {
        return CC.getProfessions(characterId);
    };

    window.addProfession = function (characterId, professionData) {
        return CC.addProfession(characterId, professionData);
    };

    window.updateProfession = function (characterId, professionId, updates) {
        return CC.updateProfession(characterId, professionId, updates);
    };

    window.removeProfession = function (characterId, professionId) {
        return CC.removeProfession(characterId, professionId);
    };

    window.removeProfessionFromAll = function (professionId) {
        return CC.removeProfessionFromAll(professionId);
    };

    window.replaceProfessions = function (characterId, professions) {
        return CC.replaceProfessions(characterId, professions);
    };

    window.setPrimaryProfession = function (characterId, professionId) {
        return CC.setPrimaryProfession(characterId, professionId);
    };

    window.clearPrimaryProfession = function (characterId) {
        return CC.clearPrimaryProfession(characterId);
    };

    // Surname

    window.recordCharacterSurnameChange = function (id, newSurname, year, reason, options) {
        return CC.recordCharacterSurnameChange(id, newSurname, year, reason, options);
    };

    window.revertCharacterSurnameChange = function (id) {
        return CC.revertCharacterSurnameChange(id);
    };

    // Religion orchestration

    window.assignCharacterReligion = function (characterId, religionId, options) {
        return CC.assignCharacterReligion(characterId, religionId, options);
    };

    window.removeCharacterReligion = function (characterId) {
        return CC.removeCharacterReligion(characterId);
    };

    // =========================================================================
    // 5. CREATION ALIASES
    // =========================================================================

    window.createCharacter = function (data, options) {
        return CCC.createCharacter(data, options);
    };

    window.createCharacterFromData = function (builtCharacter) {
        return CCC.createCharacterFromData(builtCharacter);
    };

    window.createRandomCharacter = function (options) {
        return CCC.createRandomCharacter(options);
    };

    window.bulkCreateCharacters = function (dataArray, options) {
        return CCC.bulkCreateCharacters(dataArray, options);
    };

    // =========================================================================
    // 6. DELETION ALIASES
    // =========================================================================

    window.deleteCharacter = function (characterId) {
        return CDC.deleteCharacter(characterId);
    };

    window.softDeleteCharacter = function (characterId) {
        return CDC.softDeleteCharacter(characterId);
    };

    window.restoreSoftDeletedCharacter = function (characterId) {
        return CDC.restoreSoftDeletedCharacter(characterId);
    };

    window.purgeSoftDeletedCharacters = function () {
        return CDC.purgeSoftDeletedCharacters();
    };

    window.bulkDeleteCharacters = function (ids, soft) {
        return CDC.bulkDeleteCharacters(ids, soft);
    };

    window.getSoftDeletedCharacters = function () {
        return CDC.getSoftDeletedCharacters();
    };

    // =========================================================================
    // 7. LIFECYCLE ALIASES
    // =========================================================================

    window.advanceMortality = function (yearsAdvanced, options) {
        return CL.advanceMortality(yearsAdvanced, options);
    };

    window.killCharacter = function (characterId, deathData) {
        return CL.killCharacter(characterId, deathData);
    };

    // Legacy signature compatibility.
    //
    // The pre-refactor global was:
    //     killCharacter(character, deathYear, deathCause, options)
    //
    // The new canonical signature is:
    //     CharacterLifecycle.killCharacter(characterId, deathData)
    //
    // Callers passing the old signature are not supported by this shim.
    // They must migrate. This shim does not silently transform the old
    // call into the new one, because "character" and "characterId" are
    // not interchangeable and "deathCause" is now a stable id, not prose.

    // =========================================================================
    // 8. FAMILY ALIASES
    // =========================================================================
    //
    // The family domain owns parentage. These aliases expose the current
    // FamilyQueries / FamilyCommands surface under the names older callers
    // expect.

    window.getFamilyParents = function (childId, options) {
        return window.FamilyQueries.getParents(childId, options);
    };

    window.getFamilyParentsByRole = function (childId) {
        return window.FamilyQueries.getParentsByRole(childId);
    };

    window.getFamilyChildren = function (parentId, options) {
        return window.FamilyQueries.getChildren(parentId, options);
    };

    window.getFamilyChildIds = function (parentId) {
        return window.FamilyQueries.getChildIds(parentId);
    };

    window.getFamilySiblings = function (childId) {
        return window.FamilyQueries.getSiblings(childId);
    };

    window.getFamilyGrandparentIds = function (childId, generation) {
        return window.FamilyQueries.getGrandparentIds(childId, generation);
    };

    window.getFamilyGrandchildIds = function (parentId, generation) {
        return window.FamilyQueries.getGrandchildIds(parentId, generation);
    };

    window.setFamilyParent = function (childId, parentId, options) {
        return window.FamilyCommands.setParent(childId, parentId, options);
    };

    window.removeFamilyParent = function (edgeId, options) {
        return window.FamilyCommands.removeParent(edgeId, options);
    };

    window.createFamilyAdoption = function (childId, adopterId, options) {
        return window.FamilyCommands.createAdoption(childId, adopterId, options);
    };

    window.removeFamilyAdoption = function (childId, adopterId, options) {
        return window.FamilyCommands.removeAdoption(childId, adopterId, options);
    };

    // =========================================================================
    // 9. MORTALITY ALIASES
    // =========================================================================

    window.isCharacterLiving = function (characterId) {
        return window.MortalityQueries.isLiving(characterId);
    };

    window.isCharacterDeceased = function (characterId) {
        return window.MortalityQueries.isDeceased(characterId);
    };

    window.getDeathRecord = function (characterId) {
        return window.MortalityQueries.getDeathRecord(characterId);
    };

    window.getAllDeathRecords = function () {
        return window.MortalityQueries.getAllDeathRecords();
    };

    window.getDeathsByYear = function (year) {
        return window.MortalityQueries.getDeathsByYear(year);
    };

    window.getDeathsByCause = function (cause) {
        return window.MortalityQueries.getDeathsByCause(cause);
    };

    window.getMurderRecords = function () {
        return window.MortalityQueries.getMurderRecords();
    };

    window.getExecutionRecords = function () {
        return window.MortalityQueries.getExecutionRecords();
    };

    window.getMortalityStatistics = function () {
        return window.MortalityStatistics.getMortalityStatistics();
    };

    window.getMurderStatistics = function () {
        return window.MortalityStatistics.getMurderStatistics();
    };

    window.getExecutionStatistics = function () {
        return window.MortalityStatistics.getExecutionStatistics();
    };

    // =========================================================================
    // 10. DELETED ALIASES (INTENTIONALLY NOT REINSTATED)
    // =========================================================================
    //
    // The following globals existed in pre-refactor modules and are
    // deliberately not provided. Reinstating any of them would resurrect
    // an architectural problem the refactor removed. If a caller still
    // references one by name, fix the caller.
    //
    //   triggerMurder(victim, killer, year, options)
    //       Use CharacterLifecycle.killCharacter with isMurder: true.
    //
    //   triggerExecution(condemned, year, reason, options)
    //       Use CharacterLifecycle.killCharacter with isExecution: true.
    //
    //   updateDeathRecord(characterId, updates)
    //       Not provided. Death is written once through markDeceased.
    //       Post-death edits, if needed, must go through a future
    //       CharacterCommands.updateDeathData command.
    //
    //   setParent(childId, parentId, parentType, options)  [old signature]
    //       Use FamilyCommands.setParent(childId, parentId, options) with
    //       the options object.
    //
    //   generateNewborn(mother, father, birthYear, options)
    //       Children domain. Not implemented.
    //
    //   createAdoption(parentId, childId, options)   [old signature]
    //       Use FamilyCommands.createAdoption(childId, adopterId, options).
    //       Argument order is reversed from the old signature.
    //
    //   removeAdoption(parentId, childId, options)   [old signature]
    //       Use FamilyCommands.removeAdoption(childId, adopterId, options).
    //       Argument order is reversed from the old signature.
    //
    //   getAdoptiveParents, getAdoptedChildren, isAdoptiveParent,
    //   getAdoptionType, getAdoptionYear, getAdoptionRecord,
    //   validateAdoption, createGuardianship, createFosterPlacement,
    //   removeAllAdoptiveParents, getAdoptionStats
    //       Children/adoption domain. Not implemented.
    //
    //   recordBirth, recordAdoption, legitimizeChild, recordSurrogacy,
    //   updateSurrogacyRecord, generateChildrenForCouple,
    //   getCharacterLastChildBirthYear, getCharacterTotalChildren
    //       Children domain. Not implemented.
    //
    //   getChildren, getParents, getSiblings   [unified across bio/adopt]
    //       Not provided under these names. FamilyQueries exposes the
    //       edges separately; callers compose.
    //
    //   getRelationshipBetween, getRelationshipsForCharacter,
    //   getActiveRomanticRelationships, getMutualConnections,
    //   getSocialDistance, getRelationshipNetwork,
    //   getRelationshipRecommendations, and every other relationship-*
    //   global
    //       Relationship domain. Not implemented.
    //
    //   getRankById, getActiveRankDisplay, getRanks
    //       Rank domain. Not implemented here. If your rank module still
    //       exists, it provides them; this shim does not.
    //
    //   getCurrentLocation, getPlaceById, getPlaces
    //       Location/world domain. Not implemented here. If your world
    //       module still exists, it provides them.
    //
    //   saveMasterData
    //       Storage. Not touched by this shim. If storage.js is loaded,
    //       it exposes this name. The character subsystem never calls it.
    //
    //   MortalityState, MortalityCommands, ChildrenState,
    //   ChildrenCommands, ChildrenQueries, ChildrenLifecycle,
    //   PregnancyService, SurrogacyService, AdoptionService,
    //   RelationshipState, RelationshipQueries, RelationshipCommands,
    //   RelationshipRules, RomanceCommands, RomanceQueries,
    //   FriendshipCommands, FriendshipQueries, JealousyCommands,
    //   JealousyQueries, AffairCommands, AffairQueries,
    //   ProfessionalCommands, ProfessionalQueries, MatchmakingQueries
    //       Deleted modules. Names are undefined. Fix callers.

    // =========================================================================
    // 11. DIAGNOSTIC
    // =========================================================================

    if (window.console && typeof window.console.debug === 'function') {
        window.console.debug(
            'character-system.js: legacy aliases installed (compatibility shim). ' +
            'New code should call CharacterState / CharacterCommands / ' +
            'CharacterQueries / CharacterCreationCommands / ' +
            'CharacterDeletionCommands / CharacterLifecycle / FamilyRules / ' +
            'FamilyState / FamilyQueries / FamilyCommands / MortalityRules / ' +
            'MortalityQueries / MortalityStatistics directly.'
        );
    }

    // =========================================================================
    // 12. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // State
            getCharacters: window.getCharacters,
            getCharacterById: window.getCharacterById,
            getTotalCharacterCount: window.getTotalCharacterCount,
            hasCharacter: window.hasCharacter,
            getLivingCharacters: window.getLivingCharacters,
            getDeceasedCharacters: window.getDeceasedCharacters,
            subscribeCharacters: window.subscribeCharacters,

            // Queries
            searchCharacters: window.searchCharacters,
            getCharacterSummary: window.getCharacterSummary,
            getCharacterFacts: window.getCharacterFacts,
            getCharacterDisplayName: window.getCharacterDisplayName,

            // Commands
            updateCharacterFields: window.updateCharacterFields,
            markCharacterDeceased: window.markCharacterDeceased,
            createCharacter: window.createCharacter,
            createRandomCharacter: window.createRandomCharacter,
            deleteCharacter: window.deleteCharacter,

            // Lifecycle
            advanceMortality: window.advanceMortality,
            killCharacter: window.killCharacter,

            // Family
            setFamilyParent: window.setFamilyParent,
            removeFamilyParent: window.removeFamilyParent,
            getFamilyParents: window.getFamilyParents,
            getFamilyChildren: window.getFamilyChildren,

            // Mortality
            getDeathRecord: window.getDeathRecord,
            getMortalityStatistics: window.getMortalityStatistics
        };
    }
})();
