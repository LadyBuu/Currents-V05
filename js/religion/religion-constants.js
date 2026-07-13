/**
 * =============================================================================
 * STILL WATERS - RELIGION CONSTANTS (religion-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-constants.js
 * 
 * This file contains ALL religion-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
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

    // =========================================================================
    // 2. INHERITANCE RULES (mirrors surname rules pattern)
    // =========================================================================

    var INHERITANCE_RULES = {
        MOTHER: 'mother',
        FATHER: 'father',
        BOTH: 'both',
        DOMINANT: 'dominant',
        NONE: 'none'
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

    // =========================================================================
    // 4. WORSHIP TYPE DISPLAY NAMES
    // =========================================================================

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
    // 5. DEFAULT RELIGION TEMPLATE
    // =========================================================================

    var DEFAULT_RELIGION = {
        id: null,
        name: '',
        displayName: '',
        icon: '✦',
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
        symbol: '✦',
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
    // 8. CONVERSION REASONS
    // =========================================================================

    var CONVERSION_REASONS = {
        MARRIAGE: 'marriage',
        PERSONAL: 'personal',
        FORCED: 'forced',
        POLITICAL: 'political',
        FAMILY: 'family',
        OTHER: 'other'
    };

    // =========================================================================
    // 9. HELPER FUNCTIONS
    // =========================================================================

    function getReligiousTraitName(traitId) {
        var names = {
            'monotheistic': 'Monotheistic',
            'polytheistic': 'Polytheistic',
            'syncretic': 'Syncretic',
            'evangelical': 'Evangelical',
            'animist': 'Animist'
        };
        return names[traitId] || traitId;
    }

    function getWorshipTypeName(typeId) {
        return WORSHIP_TYPE_NAMES[typeId] || typeId;
    }

    function getInheritanceRuleName(ruleType) {
        var names = {
            'mother': 'Mother\'s Religion',
            'father': 'Father\'s Religion',
            'both': 'Both Parents (if same)',
            'dominant': 'Location\'s Dominant Religion',
            'none': 'No Inheritance'
        };
        return names[ruleType] || ruleType;
    }

    function getConversionReasonName(reason) {
        var names = {
            'marriage': 'Marriage',
            'personal': 'Personal Choice',
            'forced': 'Forced Conversion',
            'political': 'Political Reasons',
            'family': 'Family Pressure',
            'other': 'Other'
        };
        return names[reason] || reason;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

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

    if (typeof window.DEFAULT_RELIGION === 'undefined') {
        window.DEFAULT_RELIGION = DEFAULT_RELIGION;
    }

    if (typeof window.DEFAULT_GOD === 'undefined') {
        window.DEFAULT_GOD = DEFAULT_GOD;
    }

    if (typeof window.DEFAULT_PLACE_OF_WORSHIP === 'undefined') {
        window.DEFAULT_PLACE_OF_WORSHIP = DEFAULT_PLACE_OF_WORSHIP;
    }

    if (typeof window.CONVERSION_REASONS === 'undefined') {
        window.CONVERSION_REASONS = CONVERSION_REASONS;
    }

    window.getReligiousTraitName = getReligiousTraitName;
    window.getWorshipTypeName = getWorshipTypeName;
    window.getInheritanceRuleName = getInheritanceRuleName;
    window.getConversionReasonName = getConversionReasonName;

    window.ReligionConstants = {
        RELIGIOUS_TRAITS: RELIGIOUS_TRAITS,
        INHERITANCE_RULES: INHERITANCE_RULES,
        WORSHIP_TYPES: WORSHIP_TYPES,
        WORSHIP_TYPE_NAMES: WORSHIP_TYPE_NAMES,
        DEFAULT_RELIGION: DEFAULT_RELIGION,
        DEFAULT_GOD: DEFAULT_GOD,
        DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP,
        CONVERSION_REASONS: CONVERSION_REASONS,
        getReligiousTraitName: getReligiousTraitName,
        getWorshipTypeName: getWorshipTypeName,
        getInheritanceRuleName: getInheritanceRuleName,
        getConversionReasonName: getConversionReasonName
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            RELIGIOUS_TRAITS: RELIGIOUS_TRAITS,
            INHERITANCE_RULES: INHERITANCE_RULES,
            WORSHIP_TYPES: WORSHIP_TYPES,
            WORSHIP_TYPE_NAMES: WORSHIP_TYPE_NAMES,
            DEFAULT_RELIGION: DEFAULT_RELIGION,
            DEFAULT_GOD: DEFAULT_GOD,
            DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP,
            CONVERSION_REASONS: CONVERSION_REASONS,
            getReligiousTraitName: getReligiousTraitName,
            getWorshipTypeName: getWorshipTypeName,
            getInheritanceRuleName: getInheritanceRuleName,
            getConversionReasonName: getConversionReasonName,
            ReligionConstants: {
                RELIGIOUS_TRAITS: RELIGIOUS_TRAITS,
                INHERITANCE_RULES: INHERITANCE_RULES,
                WORSHIP_TYPES: WORSHIP_TYPES,
                WORSHIP_TYPE_NAMES: WORSHIP_TYPE_NAMES,
                DEFAULT_RELIGION: DEFAULT_RELIGION,
                DEFAULT_GOD: DEFAULT_GOD,
                DEFAULT_PLACE_OF_WORSHIP: DEFAULT_PLACE_OF_WORSHIP,
                CONVERSION_REASONS: CONVERSION_REASONS,
                getReligiousTraitName: getReligiousTraitName,
                getWorshipTypeName: getWorshipTypeName,
                getInheritanceRuleName: getInheritanceRuleName,
                getConversionReasonName: getConversionReasonName
            }
        };
    }

})();