/**
 * =============================================================================
 * STILL WATERS - DISASTER DAMAGE COORDINATOR (disaster-damage.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-damage.js
 *
 * PURPOSE:
 *   Central coordinator for applying structural damage from disasters.
 *   Integrates with Settlement, Education, Industry, Household, and
 *   Residence systems.
 *
 * RESULT CONTRACT:
 *   { success: true, data: DamageReport }
 *   { success: false, reason: string, code?: string }
 *
 *   The damage report shape is preserved from the previous version (see
 *   §DamageReport below). Systems that are not loaded are skipped; the
 *   report's `errors` array records only actual failures, not skipped
 *   systems.
 *
 * COMMIT BOUNDARY:
 *   This module is a coordinator, not a command. It calls the owning
 *   domain's commands for each destruction (demolishFeature, etc.). Each
 *   destruction is its own transaction owned by that domain. There is no
 *   overall commit here — the caller (DisasterCommands.applyDisasterEffects)
 *   is what commits the aggregate state via _commit + persist.
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not own disaster records. (DisasterState)
 *   - It does not orchestrate the disaster lifecycle. (DisasterCommands)
 *   - It does not save. (DisasterCommands.persist)
 *   - It does not reach into another domain's private state; every
 *     destruction goes through that domain's public command boundary.
 *   - It does not use a module-wide recursion guard. Composition is
 *     acyclic: applyStructuralDamage calls into each domain's commands,
 *     none of which call back into applyStructuralDamage.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants
 *   - DisasterState
 *
 * DEPENDENCIES (optional, shape-checked at load if present):
 *   - SettlementQueries.getSettlementData
 *   - SettlementFeatureCommands.demolishFeature
 *   - SettlementFeatureDefinitions (or the query module that resolves feature
 *     ids to definitions)
 *   - EducationState.getInstitutionsByLocation + EducationCommands.demolishInstitution
 *   - IndustryState.getEnterprisesByLocation + IndustryCommands.demolishEnterprise
 *   - HouseholdState.getHouseholdsByLocation + HouseholdCommands.demolishHousehold
 *   - ResidenceSystem.getResidencesByLocation + ResidenceSystem.demolishResidence
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

    if (!C)     throw new Error('disaster-damage.js requires DisasterConstants');
    if (!State) throw new Error('disaster-damage.js requires DisasterState');

    if (!C.CODES) throw new Error('disaster-damage.js requires DisasterConstants.CODES');
    if (!C.DAMAGE_CHANCE) throw new Error('disaster-damage.js requires DisasterConstants.DAMAGE_CHANCE');
    if (!C.DISASTER_TYPE_DAMAGE_MULTIPLIERS) {
        throw new Error('disaster-damage.js requires DisasterConstants.DISASTER_TYPE_DAMAGE_MULTIPLIERS');
    }
    if (!C.DAMAGE_SYSTEM_MULTIPLIERS) {
        throw new Error('disaster-damage.js requires DisasterConstants.DAMAGE_SYSTEM_MULTIPLIERS');
    }
    if (!C.DAMAGE_ITEM_VALUES) {
        throw new Error('disaster-damage.js requires DisasterConstants.DAMAGE_ITEM_VALUES');
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) {
        return { success: false, reason: reason, code: code || null };
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    /**
     * Picks items from `items` to destroy, given a base chance plus
     * disaster-type and system-type multipliers. Chance is clamped to
     * DAMAGE_CHANCE.maxAdjustedChance so a maximum-severity event never
     * destroys everything unconditionally.
     */
    function _selectItemsToDestroy(items, baseChance, disaster, systemMultiplier) {
        if (!items || items.length === 0) return [];

        var typeMultiplier = 1.0;
        if (disaster && disaster.disasterId) {
            typeMultiplier =
                C.DISASTER_TYPE_DAMAGE_MULTIPLIERS[disaster.disasterId] || 1.0;
        }
        var adjusted = baseChance * typeMultiplier * (systemMultiplier || 1.0);
        if (adjusted > C.DAMAGE_CHANCE.maxAdjustedChance) {
            adjusted = C.DAMAGE_CHANCE.maxAdjustedChance;
        }

        var out = [];
        for (var i = 0; i < items.length; i++) {
            if (Math.random() < adjusted) out.push(items[i]);
        }
        return out;
    }

    function _calculateDestructionChance(severity) {
        if (!_isFiniteNumber(severity)) return 0;
        var base = (severity / 100) * C.DAMAGE_CHANCE.maxBaseChance;
        return Math.min(C.DAMAGE_CHANCE.maxBaseChance, base);
    }

    // =========================================================================
    // 2. SYSTEM AVAILABILITY
    // =========================================================================
    //
    // Each `_isLoaded*` check requires both the owning module AND the
    // specific method this coordinator calls. If the module is present
    // but missing the method, the load failed earlier (see
    // disaster-bootstrap) — but we re-check here so this file is safe
    // when loaded standalone.

    function _isLoadedSettlement() {
        return (
            typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getSettlementData === 'function' &&
            typeof window.SettlementFeatureCommands !== 'undefined' &&
            typeof window.SettlementFeatureCommands.demolishFeature === 'function'
        );
    }

    function _isLoadedEducation() {
        return (
            typeof window.EducationState !== 'undefined' &&
            typeof window.EducationState.getInstitutionsByLocation === 'function' &&
            typeof window.EducationCommands !== 'undefined' &&
            typeof window.EducationCommands.demolishInstitution === 'function'
        );
    }

    function _isLoadedIndustry() {
        return (
            typeof window.IndustryState !== 'undefined' &&
            typeof window.IndustryState.getEnterprisesByLocation === 'function' &&
            typeof window.IndustryCommands !== 'undefined' &&
            typeof window.IndustryCommands.demolishEnterprise === 'function'
        );
    }

    function _isLoadedHousehold() {
        return (
            typeof window.HouseholdState !== 'undefined' &&
            typeof window.HouseholdState.getHouseholdsByLocation === 'function' &&
            typeof window.HouseholdCommands !== 'undefined' &&
            typeof window.HouseholdCommands.demolishHousehold === 'function'
        );
    }

    function _isLoadedResidence() {
        return (
            typeof window.ResidenceSystem !== 'undefined' &&
            typeof window.ResidenceSystem.getResidencesByLocation === 'function' &&
            typeof window.ResidenceSystem.demolishResidence === 'function'
        );
    }

    // =========================================================================
    // 3. SYSTEM-SPECIFIC DESTRUCTION
    // =========================================================================

    function _destroySettlementFeatures(locationId, chance, disaster) {
        var destroyed = [];
        var errors = [];

        if (!_isLoadedSettlement()) {
            return { destroyed: destroyed, errors: errors, skipped: true };
        }

        try {
            var settlement = window.SettlementQueries.getSettlementData(locationId);
            if (!settlement) {
                return { destroyed: destroyed, errors: errors, skipped: true };
            }

            var featureIds = settlement.featureIds || [];
            if (featureIds.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            // Resolve feature definitions.
            var featureQueries = window.SettlementFeatureQueries;
            if (!featureQueries || typeof featureQueries.getFeatureById !== 'function') {
                return {
                    destroyed: destroyed,
                    errors: errors,
                    skipped: true
                };
            }

            var resolvable = [];
            for (var i = 0; i < featureIds.length; i++) {
                var feature = featureQueries.getFeatureById(featureIds[i]);
                if (feature) resolvable.push(feature);
            }
            if (resolvable.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            var toDestroy = _selectItemsToDestroy(
                resolvable,
                chance,
                disaster,
                C.DAMAGE_SYSTEM_MULTIPLIERS.features
            );

            for (var j = 0; j < toDestroy.length; j++) {
                var f = toDestroy[j];
                try {
                    var result = window.SettlementFeatureCommands.demolishFeature(
                        locationId,
                        f.id,
                        { reason: 'Destroyed by ' + (disaster && disaster.disasterType || 'disaster') }
                    );
                    if (result && result.success !== false) {
                        destroyed.push({
                            id: f.id,
                            name: f.name,
                            type: 'settlement_feature',
                            category: f.category || 'uncategorized',
                            demolished: true,
                            year: (disaster && disaster.year) || null
                        });
                    } else {
                        errors.push({
                            system: 'settlement',
                            feature: f.name,
                            reason: (result && result.reason) || 'unknown'
                        });
                    }
                } catch (e) {
                    errors.push({
                        system: 'settlement',
                        feature: f.name,
                        reason: e.message || 'exception'
                    });
                }
            }
        } catch (e) {
            errors.push({ system: 'settlement', reason: e.message || 'exception' });
        }

        return { destroyed: destroyed, errors: errors, skipped: false };
    }

    function _destroySchools(locationId, chance, disaster) {
        var destroyed = [];
        var errors = [];

        if (!_isLoadedEducation()) {
            return { destroyed: destroyed, errors: errors, skipped: true };
        }

        try {
            var institutions = window.EducationState.getInstitutionsByLocation(locationId);
            if (!institutions || institutions.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            var toDestroy = _selectItemsToDestroy(
                institutions,
                chance,
                disaster,
                C.DAMAGE_SYSTEM_MULTIPLIERS.schools
            );

            for (var i = 0; i < toDestroy.length; i++) {
                var inst = toDestroy[i];
                try {
                    var result = window.EducationCommands.demolishInstitution(
                        inst.id,
                        'Destroyed by ' + (disaster && disaster.disasterType || 'disaster'),
                        (disaster && disaster.year) || null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster && disaster.id || null
                        }
                    );
                    if (result && result.success !== false) {
                        destroyed.push({
                            id: inst.id,
                            name: inst.name,
                            type: 'school',
                            institutionType: inst.type || 'unknown',
                            demolished: true,
                            year: (disaster && disaster.year) || null
                        });
                    } else {
                        errors.push({
                            system: 'education',
                            school: inst.name,
                            reason: (result && result.reason) || 'unknown'
                        });
                    }
                } catch (e) {
                    errors.push({
                        system: 'education',
                        school: inst.name,
                        reason: e.message || 'exception'
                    });
                }
            }
        } catch (e) {
            errors.push({ system: 'education', reason: e.message || 'exception' });
        }

        return { destroyed: destroyed, errors: errors, skipped: false };
    }

    function _destroyEnterprises(locationId, chance, disaster) {
        var destroyed = [];
        var errors = [];

        if (!_isLoadedIndustry()) {
            return { destroyed: destroyed, errors: errors, skipped: true };
        }

        try {
            var enterprises = window.IndustryState.getEnterprisesByLocation(locationId);
            if (!enterprises || enterprises.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            var toDestroy = _selectItemsToDestroy(
                enterprises,
                chance,
                disaster,
                C.DAMAGE_SYSTEM_MULTIPLIERS.enterprises
            );

            for (var i = 0; i < toDestroy.length; i++) {
                var ent = toDestroy[i];
                try {
                    var result = window.IndustryCommands.demolishEnterprise(
                        ent.id,
                        'Destroyed by ' + (disaster && disaster.disasterType || 'disaster'),
                        (disaster && disaster.year) || null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster && disaster.id || null
                        }
                    );
                    if (result && result.success !== false) {
                        destroyed.push({
                            id: ent.id,
                            name: ent.name,
                            type: 'enterprise',
                            category: ent.category || 'unknown',
                            demolished: true,
                            year: (disaster && disaster.year) || null
                        });
                    } else {
                        errors.push({
                            system: 'industry',
                            enterprise: ent.name,
                            reason: (result && result.reason) || 'unknown'
                        });
                    }
                } catch (e) {
                    errors.push({
                        system: 'industry',
                        enterprise: ent.name,
                        reason: e.message || 'exception'
                    });
                }
            }
        } catch (e) {
            errors.push({ system: 'industry', reason: e.message || 'exception' });
        }

        return { destroyed: destroyed, errors: errors, skipped: false };
    }

    function _demolishResidences(locationId, chance, disaster) {
        var demolished = [];
        var errors = [];

        if (!_isLoadedResidence()) {
            return { demolished: demolished, errors: errors, skipped: true };
        }

        try {
            var residences = window.ResidenceSystem.getResidencesByLocation(locationId);
            if (!residences || residences.length === 0) {
                return { demolished: demolished, errors: errors, skipped: false };
            }

            var active = [];
            for (var i = 0; i < residences.length; i++) {
                if (!residences[i].isDemolished) active.push(residences[i]);
            }
            if (active.length === 0) {
                return { demolished: demolished, errors: errors, skipped: false };
            }

            var toDestroy = _selectItemsToDestroy(
                active,
                chance,
                disaster,
                C.DAMAGE_SYSTEM_MULTIPLIERS.residences
            );

            for (var j = 0; j < toDestroy.length; j++) {
                var res = toDestroy[j];
                try {
                    var result = window.ResidenceSystem.demolishResidence(
                        res.id,
                        'Destroyed by ' + (disaster && disaster.disasterType || 'disaster'),
                        (disaster && disaster.year) || null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster && disaster.id || null
                        }
                    );
                    if (result && result.success !== false) {
                        demolished.push({
                            id: res.id,
                            name: res.name,
                            type: 'residence',
                            residenceType: res.typeId || 'unknown',
                            unitsDemolished: (result && result.unitsDemolished) || 0,
                            demolished: true,
                            year: (disaster && disaster.year) || null
                        });
                    } else {
                        errors.push({
                            system: 'residence',
                            residence: res.name,
                            reason: (result && result.reason) || 'unknown'
                        });
                    }
                } catch (e) {
                    errors.push({
                        system: 'residence',
                        residence: res.name,
                        reason: e.message || 'exception'
                    });
                }
            }
        } catch (e) {
            errors.push({ system: 'residence', reason: e.message || 'exception' });
        }

        return { demolished: demolished, errors: errors, skipped: false };
    }

    function _destroyHouseholds(locationId, chance, disaster) {
        var destroyed = [];
        var errors = [];

        if (!_isLoadedHousehold()) {
            return { destroyed: destroyed, errors: errors, skipped: true };
        }

        try {
            var households = window.HouseholdState.getHouseholdsByLocation(locationId);
            if (!households || households.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            // Only destroy vulnerable households.
            var vulnerable = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (h.status === 'destroyed') continue;
                var hasMembers = Array.isArray(h.members) && h.members.length > 0;
                var hasWealth = _isFiniteNumber(h.wealth) && h.wealth >= 20;
                var hasResidence = !!h.residenceId;
                var isProtected = hasMembers && hasWealth && hasResidence;
                if (!isProtected) vulnerable.push(h);
            }

            if (vulnerable.length === 0) {
                return { destroyed: destroyed, errors: errors, skipped: false };
            }

            var toDestroy = _selectItemsToDestroy(
                vulnerable,
                chance,
                disaster,
                C.DAMAGE_SYSTEM_MULTIPLIERS.households
            );

            for (var j = 0; j < toDestroy.length; j++) {
                var hh = toDestroy[j];
                try {
                    var result = window.HouseholdCommands.demolishHousehold(
                        hh.id,
                        'Destroyed by ' + (disaster && disaster.disasterType || 'disaster'),
                        (disaster && disaster.year) || null,
                        {
                            destroyedBy: 'disaster',
                            disasterId: disaster && disaster.id || null,
                            demolishResidence: true
                        }
                    );
                    if (result && result.success !== false) {
                        destroyed.push({
                            id: hh.id,
                            name: hh.name,
                            type: 'household',
                            membersRemoved: (result && result.membersRemoved) || 0,
                            demolished: true,
                            year: (disaster && disaster.year) || null
                        });
                    } else {
                        errors.push({
                            system: 'household',
                            household: hh.name,
                            reason: (result && result.reason) || 'unknown'
                        });
                    }
                } catch (e) {
                    errors.push({
                        system: 'household',
                        household: hh.name,
                        reason: e.message || 'exception'
                    });
                }
            }
        } catch (e) {
            errors.push({ system: 'household', reason: e.message || 'exception' });
        }

        return { destroyed: destroyed, errors: errors, skipped: false };
    }

    // =========================================================================
    // 4. LOSS CALCULATION
    // =========================================================================

    function _calculateTotalLoss(results) {
        var total = 0;
        var v = C.DAMAGE_ITEM_VALUES;
        total += (results.featuresDestroyed    || []).length * v.features;
        total += (results.schoolsDestroyed     || []).length * v.schools;
        total += (results.enterprisesDestroyed || []).length * v.enterprises;
        total += (results.residencesDemolished || []).length * v.residences;
        total += (results.householdsDestroyed  || []).length * v.households;
        return total;
    }

    // =========================================================================
    // 5. DAMAGE RECORD PERSISTENCE
    // =========================================================================
    //
    // Persist the damage report back onto the disaster record via
    // State.updateDisaster. If the disaster has no id (was never
    // recorded), the update is skipped — this is legitimate when the
    // damage coordinator is called on an in-flight record before
    // DisasterCommands records it.

    function _saveDamageRecord(disasterId, report) {
        if (!disasterId) return;
        var result = State.updateDisaster(disasterId, {
            structuralDamage: {
                featuresDestroyed:    (report.featuresDestroyed    || []).length,
                schoolsDestroyed:     (report.schoolsDestroyed     || []).length,
                enterprisesDestroyed: (report.enterprisesDestroyed || []).length,
                residencesDemolished: (report.residencesDemolished || []).length,
                householdsDestroyed:  (report.householdsDestroyed  || []).length,
                totalLoss: report.totalLoss,
                destructionList: {
                    features:    report.featuresDestroyed    || [],
                    schools:     report.schoolsDestroyed     || [],
                    enterprises: report.enterprisesDestroyed || [],
                    residences:  report.residencesDemolished || [],
                    households:  report.householdsDestroyed  || []
                }
            }
        });
        if (!result.success && typeof console !== 'undefined' && console.error) {
            console.error(
                'disaster-damage.js: failed to persist damage record for ' +
                disasterId + ': ' + (result.reason || 'unknown')
            );
        }
    }

    // =========================================================================
    // 6. PUBLIC ENTRY: APPLY STRUCTURAL DAMAGE
    // =========================================================================
    //
    // Orchestrates the five category-level destroyers, aggregates their
    // reports, computes total loss, and persists the record back onto the
    // disaster. Skips categories whose owning system is not loaded.

    function applyStructuralDamage(locationId, disaster, options) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return _fail('Invalid locationId', C.CODES.VALIDATION);
        }
        if (!disaster) {
            return _fail('No disaster provided', C.CODES.VALIDATION);
        }

        options = options || {};
        var severity = _isFiniteNumber(disaster.severity) ? disaster.severity : 50;
        var baseChance = _isFiniteNumber(options.destructionChance)
            ? options.destructionChance
            : _calculateDestructionChance(severity);

        var report = {
            locationId: locationId,
            disasterId: disaster.id || null,
            year: disaster.year || null,
            featuresDestroyed:    [],
            schoolsDestroyed:     [],
            enterprisesDestroyed: [],
            residencesDemolished: [],
            householdsDestroyed:  [],
            totalLoss: 0,
            errors: []
        };

        var r;

        r = _destroySettlementFeatures(locationId, baseChance, disaster);
        report.featuresDestroyed = r.destroyed;
        report.errors = report.errors.concat(r.errors);

        r = _destroySchools(locationId, baseChance, disaster);
        report.schoolsDestroyed = r.destroyed;
        report.errors = report.errors.concat(r.errors);

        r = _destroyEnterprises(locationId, baseChance, disaster);
        report.enterprisesDestroyed = r.destroyed;
        report.errors = report.errors.concat(r.errors);

        r = _demolishResidences(locationId, baseChance, disaster);
        report.residencesDemolished = r.demolished;
        report.errors = report.errors.concat(r.errors);

        if (options.demolishHouseholds !== false) {
            r = _destroyHouseholds(locationId, baseChance, disaster);
            report.householdsDestroyed = r.destroyed;
            report.errors = report.errors.concat(r.errors);
        }

        report.totalLoss = _calculateTotalLoss(report);

        _saveDamageRecord(report.disasterId, report);

        return _ok(report);
    }

    // =========================================================================
    // 7. QUERIES
    // =========================================================================

    function getDamageSummary(disasterId) {
        var disaster = State.getDisaster(disasterId);
        if (!disaster) return null;
        return disaster.structuralDamage || null;
    }

    function getDestructionList(disasterId, type) {
        var disaster = State.getDisaster(disasterId);
        if (!disaster) return null;

        var damage = disaster.structuralDamage;
        if (!damage || !damage.destructionList) return [];

        if (type) {
            return damage.destructionList[type]
                ? damage.destructionList[type].slice()
                : [];
        }

        var all = [];
        var lists = damage.destructionList;
        var keys = ['features', 'schools', 'enterprises', 'residences', 'households'];
        for (var i = 0; i < keys.length; i++) {
            var list = lists[keys[i]];
            if (!Array.isArray(list)) continue;
            for (var j = 0; j < list.length; j++) {
                var item = {};
                for (var key in list[j]) {
                    if (Object.prototype.hasOwnProperty.call(list[j], key)) {
                        item[key] = list[j][key];
                    }
                }
                item.category = keys[i];
                all.push(item);
            }
        }
        return all;
    }

    function getLocationDestruction(locationId, options) {
        options = options || {};
        var limit = (typeof options.limit === 'number' && options.limit > 0)
            ? options.limit
            : 50;
        var result = [];

        var disasters = State.getDisastersByLocation(locationId);
        if (!disasters || disasters.length === 0) return result;

        var keys = ['features', 'schools', 'enterprises', 'residences', 'households'];

        for (var i = 0; i < disasters.length; i++) {
            var disaster = disasters[i];
            var damage = disaster.structuralDamage;
            if (!damage || !damage.destructionList) continue;

            for (var ki = 0; ki < keys.length; ki++) {
                var key = keys[ki];
                if (options.type && options.type !== key) continue;

                var list = damage.destructionList[key];
                if (!Array.isArray(list)) continue;

                for (var j = 0; j < list.length; j++) {
                    var item = {};
                    for (var itemKey in list[j]) {
                        if (Object.prototype.hasOwnProperty.call(list[j], itemKey)) {
                            item[itemKey] = list[j][itemKey];
                        }
                    }
                    item.category = key;
                    item.disasterId = disaster.id;
                    item.disasterType = disaster.disasterType;
                    item.disasterYear = disaster.year;
                    result.push(item);
                }
            }
        }

        result.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });

        if (result.length > limit) result = result.slice(0, limit);
        return result;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.DisasterDamage = {
        applyStructuralDamage: applyStructuralDamage,
        getDamageSummary: getDamageSummary,
        getDestructionList: getDestructionList,
        getLocationDestruction: getLocationDestruction,

        // Internal helpers exposed for testing
        _calculateDestructionChance: _calculateDestructionChance,
        _selectItemsToDestroy: _selectItemsToDestroy
    };

    window._DisasterDamageInitialized = true;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterDamage;
    }

})();
