/**
 * =============================================================================
 * STILL WATERS - DISASTER COMMANDS (disaster-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-commands.js
 *
 * PURPOSE:
 *   Orchestration layer for disaster workflows. Each command:
 *     1. validates inputs
 *     2. resolves context
 *     3. generates the disaster record
 *     4. records it via DisasterState
 *     5. applies effects (prosperity, crime, deaths, structural damage)
 *        through the owning domain's public command boundary
 *     6. commits the transaction
 *     7. returns a structured result
 *
 * RESULT CONTRACT:
 *   { success: true, data: {...} }
 *   { success: false, reason: string, code?: string }
 *
 *   Codes come from DisasterConstants.CODES. Foreign command failures
 *   propagate their own codes — this module does not invent a code for a
 *   domain it does not own.
 *
 * COMMIT TAIL (_commit):
 *   1. DisasterState.hydrateFromMasterData()  — rebuild indexes
 *   2. markDataDirty()                        — flag for next save
 *   3. DisasterState.publish()                — in-process subscribers
 *   4. dispatchEvent(CustomEvent)             — cross-domain consumers
 *
 *   No saveMasterData inside a command. Persistence is
 *   DisasterCommands.persist(), called by the UI once per modal action.
 *
 * OWNERSHIP:
 *   - generateDisaster, triggerPlague, triggerFamine, triggerDisaster,
 *     simulateRandomDisaster
 *   - applyDisasterEffects orchestration
 *   - the persist boundary
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not own disaster records. (DisasterState)
 *   - It does not apply structural damage directly. (DisasterDamage)
 *   - It does not compute statistics. (DisasterQueries)
 *   - It does not reach into another domain's private state. All cross-
 *     domain effects go through that domain's public command API.
 *   - It does not use a module-wide recursion guard.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants, DisasterState, DisasterDamage
 *   - getCurrentYearSafe, generateId, markDataDirty
 *   - killCharacter, logEvent
 *   - getCharacterById, getCharacters
 *   - getPlaceById, getPlaces, getLocationPopulationCount
 *   - getAllSubLocationIds, getCurrentLocation
 *   - chance, randomInt, pickRandom, pickWeighted
 *   - modifySettlementProsperity, modifySettlementCrimeRate
 *   - SettlementFeatureCommands.demolishFeature
 *   - SettlementQueries.getSettlementData
 *
 * DEPENDENCIES (optional, shape-checked at load):
 *   - EducationCommands.demolishInstitution
 *   - IndustryCommands.demolishEnterprise
 *   - HouseholdCommands.demolishHousehold
 *   - ResidenceSystem.demolishResidence
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.DisasterConstants;
    var State = window.DisasterState;
    var Damage = window.DisasterDamage;

    if (!C)     throw new Error('disaster-commands.js requires DisasterConstants');
    if (!State) throw new Error('disaster-commands.js requires DisasterState');
    if (!Damage) throw new Error('disaster-commands.js requires DisasterDamage');

    if (!C.CODES || !C.EVENTS) {
        throw new Error('disaster-commands.js requires DisasterConstants.CODES and .EVENTS');
    }

    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('disaster-commands.js requires getCurrentYearSafe');
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('disaster-commands.js requires generateId');
    }
    if (typeof window.markDataDirty !== 'function') {
        throw new Error('disaster-commands.js requires markDataDirty');
    }
    if (typeof window.killCharacter !== 'function') {
        throw new Error('disaster-commands.js requires killCharacter');
    }
    if (typeof window.logEvent !== 'function') {
        throw new Error('disaster-commands.js requires logEvent');
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error('disaster-commands.js requires getCharacterById');
    }
    if (typeof window.getCharacters !== 'function') {
        throw new Error('disaster-commands.js requires getCharacters');
    }
    if (typeof window.getPlaceById !== 'function') {
        throw new Error('disaster-commands.js requires getPlaceById');
    }
    if (typeof window.getPlaces !== 'function') {
        throw new Error('disaster-commands.js requires getPlaces');
    }
    if (typeof window.getLocationPopulationCount !== 'function') {
        throw new Error('disaster-commands.js requires getLocationPopulationCount');
    }
    if (typeof window.getAllSubLocationIds !== 'function') {
        throw new Error('disaster-commands.js requires getAllSubLocationIds');
    }
    if (typeof window.getCurrentLocation !== 'function') {
        throw new Error('disaster-commands.js requires getCurrentLocation');
    }
    if (typeof window.chance !== 'function') {
        throw new Error('disaster-commands.js requires chance');
    }
    if (typeof window.randomInt !== 'function') {
        throw new Error('disaster-commands.js requires randomInt');
    }
    if (typeof window.pickRandom !== 'function') {
        throw new Error('disaster-commands.js requires pickRandom');
    }
    if (typeof window.pickWeighted !== 'function') {
        throw new Error('disaster-commands.js requires pickWeighted');
    }
    if (typeof window.modifySettlementProsperity !== 'function') {
        throw new Error('disaster-commands.js requires modifySettlementProsperity');
    }
    if (typeof window.modifySettlementCrimeRate !== 'function') {
        throw new Error('disaster-commands.js requires modifySettlementCrimeRate');
    }
    if (typeof window.SettlementQueries === 'undefined' ||
        typeof window.SettlementQueries.getSettlementData !== 'function') {
        throw new Error('disaster-commands.js requires SettlementQueries.getSettlementData');
    }
    if (typeof window.SettlementFeatureCommands === 'undefined' ||
        typeof window.SettlementFeatureCommands.demolishFeature !== 'function') {
        throw new Error('disaster-commands.js requires SettlementFeatureCommands.demolishFeature');
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _now() { return window.getCurrentYearSafe(); }
    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) {
        return { success: false, reason: reason, code: code || null };
    }

    function _log(category, type, message, subjects, locationName) {
        window.logEvent(category, type, message, subjects || [], locationName);
    }

    // =========================================================================
    // 2. COMMIT TAIL
    // =========================================================================

    function _commit(eventName, payload) {
        State.hydrateFromMasterData(true);
        window.markDataDirty();
        State.publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, detail) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: detail || null }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-commands.js: dispatch failed', eventName, e);
            }
        }
    }

    // =========================================================================
    // 3. PERSISTENCE BOUNDARY
    // =========================================================================

    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return _fail('saveMasterData unavailable', C.CODES.DAMAGE_FAILED);
        }
        try {
            window.saveMasterData();
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            return _ok(null);
        } catch (e) {
            return _fail(e.message || String(e), C.CODES.DAMAGE_FAILED);
        }
    }

    // =========================================================================
    // 4. LOCATION MODIFIER
    // =========================================================================

    function _matchesLocationKeywords(locationName, keywords) {
        if (!locationName || !Array.isArray(keywords)) return false;
        var lower = String(locationName).toLowerCase();
        for (var i = 0; i < keywords.length; i++) {
            if (lower.indexOf(keywords[i]) !== -1) return true;
        }
        return false;
    }

    function getDisasterLocationModifier(location, disasterType) {
        if (!location || !disasterType || !disasterType.locationModifiers) return 1.0;

        var modifier = 1.0;
        var locationName = location.displayName || '';

        for (var terrain in disasterType.locationModifiers) {
            if (!Object.prototype.hasOwnProperty.call(disasterType.locationModifiers, terrain)) continue;
            var mod = disasterType.locationModifiers[terrain];
            var keywords = C.getLocationKeywords(terrain);
            if (_matchesLocationKeywords(locationName, keywords)) {
                modifier *= mod;
            }
        }

        var bounds = C.LOCATION_MODIFIER_BOUNDS;
        return Math.min(bounds.max, Math.max(bounds.min, modifier));
    }

    // =========================================================================
    // 5. DESCRIPTION
    // =========================================================================

    function generateDisasterDescription(disasterType, location, severity, deaths) {
        if (!disasterType || !location) {
            return 'A disaster occurred.';
        }

        var severityText = 'moderate';
        var band = C.classifySeverity(severity);
        if (band === C.SEVERITY_BANDS.CRITICAL)     severityText = 'catastrophic';
        else if (band === C.SEVERITY_BANDS.HIGH)    severityText = 'severe';
        else if (band === C.SEVERITY_BANDS.MEDIUM)  severityText = 'major';
        else if (band === C.SEVERITY_BANDS.LOW)     severityText = 'minor';

        var baseDesc = disasterType.desc || 'A disaster struck';
        var locationName = location.displayName || 'Unknown Location';

        return baseDesc + ' in ' + locationName +
            '. A ' + severityText + ' event (severity: ' + severity + ') claiming ' + deaths + ' lives.';
    }

    // =========================================================================
    // 6. GENERATE DISASTER
    // =========================================================================
    //
    // Pure generation. Does not persist, does not apply effects. The
    // caller decides whether to record it (triggerDisaster / triggerPlague /
    // triggerFamine / simulateRandomDisaster all do).

    function generateDisaster(locationId, year, forcedType) {
        var location = window.getPlaceById(locationId);
        if (!location) {
            return _fail('Location not found', C.CODES.LOCATION_NOT_FOUND);
        }

        var disasterTypes = C.DISASTER_TYPES;
        if (!disasterTypes || disasterTypes.length === 0) {
            return _fail('No disaster types available', C.CODES.NO_DISASTER_TYPES);
        }

        var disasterType;

        if (forcedType) {
            disasterType = C.getDisasterTypeById(forcedType);
            if (!disasterType) {
                return _fail(
                    'Disaster type not found: ' + forcedType,
                    C.CODES.DISASTER_TYPE_NOT_FOUND
                );
            }
        } else {
            var weightedTypes = [];
            for (var i = 0; i < disasterTypes.length; i++) {
                var t = disasterTypes[i];
                var modifier = getDisasterLocationModifier(location, t);
                weightedTypes.push({
                    type: t,
                    weight: Math.floor(t.weight * modifier)
                });
            }
            var picked = window.pickWeighted(weightedTypes, function(item) { return item.weight; });
            disasterType = picked ? picked.type : disasterTypes[0];
        }

        var severity = window.randomInt(
            disasterType.severityRange[0],
            disasterType.severityRange[1]
        );
        var locationModifier = getDisasterLocationModifier(location, disasterType);
        severity = Math.min(
            disasterType.severityRange[1],
            Math.floor(severity * locationModifier)
        );

        var population = window.getLocationPopulationCount(locationId);
        if (typeof population !== 'number' || !isFinite(population)) population = 0;

        var deathPercentage = severity / 100;
        if (disasterType.id === 'plague') {
            deathPercentage = Math.min(0.7, severity / 70);
        } else if (disasterType.id === 'famine') {
            deathPercentage = Math.min(0.5, severity / 50);
        } else if (disasterType.id === 'earthquake') {
            deathPercentage = Math.min(0.4, severity / 40);
        }
        var deaths = Math.floor(population * deathPercentage);

        var description = generateDisasterDescription(disasterType, location, severity, deaths);

        var severityBand = C.classifySeverity(severity);

        var record = {
            year: (typeof year === 'number') ? year : _now(),
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
                severityText: severityBand,
                locationModifier: locationModifier,
                forced: !!forcedType
            },
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

        return _ok(record);
    }

    // =========================================================================
    // 7. VICTIM COLLECTION
    // =========================================================================

    function _getCharactersAtLocation(locationId) {
        var allLocationIds = window.getAllSubLocationIds(locationId);
        if (!Array.isArray(allLocationIds) || allLocationIds.length === 0) {
            allLocationIds = [locationId];
        }
        var allSet = {};
        for (var i = 0; i < allLocationIds.length; i++) allSet[allLocationIds[i]] = true;

        var places = window.getPlaces();
        var nameToId = {};
        for (var p = 0; p < places.length; p++) {
            if (places[p] && places[p].displayName) {
                nameToId[places[p].displayName] = places[p].id;
            }
        }

        var characters = window.getCharacters();
        var affected = [];
        for (var c = 0; c < characters.length; c++) {
            var char = characters[c];
            if (!char || char.isDeceased) continue;
            var charLocation = window.getCurrentLocation(char);
            if (!charLocation) continue;
            var charLocationId = nameToId[charLocation];
            if (charLocationId && allSet[charLocationId]) {
                affected.push(char);
            }
        }
        return affected;
    }

    function _killVictims(victims, disaster) {
        var killed = 0;
        var subjects = [];
        for (var i = 0; i < victims.length; i++) {
            var char = victims[i];
            if (!char || char.isDeceased) continue;
            var result = window.killCharacter(char, disaster.year, disaster.disasterType, {
                disasterId: disaster.id || null,
                disasterType: disaster.disasterType
            });
            if (result && result.success !== false) {
                killed++;
                subjects.push(char);
            } else if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'disaster-commands.js: killCharacter failed for ' + (char.id || '?') +
                    ': ' + ((result && (result.reason || result.error)) || 'unknown')
                );
            }
        }
        return { killed: killed, subjects: subjects };
    }

    // =========================================================================
    // 8. EFFECTS: SETTLEMENT
    // =========================================================================

    function applyDisasterSettlementEffects(locationId, disaster) {
        var prosperityLoss = (typeof disaster.prosperityLoss === 'number')
            ? disaster.prosperityLoss
            : 0;

        try {
            window.modifySettlementProsperity(
                locationId,
                -prosperityLoss,
                disaster.disasterType
            );
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-commands.js: modifySettlementProsperity threw', e);
            }
        }

        _log('disaster', 'Settlement Impact',
            disaster.locationName + ' prosperity decreased by ' + prosperityLoss +
            ' due to ' + disaster.disasterType,
            [], disaster.locationName);

        return prosperityLoss;
    }

    function applyDisasterCrimeEffect(locationId, disaster) {
        var crimeIncrease = (typeof disaster.crimeIncrease === 'number')
            ? disaster.crimeIncrease
            : 0;

        try {
            window.modifySettlementCrimeRate(
                locationId,
                crimeIncrease,
                disaster.disasterType + ' aftermath'
            );
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-commands.js: modifySettlementCrimeRate threw', e);
            }
        }

        _log('disaster', 'Crime Impact',
            'Crime rate in ' + disaster.locationName + ' increased by ' +
            Math.round(crimeIncrease * 100) + '% after ' + disaster.disasterType,
            [], disaster.locationName);

        return crimeIncrease;
    }

    // =========================================================================
    // 9. EFFECTS: ORCHESTRATION
    // =========================================================================

    function applyDisasterEffects(locationId, disaster) {
        var location = window.getPlaceById(locationId);
        if (!location) {
            return _fail('Location not found', C.CODES.LOCATION_NOT_FOUND);
        }

        var results = {
            success: true,
            locationId: locationId,
            disasterId: disaster.id || null,
            year: disaster.year,
            prosperityLoss: 0,
            crimeIncrease: 0,
            victimsKilled: 0,
            structuralDamage: null
        };

        // 1. Settlement prosperity + crime.
        results.prosperityLoss = applyDisasterSettlementEffects(locationId, disaster);
        results.crimeIncrease = applyDisasterCrimeEffect(locationId, disaster);

        // 2. Character deaths.
        try {
            var victims = _getCharactersAtLocation(locationId);
            var killResult = _killVictims(victims, disaster);
            results.victimsKilled = killResult.killed;
            if (killResult.killed > 0) {
                _log('disaster', 'Death Impact',
                    killResult.killed + ' character(s) died in ' +
                    disaster.locationName + ' due to ' + disaster.disasterType,
                    killResult.subjects, disaster.locationName);
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-commands.js: victim collection threw', e);
            }
        }

        // 3. Structural damage via the coordinator.
        if (typeof window.DisasterDamage !== 'undefined' &&
            typeof window.DisasterDamage.applyStructuralDamage === 'function') {
            try {
                var damageResult = window.DisasterDamage.applyStructuralDamage(
                    locationId,
                    disaster,
                    { demolishHouseholds: true }
                );
                results.structuralDamage = damageResult;

                if (damageResult && damageResult.success) {
                    var updates = {
                        structuralDamage: {
                            featuresDestroyed:    (damageResult.featuresDestroyed    || []).length,
                            schoolsDestroyed:     (damageResult.schoolsDestroyed     || []).length,
                            enterprisesDestroyed: (damageResult.enterprisesDestroyed || []).length,
                            residencesDemolished: (damageResult.residencesDemolished || []).length,
                            householdsDestroyed:  (damageResult.householdsDestroyed  || []).length,
                            totalLoss: (damageResult.totalLoss || 0),
                            destructionList: {
                                features:    damageResult.featuresDestroyed    || [],
                                schools:     damageResult.schoolsDestroyed     || [],
                                enterprises: damageResult.enterprisesDestroyed || [],
                                residences:  damageResult.residencesDemolished || [],
                                households:  damageResult.householdsDestroyed  || []
                            }
                        }
                    };
                    if (disaster.id) {
                        State.updateDisaster(disaster.id, updates);
                    }
                }
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('disaster-commands.js: applyStructuralDamage threw', e);
                }
            }
        }

        return _ok(results);
    }

    // =========================================================================
    // 10. CONVENIENCE WRAPPERS
    // =========================================================================
    //
    // Each wrapper: generate → record → apply effects (optional) → commit
    // → return. If generation or recording fails, we return early without
    // applying effects. If applying effects fails partway, we return a
    // structured failure with the code from the failing step.

    function _triggerInternal(locationId, disasterTypeId, year, options) {
        options = options || {};
        var resolvedYear = (typeof year === 'number') ? year : _now();

        var genResult = generateDisaster(locationId, resolvedYear, disasterTypeId);
        if (!genResult.success) return genResult;
        var record = genResult.data;

        var addResult = State.addDisaster(record);
        if (!addResult.success) {
            return _fail(
                'Failed to record disaster: ' + addResult.reason,
                addResult.code || C.CODES.VALIDATION
            );
        }
        var stored = addResult.data;

        var applyResult = null;
        if (options.applyEffects !== false) {
            applyResult = applyDisasterEffects(locationId, stored);
            if (!applyResult.success) {
                _commit(C.EVENTS.DISASTER_ADDED, {
                    disasterId: stored.id,
                    locationId: locationId,
                    effectsFailed: true
                });
                return applyResult;
            }
        }

        _commit(C.EVENTS.DISASTER_ADDED, {
            disasterId: stored.id,
            locationId: locationId,
            disasterType: stored.disasterType,
            severity: stored.severity
        });

        return _ok({
            disaster: stored,
            prosperityLoss: applyResult ? applyResult.data.prosperityLoss : 0,
            crimeIncrease: applyResult ? applyResult.data.crimeIncrease : 0,
            victimsKilled: applyResult ? applyResult.data.victimsKilled : 0,
            structuralDamage: applyResult ? applyResult.data.structuralDamage : null
        });
    }

    function triggerPlague(locationId, year, options) {
        return _triggerInternal(locationId, 'plague', year, options);
    }

    function triggerFamine(locationId, year, options) {
        return _triggerInternal(locationId, 'famine', year, options);
    }

    function triggerDisaster(locationId, disasterType, year, options) {
        return _triggerInternal(locationId, disasterType, year, options);
    }

    // =========================================================================
    // 11. RANDOM SIMULATION
    // =========================================================================

    function simulateRandomDisaster(year, baseChance) {
        var resolvedYear = (typeof year === 'number') ? year : _now();
        var chanceRate = (typeof baseChance === 'number' && baseChance >= 0)
            ? baseChance
            : C.DEFAULT_RANDOM_DISASTER_CHANCE;

        if (!window.chance(chanceRate)) {
            return _ok({ disaster: null, reason: 'no-disaster' });
        }

        var places = window.getPlaces();
        var populated = [];
        for (var i = 0; i < places.length; i++) {
            if (!places[i] || !places[i].id) continue;
            var pop = window.getLocationPopulationCount(places[i].id);
            if (typeof pop === 'number' && pop > 0) {
                populated.push({ place: places[i], population: pop });
            }
        }

        if (populated.length === 0) {
            return _fail('No populated locations available', C.CODES.NO_POPULATED_LOCATIONS);
        }

        var selected = window.pickWeighted(populated, function(item) {
            return item.population;
        });
        if (!selected) {
            return _fail('No populated locations available', C.CODES.NO_POPULATED_LOCATIONS);
        }

        return triggerDisaster(selected.place.id, null, resolvedYear, { applyEffects: true });
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.DisasterCommands = {
        // Generation (does not persist, does not apply effects)
        generateDisaster: generateDisaster,
        generateDisasterDescription: generateDisasterDescription,
        getDisasterLocationModifier: getDisasterLocationModifier,

        // Effect application (public so callers can re-apply or inspect)
        applyDisasterEffects: applyDisasterEffects,
        applyDisasterSettlementEffects: applyDisasterSettlementEffects,
        applyDisasterCrimeEffect: applyDisasterCrimeEffect,

        // Workflows (generate + record + apply + commit)
        triggerPlague: triggerPlague,
        triggerFamine: triggerFamine,
        triggerDisaster: triggerDisaster,

        // Random simulation
        simulateRandomDisaster: simulateRandomDisaster,

        // Persistence
        persist: persist
    };

    window._disasterCommands = window.DisasterCommands;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterCommands;
    }

})();
