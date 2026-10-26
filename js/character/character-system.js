/**
 * =============================================================================
 * STILL WATERS - CHARACTER SYSTEM COMPATIBILITY SHIM
 * (js/character/character-system.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-system.js
 *
 * PURPOSE
 * -------
 * Expose the pre-refactor global API as one-way aliases onto the canonical
 * modules, for the remaining callers that have not yet been migrated.
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
 * CANONICAL NAMESPACE OWNERSHIP
 * ----------------------------
 * The character subsystem's public surface, as of this revision:
 *
 *   CharacterState            — canonical character collection
 *   CharacterCommands         — character-owned mutations (incl. death)
 *   CharacterQueries          — semantic reads + summary projection
 *   CharacterCreationCommands — creation boundary
 *   CharacterDeletionCommands — deletion boundary (soft/hard/bulk)
 *   CharacterLifecycle        — time progression + death dispatch
 *   FamilyRules               — parentage policy, kinship
 *   FamilyState               — parent-child edge collection
 *   FamilyQueries             — family graph reads
 *   FamilyCommands            — family graph mutations
 *   FamilyStatistics          — family aggregation (uses FamilyQueries)
 *   MortalityRules            — mortality policy
 *   MortalityQueries          — mortality reads
 *   MortalityStatistics       — mortality aggregation
 *   ChildrenState             — pregnancy/surrogacy/adoption storage
 *   ChildrenRules             — children policy
 *   ChildrenQueries           — children reads
 *   ChildrenCommands          — children mutations
 *   ChildrenStatistics        — children aggregation
 *   ChildrenGenerator         — birth proposal generation
 *
 * These are the canonical modules. This shim aliases legacy global names
 * onto them. If any of these is missing, this shim throws at load.
 *
 * MIGRATION POLICY
 * ----------------
 * Every alias below is one-way. New code must call the canonical
 * namespaces directly. The aliases exist so existing call sites keep
 * working during the transition. Each alias should be removed once no
 * caller references it.
 *
 * To find remaining consumers:
 *   grep -rn "window\.getCharacterById\b" js/
 *   grep -rn "window\.getFamilyParents\b" js/
 *   (repeat for each alias; delete the alias when the count reaches zero.)
 *
 * DELETED MODULES (NOT aliased here):
 *   - family-accessors.js (FamilyAccessors)    → use FamilyQueries / FamilyRules
 *   - relationship domain (Relationship*)       → optional; not part of
 *                                                  the character subsystem
 *   - mortality-state.js / mortality-commands.js (old) → removed
 *   - children-lifecycle.js / pregnancy-service.js /
 *     surrogacy-service.js / adoption-service.js        → removed
 *
 * If any caller still references those names, they receive `undefined`.
 * That is a bug, not a shim failure. Fix the caller.
 *
 * DEPENDENCIES (REQUIRED):
 *   See the REQUIRED list below. Every module listed must be loaded
 *   before this file. Load order in `load order.txt` is the source of
 *   truth.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        // Character core
        ['CharacterState',            'character-state.js'],
        ['CharacterCommands',         'character-commands.js'],
        ['CharacterQueries',          'character-queries.js'],
        ['CharacterCreationCommands', 'character-creation-commands.js'],
        ['CharacterDeletionCommands', 'character-deletion-commands.js'],
        ['CharacterLifecycle',        'character-lifecycle.js'],

        // Family
        ['FamilyRules',      'family-rules.js'],
        ['FamilyState',      'family-state.js'],
        ['FamilyQueries',    'family-queries.js'],
        ['FamilyCommands',   'family-commands.js'],
        ['FamilyStatistics', 'family-statistics.js'],

        // Mortality
        ['MortalityRules',      'mortality-rules.js'],
        ['MortalityQueries',    'mortality-queries.js'],
        ['MortalityStatistics', 'mortality-statistics.js'],

        // Children
        ['ChildrenState',      'children-state.js'],
        ['ChildrenRules',      'children-rules.js'],
        ['ChildrenQueries',    'children-queries.js'],
        ['ChildrenCommands',   'children-commands.js'],
        ['ChildrenStatistics', 'children-statistics.js'],
        ['ChildrenGenerator',  'children-generator.js']
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

    var FQ  = window.FamilyQueries;
    var FC  = window.FamilyCommands;

    var MQ  = window.MortalityQueries;
    var MS  = window.MortalityStatistics;

    // =========================================================================
    // 2. STATE ALIASES
    // =========================================================================
    //
    // Read side of CharacterState. Existing callers that used accessors.js
    // continue to work; accessors.js is free to disappear once nothing
    // references it.
    //
    // NOTE: getCharacters / getCharacterById historically returned live
    // canonical objects. They now return projections. Callers that mutated
    // the result through these functions were relying on removed
    // behaviour; those callers must migrate to CharacterCommands.

    window.getCharacters = function () {
        return CS.getAllCharacters();
    };

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

    window.getCharactersByAgeRange = function (minAge, maxAge, includeDeceased) {
        return CQ.getCharactersByAgeRange(minAge, maxAge, includeDeceased);
    };

    window.getCharacterProfessions = function (id) {
        return CQ.getCharacterProfessions(id);
    };

    window.getPrimaryProfession = function (id) {
        return CQ.getPrimaryProfession(id);
    };

    // Family delegates — these return simplified shapes; see
    // character-queries.js for the shape contract.
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

    // Death transition. The single canonical death writer.
    // Third argument is optional { referenceYear }.
    window.markCharacterDeceased = function (characterId, deathData, options) {
        return CC.markDeceased(characterId, deathData, options);
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

    // Religion orchestration (delegates to ReligionCommands when loaded)
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
    //
    // FamilyAccessors (family-accessors.js) is DELETED. Aliases below
    // route to FamilyQueries, which is the canonical implementation.

    window.getFamilyParents = function (childId, options) {
        return FQ.getParents(childId, options);
    };

    window.getFamilyParentsByRole = function (childId) {
        return FQ.getParentsByRole(childId);
    };

    window.getFamilyChildren = function (parentId, options) {
        return FQ.getChildren(parentId, options);
    };

    window.getFamilyChildIds = function (parentId) {
        return FQ.getChildIds(parentId);
    };

    window.getFamilySiblings = function (childId) {
        return FQ.getSiblings(childId);
    };

    window.getFamilyGrandparentIds = function (childId, generation) {
        return FQ.getGrandparentIds(childId, generation);
    };

    window.getFamilyGrandchildIds = function (parentId, generation) {
        return FQ.getGrandchildIds(parentId, generation);
    };

    window.setFamilyParent = function (childId, parentId, options) {
        return FC.setParent(childId, parentId, options);
    };

    window.removeFamilyParent = function (edgeId, options) {
        return FC.removeParent(edgeId, options);
    };

    window.createFamilyAdoption = function (childId, adopterId, options) {
        return FC.createAdoption(childId, adopterId, options);
    };

    window.removeFamilyAdoption = function (childId, adopterId, options) {
        return FC.removeAdoption(childId, adopterId, options);
    };

    // Aggregate family statistics. Canonical implementation lives in
    // family-statistics.js; this is a thin alias, not a second impl.
    window.getFamilyStatistics = function (characterId) {
        return window.FamilyStatistics.getFamilyStatistics(characterId);
    };

    // =========================================================================
    // 9. MORTALITY ALIASES
    // =========================================================================

    window.isCharacterLiving = function (characterId) {
        return MQ.isLiving(characterId);
    };

    window.isCharacterDeceased = function (characterId) {
        return MQ.isDeceased(characterId);
    };

    window.getDeathRecord = function (characterId) {
        return MQ.getDeathRecord(characterId);
    };

    window.getAllDeathRecords = function () {
        return MQ.getAllDeathRecords();
    };

    window.getDeathsByYear = function (year) {
        return MQ.getDeathsByYear(year);
    };

    window.getDeathsByCause = function (cause) {
        return MQ.getDeathsByCause(cause);
    };

    window.getMurderRecords = function () {
        return MQ.getMurderRecords();
    };

    window.getExecutionRecords = function () {
        return MQ.getExecutionRecords();
    };

    window.getMortalityStatistics = function () {
        return MS.getMortalityStatistics();
    };

    window.getMurderStatistics = function () {
        return MS.getMurderStatistics();
    };

    window.getExecutionStatistics = function () {
        return MS.getExecutionStatistics();
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
    //       Use FamilyCommands.setParent(childId, parentId, options).
    //
    //   generateNewborn(mother, father, birthYear, options)
    //       Use ChildrenCommands.recordBirth.
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
    //       Not implemented.
    //
    //   recordBirth, recordAdoption, legitimizeChild, recordSurrogacy,
    //   updateSurrogacyRecord, generateChildrenForCouple,
    //   getCharacterLastChildBirthYear, getCharacterTotalChildren
    //       Not provided as flat globals. Use ChildrenCommands /
    //       ChildrenQueries / ChildrenStatistics directly.
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
    //       Relationship domain. Not installed by this shim. If your
    //       relationship domain is loaded separately, it provides its
    //       own aliases.
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
    //   FamilyAccessors, family-accessors.js
    //       DELETED. Use FamilyQueries / FamilyRules / FamilyStatistics.
    //
    //   MortalityState, MortalityCommands, ChildrenState (old),
    //   ChildrenCommands (old), ChildrenQueries (old), ChildrenLifecycle,
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
            'FamilyState / FamilyQueries / FamilyCommands / FamilyStatistics / ' +
            'MortalityRules / MortalityQueries / MortalityStatistics / ' +
            'ChildrenState / ChildrenCommands / ChildrenQueries / ' +
            'ChildrenStatistics / ChildrenRules / ChildrenGenerator directly.'
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
            getFamilyStatistics: window.getFamilyStatistics,

            // Mortality
            getDeathRecord: window.getDeathRecord,
            getMortalityStatistics: window.getMortalityStatistics
        };
    }
})();
