/**
 * =============================================================================
 * STILL WATERS - RELIGION CONSTANTS (religion-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-constants.js
 * 
 * Central registry of ALL religion-related vocabulary and default templates.
 * Pure constants - no dependencies. Does not provide display names; those live
 * in religion-format.js.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - Added *_NAMES maps. Removed display-name helper functions.
 *   - Removed icon/symbol defaults from templates.
 * 
 * PHASE 6 CLEANUP (2026):
 *   - Deleted legacy global aliases (window.RELIGIOUS_TRAITS,
 *     window.INHERITANCE_RULES, window.WORSHIP_TYPES, window.CONVERSION_REASONS,
 *     window.DEFAULT_RELIGION, window.DEFAULT_GOD,
 *     window.DEFAULT_PLACE_OF_WORSHIP).
 *   - Canonical access is now ReligionConstants.* only.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RELIGIOUS TRAITS
    // =========================================================================

    var RELIGIOUS_TRAITS = {
        MONOTHEISTIC: 'monotheistic',
        POLYTHEISTIC: 'polytheistic',
        SYNCRETIC: 'syncretic',
        EVANGELICAL: 'evangelical',
        ANIMIST: 'animist'
    };

    var RELIGIOUS_TRAIT_NAMES = {
        'monotheistic': 'Monotheistic',
        'polytheistic': 'Polytheistic',
        'syncretic': 'Syncretic',
        'evangelical': 'Evangelical',
        'animist': 'Animist'
    };

    // =========================================================================
    // 2. INHERITANCE RULES
    // =========================================================================

    var INHERITANCE_RULES = {
        MOTHER: 'mother',
        FATHER: 'father',
        BOTH: 'both',
        DOMINANT: 'dominant',
        NONE: 'none'
    };

    var INHERITANCE_RULE_NAMES = {
        'mother': 'Mother\'s Religion',
        'father': 'Father\'s Religion',
        'both': 'Both Parents (if same)',
        'dominant': 'Location\'s Dominant Religion',
        'none': 'No Inheritance'
    };

    // =========================================================================
    // 3. WORSHIP TYPES
    // =========================================================================

    var WORSHIP_TYPES = {
        TEMPLE: 'temple',
        CHURCH: 'church',
        SHRINE: 'shrine',
        MOSQUE: 'mosque',
        SYNAGOGUE: 'synagogue',
        MONASTERY: 'monastery',
        GROVE: 'grove'
    };

    var WORSHIP_TYPE_NAMES = {
        'temple': 'Temple',
        'church': 'Church',
        'shrine': 'Shrine',
        'mosque': 'Mosque',
        'synagogue': 'Synagogue',
        'monastery': 'Monastery',
        'grove': 'Sacred Grove'
    };

    // =========================================================================
    // 4. CONVERSION REASONS
    // =========================================================================

    var CONVERSION_REASONS = {
        MARRIAGE: 'marriage',
        PERSONAL: 'personal',
        FORCED: 'forced',
        POLITICAL: 'political',
        FAMILY: 'family',
        OTHER: 'other'
    };

    var CONVERSION_REASON_NAMES = {
        'marriage': 'Marriage',
        'personal': 'Personal Choice',
        'forced': 'Forced Conversion',
        'political': 'Political Reasons',
        'family': 'Family Pressure',
        'other': 'Other'
    };

    // =========================================================================
    // 5. DEFAULT RELIGION TEMPLATE
    // =========================================================================

    var DEFAULT_RELIGION = {
        id: null,
        name: '',
        displayName: '',
        icon: '',
        description: '',
        trait: RELIGIOUS_TRAITS.POLYTHEISTIC,
        isOrganized: false,
        allowsConversion: true,
        proselytizes: false,
        inheritanceRule: {
            type: INHERITANCE_RULES.MOTHER,
            priority: INHERITANCE_RULES.MOTHER,
            notes: ''
        },
        gods: [],
        laws: [],
        leader: null,
        leaderHistory: [],
        locations: [],
        schools: [],
        placesOfWorship: [],
        isDeprecated: false,
        deprecatedYear: null,
        createdAt: null,
        updatedAt: null,
        notes: ''
    };

    // =========================================================================
    // 6. DEFAULT GOD TEMPLATE
    // =========================================================================

    var DEFAULT_GOD = {
        id: null,
        name: '',
        displayName: '',
        domain: 'war',
        symbol: '',
        description: '',
        gender: 'neuter',
        alignment: 'neutral',
        parentGodId: null,
        createdAt: null
    };

    // =========================================================================
    // 7. DEFAULT PLACE OF WORSHIP TEMPLATE
    // =========================================================================

    var DEFAULT_PLACE_OF_WORSHIP = {
        id: null,
        name: '',
        religionId: null,
        religionName: '',
        locationId: null,
        locationName: '',
        ownerType: 'state',
        ownerId: null,
        ownerName: '',
        type: WORSHIP_TYPES.TEMPLE,
        isActive: true,
        foundedYear: null,
        headClergyId: null,
        clergy: [],
        producesIncome: true,
        baseTithe: 1,
        currentFollowers: 0,
        annualIncome: 0,
        wealth: 0,
        collectedThisYear: 0,
        features: [],
        history: [],
        notes: '',
        createdAt: null,
        updatedAt: null
    };

    // =========================================================================
    // 8. CANONICAL NAMESPACE
    // =========================================================================

    var ReligionConstants = {
        RELIGIOUS_TRAITS: RELIGIOUS_TRAITS,
        RELIGIOUS_TRAIT_NAMES: RELIGIOUS_TRAIT_NAMES,

        INHERITANCE_RULES: INHERITANCE_RULES,
        INHERITANCE_RULE_NAMES: INHERITANCE_RULE_NAMES,

        WORSHIP_TYPES: WORSHIP_TYPES,
        WORSHIP_TYPE_NAMES: WORSHIP_TYPE_NAMES,

        CONVERSION_REASONS: CONVERSION_REASONS,
        CONVERSION_REASON_NAMES: CONVERSION_REASON_NAMES,

        DEFAULT_RELIGION: DEFAULT_RELIGION,
        DEFAULT_GOD: DEFAULT_GOD,
        DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP
    };

    window.ReligionConstants = ReligionConstants;

    // =========================================================================
    // 9. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionConstants: ReligionConstants
        };
    }

})();
