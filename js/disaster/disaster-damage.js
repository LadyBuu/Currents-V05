/**
 * =============================================================================
 * STILL WATERS - DISASTER DAMAGE COORDINATOR (disaster-damage.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-damage.js
 * 
 * Central coordinator for applying structural damage from disasters.
 * Integrates with: Settlement, Education, Industry, Household, Residence systems.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterDamage.applyStructuralDamage(locationId, disaster, options)
 *   - DisasterDamage.getDamageSummary(disasterId)
 *   - DisasterDamage.getDestructionList(disasterId)
 *   - DisasterDamage.getLocationDestruction(locationId, options)
 * 
 * DEPENDENCIES:
 *   - disaster-state.js: DisasterState
 *   - settlement-commands.js: SettlementCommands
 *   - education-commands.js: EducationCommands
 *   - industry-commands.js: IndustryCommands
 *   - household-commands.js: HouseholdCommands
 *   - residence-system.js: ResidenceSystem
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

    var _processing = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getDisasterState() {
        return typeof window.DisasterState !== 'undefined' ? window.DisasterState : null;
    }

    function _getSettlementCommands() {
        return typeof window.SettlementCommands !== 'undefined' ? window.SettlementCommands : null;
    }

    function _getSettlementState() {
        return typeof window.SettlementState !== 'undefined' ? window.SettlementState : null;
    }

    function _getSettlementFeatures() {
        return typeof window.SettlementFeatures !== 'undefined' ? window.SettlementFeatures : null;
    }

    function _getEducationCommands() {
        return typeof window.EducationCommands !== 'undefined' ? window.EducationCommands : null;
    }

    function _getEducationState() {
        return typeof window.EducationState !== 'undefined' ? window.EducationState : null;
    }

    function _getIndustryCommands() {
        return typeof window.IndustryCommands !== 'undefined' ? window.IndustryCommands : null;
    }

    function _getIndustryState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function _getHouseholdCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getHouseholdState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isLoaded(name) {
        switch (name) {
            case 'settlement': return !!(window.SettlementCommands && window.SettlementState);
            case 'education': return !!(window.EducationCommands && window.EducationState);
            case 'industry': return !!(window.IndustryCommands && window.IndustryState);
            case 'household': return !!(window.HouseholdCommands && window.HouseholdState);
            case 'residence': return !!(window.ResidenceSystem);
            default: return false;
        }
    }

    function _safeCall(fn, fallback) {
        try {
            return fn();
        } catch (e) {
            return fallback !== undefined ? fallback : null;
        }
    }

    // =========================================================================
    // 3. CORE DAMAGE CALCULATION
    // =========================================================================

    /**
     * Calculates destruction chance from severity
     * @param {number} severity - Disaster severity (0-100)
     * @returns {number} - Destruction chance (0-1)
     */
    function _calculateDestructionChance(severity) {
        // Severity 0-100 maps to destruction chance 0-0.65
        // Cap at 65% so not everything is destroyed
        return Math.min(0.65, (severity / 100) * 0.65);
    }

    /**
     * Gets disaster type multiplier for structural damage
     * @param {string} disasterType - Disaster ID
     * @returns {number} - Multiplier
     */
    function _getDisasterTypeMultiplier(disasterType) {
        var multipliers = {
            'earthquake': 1.4,
            'landslide': 1.4,
            'volcano': 1.3,
            'fire': 1.3,
            'hurricane': 1.2,
            'tornado': 1.2,
            'tsunami': 1.2,
            'flood': 1.1,
            'avalanche': 1.2,
            'drought': 0.5,
            'plague': 0.1,
            'famine': 0.3
        };
        return multipliers[disasterType] || 1.0;
    }

    /**
     * Selects items to destroy based on chance
     * @param {Array} items - Items to consider
     * @param {number} baseChance - Base destruction chance
     * @param {Object} disaster - Disaster object
     * @param {number} typeMultiplier - Additional multiplier for this type
     * @returns {Array} - Items to destroy
     */
    function _selectItemsToDestroy(items, baseChance, disaster, typeMultiplier) {
        var toDestroy = [];
        if (!items || items.length === 0) return toDestroy;

        var disasterType = disaster ? (disaster.disasterId || 'unknown') : 'unknown';
        var typeMult = _getDisasterTypeMultiplier(disasterType);
        var adjustedChance = Math.min(0.9, baseChance * typeMult * (typeMultiplier || 1.0));

        for (var i = 0; i < items.length; i++) {
            if (Math.random() < adjustedChance) {
                toDestroy.push(items[i]);
            }
        }

        return toDestroy;
    }

    // =========================================================================
    // 4. STRUCTURAL DAMAGE APPLICATION
    // =========================================================================

    /**
     * Main entry point: Apply structural damage from a disaster
     * @param {string} locationId - The location affected
     * @param {Object} disaster - The disaster object
     * @param {Object} options - Damage options
     * @param {number} options.destructionChance - Override chance (0-1)
     * @param {boolean} options.demolishHouseholds - Also demolish households (default: true)
     * @returns {Object} - Damage report
     */
    function applyStructuralDamage(locationId, disaster, options) {
        if (_processing) {
            return { success: false, error: 'Damage processing already in progress' };
        }
        _processing = true;

        try {
            options = options || {};

            var severity = disaster ? (disaster.severity || 50) : 50;
            var baseChance = options.destructionChance !== undefined ? 
                options.destructionChance : 
                _calculateDestructionChance(severity);
            var chance = Math.min(0.9, baseChance);

            var results = {
                success: true,
                locationId: locationId,
                disasterId: disaster ? disaster.id : null,
                year: disaster ? disaster.year : null,
                featuresDestroyed: [],
                schoolsDestroyed: [],
                enterprisesDestroyed: [],
                residencesDemolished: [],
                householdsDestroyed: [],
                totalLoss: 0,
                summary: {
                    features: 0,
                    schools: 0,
                    enterprises: 0,
                    residences: 0,
                    households: 0
                },
                errors: []
            };

            // 1. Destroy settlement features
            if (_isLoaded('settlement')) {
                try {
                    var featuresResult = _destroySettlementFeatures(locationId, chance, disaster);
                    results.featuresDestroyed = featuresResult.destroyed;
                    results.errors = results.errors.concat(featuresResult.errors || []);
                } catch (e) {
                    results.errors.push({ system: 'settlement', error: e.message });
                }
            }

            // 2. Destroy schools
            if (_isLoaded('education')) {
                try {
                    var schoolsResult = _destroySchools(locationId, chance, disaster);
                    results.schoolsDestroyed = schoolsResult.destroyed;
                    results.errors = results.errors.concat(schoolsResult.errors || []);
                } catch (e) {
                    results.errors.push({ system: 'education', error: e.message });
                }
            }

            // 3. Destroy enterprises
            if (_isLoaded('industry')) {
                try {
                    var enterprisesResult = _destroyEnterprises(locationId, chance, disaster);
                    results.enterprisesDestroyed = enterprisesResult.destroyed;
                    results.errors = results.errors.concat(enterprisesResult.errors || []);
                } catch (e) {
                    results.errors.push({ system: 'industry', error: e.message });
                }
            }

            // 4. Demolish residences
            if (_isLoaded('residence')) {
                try {
                    var residencesResult = _demolishResidences(locationId, chance, disaster);
                    results.residencesDemolished = residencesResult.demolished;
                    results.errors = results.errors.concat(residencesResult.errors || []);
                } catch (e) {
                    results.errors.push({ system: 'residence', error: e.message });
                }
            }

            // 5. Destroy households (if enabled)
            if (options.demolishHouseholds !== false && _isLoaded('household')) {
                try {
                    var householdsResult = _destroyHouseholds(locationId, chance * 0.5, disaster);
                    results.householdsDestroyed = householdsResult.destroyed;
                    results.errors = results.errors.concat(householdsResult.errors || []);
                } catch (e) {
                    results.errors.push({ system: 'household', error: e.message });
                }
            }

            // 6. Calculate total loss
            results.totalLoss = _calculateTotalLoss(results);

            // 7. Update summary
            results.summary = {
                features: results.featuresDestroyed.length,
                schools: results.schoolsDestroyed.length,
                enterprises: results.enterprisesDestroyed.length,
                residences: results.residencesDemolished.length,
                households: results.householdsDestroyed.length
            };

            // 8. Save damage record to disaster
            if (disaster && disaster.id) {
                _saveDamageRecord(disaster.id, results);
            }

            return results;

        } catch (e) {
            return { 
                success: false, 
                error: e.message || 'Failed to apply structural damage',
                locationId: locationId,
                disasterId: disaster ? disaster.id : null
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. SYSTEM-SPECIFIC DESTRUCTION FUNCTIONS
    // =========================================================================

    /**
     * Destroys settlement features
     */
    function _destroySettlementFeatures(locationId, chance, disaster) {
        var result = { destroyed: [], errors: [] };

        try {
            var state = _getSettlementState();
            var commands = _getSettlementCommands();
            var features = _getSettlementFeatures();

            if (!state || !commands || !features) {
                result.errors.push({ system: 'settlement', error: 'System not fully loaded' });
                return result;
            }

            var settlement = state.getSettlementData(locationId);
            if (!settlement) {
                result.errors.push({ system: 'settlement', error: 'Settlement data not found' });
                return result;
            }

            var featureIds = settlement.featureIds || [];
            if (featureIds.length === 0) return result;

            var featureObjects = [];
            for (var i = 0; i < featureIds.length; i++) {
                var f = features.getFeatureById(featureIds[i]);
                if (f) featureObjects.push(f);
            }

            var toDestroy = _selectItemsToDestroy(featureObjects, chance * 0.6, disaster);

            for (var i = 0; i < toDestroy.length; i++) {
                var feature = toDestroy[i];
                try {
                    var demolishResult = commands.demolishFeature(
                        locationId,
                        feature.id
                    );

                    if (demolishResult && demolishResult.success) {
                        result.destroyed.push({
                            id: feature.id,
                            name: feature.name,
                            type: 'settlement_feature',
                            category: feature.category || 'uncategorized',
                            demolished: true,
                            year: disaster ? disaster.year : null
                        });
                    }
                } catch (e) {
                    result.errors.push({ 
                        system: 'settlement', 
                        feature: feature.name,
                        error: e.message 
                    });
                }
            }
        } catch (e) {
            result.errors.push({ system: 'settlement', error: e.message });
        }

        return result;
    }

    /**
     * Destroys schools
     */
    function _destroySchools(locationId, chance, disaster) {
        var result = { destroyed: [], errors: [] };

        try {
            var state = _getEducationState();
            var commands = _getEducationCommands();

            if (!state || !commands) {
                result.errors.push({ system: 'education', error: 'System not fully loaded' });
                return result;
            }

            var schools = state.getInstitutionsByLocation(locationId);
            if (!schools || schools.length === 0) return result;

            var toDestroy = _selectItemsToDestroy(schools, chance * 0.7, disaster);

            for (var i = 0; i < toDestroy.length; i++) {
                var school = toDestroy[i];
                try {
                    var demolishResult = commands.demolishInstitution(
                        school.id,
                        'Destroyed by ' + (disaster ? disaster.disasterType : 'disaster'),
                        disaster ? disaster.year : null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster ? disaster.id : null
                        }
                    );

                    if (demolishResult && demolishResult.success) {
                        result.destroyed.push({
                            id: school.id,
                            name: school.name,
                            type: 'school',
                            institutionType: school.type || 'unknown',
                            demolished: true,
                            year: disaster ? disaster.year : null
                        });
                    }
                } catch (e) {
                    result.errors.push({
                        system: 'education',
                        school: school.name,
                        error: e.message
                    });
                }
            }
        } catch (e) {
            result.errors.push({ system: 'education', error: e.message });
        }

        return result;
    }

    /**
     * Destroys enterprises
     */
    function _destroyEnterprises(locationId, chance, disaster) {
        var result = { destroyed: [], errors: [] };

        try {
            var state = _getIndustryState();
            var commands = _getIndustryCommands();

            if (!state || !commands) {
                result.errors.push({ system: 'industry', error: 'System not fully loaded' });
                return result;
            }

            var enterprises = state.getEnterprisesByLocation(locationId);
            if (!enterprises || enterprises.length === 0) return result;

            var toDestroy = _selectItemsToDestroy(enterprises, chance * 0.8, disaster);

            for (var i = 0; i < toDestroy.length; i++) {
                var enterprise = toDestroy[i];
                try {
                    var demolishResult = commands.demolishEnterprise(
                        enterprise.id,
                        'Destroyed by ' + (disaster ? disaster.disasterType : 'disaster'),
                        disaster ? disaster.year : null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster ? disaster.id : null
                        }
                    );

                    if (demolishResult && demolishResult.success) {
                        result.destroyed.push({
                            id: enterprise.id,
                            name: enterprise.name,
                            type: 'enterprise',
                            category: enterprise.category || 'unknown',
                            demolished: true,
                            year: disaster ? disaster.year : null
                        });
                    }
                } catch (e) {
                    result.errors.push({
                        system: 'industry',
                        enterprise: enterprise.name,
                        error: e.message
                    });
                }
            }
        } catch (e) {
            result.errors.push({ system: 'industry', error: e.message });
        }

        return result;
    }

    /**
     * Demolishes residences
     */
    function _demolishResidences(locationId, chance, disaster) {
        var result = { demolished: [], errors: [] };

        try {
            var system = _getResidenceSystem();

            if (!system) {
                result.errors.push({ system: 'residence', error: 'System not loaded' });
                return result;
            }

            var residences = system.getResidencesByLocation(locationId);
            if (!residences || residences.length === 0) return result;

            // Filter out already demolished residences
            var activeResidences = residences.filter(function(r) {
                return !r.isDemolished;
            });

            if (activeResidences.length === 0) return result;

            var toDestroy = _selectItemsToDestroy(activeResidences, chance * 0.9, disaster);

            for (var i = 0; i < toDestroy.length; i++) {
                var residence = toDestroy[i];
                try {
                    var demolishResult = system.demolishResidence(
                        residence.id,
                        'Destroyed by ' + (disaster ? disaster.disasterType : 'disaster'),
                        disaster ? disaster.year : null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster ? disaster.id : null
                        }
                    );

                    if (demolishResult && demolishResult.success) {
                        result.demolished.push({
                            id: residence.id,
                            name: residence.name,
                            type: 'residence',
                            residenceType: residence.typeId || 'unknown',
                            unitsDemolished: demolishResult.unitsDemolished || 0,
                            demolished: true,
                            year: disaster ? disaster.year : null
                        });
                    }
                } catch (e) {
                    result.errors.push({
                        system: 'residence',
                        residence: residence.name,
                        error: e.message
                    });
                }
            }
        } catch (e) {
            result.errors.push({ system: 'residence', error: e.message });
        }

        return result;
    }

    /**
     * Destroys households
     */
    function _destroyHouseholds(locationId, chance, disaster) {
        var result = { destroyed: [], errors: [] };

        try {
            var state = _getHouseholdState();
            var commands = _getHouseholdCommands();

            if (!state || !commands) {
                result.errors.push({ system: 'household', error: 'System not fully loaded' });
                return result;
            }

            var households = state.getHouseholdsByLocation(locationId);
            if (!households || households.length === 0) return result;

            // Only destroy vulnerable households
            var vulnerableHouseholds = households.filter(function(h) {
                // Don't destroy active households with members and wealth
                var hasMembers = h.members && h.members.length > 0;
                var hasWealth = (h.wealth || 0) >= 20;
                var hasResidence = !!h.residenceId;
                var isProtected = hasMembers && hasWealth && hasResidence;
                return !isProtected && h.status !== 'destroyed';
            });

            if (vulnerableHouseholds.length === 0) return result;

            var toDestroy = _selectItemsToDestroy(vulnerableHouseholds, chance, disaster);

            for (var i = 0; i < toDestroy.length; i++) {
                var household = toDestroy[i];
                try {
                    var demolishResult = commands.demolishHousehold(
                        household.id,
                        'Destroyed by ' + (disaster ? disaster.disasterType : 'disaster'),
                        disaster ? disaster.year : null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster ? disaster.id : null,
                            demolishResidence: true
                        }
                    );

                    if (demolishResult && demolishResult.success) {
                        result.destroyed.push({
                            id: household.id,
                            name: household.name,
                            type: 'household',
                            membersRemoved: demolishResult.membersRemoved || 0,
                            demolished: true,
                            year: disaster ? disaster.year : null
                        });
                    }
                } catch (e) {
                    result.errors.push({
                        system: 'household',
                        household: household.name,
                        error: e.message
                    });
                }
            }
        } catch (e) {
            result.errors.push({ system: 'household', error: e.message });
        }

        return result;
    }

    // =========================================================================
    // 6. LOSS CALCULATION & PERSISTENCE
    // =========================================================================

    /**
     * Calculates total loss from destruction
     */
    function _calculateTotalLoss(results) {
        var total = 0;

        // Each destroyed item has a base value
        total += results.featuresDestroyed.length * 30;
        total += results.schoolsDestroyed.length * 100;
        total += results.enterprisesDestroyed.length * 75;
        total += results.residencesDemolished.length * 80;
        total += results.householdsDestroyed.length * 50;

        return total;
    }

    /**
     * Saves damage record to the disaster
     */
    function _saveDamageRecord(disasterId, results) {
        try {
            var state = _getDisasterState();
            if (!state) return;

            var disaster = state.getDisaster(disasterId);
            if (!disaster) return;

            state.updateDisaster(disasterId, {
                structuralDamage: {
                    featuresDestroyed: results.featuresDestroyed.length,
                    schoolsDestroyed: results.schoolsDestroyed.length,
                    enterprisesDestroyed: results.enterprisesDestroyed.length,
                    residencesDemolished: results.residencesDemolished.length,
                    householdsDestroyed: results.householdsDestroyed.length,
                    totalLoss: results.totalLoss,
                    destructionList: {
                        features: results.featuresDestroyed,
                        schools: results.schoolsDestroyed,
                        enterprises: results.enterprisesDestroyed,
                        residences: results.residencesDemolished,
                        households: results.householdsDestroyed
                    }
                },
                // Convenience fields
                featuresDestroyed: results.featuresDestroyed.length,
                schoolsDestroyed: results.schoolsDestroyed.length,
                enterprisesDestroyed: results.enterprisesDestroyed.length,
                residencesDemolished: results.residencesDemolished.length,
                householdsDestroyed: results.householdsDestroyed.length,
                totalLoss: results.totalLoss
            });
        } catch (e) {
            // Failed to save - log but don't fail
        }
    }

    // =========================================================================
    // 7. QUERY FUNCTIONS
    // =========================================================================

    /**
     * Gets damage summary for a disaster
     * @param {string} disasterId - Disaster ID
     * @returns {Object|null} - Damage summary
     */
    function getDamageSummary(disasterId) {
        try {
            var state = _getDisasterState();
            if (!state) return null;

            var disaster = state.getDisaster(disasterId);
            if (!disaster) return null;

            return disaster.structuralDamage || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Gets all destruction caused by a disaster
     * @param {string} disasterId - Disaster ID
     * @param {string} type - Optional: 'features', 'schools', 'enterprises', 'residences', 'households'
     * @returns {Array|null} - Destruction list
     */
    function getDestructionList(disasterId, type) {
        try {
            var state = _getDisasterState();
            if (!state) return null;

            var disaster = state.getDisaster(disasterId);
            if (!disaster) return null;

            var damage = disaster.structuralDamage;
            if (!damage) return null;

            if (type) {
                return damage.destructionList ? damage.destructionList[type] || [] : [];
            }

            // Return all
            var all = [];
            var lists = damage.destructionList || {};
            for (var key in lists) {
                if (lists.hasOwnProperty(key)) {
                    var items = lists[key] || [];
                    for (var i = 0; i < items.length; i++) {
                        all.push({ ...items[i], category: key });
                    }
                }
            }
            return all;
        } catch (e) {
            return null;
        }
    }

    /**
     * Gets all destroyed items for a location
     * @param {string} locationId - Location ID
     * @param {Object} options - Filter options
     * @param {string} options.type - Filter by type
     * @param {number} options.limit - Max items to return
     * @returns {Array} - Array of destroyed items
     */
    function getLocationDestruction(locationId, options) {
        options = options || {};
        var result = [];
        var limit = options.limit || 50;

        try {
            var state = _getDisasterState();
            if (!state) return result;

            var disasters = state.getDisastersByLocation(locationId);
            if (!disasters || disasters.length === 0) return result;

            // Collect from all disasters
            for (var i = 0; i < disasters.length; i++) {
                var disaster = disasters[i];
                var damage = disaster.structuralDamage;
                if (!damage) continue;

                var lists = damage.destructionList || {};
                for (var key in lists) {
                    if (lists.hasOwnProperty(key)) {
                        if (options.type && options.type !== key) continue;
                        var items = lists[key] || [];
                        for (var j = 0; j < items.length; j++) {
                            result.push({
                                ...items[j],
                                category: key,
                                disasterId: disaster.id,
                                disasterType: disaster.disasterType,
                                disasterYear: disaster.year
                            });
                        }
                    }
                }
            }

            // Sort by year (most recent first)
            result.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            // Apply limit
            if (result.length > limit) {
                result = result.slice(0, limit);
            }

        } catch (e) {
            // Error getting destruction
        }

        return result;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    var DisasterDamage = {
        applyStructuralDamage: applyStructuralDamage,
        getDamageSummary: getDamageSummary,
        getDestructionList: getDestructionList,
        getLocationDestruction: getLocationDestruction,

        // Internal helpers (exposed for testing)
        _calculateDestructionChance: _calculateDestructionChance,
        _getDisasterTypeMultiplier: _getDisasterTypeMultiplier,
        _selectItemsToDestroy: _selectItemsToDestroy
    };

    window.DisasterDamage = DisasterDamage;

    // Flag to prevent duplicate initialization
    window._DisasterDamageInitialized = true;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DisasterDamage;
    }

})();