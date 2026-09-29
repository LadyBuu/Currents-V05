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
 *   - Removed getReligiousTraitName / getWorshipTypeName / getInheritanceRuleName
 *     / getConversionReasonName. Display names now live in religion-format.js.
 *   - Added *_NAMES maps (RELIGIOUS_TRAIT_NAMES, INHERITANCE_RULE_NAMES,
 *     WORSHIP_TYPE_NAMES, CONVERSION_REASON_NAMES) so the display-name source
 *     is data, not a function, and can be consumed directly by format modules
 *     or UI without a wrapper call.
 *   - Removed icon default ('✦') from DEFAULT_RELIGION.
 *   - Removed symbol default ('✦') from DEFAULT_GOD.
 *     Per ADR Decision 4: icons and symbols are user-authored world data, not
 *     presentation defaults.
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
    // 3. WORSHIP TYPES (for places of worship)
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
        // No default icon. Icons are user-authored world data (ADR Decision 4).
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
        // No default symbol. Symbols are user-authored world data (ADR Decision 4).
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
        // Vocabulary
        RELIGIOUS_TRAITS: RELIGIOUS_TRAITS,
        RELIGIOUS_TRAIT_NAMES: RELIGIOUS_TRAIT_NAMES,

        INHERITANCE_RULES: INHERITANCE_RULES,
        INHERITANCE_RULE_NAMES: INHERITANCE_RULE_NAMES,

        WORSHIP_TYPES: WORSHIP_TYPES,
        WORSHIP_TYPE_NAMES: WORSHIP_TYPE_NAMES,

        CONVERSION_REASONS: CONVERSION_REASONS,
        CONVERSION_REASON_NAMES: CONVERSION_REASON_NAMES,

        // Templates
        DEFAULT_RELIGION: DEFAULT_RELIGION,
        DEFAULT_GOD: DEFAULT_GOD,
        DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP
    };

    window.ReligionConstants = ReligionConstants;

    // =========================================================================
    // 9. LEGACY GLOBAL ALIASES
    // =========================================================================
    // Kept for compatibility during the refactor. Removed in Phase 6.

    if (typeof window.RELIGIOUS_TRAITS === 'undefined') {
        window.RELIGIOUS_TRAITS = RELIGIOUS_TRAITS;
    }
    if (typeof window.INHERITANCE_RULES === 'undefined') {
        window.INHERITANCE_RULES = INHERITANCE_RULES;
    }
    if (typeof window.WORSHIP_TYPES === 'undefined') {
        window.WORSHIP_TYPES = WORSHIP_TYPES;
    }
    if (typeof window.WORSHIP_TYPE_NAMES === 'undefined') {
        window.WORSHIP_TYPE_NAMES = WORSHIP_TYPE_NAMES;
    }
    if (typeof window.CONVERSION_REASONS === 'undefined') {
        window.CONVERSION_REASONS = CONVERSION_REASONS;
    }
    if (typeof window.DEFAULT_RELIGION === 'undefined') {
        window.DEFAULT_RELIGION = DEFAULT_RELIGION;
    }
    if (typeof window.DEFAULT_GOD === 'undefined') {
        window.DEFAULT_GOD = DEFAULT_GOD;
    }
    if (typeof window.DEFAULT_PLACE_OF_WORSHIP === 'undefined') {
        window.DEFAULT_PLACE_OF_WORSHIP = DEFAULT_PLACE_OF_WORSHIP;
    }

    // NOTE: window.getReligiousTraitName, window.getWorshipTypeName,
    // window.getInheritanceRuleName, window.getConversionReasonName are NOT
    // redefined here. They now live in religion-format.js (Phase 2 file 2).

    // =========================================================================
    // 10. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
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
            DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP,
            ReligionConstants: ReligionConstants
        };
    }

})();
