/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD CONSTANTS (household-constants.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-constants.js
 *
 * PURPOSE
 * -------
 * Single source of truth for the household domain's vocabulary:
 *
 *   - Economic tiers, income sources, expense categories, economic events
 *   - Service types, service statuses, service quality tiers,
 *     service contract terms
 *   - Residence types, residence statuses, rental statuses,
 *     residence conditions
 *   - Thresholds and multipliers used across economy / servant / residence
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 *   - Not policy. Policy (succession rules, quality calculation,
 *     repair cost) belongs in household-rules.js.
 *   - Not storage. Nothing here is persisted.
 *   - Not state. These are catalogs, frozen at load.
 *
 * CONVENTIONS
 * -----------
 *   - Every catalog is deeply frozen. Mutating throws in strict mode.
 *   - Every catalog also has a lookup helper (getX(id) → entry | null).
 *   - Catalog keys are uppercase (ECONOMIC_TIERS.STRONG_HARVEST etc.)
 *     where the value is a tier-like object.
 *   - Array catalogs (RESIDENCE_CONDITIONS) are also frozen; lookups
 *     iterate the array.
 *   - All IDs are lowercase, underscore-separated strings. This is the
 *     canonical vocabulary used on records.
 *
 * LOAD ORDER
 * ----------
 * Load FIRST among household scripts. Everything else reads from here.
 *
 *   household-constants.js   ← this file
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js
 *
 * DEPENDENCIES
 * ------------
 *   None. This module has no dependencies.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEEP FREEZE HELPER
    // =========================================================================

    function _deepFreeze(obj) {
        if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
            return obj;
        }
        Object.freeze(obj);
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var v = obj[keys[i]];
            if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
                _deepFreeze(v);
            }
        }
        return obj;
    }

    // =========================================================================
    // 2. ECONOMIC CATALOGS
    // =========================================================================

    /**
     * Economic tiers ordered from lowest wealth to highest.
     * A household's tier is determined by `wealth` alone.
     */
    var ECONOMIC_TIERS = _deepFreeze({
        DESTITUTE:  { id: 'destitute',  minWealth: 0,    maxWealth: 10,       label: 'Destitute' },
        POOR:       { id: 'poor',       minWealth: 11,   maxWealth: 30,       label: 'Poor' },
        MODERATE:   { id: 'moderate',   minWealth: 31,   maxWealth: 70,       label: 'Moderate' },
        PROSPEROUS: { id: 'prosperous', minWealth: 71,   maxWealth: 120,      label: 'Prosperous' },
        WEALTHY:    { id: 'wealthy',    minWealth: 121,  maxWealth: 200,      label: 'Wealthy' },
        NOBLE:      { id: 'noble',      minWealth: 201,  maxWealth: 500,      label: 'Noble' },
        VERY_NOBLE: { id: 'very_noble', minWealth: 501,  maxWealth: 1000,     label: 'High Noble' },
        ROYAL:      { id: 'royal',      minWealth: 1001, maxWealth: Infinity, label: 'Royal' }
    });

    /**
     * Income source categories. `baseIncome` is a reference value; the
     * actual income is computed by household-economy from the household's
     * explicit income sources and enterprise profits.
     */
    var INCOME_SOURCES = _deepFreeze({
        agriculture: { id: 'agriculture', name: 'Agriculture',      baseIncome: 10 },
        livestock:   { id: 'livestock',   name: 'Livestock',        baseIncome: 8 },
        trade:       { id: 'trade',       name: 'Trade',            baseIncome: 15 },
        crafts:      { id: 'crafts',      name: 'Crafts',           baseIncome: 12 },
        taxes:       { id: 'taxes',       name: 'Taxes',            baseIncome: 20 },
        rent:        { id: 'rent',        name: 'Rent',             baseIncome: 10 },
        tribute:     { id: 'tribute',     name: 'Tribute',          baseIncome: 25 },
        patronage:   { id: 'patronage',   name: 'Patronage',        baseIncome: 5 },
        military:    { id: 'military',    name: 'Military Service', baseIncome: 15 },
        mining:      { id: 'mining',      name: 'Mining',           baseIncome: 18 }
    });

    var EXPENSE_CATEGORIES = _deepFreeze({
        food:        { id: 'food',        name: 'Food & Supplies',      baseExpense: 8 },
        maintenance: { id: 'maintenance', name: 'Property Maintenance', baseExpense: 6 },
        taxes:       { id: 'taxes',       name: 'Taxes Paid',           baseExpense: 10 },
        staff:       { id: 'staff',       name: 'Staff Wages',          baseExpense: 12 },
        luxury:      { id: 'luxury',      name: 'Luxury Goods',         baseExpense: 15 },
        debt:        { id: 'debt',        name: 'Debt Payments',        baseExpense: 10 },
        tithe:       { id: 'tithe',       name: 'Religious Tithe',      baseExpense: 5 },
        medical:     { id: 'medical',     name: 'Medical Expenses',     baseExpense: 8 }
    });

    /**
     * Economic events. `delta` is a function (returns the wealth delta)
     * or a number. `chance` is the probability weight for
     * applyRandomEconomicEvent.
     */
    var ECONOMIC_EVENTS = _deepFreeze({
        good_harvest: {
            id: 'good_harvest', name: 'Good Harvest',
            description: 'A bountiful harvest brings prosperity',
            delta: function() { return 10 + Math.floor(Math.random() * 20); },
            chance: 0.15
        },
        poor_harvest: {
            id: 'poor_harvest', name: 'Poor Harvest',
            description: 'Poor harvest leads to food shortages',
            delta: function() { return -(10 + Math.floor(Math.random() * 15)); },
            chance: 0.10
        },
        trade_bonus: {
            id: 'trade_bonus', name: 'Trade Windfall',
            description: 'A profitable trade deal brings extra income',
            delta: function() { return 15 + Math.floor(Math.random() * 30); },
            chance: 0.08
        },
        tax_increase: {
            id: 'tax_increase', name: 'Tax Increase',
            description: 'Increased taxes reduce household wealth',
            delta: function() { return -(5 + Math.floor(Math.random() * 10)); },
            chance: 0.12
        },
        theft: {
            id: 'theft', name: 'Theft',
            description: 'Household was robbed',
            delta: function() { return -(10 + Math.floor(Math.random() * 20)); },
            chance: 0.05
        },
        inheritance: {
            id: 'inheritance', name: 'Inheritance',
            description: 'Received inheritance from distant relative',
            delta: function() { return 20 + Math.floor(Math.random() * 50); },
            chance: 0.03
        },
        fire: {
            id: 'fire', name: 'Fire',
            description: 'Property damaged by fire',
            delta: function() { return -(15 + Math.floor(Math.random() * 30)); },
            chance: 0.04
        }
    });

    // =========================================================================
    // 3. SERVICE CATALOGS
    // =========================================================================

    /**
     * Service types. `isDomestic` distinguishes household staff from
     * retainers and other non-live-in staff. `baseWage` is a suggested
     * default; actual wages are stored on the relationship metadata.
     *
     * Key convention: uppercase. Value `id` is lowercase (canonical).
     */
    var SERVICE_TYPES = _deepFreeze({
        HOUSEHOLD_STAFF:    { id: 'household_staff',    name: 'Household Staff',    isDomestic: true,  baseWage: 5  },
        RETAINER:           { id: 'retainer',           name: 'Retainer',           isDomestic: false, baseWage: 15 },
        PERSONAL_ATTENDANT: { id: 'personal_attendant', name: 'Personal Attendant', isDomestic: true,  baseWage: 10 },
        STEWARD:            { id: 'steward',            name: 'Steward',            isDomestic: true,  baseWage: 20 },
        MAID:               { id: 'maid',               name: 'Maid',               isDomestic: true,  baseWage: 6  },
        COOK:               { id: 'cook',               name: 'Cook',               isDomestic: true,  baseWage: 8  },
        GARDENER:           { id: 'gardener',           name: 'Gardener',           isDomestic: true,  baseWage: 7  },
        GROOM:              { id: 'groom',              name: 'Groom',              isDomestic: true,  baseWage: 7  },
        CHAMBERLAIN:        { id: 'chamberlain',        name: 'Chamberlain',        isDomestic: true,  baseWage: 25 },
        BUTLER:             { id: 'butler',             name: 'Butler',             isDomestic: true,  baseWage: 22 },
        LADY_MAID:          { id: 'lady_maid',          name: "Lady's Maid",        isDomestic: true,  baseWage: 12 },
        VALET:              { id: 'valet',              name: 'Valet',              isDomestic: true,  baseWage: 12 }
    });

    /**
     * Service lifecycle statuses. These are distinct from relationship
     * statuses (which use 'ongoing' / 'ended'). This enum describes the
     * service contract state.
     */
    var SERVICE_STATUS = _deepFreeze({
        ACTIVE:     'active',
        ON_LEAVE:   'on_leave',
        TERMINATED: 'terminated',
        RESIGNED:   'resigned'
    });

    /**
     * Service quality tiers, ordered from best to worst. The `minSatisfaction`
     * field is the minimum average satisfaction required to hit this tier.
     * Order matters — calculateServiceQuality returns the first matching tier.
     */
    var SERVICE_QUALITY = _deepFreeze({
        EXCELLENT:      { id: 'excellent',      name: 'Excellent',      minSatisfaction: 90 },
        GOOD:           { id: 'good',           name: 'Good',           minSatisfaction: 70 },
        AVERAGE:        { id: 'average',        name: 'Average',        minSatisfaction: 50 },
        POOR:           { id: 'poor',           name: 'Poor',           minSatisfaction: 30 },
        UNSATISFACTORY: { id: 'unsatisfactory', name: 'Unsatisfactory', minSatisfaction: 0  }
    });

    /**
     * Service quality order — explicit ordering for quality calculation.
     * Array so consumers can iterate without relying on object key order.
     */
    var SERVICE_QUALITY_ORDER = _deepFreeze([
        SERVICE_QUALITY.EXCELLENT,
        SERVICE_QUALITY.GOOD,
        SERVICE_QUALITY.AVERAGE,
        SERVICE_QUALITY.POOR,
        SERVICE_QUALITY.UNSATISFACTORY
    ]);

    var SERVICE_CONTRACT_TERMS = _deepFreeze({
        INDEFINITE: { id: 'indefinite', name: 'Indefinite',   duration: null, noticePeriod: 30 },
        ANNUAL:     { id: 'annual',     name: 'Annual',       duration: 365,  noticePeriod: 30 },
        SEASONAL:   { id: 'seasonal',   name: 'Seasonal',     duration: 90,   noticePeriod: 14 },
        TRIAL:      { id: 'trial',      name: 'Trial Period', duration: 30,   noticePeriod: 7  },
        DAY_LABOR:  { id: 'day_labor',  name: 'Day Labor',    duration: 1,    noticePeriod: 0  }
    });

    // =========================================================================
    // 4. RESIDENCE CATALOGS
    // =========================================================================

    var RESIDENCE_TYPES = _deepFreeze({
        estate:    { id: 'estate',    name: 'Estate',             capacity: 20, isMultiUnit: false },
        manor:     { id: 'manor',     name: 'Manor House',        capacity: 15, isMultiUnit: false },
        house:     { id: 'house',     name: 'House',              capacity: 8,  isMultiUnit: false },
        cottage:   { id: 'cottage',   name: 'Cottage',            capacity: 4,  isMultiUnit: false },
        apartment: { id: 'apartment', name: 'Apartment Building', capacity: 30, isMultiUnit: true  },
        tenement:  { id: 'tenement',  name: 'Tenement',           capacity: 25, isMultiUnit: true  },
        suite:     { id: 'suite',     name: 'Suite',              capacity: 6,  isMultiUnit: false },
        room:      { id: 'room',      name: 'Room',               capacity: 2,  isMultiUnit: false },
        tower:     { id: 'tower',     name: 'Tower',              capacity: 10, isMultiUnit: false },
        palace:    { id: 'palace',    name: 'Palace',             capacity: 50, isMultiUnit: false },
        castle:    { id: 'castle',    name: 'Castle',             capacity: 40, isMultiUnit: false },
        barracks:  { id: 'barracks',  name: 'Barracks',           capacity: 30, isMultiUnit: true  }
    });

    var RESIDENCE_STATUS = _deepFreeze({
        ACTIVE:             'active',
        ABANDONED:          'abandoned',
        DEMOLISHED:         'demolished',
        UNDER_CONSTRUCTION: 'under_construction',
        RENOVATING:         'renovating'
    });

    var RENTAL_STATUS = _deepFreeze({
        OWNER_OCCUPIED: 'owner_occupied',
        RENTED:         'rented',
        VACANT:         'vacant'
    });

    /**
     * Residence conditions ordered from best to worst. `modifier` is
     * multiplied against estimated value for condition-adjusted pricing.
     * Array form so order is explicit.
     */
    var RESIDENCE_CONDITIONS = _deepFreeze([
        { id: 'pristine', name: 'Pristine', modifier: 1.2 },
        { id: 'good',     name: 'Good',     modifier: 1.0 },
        { id: 'fair',     name: 'Fair',     modifier: 0.8 },
        { id: 'poor',     name: 'Poor',     modifier: 0.6 },
        { id: 'ruined',   name: 'Ruined',   modifier: 0.3 }
    ]);

    /**
     * Lookup table derived from RESIDENCE_CONDITIONS. Not a separate
     * catalog — derived here so consumers don't rebuild it.
     */
    var CONDITION_MULTIPLIER = _deepFreeze((function() {
        var map = {};
        for (var i = 0; i < RESIDENCE_CONDITIONS.length; i++) {
            map[RESIDENCE_CONDITIONS[i].id] = RESIDENCE_CONDITIONS[i].modifier;
        }
        return map;
    })());

    // =========================================================================
    // 5. THRESHOLDS AND MULTIPLIERS
    // =========================================================================

    var THRESHOLDS = _deepFreeze({
        // Economy
        BANKRUPTCY: -50,           // wealth below this triggers bankruptcy
        DEBT_INTEREST_RATE: 0.05,  // 5% per year

        // History buffer sizes
        MAX_TRANSACTION_HISTORY: 100,
        MAX_RESOURCE_HISTORY: 100,
        MAX_SALARY_HISTORY: 100,
        MAX_TUITION_HISTORY: 100,
        MAX_SCHOOL_PROFIT_HISTORY: 100,
        MAX_EVENT_LOG: 200,
        MAX_TIMELINE_ENTRIES: 200,
        MAX_HISTORY_ENTRIES: 100,
        MAX_RENTAL_HISTORY: 100,
        MAX_RENT_PAYMENTS: 200,

        // Residence defaults
        DEFAULT_ESTIMATED_VALUE: 500,
        DEFAULT_MAX_UNITS: 20,
        DEFAULT_UNIT_COUNT_DIVISOR: 3,   // unitCount = floor(capacity / divisor)
        MAX_DEFAULT_UNIT_COUNT: 10,

        // Succession
        HEIR_MIN_AGE: 16,
        HEIR_MAX_AGE: 60
    });

    // =========================================================================
    // 6. LOOKUP HELPERS
    // =========================================================================
    //
    // Simple linear scans. Catalogs are small (≤20 entries), so an
    // additional index would be overkill. If a catalog grows large,
    // add an index here — the helper signature stays the same.

    function getEconomicTierById(id) {
        if (!id) return null;
        var keys = Object.keys(ECONOMIC_TIERS);
        for (var i = 0; i < keys.length; i++) {
            if (ECONOMIC_TIERS[keys[i]].id === id) return ECONOMIC_TIERS[keys[i]];
        }
        return null;
    }

    function getIncomeSourceById(id) {
        if (!id) return null;
        return INCOME_SOURCES[id] || null;
    }

    function getExpenseCategoryById(id) {
        if (!id) return null;
        return EXPENSE_CATEGORIES[id] || null;
    }

    function getEconomicEventById(id) {
        if (!id) return null;
        return ECONOMIC_EVENTS[id] || null;
    }

    function getServiceTypeById(id) {
        if (!id) return null;
        var lowerId = String(id).toLowerCase();
        var keys = Object.keys(SERVICE_TYPES);
        for (var i = 0; i < keys.length; i++) {
            if (SERVICE_TYPES[keys[i]].id === lowerId) return SERVICE_TYPES[keys[i]];
        }
        return null;
    }

    function getServiceQualityById(id) {
        if (!id) return null;
        for (var i = 0; i < SERVICE_QUALITY_ORDER.length; i++) {
            if (SERVICE_QUALITY_ORDER[i].id === id) return SERVICE_QUALITY_ORDER[i];
        }
        return null;
    }

    function getServiceContractTermById(id) {
        if (!id) return null;
        var keys = Object.keys(SERVICE_CONTRACT_TERMS);
        for (var i = 0; i < keys.length; i++) {
            if (SERVICE_CONTRACT_TERMS[keys[i]].id === id) {
                return SERVICE_CONTRACT_TERMS[keys[i]];
            }
        }
        return null;
    }

    function getResidenceTypeById(id) {
        if (!id) return null;
        var lowerId = String(id).toLowerCase();
        return RESIDENCE_TYPES[lowerId] || null;
    }

    function getResidenceConditionById(id) {
        if (!id) return null;
        for (var i = 0; i < RESIDENCE_CONDITIONS.length; i++) {
            if (RESIDENCE_CONDITIONS[i].id === id) return RESIDENCE_CONDITIONS[i];
        }
        return null;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    var api = {
        // Catalogs
        ECONOMIC_TIERS: ECONOMIC_TIERS,
        INCOME_SOURCES: INCOME_SOURCES,
        EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
        ECONOMIC_EVENTS: ECONOMIC_EVENTS,
        SERVICE_TYPES: SERVICE_TYPES,
        SERVICE_STATUS: SERVICE_STATUS,
        SERVICE_QUALITY: SERVICE_QUALITY,
        SERVICE_QUALITY_ORDER: SERVICE_QUALITY_ORDER,
        SERVICE_CONTRACT_TERMS: SERVICE_CONTRACT_TERMS,
        RESIDENCE_TYPES: RESIDENCE_TYPES,
        RESIDENCE_STATUS: RESIDENCE_STATUS,
        RENTAL_STATUS: RENTAL_STATUS,
        RESIDENCE_CONDITIONS: RESIDENCE_CONDITIONS,
        CONDITION_MULTIPLIER: CONDITION_MULTIPLIER,
        THRESHOLDS: THRESHOLDS,

        // Lookups
        getEconomicTierById: getEconomicTierById,
        getIncomeSourceById: getIncomeSourceById,
        getExpenseCategoryById: getExpenseCategoryById,
        getEconomicEventById: getEconomicEventById,
        getServiceTypeById: getServiceTypeById,
        getServiceQualityById: getServiceQualityById,
        getServiceContractTermById: getServiceContractTermById,
        getResidenceTypeById: getResidenceTypeById,
        getResidenceConditionById: getResidenceConditionById,

        // Diagnostics
        isFrozen: true,
        version: 1
    };

    window.HouseholdConstants = api;

    // Legacy aliases for backwards compatibility. These point at the same
    // (frozen) objects, so consumers that read `window.ECONOMIC_TIERS`
    // keep working without a code change.
    if (typeof window.ECONOMIC_TIERS === 'undefined') {
        window.ECONOMIC_TIERS = ECONOMIC_TIERS;
    }
    if (typeof window.SERVICE_TYPES === 'undefined') {
        window.SERVICE_TYPES = SERVICE_TYPES;
    }
    if (typeof window.SERVICE_STATUS === 'undefined') {
        window.SERVICE_STATUS = SERVICE_STATUS;
    }
    if (typeof window.SERVICE_QUALITY === 'undefined') {
        window.SERVICE_QUALITY = SERVICE_QUALITY;
    }
    if (typeof window.SERVICE_CONTRACT_TERMS === 'undefined') {
        window.SERVICE_CONTRACT_TERMS = SERVICE_CONTRACT_TERMS;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
