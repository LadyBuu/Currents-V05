/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT PROSPERITY QUERIES
 * js/settlement/settlement-prosperity-queries.js
 * =============================================================================
 *
 * PROSPERITY QUERIES.
 *
 * This file provides read-only calculation of a settlement's prosperity
 * and a breakdown of every modifier that contributed to it. It answers:
 *   - what is the prosperity of a settlement?
 *   - how does each factor (rank, features, specialization, tax, crime,
 *     literacy, employment, debt, government, roles, religion,
 *     enterprises) affect it?
 *   - what band does the prosperity fall into?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads features through SettlementFeatureQueries
 *   - reads employment through SettlementEmploymentQueries
 *   - reads crime through SettlementCrimeQueries
 *   - reads literacy through SettlementEducationQueries
 *   - reads religion through SettlementReligionQueries
 *   - reads enterprises through IndustryQueries
 *   - reads government leader through GovernmentQueries
 *   - reads role data through CharacterQueries
 *   - reads definitions from SettlementProsperityDefinitions
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *   - does not apply random variation
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §22 (Prosperity
 * Contract), §32 (Completion Standard).
 *
 * Determinism:
 *
 *   Prosperity is deterministic. The same inputs always produce the same
 *   value. Random variation is NOT part of this calculation. Randomness,
 *   if it is desired, belongs to the annual processor as an explicit
 *   simulation step, not to a query.
 *
 * Result shape:
 *
 *   {
 *     value: number,             // 0-100 integer
 *     base: number,              // BASE_PROSPERITY
 *     band: { id, name, color }, // from PROSPERITY_BANDS
 *     modifiers: {
 *       rank: number,
 *       features: number,
 *       specialization: number,
 *       taxRate: number,
 *       crime: number,
 *       literacy: number,
 *       employment: number,
 *       debt: number,
 *       governmentLeader: number,
 *       roleDiversity: number,
 *       masterConcentration: number,
 *       specializationSynergy: number,
 *       underservedRoles: number,
 *       averageSkill: number,
 *       religiousUnity: number,
 *       placesOfWorship: number,
 *       dominantReligion: number,
 *       publicEnterprises: number
 *     }
 *   }
 *
 * Each modifier is the delta applied. The sum of modifiers, added to
 * base, clamped to [0, 100], is the final value.
 *
 * Missing data:
 *
 *   - settlement missing             → returns null
 *   - a foreign subsystem missing    → the call throws (required dep)
 *   - a specific foreign input is
 *     unavailable (e.g. no leader)   → that modifier is 0 for this
 *                                       settlement
 *
 * Time dependency:
 *   window.getCurrentYearSafe, defined in js/core/time.js, aliased to
 *   window.getCurrentYear. The previous version of this file called
 *   window.Time.getCurrentYear() in the government-leader tenure
 *   calculation, which would have thrown. It now uses the canonical
 *   helper directly.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries()       { return window.SettlementQueries; }
    function _getFeatureQueries()          { return window.SettlementFeatureQueries; }
    function _getEmploymentQueries()       { return window.SettlementEmploymentQueries; }
    function _getCrimeQueries()            { return window.SettlementCrimeQueries; }
    function _getEducationQueries()        { return window.SettlementEducationQueries; }
    function _getReligionQueries()         { return window.SettlementReligionQueries; }
    function _getIndustryQueries()         { return window.IndustryQueries; }
    function _getGovernmentQueries()       { return window.GovernmentQueries; }
    function _getCharacterQueries()        { return window.CharacterQueries; }
    function _getProsperityDefinitions()   { return window.SettlementProsperityDefinitions; }
    function _getRankRules()               { return window.SettlementRankRules; }
    function _getPopulationAccessor()      { return window.getLocationPopulationCount; }
    function _getLocationState()           { return window.LocationState; }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _getLocationIdsForSettlement(locationId) {
        var locationState = _getLocationState();
        if (typeof locationState.getAllSubLocationIds === 'function') {
            var ids = locationState.getAllSubLocationIds(locationId);
            if (ids && ids.length > 0) return ids;
        }
        return [locationId];
    }

    /**
     * Returns the prosperity band definition for a given value.
     * Bands are declared in descending `min` order; the first whose min
     * is satisfied is returned. The last band always has min 0, so a
     * band is always found.
     */
    function _getBandForValue(value) {
        var bands = _getProsperityDefinitions().PROSPERITY_BANDS;
        for (var i = 0; i < bands.length; i++) {
            if (value >= bands[i].min) return bands[i];
        }
        return bands[bands.length - 1];
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'settlement-prosperity-queries.js requires time.js (getCurrentYearSafe).'
            );
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 3. ROLE ANALYSIS
    // =========================================================================
    //
    // Role analysis requires iterating characters in the settlement's
    // location set once and building a small role summary. It returns
    // counts used by two prosperity modifiers: role diversity and master
    // concentration.
    //

    function _computeRoleFacts(locationId) {
        var locationIds = _getLocationIdsForSettlement(locationId);
        var characters = _getCharacterQueries().getCharactersInLocations(locationIds);

        var roles = {};
        var totalProfessions = 0;
        var masterCount = 0;
        var totalSkill = 0;
        var skillSamples = 0;

        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            if (!character) continue;
            if (character.isDeceased) continue;

            var professions = character.professions;
            if (!professions || professions.length === 0) continue;

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

    // =========================================================================
    // 4. PROSPERITY CALCULATION
    // =========================================================================

    /**
     * Returns the settlement's prosperity and its modifier breakdown.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

        // ----- Rank effect -----
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

        // ----- Feature effect -----
        var featureEffects = _getFeatureQueries().getSettlementFeatureEffects(locationId);
        if (featureEffects) {
            modifiers.features = featureEffects.prosperityBonus;
        }

        // ----- Specialization effect -----
        // Specialization prosperity bonus is owned by the specialization
        // calculation. For now, it is not available as a separate module.
        // When SettlementSpecializationQueries exists, this reads from it.
        if (window.SettlementSpecializationQueries
            && typeof window.SettlementSpecializationQueries.getProsperityBonus === 'function') {
            var specBonus = window.SettlementSpecializationQueries.getProsperityBonus(locationId);
            if (_isFiniteNumber(specBonus)) modifiers.specialization = specBonus;
        }

        // ----- Tax rate effect -----
        var taxRate = settlement.taxRate;
        if (_isFiniteNumber(taxRate)) {
            if (taxRate > 20) modifiers.taxRate = -3;
            else if (taxRate > 15) modifiers.taxRate = -1;
        }

        // ----- Crime effect -----
        var crimeRate = _getCrimeQueries().getCrimeRateValue(locationId);
        if (_isFiniteNumber(crimeRate)) {
            if (crimeRate > 0.3) modifiers.crime = -5;
            else if (crimeRate > 0.2) modifiers.crime = -2;
        }

        // ----- Literacy effect -----
        var literacyStats = _getEducationQueries().getLiteracyStats(locationId);
        if (literacyStats && _isFiniteNumber(literacyStats.literacyRate)) {
            if (literacyStats.literacyRate > 70) modifiers.literacy = 2;
            else if (literacyStats.literacyRate > 50) modifiers.literacy = 1;
        }

        // ----- Employment effect -----
        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (employment && _isFiniteNumber(employment.employmentRate)) {
            if (employment.employmentRate > 80) modifiers.employment = 3;
            else if (employment.employmentRate < 40) modifiers.employment = -3;
        }

        // ----- Debt effect -----
        if (_isFiniteNumber(settlement.wealth) && settlement.wealth < 0) {
            var debtRatio = Math.min(1, Math.abs(settlement.wealth) / 1000);
            modifiers.debt = -Math.floor(debtRatio * 15);
        }

        // ----- Government leader effect -----
        var leader = _getGovernmentQueries().getCurrentLeader(locationId);
        if (leader && leader.character) {
            var traits = leader.character.traits || [];
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
            modifiers.governmentLeader = leaderDelta;
        }

        // ----- Role effects -----
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

        // Underserved roles: count important roles that are absent by
        // name match. The important-role list is a domain rule, defined
        // here as the current economy model.
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

        // Average skill
        if (roleFacts.averageSkill > 60) modifiers.averageSkill = 2;
        else if (roleFacts.averageSkill > 40) modifiers.averageSkill = 1;
        else if (roleFacts.averageSkill < 20 && roleFacts.totalProfessions > 0) modifiers.averageSkill = -1;

        // ----- Religious effects -----
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

        // ----- Public enterprise effect -----
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

        // ----- Sum -----
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

    /**
     * Returns just the prosperity value as an integer in [0, 100].
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getProsperityValue(locationId) {
        var result = getProsperity(locationId);
        return result === null ? null : result.value;
    }

    /**
     * Returns the prosperity band for a settlement: { id, name, color }.
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getProsperityBand(locationId) {
        var result = getProsperity(locationId);
        return result === null ? null : result.band;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementProsperityQueries = Object.freeze({
        getProsperity: getProsperity,
        getProsperityValue: getProsperityValue,
        getProsperityBand: getProsperityBand
    });

})();
