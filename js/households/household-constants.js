/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD CONSTANTS (household-constants.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-constants.js
 *
 * PURPOSE
 * -------
 * The canonical vocabulary for the household domain. Every catalog,
 * threshold, multiplier, and probability the household system relies on
 * lives here. No other household module may define its own copy.
 *
 * WHAT THIS FILE IS
 * -----------------
 *   - Pure data. No state reads, no state writes, no persistence.
 *   - Deeply frozen. Mutating any catalog throws in strict mode.
 *   - Randomness-free. No catalog holds a random draw. Events carry
 *     min/max swing bounds; the caller supplies the roll.
 *   - The single source for the SERVICE_TYPES / ECONOMIC_TIERS /
 *     RESIDENCE_* / THRESHOLDS surface that household-economy.js,
 *     household-servant.js, household-rules.js, residence-system.js,
 *     and the modals all consume.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 *   - Not policy. "What does a service-quality average of 72 mean"
 *     belongs in household-rules.js.
 *   - Not state. No arrays, no indexes, no subscribers.
 *   - Not storage. Nothing here is persisted.
 *   - Not orchestration. Applying an economic event belongs in
 *     household-economy.js.
 *
 * CONVENTIONS
 * -----------
 *   - Every catalog is deeply frozen. `Object.isFrozen(x) === true`.
 *   - Ids are lowercase, underscore-separated, matching record fields.
 *   - Catalog keys are UPPERCASE where the value is an object or an
 *     array of objects (ECONOMIC_TIERS.DESTITUTE, SERVICE_QUALITY.GOOD).
 *   - Catalog keys are the id string itself where the value is a scalar
 *     (SERVICE_STATUS.ACTIVE === 'active', RENTAL_STATUS.VACANT).
 *   - Array catalogs preserve order; the order is meaningful (best-to-
 *     worst, cheapest-to-richest, etc.) and is documented at the catalog.
 *   - No catalog carries a function. Where a value needs to vary at
 *     runtime, this file exposes the *bounds* and the caller applies
 *     the randomness. See ECONOMIC_EVENTS below.
 *
 * LOAD ORDER
 * ----------
 *   household-constants.js       ← this file (FIRST)
 *   household-rules.js
 *   household-view-models.js
 *   household-orchestration.js
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js
 *   household-ui-list.js
 *   modals-*.js
 *
 * DEPENDENCIES
 * ------------
 *   None. This file loads before everything else in the household domain
 *   and can be unit-tested in isolation.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No icons. Labels are plain text. Icons are chosen by
 *   callers via icons.js.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEEP FREEZE
    // =========================================================================

    /**
     * Recursively freezes `obj` and returns it. Safe to call on already-
     * frozen values (idempotent).
     *
     * @private
     * @param {*} obj
     * @returns {*}
     */
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
    // 2. ECONOMIC TIERS
    // =========================================================================
    //
    // A household's economic tier is determined by wealth alone. The tiers
    // form a total, non-overlapping partition of [0, +Infinity).
    //
    // Order: DESTITUTE (poorest) → ROYAL (wealthiest).
    // Consumers that display tiers in order should iterate ECONOMIC_TIER_ORDER.

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

    var ECONOMIC_TIER_ORDER = _deepFreeze([
        ECONOMIC_TIERS.DESTITUTE,
        ECONOMIC_TIERS.POOR,
        ECONOMIC_TIERS.MODERATE,
        ECONOMIC_TIERS.PROSPEROUS,
        ECONOMIC_TIERS.WEALTHY,
        ECONOMIC_TIERS.NOBLE,
        ECONOMIC_TIERS.VERY_NOBLE,
        ECONOMIC_TIERS.ROYAL
    ]);

    // =========================================================================
    // 3. INCOME SOURCES
    // =========================================================================
    //
    // Categories of household income. `baseIncome` is a reference value used
    // by the annual economy calculation as a starting point; actual income
    // is the sum of explicit income sources on the household plus enterprise
    // profit plus rent plus salary. baseIncome is *not* added automatically.

    var INCOME_SOURCES = _deepFreeze({
        agriculture: { id: 'agriculture', name: 'Agriculture',     baseIncome: 10 },
        livestock:   { id: 'livestock',   name: 'Livestock',       baseIncome: 8  },
        trade:       { id: 'trade',       name: 'Trade',           baseIncome: 15 },
        crafts:      { id: 'crafts',      name: 'Crafts',          baseIncome: 12 },
        taxes:       { id: 'taxes',       name: 'Taxes',           baseIncome: 20 },
        rent:        { id: 'rent',        name: 'Rent',            baseIncome: 10 },
        tribute:     { id: 'tribute',     name: 'Tribute',         baseIncome: 25 },
        patronage:   { id: 'patronage',   name: 'Patronage',       baseIncome: 5  },
        military:    { id: 'military',    name: 'Military Service', baseIncome: 15 },
        mining:      { id: 'mining',      name: 'Mining',          baseIncome: 18 }
    });

    // =========================================================================
    // 4. EXPENSE CATEGORIES
    // =========================================================================

    var EXPENSE_CATEGORIES = _deepFreeze({
        food:        { id: 'food',        name: 'Food & Supplies',      baseExpense: 8  },
        maintenance: { id: 'maintenance', name: 'Property Maintenance', baseExpense: 6  },
        taxes:       { id: 'taxes',       name: 'Taxes Paid',           baseExpense: 10 },
        staff:       { id: 'staff',       name: 'Staff Wages',          baseExpense: 12 },
        luxury:      { id: 'luxury',      name: 'Luxury Goods',         baseExpense: 15 },
        debt:        { id: 'debt',        name: 'Debt Payments',        baseExpense: 10 },
        tithe:       { id: 'tithe',       name: 'Religious Tithe',      baseExpense: 5  },
        medical:     { id: 'medical',     name: 'Medical Expenses',     baseExpense: 8  }
    });

    // =========================================================================
    // 5. ECONOMIC EVENTS
    // =========================================================================
    //
    // Economic events are the household-domain equivalent of a random shock.
    // This file declares the event POLICY: name, description, the wealth
    // swing bounds (minDelta / maxDelta), and the probability weight that
    // the event fires.
    //
    // The RANDOM DRAW is NOT here. That is deliberate. Callers that want a
    // deterministic simulation pass their own seeded RNG through
    // `HouseholdConstants.getEconomicEventDelta(eventId, randomFn)`.
    //
    // CONTRACT
    //   delta = getEconomicEventDelta(eventId, randomFn)
    //     - eventId must be a key in ECONOMIC_EVENTS, else throws.
    //     - randomFn must return a value in [0, 1). Throws on anything else.
    //     - Return value is a finite number in [minDelta, maxDelta],
    //       clamped to that range after the draw.
    //
    //   chance = ECONOMIC_EVENTS[eventId].chance   (probability weight)
    //
    // A caller that wants to apply "the next random event" iterates the
    // catalog, computes the total weight, draws once, and dispatches to
    // `HouseholdEconomy.triggerEconomicEvent`.

    var ECONOMIC_EVENTS = _deepFreeze({
        good_harvest: {
            id: 'good_harvest',
            name: 'Good Harvest',
            description: 'A bountiful harvest brings prosperity',
            minDelta: 10,
            maxDelta: 30,
            chance: 0.15
        },
        poor_harvest: {
            id: 'poor_harvest',
            name: 'Poor Harvest',
            description: 'Poor harvest leads to food shortages',
            minDelta: -25,
            maxDelta: -10,
            chance: 0.10
        },
        trade_bonus: {
            id: 'trade_bonus',
            name: 'Trade Windfall',
            description: 'A profitable trade deal brings extra income',
            minDelta: 15,
            maxDelta: 45,
            chance: 0.08
        },
        tax_increase: {
            id: 'tax_increase',
            name: 'Tax Increase',
            description: 'Increased taxes reduce household wealth',
            minDelta: -15,
            maxDelta: -5,
            chance: 0.12
        },
        theft: {
            id: 'theft',
            name: 'Theft',
            description: 'Household was robbed',
            minDelta: -30,
            maxDelta: -10,
            chance: 0.05
        },
        inheritance: {
            id: 'inheritance',
            name: 'Inheritance',
            description: 'Received inheritance from a distant relative',
            minDelta: 20,
            maxDelta: 70,
            chance: 0.03
        },
        fire: {
            id: 'fire',
            name: 'Fire',
            description: 'Property damaged by fire',
            minDelta: -45,
            maxDelta: -15,
            chance: 0.04
        }
    });

    var ECONOMIC_EVENT_IDS = _deepFreeze(
        Object.keys(ECONOMIC_EVENTS)
    );

    /**
     * Computes the wealth delta for an economic event given a caller-
     * supplied random draw.
     *
     * The delta is uniformly distributed over [minDelta, maxDelta]. A draw
     * of 0 yields minDelta; a draw approaching 1 approaches maxDelta.
     *
     * @param {string} eventId    Key in ECONOMIC_EVENTS.
     * @param {Function} randomFn Returns a value in [0, 1).
     * @returns {number}
     * @throws {Error} On unknown eventId or invalid randomFn result.
     */
    function getEconomicEventDelta(eventId, randomFn) {
        if (typeof eventId !== 'string' || eventId.length === 0) {
            throw new Error(
                'HouseholdConstants.getEconomicEventDelta: eventId is required'
            );
        }
        var event = ECONOMIC_EVENTS[eventId];
        if (!event) {
            throw new Error(
                'HouseholdConstants.getEconomicEventDelta: unknown event "' +
                eventId + '"'
            );
        }
        if (typeof randomFn !== 'function') {
            throw new Error(
                'HouseholdConstants.getEconomicEventDelta: randomFn must be a function'
            );
        }
        var roll = randomFn();
        if (typeof roll !== 'number' || !isFinite(roll) ||
            roll < 0 || roll >= 1) {
            throw new Error(
                'HouseholdConstants.getEconomicEventDelta: randomFn must return a value in [0, 1)'
            );
        }

        var span = event.maxDelta - event.minDelta;
        var raw = event.minDelta + roll * span;
        var rounded = Math.round(raw);

        // Clamp defensively — float math should not push past the bounds,
        // but the clamp documents the contract.
        if (rounded < event.minDelta) rounded = event.minDelta;
        if (rounded > event.maxDelta) rounded = event.maxDelta;
        return rounded;
    }

    // =========================================================================
    // 6. SERVICE TYPES
    // =========================================================================
    //
    // Keyed by UPPERCASE name, with a lowercase `id` for record storage.
    // `isDomestic` distinguishes live-in staff from retainers and mercenaries.
    // `baseWage` is a suggested starting wage; the actual wage is stored on
    // the service relationship's metadata.
    //
    // The `id` values are the canonical service-type ids and MUST match what
    // household-servant.js stores on a relationship's metadata.serviceTypeId.

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

    // =========================================================================
    // 7. SERVICE STATUS
    // =========================================================================
    //
    // Scalar catalog: the key name and the value are the same string.
    // Consumers compare `relationship.metadata.status === SERVICE_STATUS.ACTIVE`
    // or use the string directly.

    var SERVICE_STATUS = _deepFreeze({
        ACTIVE:     'active',
        ON_LEAVE:   'on_leave',
        TERMINATED: 'terminated',
        RESIGNED:   'resigned'
    });

    // =========================================================================
    // 8. SERVICE QUALITY
    // =========================================================================
    //
    // Quality tiers ordered best-to-worst. calculateServiceQuality in
    // household-rules.js picks the first tier whose minSatisfaction the
    // average satisfaction meets or exceeds.

    var SERVICE_QUALITY = _deepFreeze({
        EXCELLENT:      { id: 'excellent',      name: 'Excellent',      minSatisfaction: 90 },
        GOOD:           { id: 'good',           name: 'Good',           minSatisfaction: 70 },
        AVERAGE:        { id: 'average',        name: 'Average',        minSatisfaction: 50 },
        POOR:           { id: 'poor',           name: 'Poor',           minSatisfaction: 30 },
        UNSATISFACTORY: { id: 'unsatisfactory', name: 'Unsatisfactory', minSatisfaction: 0  }
    });

    var SERVICE_QUALITY_ORDER = _deepFreeze([
        SERVICE_QUALITY.EXCELLENT,
        SERVICE_QUALITY.GOOD,
        SERVICE_QUALITY.AVERAGE,
        SERVICE_QUALITY.POOR,
        SERVICE_QUALITY.UNSATISFACTORY
    ]);

    // =========================================================================
    // 9. SERVICE CONTRACT TERMS
    // =========================================================================
    //
    // `duration` is in days; null means indefinite.
    // `noticePeriod` is in days.

    var SERVICE_CONTRACT_TERMS = _deepFreeze({
        INDEFINITE: { id: 'indefinite', name: 'Indefinite',   duration: null, noticePeriod: 30 },
        ANNUAL:     { id: 'annual',     name: 'Annual',       duration: 365,  noticePeriod: 30 },
        SEASONAL:   { id: 'seasonal',   name: 'Seasonal',     duration: 90,   noticePeriod: 14 },
        TRIAL:      { id: 'trial',      name: 'Trial Period', duration: 30,   noticePeriod: 7  },
        DAY_LABOR:  { id: 'day_labor',  name: 'Day Labor',    duration: 1,    noticePeriod: 0  }
    });

    // =========================================================================
    // 10. RESIDENCE TYPES
    // =========================================================================
    //
    // `capacity` is the maximum number of residents. `isMultiUnit` marks
    // residences that can hold more than one household (each unit rented
    // separately).

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

    // =========================================================================
    // 11. RESIDENCE STATUS
    // =========================================================================

    var RESIDENCE_STATUS = _deepFreeze({
        ACTIVE:             'active',
        ABANDONED:          'abandoned',
        DEMOLISHED:         'demolished',
        UNDER_CONSTRUCTION: 'under_construction',
        RENOVATING:         'renovating'
    });

    // =========================================================================
    // 12. RENTAL STATUS
    // =========================================================================

    var RENTAL_STATUS = _deepFreeze({
        OWNER_OCCUPIED: 'owner_occupied',
        RENTED:         'rented',
        VACANT:         'vacant'
    });

    // =========================================================================
    // 13. RESIDENCE CONDITIONS
    // =========================================================================
    //
    // Ordered best-to-worst. `modifier` scales the estimated value. Repair
    // cost (in household-rules.js) is derived from the delta between the
    // current condition's modifier and the target condition's modifier.

    var RESIDENCE_CONDITIONS = _deepFreeze([
        { id: 'pristine', name: 'Pristine', modifier: 1.2 },
        { id: 'good',     name: 'Good',     modifier: 1.0 },
        { id: 'fair',     name: 'Fair',     modifier: 0.8 },
        { id: 'poor',     name: 'Poor',     modifier: 0.6 },
        { id: 'ruined',   name: 'Ruined',   modifier: 0.3 }
    ]);

    var CONDITION_MULTIPLIER = _deepFreeze((function() {
        var map = {};
        for (var i = 0; i < RESIDENCE_CONDITIONS.length; i++) {
            map[RESIDENCE_CONDITIONS[i].id] = RESIDENCE_CONDITIONS[i].modifier;
        }
        return map;
    })());

    // =========================================================================
    // 14. THRESHOLDS
    // =========================================================================
    //
    // Numeric thresholds and history caps. These are the numbers the rules
    // and economy modules depend on. Keeping them centralized means a policy
    // change is a one-line edit here, not a hunt across three files.

    var THRESHOLDS = _deepFreeze({
        // Economy
        BANKRUPTCY: -50,
        DEBT_INTEREST_RATE: 0.05,

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
        DEFAULT_UNIT_COUNT_DIVISOR: 3,
        MAX_DEFAULT_UNIT_COUNT: 10,

        // Succession
        HEIR_MIN_AGE: 16,
        HEIR_MAX_AGE: 60
    });

    // =========================================================================
    // 15. LOOKUP HELPERS
    // =========================================================================
    //
    // Simple linear scans. Catalogs are small (≤20 entries). Callers that
    // need O(1) lookups should pre-index; these helpers are for correctness
    // and clarity, not throughput.

    function getEconomicTierById(id) {
        if (!id) return null;
        var keys = Object.keys(ECONOMIC_TIERS);
        for (var i = 0; i < keys.length; i++) {
            if (ECONOMIC_TIERS[keys[i]].id === id) {
                return ECONOMIC_TIERS[keys[i]];
            }
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

    /**
     * Resolves a service type by its canonical lowercase id. Accepts
     * either the uppercase key ('BUTLER') or the lowercase id ('butler').
     * Returns the type object or null.
     */
    function getServiceTypeById(id) {
        if (!id) return null;
        var lowerId = String(id).toLowerCase();
        var keys = Object.keys(SERVICE_TYPES);
        for (var i = 0; i < keys.length; i++) {
            if (SERVICE_TYPES[keys[i]].id === lowerId) {
                return SERVICE_TYPES[keys[i]];
            }
        }
        return null;
    }

    function getServiceQualityById(id) {
        if (!id) return null;
        for (var i = 0; i < SERVICE_QUALITY_ORDER.length; i++) {
            if (SERVICE_QUALITY_ORDER[i].id === id) {
                return SERVICE_QUALITY_ORDER[i];
            }
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

    /**
     * Resolves a residence type by key ('estate') or by id ('estate').
     * They are the same string in the current catalog, but the helper
     * normalizes case to be forgiving.
     */
    function getResidenceTypeById(id) {
        if (!id) return null;
        return RESIDENCE_TYPES[String(id).toLowerCase()] || null;
    }

    function getResidenceConditionById(id) {
        if (!id) return null;
        for (var i = 0; i < RESIDENCE_CONDITIONS.length; i++) {
            if (RESIDENCE_CONDITIONS[i].id === id) {
                return RESIDENCE_CONDITIONS[i];
            }
        }
        return null;
    }

    function getConditionMultiplier(conditionId) {
        if (!conditionId) return null;
        var m = CONDITION_MULTIPLIER[conditionId];
        return typeof m === 'number' ? m : null;
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    var api = _deepFreeze({
        // Economic catalogs
        ECONOMIC_TIERS: ECONOMIC_TIERS,
        ECONOMIC_TIER_ORDER: ECONOMIC_TIER_ORDER,
        INCOME_SOURCES: INCOME_SOURCES,
        EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
        ECONOMIC_EVENTS: ECONOMIC_EVENTS,
        ECONOMIC_EVENT_IDS: ECONOMIC_EVENT_IDS,

        // Service catalogs
        SERVICE_TYPES: SERVICE_TYPES,
        SERVICE_STATUS: SERVICE_STATUS,
        SERVICE_QUALITY: SERVICE_QUALITY,
        SERVICE_QUALITY_ORDER: SERVICE_QUALITY_ORDER,
        SERVICE_CONTRACT_TERMS: SERVICE_CONTRACT_TERMS,

        // Residence catalogs
        RESIDENCE_TYPES: RESIDENCE_TYPES,
        RESIDENCE_STATUS: RESIDENCE_STATUS,
        RENTAL_STATUS: RENTAL_STATUS,
        RESIDENCE_CONDITIONS: RESIDENCE_CONDITIONS,
        CONDITION_MULTIPLIER: CONDITION_MULTIPLIER,

        // Thresholds
        THRESHOLDS: THRESHOLDS,

        // Delta calculation
        getEconomicEventDelta: getEconomicEventDelta,

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
        getConditionMultiplier: getConditionMultiplier,

        // Diagnostics
        version: 2,
        isFrozen: true
    });

    window.HouseholdConstants = api;

    // =========================================================================
    // 17. LEGACY FLAT ALIASES
    // =========================================================================
    //
    // Several pre-refactor call sites read `window.ECONOMIC_TIERS` etc.
    // directly. Those aliases point at the SAME frozen objects as the
    // HouseholdConstants namespace, so consumers cannot accidentally
    // create a divergent copy. New code should call
    // `window.HouseholdConstants.*` directly.
    //
    // This block will be removed once the greps in the plan verify zero
    // remaining consumers of the flat aliases.

    if (typeof window.ECONOMIC_TIERS === 'undefined') {
        window.ECONOMIC_TIERS = ECONOMIC_TIERS;
    }
    if (typeof window.INCOME_SOURCES === 'undefined') {
        window.INCOME_SOURCES = INCOME_SOURCES;
    }
    if (typeof window.EXPENSE_CATEGORIES === 'undefined') {
        window.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
    }
    if (typeof window.ECONOMIC_EVENTS === 'undefined') {
        window.ECONOMIC_EVENTS = ECONOMIC_EVENTS;
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
    if (typeof window.SERVICE_QUALITY_ORDER === 'undefined') {
        window.SERVICE_QUALITY_ORDER = SERVICE_QUALITY_ORDER;
    }
    if (typeof window.SERVICE_CONTRACT_TERMS === 'undefined') {
        window.SERVICE_CONTRACT_TERMS = SERVICE_CONTRACT_TERMS;
    }
    if (typeof window.RESIDENCE_TYPES === 'undefined') {
        window.RESIDENCE_TYPES = RESIDENCE_TYPES;
    }
    if (typeof window.RESIDENCE_STATUS === 'undefined') {
        window.RESIDENCE_STATUS = RESIDENCE_STATUS;
    }
    if (typeof window.RENTAL_STATUS === 'undefined') {
        window.RENTAL_STATUS = RENTAL_STATUS;
    }
    if (typeof window.RESIDENCE_CONDITIONS === 'undefined') {
        window.RESIDENCE_CONDITIONS = RESIDENCE_CONDITIONS;
    }
    if (typeof window.CONDITION_MULTIPLIER === 'undefined') {
        window.CONDITION_MULTIPLIER = CONDITION_MULTIPLIER;
    }

    // CommonJS for tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
