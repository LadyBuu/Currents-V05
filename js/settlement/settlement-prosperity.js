/**
 * =============================================================================
 * SETTLEMENT PROSPERITY - Prosperity calculation with multi-factor weighting js/settlement/settlement-prosperity.js
 * =============================================================================
 * 
 * This file contains the prosperity calculation logic with all factors:
 * - Rank-based modifiers
 * - Feature bonuses
 * - Specialization bonuses
 * - Tax rate effects
 * - Crime rate effects
 * - Literacy effects
 * - Employment effects
 * - Debt effects
 * - Government Leader integration
 * - Role-based prosperity factors
 * - Religious unity factors
 * - Public enterprise prosperity bonus
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - accessors.js (getPlaceById, getCurrentYear, getCharacters)
 *   - government-queries.js (GovernmentQueries)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingProsperity = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getSettlementEmployment(locationId) {
        return SettlementState.getSettlementEmployment(locationId);
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;

        if (character.moves && character.moves.length > 0) {
            var sortedMoves = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove && lastMove.locationId) {
                return lastMove.locationId;
            }
        }

        if (character.currentLocationId) return character.currentLocationId;
        if (character.birthplaceId) return character.birthplaceId;

        return null;
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getGovernmentQueries() {
        return typeof window.GovernmentQueries !== 'undefined' ? window.GovernmentQueries : null;
    }

    function _getReligion(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    }

    function _getDominantReligion(locationId) {
        if (typeof SettlementState !== 'undefined' &&
            typeof SettlementState.getDominantReligion === 'function') {
            return SettlementState.getDominantReligion(locationId);
        }
        return null;
    }

    function _getReligiousUnity(locationId) {
        if (typeof SettlementState !== 'undefined' &&
            typeof SettlementState.getReligiousUnity === 'function') {
            return SettlementState.getReligiousUnity(locationId);
        }
        return 50;
    }

    function _getPlacesOfWorship(locationId) {
        if (typeof SettlementState !== 'undefined' &&
            typeof SettlementState.getPlacesOfWorship === 'function') {
            return SettlementState.getPlacesOfWorship(locationId);
        }
        return [];
    }

    function _getSettlementLiteracyStats(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && 
            SettlementEconomy.getSettlementLiteracyStats) {
            return SettlementEconomy.getSettlementLiteracyStats(locationId);
        }
        return null;
    }

    function _getSpecializationProsperityBonus(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && 
            SettlementEconomy.calculateSpecializationProsperityBonus) {
            return SettlementEconomy.calculateSpecializationProsperityBonus(locationId);
        }
        return 0;
    }

    function _calculateCrimeRate(locationId) {
        if (typeof SettlementEconomy !== 'undefined' && 
            SettlementEconomy.calculateCrimeRate) {
            return SettlementEconomy.calculateCrimeRate(locationId);
        }
        return 0.05;
    }

    // =========================================================================
    // 3. PROSPERITY CALCULATION
    // =========================================================================

    function calculateProsperity(locationId) {
        if (_processingProsperity) {
            return 50;
        }
        _processingProsperity = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 50;

            var prosperity = data.prosperity || 50;
            var population = _getLocationPopulationCount(locationId);
            var ranks = _getSettlementRanks();
            var rank = ranks.find(function(r) { return r.id === data.rankId; });

            // Rank-based modifiers
            if (rank) {
                if (population < rank.minPopulation * 0.5) {
                    prosperity = Math.max(0, prosperity - 5);
                } else if (population < rank.minPopulation) {
                    prosperity = Math.max(0, prosperity - 2);
                } else if (population > rank.maxPopulation * 0.8) {
                    prosperity = Math.min(100, prosperity + 2);
                }
            }

            // Feature bonuses
            var features = _getSettlementFeatures(locationId);
            for (var i = 0; i < features.length; i++) {
                if (features[i].prosperityBonus) {
                    prosperity = Math.min(100, prosperity + features[i].prosperityBonus);
                }
            }

            // Specialization bonuses
            var specProsperityBonus = _getSpecializationProsperityBonus(locationId);
            prosperity = Math.min(100, prosperity + specProsperityBonus);

            // Tax rate effects
            var taxRate = data.taxRate || 10;
            if (taxRate > 20) {
                prosperity = Math.max(0, prosperity - 3);
            } else if (taxRate > 15) {
                prosperity = Math.max(0, prosperity - 1);
            }

            // Crime rate effects
            var crimeRate = _calculateCrimeRate(locationId);
            if (crimeRate > 0.3) {
                prosperity = Math.max(0, prosperity - 5);
            } else if (crimeRate > 0.2) {
                prosperity = Math.max(0, prosperity - 2);
            }

            // Literacy effects
            var literacyStats = _getSettlementLiteracyStats(locationId);
            if (literacyStats && literacyStats.literacyRate > 70) {
                prosperity = Math.min(100, prosperity + 2);
            } else if (literacyStats && literacyStats.literacyRate > 50) {
                prosperity = Math.min(100, prosperity + 1);
            }

            // Employment effects
            var employment = _getSettlementEmployment(locationId);
            if (employment) {
                var employmentRate = employment.employmentRate || 0;
                if (employmentRate > 80) {
                    prosperity = Math.min(100, prosperity + 3);
                } else if (employmentRate < 40) {
                    prosperity = Math.max(0, prosperity - 3);
                }
            }

            // Debt effects
            if (data.wealth < 0) {
                var debtRatio = Math.min(1, Math.abs(data.wealth) / 1000);
                prosperity = Math.max(0, prosperity - Math.floor(debtRatio * 15));
            }

            // =================================================================
            // INTEGRATION: Government Leader affects prosperity
            // =================================================================
            var govQueries = _getGovernmentQueries();
            if (govQueries && typeof govQueries.getCurrentLeader === 'function') {
                try {
                    var leader = govQueries.getCurrentLeader(locationId);
                    if (leader && leader.character) {
                        var char = leader.character;
                        
                        if (char.traits) {
                            if (char.traits.includes('wise') || char.traits.includes('just')) {
                                prosperity = Math.min(100, prosperity + 5);
                            }
                            if (char.traits.includes('tyrant') || char.traits.includes('cruel')) {
                                prosperity = Math.max(0, prosperity - 5);
                            }
                            if (char.traits.includes('charismatic') || char.traits.includes('diplomatic')) {
                                prosperity = Math.min(100, prosperity + 3);
                            }
                            if (char.traits.includes('incompetent') || char.traits.includes('corrupt')) {
                                prosperity = Math.max(0, prosperity - 3);
                            }
                        }
                        
                        if (leader.startYear) {
                            var tenure = _getCurrentYear() - leader.startYear;
                            if (tenure > 10) {
                                prosperity = Math.min(100, prosperity + 2);
                            } else if (tenure > 5) {
                                prosperity = Math.min(100, prosperity + 1);
                            }
                        }
                    }
                } catch(e) {
                    // Silent fail - leader data may not be available
                }
            }
            // =================================================================

            // =================================================================
            // ROLE-BASED PROSPERITY FACTORS
            // =================================================================
            
            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();
            var roles = {};
            var masterCount = 0;
            var totalProfessions = 0;
            
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;
                
                var charLocationId = _getCurrentLocationId(char);
                if (charLocationId && locationIdSet.has(charLocationId)) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            var skillLevel = prof.skillLevel || 0;
                            totalProfessions++;
                            
                            if (!roles[prof.id]) {
                                var role = _getRoleById(prof.id);
                                roles[prof.id] = {
                                    id: prof.id,
                                    name: prof.name || (role ? role.name : prof.id),
                                    count: 0,
                                    masters: 0
                                };
                            }
                            roles[prof.id].count++;
                            if (skillLevel >= 76) {
                                roles[prof.id].masters++;
                                masterCount++;
                            }
                        }
                    }
                }
            }
            
            var roleCount = Object.keys(roles).length;
            
            // 1. Role diversity bonus
            if (roleCount > 10) {
                prosperity = Math.min(100, prosperity + 4);
            } else if (roleCount > 5) {
                prosperity = Math.min(100, prosperity + 2);
            } else if (roleCount === 0 && totalProfessions === 0) {
                prosperity = Math.max(0, prosperity - 3);
            }
            
            // 2. Master concentration bonus
            if (masterCount > 20) {
                prosperity = Math.min(100, prosperity + 3);
            } else if (masterCount > 10) {
                prosperity = Math.min(100, prosperity + 2);
            } else if (masterCount > 0) {
                prosperity = Math.min(100, prosperity + 1);
            }
            
            // 3. Role specialization synergy bonus
            if (specProsperityBonus > 5 && roleCount > 5) {
                prosperity = Math.min(100, prosperity + 2);
            }
            
            // 4. Underserved roles penalty
            var importantRoles = ['blacksmith', 'merchant', 'healer', 'farmer', 'carpenter', 'baker', 'butcher'];
            var missingCount = 0;
            var roleNames = Object.keys(roles).map(function(id) { 
                return roles[id].name.toLowerCase(); 
            });
            
            for (var i = 0; i < importantRoles.length; i++) {
                var found = false;
                for (var j = 0; j < roleNames.length; j++) {
                    if (roleNames[j].indexOf(importantRoles[i]) !== -1) {
                        found = true;
                        break;
                    }
                }
                if (!found) missingCount++;
            }
            
            if (missingCount > 3) {
                prosperity = Math.max(0, prosperity - 3);
            } else if (missingCount > 1) {
                prosperity = Math.max(0, prosperity - 1);
            }
            
            // 5. Skill level average bonus
            var totalSkill = 0;
            var skillCount = 0;
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;
                
                var charLocationId = _getCurrentLocationId(char);
                if (charLocationId && locationIdSet.has(charLocationId)) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            totalSkill += (char.professions[j].skillLevel || 0);
                            skillCount++;
                        }
                    }
                }
            }
            
            var avgSkill = skillCount > 0 ? Math.round(totalSkill / skillCount) : 0;
            if (avgSkill > 60) {
                prosperity = Math.min(100, prosperity + 2);
            } else if (avgSkill > 40) {
                prosperity = Math.min(100, prosperity + 1);
            } else if (avgSkill < 20 && skillCount > 0) {
                prosperity = Math.max(0, prosperity - 1);
            }
            // =================================================================

            // =================================================================
            // RELIGIOUS UNITY PROSPERITY FACTORS
            // =================================================================
            
            var religiousUnity = _getReligiousUnity(locationId);
            var dominantReligion = _getDominantReligion(locationId);
            var placesOfWorship = _getPlacesOfWorship(locationId);
            
            // 1. Religious unity bonus/penalty
            if (religiousUnity >= 80) {
                prosperity = Math.min(100, prosperity + 3);
            } else if (religiousUnity >= 60) {
                prosperity = Math.min(100, prosperity + 1);
            } else if (religiousUnity <= 30) {
                prosperity = Math.max(0, prosperity - 3);
            } else if (religiousUnity <= 20) {
                prosperity = Math.max(0, prosperity - 5);
            }
            
            // 2. Places of worship bonus
            var placeCount = placesOfWorship ? placesOfWorship.length : 0;
            if (placeCount > 0) {
                var bonus = Math.min(3, Math.floor(placeCount * 0.5));
                prosperity = Math.min(100, prosperity + bonus);
            }
            
            // 3. Dominant religion bonus
            if (dominantReligion) {
                prosperity = Math.min(100, prosperity + 1);
                
                if (data && data.dominantReligionId) {
                    prosperity = Math.min(100, prosperity + 1);
                }
            }
            
            // 4. Religious diversity penalty (if too fragmented)
            if (religiousUnity < 40 && religiousUnity > 20) {
                prosperity = Math.max(0, prosperity - 1);
            }
            
            // 5. Places of worship with income bonus
            if (placeCount > 0) {
                var activePlaces = 0;
                for (var i = 0; i < placesOfWorship.length; i++) {
                    if (placesOfWorship[i] && placesOfWorship[i].producesIncome !== false) {
                        activePlaces++;
                    }
                }
                if (activePlaces > 0) {
                    prosperity = Math.min(100, prosperity + Math.min(2, activePlaces));
                }
            }
            // =================================================================

            // =================================================================
            // PUBLIC ENTERPRISE PROSPERITY BONUS
            // =================================================================
            var publicEnterprises = SettlementState.getPublicEnterprises(locationId);
            if (publicEnterprises && publicEnterprises.length > 0) {
                var publicProfit = 0;
                for (var i = 0; i < publicEnterprises.length; i++) {
                    if (typeof window.IndustryQueries !== 'undefined') {
                        var summary = window.IndustryQueries.getEnterpriseSummary(publicEnterprises[i].id);
                        if (summary && summary.annualProfit > 0) {
                            publicProfit += summary.annualProfit;
                        }
                    }
                }
                if (publicProfit > 100) {
                    prosperity = Math.min(100, prosperity + 3);
                } else if (publicProfit > 50) {
                    prosperity = Math.min(100, prosperity + 1);
                }
            }
            // =================================================================

            // Random variation (small)
            var randomChange = Math.floor(Math.random() * 11) - 5;
            prosperity = Math.min(100, Math.max(0, prosperity + randomChange));

            return Math.min(100, Math.max(0, Math.round(prosperity)));

        } finally {
            _processingProsperity = false;
        }
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.SettlementProsperity = {
        calculateProsperity: calculateProsperity
    };

    // Also attach to SettlementEconomy for backward compatibility
    if (window.SettlementEconomy) {
        window.SettlementEconomy.calculateProsperity = calculateProsperity;
    }

})();