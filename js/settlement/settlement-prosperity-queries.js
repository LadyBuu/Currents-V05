/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT PROSPERITY QUERIES
 * js/settlement/settlement-prosperity-queries.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the character-enumeration,
 * leader-traits, profession-input, and time-dependency blocks changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * CHARACTER ENUMERATION:
 *   The role-density, master-concentration, and average-skill modifiers
 *   are computed over every living character whose CURRENT location is
 *   anywhere in the settlement's location subtree.
 *
 *   "Current location" here is the SEMANTIC notion owned by
 *   world.js::getCurrentLocationId — explicit field, then latest move,
 *   then birthplace. It is NOT the raw currentLocationId field.
 *
 *   The prior revision called CharacterQueries.getCharactersInLocations,
 *   which filters on c.currentLocationId === locationId. That missed
 *   characters placed via moves and included characters whose raw field
 *   pointed into the subtree but whose latest move pointed elsewhere.
 *   The under/over-count silently shifted role diversity, master
 *   concentration, and average-skill modifiers.
 *
 *   This revision enumerates via CharacterQueries.getAllCharacters and
 *   filters through LocationQueries.getCurrentLocationId, matching the
 *   fix in location-view-models.js::buildBulkMoveModel and in
 *   settlement-education-queries.js.
 *
 * LEADER TRAITS:
 *   LocationQueries.getCurrentLeader returns a leader ASSIGNMENT
 *   projection, not a character projection. Its shape is:
 *
 *     { id, characterId, characterName, startYear, endYear, title,
 *       notes, isActive, endReason }
 *
 *   It does NOT carry a `character` field. The prior revision read
 *   `leader.character` and `leader.character.traits`, both of which
 *   were always undefined, so the government-leader modifier was
 *   silently 0 for every settlement.
 *
 *   This revision looks up the character projection via
 *   CharacterQueries.getCharacterById(leader.characterId) and reads
 *   traits from that projection. The tenure bonus still uses
 *   leader.startYear, which IS present on the assignment projection.
 *
 * PROFESSION INPUT:
 *   The role-diversity, master-concentration, underserved-roles,
 *   average-skill, and specialization-synergy modifiers are computed
 *   from each character's professions, read via
 *   CharacterCommands.getProfessions(character.id).
 *
 *   The prior revision read character.professions off the character
 *   projection. character-state.js::_project no longer includes
 *   professions (they are in _DOMAIN_OWNED_FIELDS, refused by the
 *   generic character-update path, and their canonical reader is
 *   CharacterCommands.getProfessions). Reading professions off the
 *   projection would read `undefined` and produce zero for every
 *   settlement — the exact silent-zero bug this section documents.
 *
 *   CharacterCommands.getProfessions is a Map lookup + array clone per
 *   character. That is O(1) per character, so the O(N) iteration cost
 *   is the same as reading an array field off a projection. There is
 *   no performance reason to prefer the projection path; there is a
 *   correctness reason to prefer the command reader.
 *
 *   Do not "optimize" by caching a projection across a
 *   characterChanged event. Professions are mutable; the projection is
 *   a snapshot. A cache would serve stale profession data.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _computeRoleFacts now reads professions via
 *       CharacterCommands.getProfessions(character.id) instead of
 *       character.professions off the projection.
 *       character-state.js::_project no longer includes professions
 *       (removed in the same pass to close the character projection
 *       contract). Without this rewrite, five prosperity modifiers
 *       (roleDiversity, masterConcentration, underservedRoles,
 *       averageSkill, specializationSynergy) would silently zero
 *       out for every settlement.
 *     - Header PROFESSION INPUT section added.
 *     - No public signature change, no public return-shape change.
 *   Previous revision:
 *     - _computeRoleFacts now enumerates characters via
 *       CharacterQueries.getAllCharacters() + LocationQueries.getCurrentLocationId,
 *       matching the fix in settlement-education-queries.js and
 *       location-view-models.js::buildBulkMoveModel. The prior
 *       CharacterQueries.getCharactersInLocations call missed
 *       characters placed via moves; role-diversity, master-
 *       concentration, and average-skill modifiers silently
 *       under-counted.
 *     - The government-leader modifier now resolves the leader's
 *       character via CharacterQueries.getCharacterById(leader.characterId)
 *       instead of the never-populated leader.character field. The
 *       trait-based portion of the modifier (+wise/+just/+charismatic/
 *       +diplomatic, -tyrant/-cruel/-incompetent/-corrupt) now actually
 *       contributes to prosperity.
 *     - Header CHARACTER ENUMERATION and LEADER TRAITS sections added.
 *     - No public signature change, no public return-shape change.
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries()       { return window.SettlementQueries; }
    function _getFeatureQueries()          { return window.SettlementFeatureQueries; }
    function _getEmploymentQueries()       { return window.SettlementEmploymentQueries; }
    function _getCrimeQueries()            { return window.SettlementCrimeQueries; }
    function _getEducationQueries()        { return window.SettlementEducationQueries; }
    function _getReligionQueries()         { return window.SettlementReligionQueries; }
    function _getIndustryQueries()         { return window.IndustryQueries; }
    function _getLocationQueries()         { return window.LocationQueries; }
    function _getCharacterQueries()        { return window.CharacterQueries; }
    function _getCharacterCommands()       { return window.CharacterCommands; }
    function _getProsperityDefinitions()   { return window.SettlementProsperityDefinitions; }
    function _getRankRules()               { return window.SettlementRankRules; }
    function _getPopulationAccessor()      { return window.getLocationPopulationCount; }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _getLocationIdsForSettlement(locationId) {
        var ids = _getLocationQueries().getAllSubLocationIds(locationId);
        if (ids && ids.length > 0) return ids;
        return [locationId];
    }

    function _getBandForValue(value) {
        var bands = _getProsperityDefinitions().PROSPERITY_BANDS;
        for (var i = 0; i < bands.length; i++) {
            if (value >= bands[i].min) return bands[i];
        }
        return bands[bands.length - 1];
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-prosperity-queries.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    /**
     * Enumerates every living character whose resolved current location
     * is anywhere in the settlement's location subtree.
     *
     * Uses LocationQueries.getCurrentLocationId (the semantic resolver)
     * rather than CharacterQueries.getCharactersInLocations (the raw-
     * field filter). See CHARACTER ENUMERATION in the module header.
     *
     * @private
     * @param {string} locationId
     * @returns {Array<Object>} character projections
     */
    function _getCharactersInSettlement(locationId) {
        var locationIds = _getLocationIdsForSettlement(locationId);
        var idSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            idSet[locationIds[i]] = true;
        }

        var allCharacters = _getCharacterQueries().getAllCharacters();
        if (!Array.isArray(allCharacters)) return [];

        var result = [];
        for (var j = 0; j < allCharacters.length; j++) {
            var character = allCharacters[j];
            if (!character || !character.id) continue;
            if (character.isDeceased === true) continue;

            var resolvedId = _getLocationQueries().getCurrentLocationId(character.id);
            if (resolvedId && idSet[resolvedId]) {
                result.push(character);
            }
        }
        return result;
    }

    /**
     * Computes role-distribution facts for the settlement.
     *
     * Professions are read via CharacterCommands.getProfessions per
     * character. See PROFESSION INPUT in the module header for why the
     * projection is not read here.
     *
     * @private
     * @param {string} locationId
     * @returns {{
     *   roleCount: number,
     *   totalProfessions: number,
     *   masterCount: number,
     *   averageSkill: number,
     *   roles: Object
     * }}
     */
    function _computeRoleFacts(locationId) {
        var characters = _getCharactersInSettlement(locationId);

        var roles = {};
        var totalProfessions = 0;
        var masterCount = 0;
        var totalSkill = 0;
        var skillSamples = 0;

        var characterCommands = _getCharacterCommands();

        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            if (!character || !character.id) continue;

            // Professions come from CharacterCommands, not from the
            // projection. See PROFESSION INPUT in the module header.
            if (typeof characterCommands.getProfessions !== 'function') {
                continue;
            }

            var professions;
            try {
                professions = characterCommands.getProfessions(character.id);
            } catch (e) {
                // A single character throwing should not silently
                // disable the modifier for the whole settlement. Log
                // and continue.
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'settlement-prosperity-queries: getProfessions threw ' +
                        'for character ' + character.id + ':',
                        e
                    );
                }
                continue;
            }

            if (!Array.isArray(professions) || professions.length === 0) continue;

            for (var j = 0; j < professions.length; j++) {
                var prof = professions[j];
                if (!prof) continue;
                totalProfessions++;

                var roleId = prof.id;
                if (!roleId) continue;

                if (!roles[roleId]) {
                    roles[roleId] = {
                        id: roleId,
                        name: prof.name || roleId,
                        count: 0,
                        masters: 0
                    };
                }
                roles[roleId].count++;

                var skill = _isFiniteNumber(prof.skillLevel) ? prof.skillLevel : 0;
                totalSkill += skill;
                skillSamples++;

                if (skill >= 76) {
                    roles[roleId].masters++;
                    masterCount++;
                }
            }
        }

        return {
            roleCount: Object.keys(roles).length,
            totalProfessions: totalProfessions,
            masterCount: masterCount,
            averageSkill: skillSamples > 0 ? Math.round(totalSkill / skillSamples) : 0,
            roles: roles
        };
    }

    /**
     * Computes the government-leader prosperity modifier.
     *
     * Resolves the leader's character projection via
     * CharacterQueries.getCharacterById(leader.characterId), because
     * LocationQueries.getCurrentLeader returns an ASSIGNMENT projection,
     * not a character projection. See LEADER TRAITS in the module header.
     *
     * Trait contributions (flat, not weighted — matches the prior
     * intent of the code that never fired):
     *
     *   wise, just                      +5  each
     *   charismatic, diplomatic         +3  each
     *   tyrant, cruel                   -5  each
     *   incompetent, corrupt            -3  each
     *
     * Tenure bonus (per year of rule):
     *   tenure > 10 years               +2
     *   tenure > 5 years                +1
     *
     * Returns 0 when there is no current leader, when the leader's
     * character cannot be resolved, or when the leader assignment has no
     * usable startYear.
     *
     * @private
     * @param {string} locationId
     * @returns {number}
     */
    function _computeLeaderModifier(locationId) {
        var leader = _getLocationQueries().getCurrentLeader(locationId);
        if (!leader) return 0;
        if (!leader.characterId) return 0;

        var character = _getCharacterQueries().getCharacterById(leader.characterId);
        if (!character) return 0;

        var traits = Array.isArray(character.traits) ? character.traits : [];
        var leaderDelta = 0;

        if (traits.indexOf('wise') !== -1 || traits.indexOf('just') !== -1) leaderDelta += 5;
        if (traits.indexOf('tyrant') !== -1 || traits.indexOf('cruel') !== -1) leaderDelta -= 5;
        if (traits.indexOf('charismatic') !== -1 || traits.indexOf('diplomatic') !== -1) leaderDelta += 3;
        if (traits.indexOf('incompetent') !== -1 || traits.indexOf('corrupt') !== -1) leaderDelta -= 3;

        if (_isFiniteNumber(leader.startYear)) {
            var currentYear = _currentYear();
            var tenure = currentYear - leader.startYear;
            if (tenure > 10) leaderDelta += 2;
            else if (tenure > 5) leaderDelta += 1;
        }

        return leaderDelta;
    }

    function getProsperity(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var base = _getProsperityDefinitions().BASE_PROSPERITY;

        var modifiers = {
            rank: 0,
            features: 0,
            specialization: 0,
            taxRate: 0,
            crime: 0,
            literacy: 0,
            employment: 0,
            debt: 0,
            governmentLeader: 0,
            roleDiversity: 0,
            masterConcentration: 0,
            specializationSynergy: 0,
            underservedRoles: 0,
            averageSkill: 0,
            religiousUnity: 0,
            placesOfWorship: 0,
            dominantReligion: 0,
            publicEnterprises: 0
        };

        var rank = _getRankRules().getRankById(settlement.rankId);
        var population = _getPopulationAccessor()(locationId);
        if (rank && _isFiniteNumber(population)) {
            if (population < rank.minPopulation * 0.5) {
                modifiers.rank -= 5;
            } else if (population < rank.minPopulation) {
                modifiers.rank -= 2;
            } else if (population > rank.maxPopulation * 0.8) {
                modifiers.rank += 2;
            }
        }

        var featureEffects = _getFeatureQueries().getSettlementFeatureEffects(locationId);
        if (featureEffects) {
            modifiers.features = featureEffects.prosperityBonus;
        }

        if (window.SettlementSpecializationQueries
            && typeof window.SettlementSpecializationQueries.getProsperityBonus === 'function') {
            var specBonus = window.SettlementSpecializationQueries.getProsperityBonus(locationId);
            if (_isFiniteNumber(specBonus)) modifiers.specialization = specBonus;
        }

        var taxRate = settlement.taxRate;
        if (_isFiniteNumber(taxRate)) {
            if (taxRate > 20) modifiers.taxRate = -3;
            else if (taxRate > 15) modifiers.taxRate = -1;
        }

        var crimeRate = _getCrimeQueries().getCrimeRateValue(locationId);
        if (_isFiniteNumber(crimeRate)) {
            if (crimeRate > 0.3) modifiers.crime = -5;
            else if (crimeRate > 0.2) modifiers.crime = -2;
        }

        var literacyStats = _getEducationQueries().getLiteracyStats(locationId);
        if (literacyStats && _isFiniteNumber(literacyStats.literacyRate)) {
            if (literacyStats.literacyRate > 70) modifiers.literacy = 2;
            else if (literacyStats.literacyRate > 50) modifiers.literacy = 1;
        }

        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (employment && _isFiniteNumber(employment.employmentRate)) {
            if (employment.employmentRate > 80) modifiers.employment = 3;
            else if (employment.employmentRate < 40) modifiers.employment = -3;
        }

        if (_isFiniteNumber(settlement.wealth) && settlement.wealth < 0) {
            var debtRatio = Math.min(1, Math.abs(settlement.wealth) / 1000);
            modifiers.debt = -Math.floor(debtRatio * 15);
        }

        modifiers.governmentLeader = _computeLeaderModifier(locationId);

        var roleFacts = _computeRoleFacts(locationId);

        if (roleFacts.roleCount > 10) modifiers.roleDiversity = 4;
        else if (roleFacts.roleCount > 5) modifiers.roleDiversity = 2;
        else if (roleFacts.roleCount === 0 && roleFacts.totalProfessions === 0) modifiers.roleDiversity = -3;

        if (roleFacts.masterCount > 20) modifiers.masterConcentration = 3;
        else if (roleFacts.masterCount > 10) modifiers.masterConcentration = 2;
        else if (roleFacts.masterCount > 0) modifiers.masterConcentration = 1;

        if (modifiers.specialization > 5 && roleFacts.roleCount > 5) {
            modifiers.specializationSynergy = 2;
        }

        var importantRoleNames = [
            'blacksmith', 'merchant', 'healer', 'farmer',
            'carpenter', 'baker', 'butcher'
        ];
        var roleNames = [];
        for (var roleId in roleFacts.roles) {
            if (!Object.prototype.hasOwnProperty.call(roleFacts.roles, roleId)) continue;
            roleNames.push(roleFacts.roles[roleId].name.toLowerCase());
        }
        var missingCount = 0;
        for (var r = 0; r < importantRoleNames.length; r++) {
            var found = false;
            for (var n = 0; n < roleNames.length; n++) {
                if (roleNames[n].indexOf(importantRoleNames[r]) !== -1) {
                    found = true;
                    break;
                }
            }
            if (!found) missingCount++;
        }
        if (missingCount > 3) modifiers.underservedRoles = -3;
        else if (missingCount > 1) modifiers.underservedRoles = -1;

        if (roleFacts.averageSkill > 60) modifiers.averageSkill = 2;
        else if (roleFacts.averageSkill > 40) modifiers.averageSkill = 1;
        else if (roleFacts.averageSkill < 20 && roleFacts.totalProfessions > 0) modifiers.averageSkill = -1;

        var unity = _getReligionQueries().getReligiousUnity(locationId);
        if (_isFiniteNumber(unity)) {
            if (unity >= 80) modifiers.religiousUnity = 3;
            else if (unity >= 60) modifiers.religiousUnity = 1;
            else if (unity <= 20) modifiers.religiousUnity = -5;
            else if (unity <= 30) modifiers.religiousUnity = -3;
        }

        var placeCount = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);
        if (_isFiniteNumber(placeCount) && placeCount > 0) {
            modifiers.placesOfWorship = Math.min(3, Math.floor(placeCount * 0.5));
        }

        var dominantReligion = _getReligionQueries().getDominantReligion(locationId);
        if (dominantReligion) {
            modifiers.dominantReligion = 1;
        }

        var publicProfit = 0;
        var locationIds = _getLocationIdsForSettlement(locationId);
        var industryQueries = _getIndustryQueries();
        for (var i = 0; i < locationIds.length; i++) {
            var enterprises = industryQueries.getLocationEnterprisesSummary(locationIds[i]);
            if (!enterprises) continue;
            for (var j = 0; j < enterprises.length; j++) {
                var enterprise = enterprises[j];
                if (!enterprise) continue;
                var isPublic = enterprise.ownerType === 'settlement'
                    || enterprise.ownershipType === 'public';
                if (!isPublic) continue;
                var profit = enterprise.annualProfit;
                if (_isFiniteNumber(profit) && profit > 0) {
                    publicProfit += profit;
                }
            }
        }
        if (publicProfit > 100) modifiers.publicEnterprises = 3;
        else if (publicProfit > 50) modifiers.publicEnterprises = 1;

        var value = base;
        for (var key in modifiers) {
            if (!Object.prototype.hasOwnProperty.call(modifiers, key)) continue;
            value += modifiers[key];
        }

        if (value < 0) value = 0;
        if (value > 100) value = 100;
        value = Math.round(value);

        return {
            value: value,
            base: base,
            band: _getBandForValue(value),
            modifiers: modifiers
        };
    }

    function getProsperityValue(locationId) {
        var result = getProsperity(locationId);
        return result === null ? null : result.value;
    }

    function getProsperityBand(locationId) {
        var result = getProsperity(locationId);
        return result === null ? null : result.band;
    }

    window.SettlementProsperityQueries = Object.freeze({
        getProsperity: getProsperity,
        getProsperityValue: getProsperityValue,
        getProsperityBand: getProsperityBand
    });

})();
