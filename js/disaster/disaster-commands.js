/**
 * =============================================================================
 * STILL WATERS - DISASTER COMMANDS (disaster-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-commands.js
 * 
 * This file contains ALL write operations for disasters.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterCommands.generateDisaster(locationId, year, forcedType)
 *   - DisasterCommands.generateDisasterDescription(disasterType, location, severity, deaths)
 *   - DisasterCommands.triggerPlague(locationId, year, options)
 *   - DisasterCommands.triggerFamine(locationId, year, options)
 *   - DisasterCommands.triggerDisaster(locationId, disasterType, year, options)
 *   - DisasterCommands.applyDisasterEffects(locationId, disaster)
 *   - DisasterCommands.applyDisasterSettlementEffects(locationId, disaster)
 *   - DisasterCommands.applyDisasterCrimeEffect(locationId, disaster)
 *   - DisasterCommands.applyDisasterEducationEffects(locationId, disaster)
 *   - DisasterCommands.applyStructuralDamage(locationId, disaster, options) - NEW
 *   - DisasterCommands.simulateRandomDisaster(year, baseChance)
 *   - DisasterCommands.getDisasterLocationModifier(location, disasterType)
 * 
 * DEPENDENCIES:
 *   - disaster-state.js: DisasterState
 *   - disaster-queries.js: DisasterQueries
 *   - disaster-constants.js: DISASTER_TYPES, MASS_DEATH_TYPES, LOCATION_KEYWORDS
 *   - disaster-damage.js: DisasterDamage (NEW)
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById, getPlaces
 *   - time.js: getCurrentYearSafe, calculateAge
 *   - randomness.js: chance, randomInt, pickRandom, pickWeighted
 *   - ids.js: generateId
 *   - storage.js: saveMasterData
 *   - eventLogger.js: logEvent
 *   - characterLifeCycle.js: killCharacter
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

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof window.getAllSubLocationIds === 'function') {
            return window.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 1000;
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _pickRandom(array) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(array);
        }
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    function _pickWeighted(items, weightGetter) {
        if (typeof window.pickWeighted === 'function') {
            return window.pickWeighted(items, weightGetter);
        }
        if (!items || items.length === 0) return null;
        var totalWeight = 0;
        var weights = [];
        for (var i = 0; i < items.length; i++) {
            var weight = weightGetter ? weightGetter(items[i]) : (items[i].weight || 1);
            totalWeight += weight;
            weights.push(weight);
        }
        var roll = Math.random() * totalWeight;
        var accumulated = 0;
        for (var i = 0; i < items.length; i++) {
            accumulated += weights[i];
            if (roll <= accumulated) return items[i];
        }
        return items[items.length - 1];
    }

    function _killCharacter(character, deathYear, deathCause, options) {
        if (typeof window.killCharacter === 'function') {
            return window.killCharacter(character, deathYear, deathCause, options);
        }
        if (!character || character.isDeceased) {
            return { success: false, reason: 'Character already deceased' };
        }
        character.isDeceased = true;
        character.deathYear = deathYear;
        character.deathCause = deathCause;
        if (options && options.notes) character.deathNotes = options.notes;
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
        return { success: true };
    }

    function _logEvent(category, type, message, subjects, locationName) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects, locationName);
        }
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

    function _getDisasterTypes() {
        return window.DISASTER_TYPES || [];
    }

    function _getLocationKeywords() {
        return window.LOCATION_KEYWORDS || {};
    }

    function _matchesLocationKeywords(locationName, keywords) {
        var lowerName = locationName.toLowerCase();
        for (var i = 0; i < keywords.length; i++) {
            if (lowerName.includes(keywords[i])) return true;
        }
        return false;
    }

    // =========================================================================
    // 2. GENERATE DISASTER DESCRIPTION
    // =========================================================================

    /**
     * Generates a human-readable description for a disaster
     * @param {Object} disasterType - Disaster type object
     * @param {Object} location - Location object
     * @param {number} severity - Severity value (0-100)
     * @param {number} deaths - Number of deaths
     * @returns {string} Human-readable description
     */
    function generateDisasterDescription(disasterType, location, severity, deaths) {
        if (!disasterType || !location) {
            return 'A disaster occurred.';
        }

        var severityText = 'moderate';
        if (severity >= 70) severityText = 'catastrophic';
        else if (severity >= 50) severityText = 'severe';
        else if (severity >= 30) severityText = 'major';
        else if (severity >= 10) severityText = 'minor';

        var baseDesc = disasterType.desc || 'A disaster struck';
        var locationName = location.displayName || 'Unknown Location';

        var description = baseDesc + ' in ' + locationName + 
            '. A ' + severityText + ' event (severity: ' + severity + ') claiming ' + deaths + ' lives.';

        return description;
    }

    // =========================================================================
    // 3. LOCATION MODIFIER
    // =========================================================================

    function getDisasterLocationModifier(location, disasterType) {
        if (!location || !disasterType || !disasterType.locationModifiers) return 1.0;

        var modifier = 1.0;
        var locationName = location.displayName || '';
        var keywords = _getLocationKeywords();

        for (var terrain in disasterType.locationModifiers) {
            if (disasterType.locationModifiers.hasOwnProperty(terrain)) {
                var mod = disasterType.locationModifiers[terrain];
                var terrainKeywords = keywords[terrain] || [];
                if (_matchesLocationKeywords(locationName, terrainKeywords)) {
                    modifier *= mod;
                }
            }
        }

        return Math.min(3.0, Math.max(0.5, modifier));
    }

    // =========================================================================
    // 4. GENERATE DISASTER
    // =========================================================================

    function generateDisaster(locationId, year, forcedType) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var location = _getPlaceById(locationId);
            if (!location) {
                return { success: false, error: 'Location not found' };
            }

            var disasterTypes = _getDisasterTypes();
            var disasterType;

            if (forcedType) {
                disasterType = null;
                for (var i = 0; i < disasterTypes.length; i++) {
                    if (disasterTypes[i].id === forcedType) {
                        disasterType = disasterTypes[i];
                        break;
                    }
                }
                if (!disasterType) {
                    return { success: false, error: 'Disaster type not found: ' + forcedType };
                }
            } else {
                // Apply location modifier to weights
                var weightedTypes = disasterTypes.map(function(type) {
                    var modifier = getDisasterLocationModifier(location, type);
                    return { 
                        ...type, 
                        weight: Math.floor(type.weight * modifier) 
                    };
                });
                disasterType = _pickWeighted(weightedTypes, function(item) { return item.weight; });
                if (!disasterType) {
                    disasterType = disasterTypes[0];
                }
            }

            if (!disasterType) {
                return { success: false, error: 'No disaster types available' };
            }

            var severity = _randomInt(disasterType.severityRange[0], disasterType.severityRange[1]);
            
            // Apply location modifier to severity
            var locationModifier = getDisasterLocationModifier(location, disasterType);
            severity = Math.min(disasterType.severityRange[1], Math.floor(severity * locationModifier));

            var population = _getLocationPopulationCount(locationId);

            // Calculate deaths based on severity and disaster type
            var deathPercentage = severity / 100;
            if (disasterType.id === 'plague') {
                deathPercentage = Math.min(0.7, severity / 70);
            } else if (disasterType.id === 'famine') {
                deathPercentage = Math.min(0.5, severity / 50);
            } else if (disasterType.id === 'earthquake') {
                deathPercentage = Math.min(0.4, severity / 40);
            }
            var deaths = Math.floor(population * deathPercentage);

            // Generate description using the dedicated function
            var description = generateDisasterDescription(disasterType, location, severity, deaths);

            var disaster = {
                id: null, // Will be set by DisasterState
                year: year || _getCurrentYear(),
                disasterType: disasterType.name,
                disasterId: disasterType.id,
                locationId: locationId,
                locationName: location.displayName,
                severity: severity,
                deaths: deaths,
                population: population,
                prosperityLoss: Math.floor(severity / 4),
                crimeIncrease: severity / 200,
                schoolsDestroyed: 0,
                description: description,
                actualDeaths: 0,
                metadata: {
                    severityText: severity >= 70 ? 'catastrophic' : (severity >= 50 ? 'severe' : (severity >= 30 ? 'major' : (severity >= 10 ? 'minor' : 'moderate'))),
                    locationModifier: locationModifier,
                    forced: !!forcedType
                },
                // NEW: Structural damage fields
                structuralDamage: {
                    featuresDestroyed: 0,
                    schoolsDestroyed: 0,
                    enterprisesDestroyed: 0,
                    residencesDemolished: 0,
                    householdsDestroyed: 0,
                    totalLoss: 0,
                    destructionList: {
                        features: [],
                        schools: [],
                        enterprises: [],
                        residences: [],
                        households: []
                    }
                },
                featuresDestroyed: 0,
                enterprisesDestroyed: 0,
                residencesDemolished: 0,
                householdsDestroyed: 0,
                totalLoss: 0
            };

            return { success: true, data: disaster, disasterType: disasterType };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to generate disaster' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. APPLY DISASTER EFFECTS (UPDATED with structural damage)
    // =========================================================================

    function applyDisasterSettlementEffects(locationId, disaster) {
        var prosperityLoss = disaster.prosperityLoss || 0;

        if (typeof window.modifySettlementProsperity === 'function') {
            window.modifySettlementProsperity(locationId, -prosperityLoss, disaster.disasterType);
        }

        _logEvent('disaster', 'Settlement Impact',
            disaster.locationName + ' prosperity decreased by ' + prosperityLoss + ' due to ' + disaster.disasterType,
            [], disaster.locationName);

        return prosperityLoss;
    }

    function applyDisasterCrimeEffect(locationId, disaster) {
        var crimeIncrease = disaster.crimeIncrease || 0;

        if (typeof window.modifySettlementCrimeRate === 'function') {
            window.modifySettlementCrimeRate(locationId, crimeIncrease, disaster.disasterType + ' aftermath');
        }

        _logEvent('disaster', 'Crime Impact',
            'Crime rate in ' + disaster.locationName + ' increased by ' + Math.round(crimeIncrease * 100) + '% after ' + disaster.disasterType,
            [], disaster.locationName);

        return crimeIncrease;
    }

    function applyDisasterEducationEffects(locationId, disaster) {
        var schoolsDestroyed = 0;

        if (typeof window.getInstitutionsAtLocation === 'function' && 
            typeof window.deleteEducationalInstitution === 'function') {
            var institutions = window.getInstitutionsAtLocation(locationId);
            var schools = institutions.filter(function(inst) {
                return inst.type === 'village_school' || 
                       inst.type === 'cathedral_school' ||
                       inst.type === 'university' ||
                       (inst.subjects && inst.subjects.indexOf('literacy') !== -1);
            });

            var destroyChance = disaster.severity / 100;
            for (var i = 0; i < schools.length; i++) {
                var shouldDestroy = _chance(destroyChance);
                if (shouldDestroy) {
                    window.deleteEducationalInstitution(schools[i].id, false);
                    schoolsDestroyed++;
                }
            }
        }

        disaster.schoolsDestroyed = schoolsDestroyed;

        if (schoolsDestroyed > 0) {
            _logEvent('disaster', 'Education Impact',
                schoolsDestroyed + ' educational institution(s) destroyed in ' + disaster.locationName + ' by ' + disaster.disasterType,
                [], disaster.locationName);
        }

        return schoolsDestroyed;
    }

    /**
     * Gets all characters at a location (including sub-locations)
     * @param {string} locationId - Location ID
     * @returns {Array} Array of character objects
     */
    function _getCharactersAtLocation(locationId) {
        var allLocationIds = _getAllSubLocationIds(locationId);
        var allLocationIdsSet = new Set(allLocationIds);

        // Build location name to ID mapping
        var places = _getPlaces();
        var displayNameToId = {};
        for (var i = 0; i < places.length; i++) {
            displayNameToId[places[i].displayName] = places[i].id;
        }

        var characters = _getCharacters();
        var affected = [];

        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            if (character.isDeceased) continue;

            var charLocation = _getCurrentLocation(character);
            var charLocationId = displayNameToId[charLocation];

            if (charLocationId && allLocationIdsSet.has(charLocationId)) {
                affected.push(character);
            }
        }

        return affected;
    }

    /**
     * Filters characters by options (age, gender, etc.)
     * @param {Array} characters - Array of character objects
     * @param {Object} options - Filter options
     * @param {number} options.minAge - Minimum age
     * @param {number} options.maxAge - Maximum age
     * @param {string} options.gender - Gender filter
     * @param {boolean} options.includeDeceased - Include deceased characters
     * @returns {Array} Filtered array of characters
     */
    function _filterCharactersByOptions(characters, options) {
        options = options || {};
        var currentYear = _getCurrentYear();

        return characters.filter(function(char) {
            // Check deceased
            if (!options.includeDeceased && char.isDeceased) return false;

            // Check age
            if (options.minAge !== undefined || options.maxAge !== undefined) {
                var age = currentYear - (char.birthYear || currentYear);
                if (options.minAge !== undefined && age < options.minAge) return false;
                if (options.maxAge !== undefined && age > options.maxAge) return false;
            }

            // Check gender
            if (options.gender && options.gender !== 'all' && char.gender !== options.gender) return false;

            return true;
        });
    }

    /**
     * Apply all disaster effects to a location
     * Now includes structural damage via DisasterDamage coordinator
     */
    function applyDisasterEffects(locationId, disaster) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            var location = _getPlaceById(locationId);
            if (!location) {
                return { success: false, error: 'Location not found' };
            }

            var results = {
                success: true,
                locationId: locationId,
                disasterId: disaster.id,
                year: disaster.year,
                prosperityLoss: 0,
                crimeIncrease: 0,
                structuralDamage: null
            };

            // 1. Apply settlement effects (prosperity, crime)
            if (typeof window.SettlementCommands !== 'undefined') {
                results.prosperityLoss = applyDisasterSettlementEffects(locationId, disaster);
                results.crimeIncrease = applyDisasterCrimeEffect(locationId, disaster);
            }

            // 2. Apply education effects (school destruction)
            // DEPRECATED: Now handled by structural damage
            // Keeping for backward compatibility
            if (typeof window.EducationCommands !== 'undefined') {
                applyDisasterEducationEffects(locationId, disaster);
            }

            // 3. NEW: Apply structural damage via Damage Coordinator
            try {
                if (typeof window.DisasterDamage !== 'undefined' && 
                    typeof window.DisasterDamage.applyStructuralDamage === 'function') {
                    var damageResults = window.DisasterDamage.applyStructuralDamage(
                        locationId, 
                        disaster,
                        { demolishHouseholds: true }
                    );
                    results.structuralDamage = damageResults;
                }
            } catch (e) {
                // Damage coordinator might not be loaded
                results.structuralDamage = { success: false, error: e.message };
            }

            // 4. Update disaster record with comprehensive results
            try {
                if (typeof window.DisasterState !== 'undefined') {
                    var updates = {
                        prosperityLoss: results.prosperityLoss,
                        crimeIncrease: results.crimeIncrease
                    };

                    if (results.structuralDamage && results.structuralDamage.success) {
                        updates.structuralDamage = {
                            featuresDestroyed: results.structuralDamage.featuresDestroyed.length || 0,
                            schoolsDestroyed: results.structuralDamage.schoolsDestroyed.length || 0,
                            enterprisesDestroyed: results.structuralDamage.enterprisesDestroyed.length || 0,
                            residencesDemolished: results.structuralDamage.residencesDemolished.length || 0,
                            householdsDestroyed: results.structuralDamage.householdsDestroyed.length || 0,
                            totalLoss: results.structuralDamage.totalLoss || 0,
                            destructionList: {
                                features: results.structuralDamage.featuresDestroyed || [],
                                schools: results.structuralDamage.schoolsDestroyed || [],
                                enterprises: results.structuralDamage.enterprisesDestroyed || [],
                                residences: results.structuralDamage.residencesDemolished || [],
                                households: results.structuralDamage.householdsDestroyed || []
                            }
                        };
                        updates.featuresDestroyed = results.structuralDamage.featuresDestroyed.length || 0;
                        updates.schoolsDestroyed = results.structuralDamage.schoolsDestroyed.length || 0;
                        updates.enterprisesDestroyed = results.structuralDamage.enterprisesDestroyed.length || 0;
                        updates.residencesDemolished = results.structuralDamage.residencesDemolished.length || 0;
                        updates.householdsDestroyed = results.structuralDamage.householdsDestroyed.length || 0;
                        updates.totalLoss = results.structuralDamage.totalLoss || 0;
                    }

                    window.DisasterState.updateDisaster(disaster.id, updates);
                }
            } catch (e) {
                // Failed to update
            }

            return results;

        } catch (e) {
            return { success: false, error: e.message || 'Failed to apply disaster effects' };
        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Apply structural damage specifically (convenience wrapper)
     */
    function applyStructuralDamage(locationId, disaster, options) {
        if (typeof window.DisasterDamage === 'undefined') {
            return { success: false, error: 'DisasterDamage module not loaded' };
        }
        return window.DisasterDamage.applyStructuralDamage(locationId, disaster, options);
    }

    // =========================================================================
    // 6. CONVENIENCE WRAPPERS
    // =========================================================================

    function triggerPlague(locationId, year, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            options = options || {};
            year = year || _getCurrentYear();

            // Generate the disaster
            var generateResult = generateDisaster(locationId, year, 'plague');
            if (!generateResult.success) {
                return { success: false, error: generateResult.error };
            }

            var disaster = generateResult.data;

            // Save the disaster first
            var saveResult = window.DisasterState.addDisaster(disaster);
            if (!saveResult.success) {
                return { success: false, error: 'Failed to save disaster: ' + saveResult.error };
            }
            disaster.id = saveResult.data.id;

            // Apply effects if requested
            if (options.applyEffects !== false) {
                var effectResult = applyDisasterEffects(locationId, disaster);
                if (!effectResult.success) {
                    return { success: false, error: effectResult.error };
                }
                return {
                    success: true,
                    data: {
                        disaster: disaster,
                        victims: effectResult.data ? effectResult.data.victims : [],
                        deaths: effectResult.data ? effectResult.data.deaths : 0,
                        prosperityLoss: effectResult.prosperityLoss || 0,
                        crimeIncrease: effectResult.crimeIncrease || 0,
                        structuralDamage: effectResult.structuralDamage || null
                    }
                };
            }

            return { success: true, data: { disaster: disaster } };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to trigger plague' };
        } finally {
            _processingCommand = false;
        }
    }

    function triggerFamine(locationId, year, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            options = options || {};
            year = year || _getCurrentYear();

            var generateResult = generateDisaster(locationId, year, 'famine');
            if (!generateResult.success) {
                return { success: false, error: generateResult.error };
            }

            var disaster = generateResult.data;

            var saveResult = window.DisasterState.addDisaster(disaster);
            if (!saveResult.success) {
                return { success: false, error: 'Failed to save disaster: ' + saveResult.error };
            }
            disaster.id = saveResult.data.id;

            if (options.applyEffects !== false) {
                var effectResult = applyDisasterEffects(locationId, disaster);
                if (!effectResult.success) {
                    return { success: false, error: effectResult.error };
                }
                return {
                    success: true,
                    data: {
                        disaster: disaster,
                        victims: effectResult.data ? effectResult.data.victims : [],
                        deaths: effectResult.data ? effectResult.data.deaths : 0,
                        prosperityLoss: effectResult.prosperityLoss || 0,
                        crimeIncrease: effectResult.crimeIncrease || 0,
                        structuralDamage: effectResult.structuralDamage || null
                    }
                };
            }

            return { success: true, data: { disaster: disaster } };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to trigger famine' };
        } finally {
            _processingCommand = false;
        }
    }

    function triggerDisaster(locationId, disasterType, year, options) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            options = options || {};
            year = year || _getCurrentYear();

            var generateResult = generateDisaster(locationId, year, disasterType);
            if (!generateResult.success) {
                return { success: false, error: generateResult.error };
            }

            var disaster = generateResult.data;

            var saveResult = window.DisasterState.addDisaster(disaster);
            if (!saveResult.success) {
                return { success: false, error: 'Failed to save disaster: ' + saveResult.error };
            }
            disaster.id = saveResult.data.id;

            if (options.applyEffects !== false) {
                var effectResult = applyDisasterEffects(locationId, disaster);
                if (!effectResult.success) {
                    return { success: false, error: effectResult.error };
                }
                return {
                    success: true,
                    data: {
                        disaster: disaster,
                        victims: effectResult.data ? effectResult.data.victims : [],
                        deaths: effectResult.data ? effectResult.data.deaths : 0,
                        prosperityLoss: effectResult.prosperityLoss || 0,
                        crimeIncrease: effectResult.crimeIncrease || 0,
                        structuralDamage: effectResult.structuralDamage || null
                    }
                };
            }

            return { success: true, data: { disaster: disaster } };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to trigger disaster' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. RANDOM DISASTER SIMULATION
    // =========================================================================

    function simulateRandomDisaster(year, baseChance) {
        if (_processingCommand) {
            return { success: false, error: 'Already processing a command' };
        }
        _processingCommand = true;

        try {
            baseChance = baseChance || 0.05;
            year = year || _getCurrentYear();

            var shouldOccur = _chance(baseChance);
            if (!shouldOccur) {
                return { success: true, data: null, message: 'No disaster occurred' };
            }

            var places = _getPlaces();
            var placesWithPopulation = places.filter(function(p) {
                var pop = _getLocationPopulationCount(p.id);
                return pop > 0;
            });

            if (placesWithPopulation.length === 0) {
                return { success: true, data: null, message: 'No populated locations available' };
            }

            // Weight by population
            var totalWeight = 0;
            var weights = placesWithPopulation.map(function(p) {
                var pop = _getLocationPopulationCount(p.id);
                totalWeight += pop;
                return pop;
            });

            var random = Math.random() * totalWeight;
            var accumulated = 0;
            var selectedPlace = null;

            for (var i = 0; i < placesWithPopulation.length; i++) {
                accumulated += weights[i];
                if (random <= accumulated) {
                    selectedPlace = placesWithPopulation[i];
                    break;
                }
            }

            if (!selectedPlace) {
                return { success: true, data: null, message: 'No location selected' };
            }

            var result = triggerDisaster(selectedPlace.id, null, year, { applyEffects: true });
            return result;

        } catch (e) {
            return { success: false, error: e.message || 'Failed to simulate random disaster' };
        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.DisasterCommands = {
        // Generation
        generateDisaster: generateDisaster,
        generateDisasterDescription: generateDisasterDescription,
        getDisasterLocationModifier: getDisasterLocationModifier,

        // Effects (UPDATED)
        applyDisasterEffects: applyDisasterEffects,
        applyDisasterSettlementEffects: applyDisasterSettlementEffects,
        applyDisasterCrimeEffect: applyDisasterCrimeEffect,
        applyDisasterEducationEffects: applyDisasterEducationEffects,

        // Structural damage (NEW)
        applyStructuralDamage: applyStructuralDamage,

        // Convenience wrappers
        triggerPlague: triggerPlague,
        triggerFamine: triggerFamine,
        triggerDisaster: triggerDisaster,

        // Random simulation
        simulateRandomDisaster: simulateRandomDisaster
    };

    // Legacy aliases
    window._disasterCommands = window.DisasterCommands;

})();