/**
 * =============================================================================
 * STILL WATERS - CRIME CONSTANTS (crime-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-constants.js
 * 
 * This file contains ALL crime, vendetta, and religious law related constants.
 * These are referenced from the main constants.js but can stand alone.
 * 
 * UPDATED: Removed hardcoded punishments and execution reasons.
 *          These are now defined dynamically by civil and religious laws.
 *          Kept CRIME_TYPES and CRIME_SEVERITY as defaults.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CRIME TYPES
    // =========================================================================

    var CRIME_TYPES = {
        // Secular crimes
        MURDER: 'murder',
        EXECUTION: 'execution',
        CRIME_OF_PASSION: 'crime_of_passion',
        ADULTERY: 'adultery',
        TREASON: 'treason',
        THEFT: 'theft',
        ESPIONAGE: 'espionage',
        ASSAULT: 'assault',
        VENDETTA: 'vendetta',
        VIOLENCE: 'violence',
        ROBBERY: 'robbery',
        FRAUD: 'fraud',
        FORGERY: 'forgery',
        SMUGGLING: 'smuggling',
        
        // Religious crimes
        HERESY: 'heresy',
        BLASPHEMY: 'blasphemy',
        APOSTASY: 'apostasy',
        SACRILEGE: 'sacrilege',
        WITCHCRAFT: 'witchcraft',
        IDOLATRY: 'idolatry',
        SCHISM: 'schism',
        EXCOMMUNICATION_VIOLATION: 'excommunication_violation',
        RELIGIOUS_IMPERSONATION: 'religious_impersonation',
        FALSE_PROPHECY: 'false_prophecy',
        DESECRATION: 'desecration'
    };

    // =========================================================================
    // 2. LAW TYPES
    // =========================================================================

    /**
     * Types of laws/guidelines
     * law: Enforced legal code with consequences
     * taboo: Strongly prohibited, usually social/spiritual consequences
     * guideline: Recommended behavior, minimal consequences
     */
    var LAW_TYPES = {
        LAW: 'law',
        TABOO: 'taboo',
        GUIDELINE: 'guideline'
    };

    /**
     * Categories of law (who defines/enforces it)
     * religious: Defined by religious authority
     * civil: Defined by secular government
     * custom: Cultural norms/traditions
     */
    var LAW_CATEGORIES = {
        RELIGIOUS: 'religious',
        CIVIL: 'civil',
        CUSTOM: 'custom'
    };

    /**
     * Domains of law (what area of life it affects)
     */
    var LAW_DOMAINS = {
        MARRIAGE: 'marriage',
        BEHAVIOR: 'behavior',
        WORSHIP: 'worship',
        FOOD: 'food',
        SOCIAL: 'social',
        ECONOMIC: 'economic',
        POLITICAL: 'political',
        SEXUAL: 'sexual',
        VIOLENCE: 'violence',
        DEATH: 'death'
    };

    // =========================================================================
    // 3. LAW SEVERITY
    // =========================================================================

    var LAW_SEVERITY = {
        MINOR: 'minor',
        MAJOR: 'major',
        MORTAL: 'mortal'
    };

    // =========================================================================
    // 4. CRIME SEVERITY (1-10) - DEFAULTS ONLY, OVERRIDDEN BY LAWS
    // =========================================================================

    var CRIME_SEVERITY = {
        // Secular crimes
        'theft': 3,
        'robbery': 5,
        'fraud': 4,
        'forgery': 4,
        'smuggling': 5,
        'assault': 5,
        'adultery': 7,
        'blasphemy': 8,
        'witchcraft': 9,
        'espionage': 9,
        'crime_of_passion': 8,
        'violence': 6,
        'treason': 10,
        'murder': 10,
        'vendetta': 9,
        'execution': 10,
        
        // Religious crimes
        'heresy': 9,
        'apostasy': 8,
        'sacrilege': 8,
        'idolatry': 7,
        'schism': 6,
        'excommunication_violation': 7,
        'religious_impersonation': 6,
        'false_prophecy': 8,
        'desecration': 7
    };

    // =========================================================================
    // 5. REMOVED: CRIME_PUNISHMENTS - Now dynamic from laws
    // 6. REMOVED: CRIME_TO_DOMAIN - Now dynamic from laws
    // 7. REMOVED: EXECUTION_REASONS - Now dynamic from laws
    // 8. REMOVED: EXECUTION_METHODS - Now dynamic from laws (kept in modals)
    // =========================================================================

    // =========================================================================
    // 9. VENDETTA STATUS
    // =========================================================================

    var VENDETTA_STATUS = {
        ACTIVE: 'active',
        ESCALATED: 'escalated',
        RESOLVED: 'resolved'
    };

    // =========================================================================
    // 10. RELIGIOUS PUNISHMENT TYPES
    // =========================================================================

    /**
     * Special punishments specific to religious law
     * These are in addition to secular punishments
     */
    var RELIGIOUS_PUNISHMENTS = {
        EXCOMMUNICATION: 'excommunication',
        ANATHEMA: 'anathema',
        INTERDICT: 'interdict',
        PUBLIC_PENANCE: 'public_penance',
        RECANTATION: 'recantation',
        RECONVERSION: 'reconversion',
        PILGRIMAGE: 'pilgrimage',
        FASTING: 'fasting',
        FLAGELLATION: 'flagellation',
        EXILE_FROM_FAITH: 'exile_from_faith'
    };

    // =========================================================================
    // 11. MURDER REASONS (Categorized - Kept for UI suggestions)
    // =========================================================================

    var MURDER_REASONS = {
        political: [
            'Political rivalry',
            'Treason',
            'Espionage',
            'Succession dispute',
            'Religious conflict',
            'Rebellion',
            'Coup attempt',
            'Court intrigue'
        ],
        personal: [
            'Personal vendetta',
            'Jealousy',
            'Revenge',
            'Crime of passion',
            'Honor killing',
            'Blood feud',
            'Love triangle',
            'Family dispute',
            'Betrayal',
            'Insult or dishonor'
        ],
        criminal: [
            'Robbery gone wrong',
            'Contract killing',
            'Gang violence',
            'Land dispute',
            'Inheritance dispute',
            'Debt collection gone wrong',
            'Banditry',
            'Rivalry between criminals'
        ],
        accidental: [
            'Self-defense gone wrong',
            'Accidental killing',
            'Mistaken identity',
            'Hunting accident',
            'Bar fight gone wrong',
            'Drunken brawl',
            'Negligence'
        ],
        affair: [
            "Crime of passion - lover's quarrel",
            'Spouse discovered affair',
            'Lover murdered by jealous spouse',
            'Affair partner eliminated for secrecy',
            'Blackmail from affair gone wrong',
            'Love triangle murder',
            'Murder to legitimize affair'
        ],
        conflict: [
            'Escalated from argument',
            'Escalated from dispute',
            'Escalated from confrontation',
            'Escalated from physical fight',
            'Feud escalation'
        ],
        religious: [
            'Religious persecution',
            'Heresy accusation',
            'Blasphemy accusation',
            'Witch hunt',
            'Religious zealotry',
            'Holy war',
            'Crusade',
            'Jihad',
            'Inquisition',
            'Sacrilege revenge'
        ],
        other: [
            'Madness or insanity',
            'Fear of exposure',
            'Silencing a witness',
            'Impersonation',
            'Unknown perpetrator',
            'Duel to the death'
        ]
    };

    // =========================================================================
    // 12. EXECUTION METHODS (Kept for UI selection)
    // =========================================================================

    var EXECUTION_METHODS = {
        beheading: { id: 'beheading', name: 'Beheading' },
        hanging: { id: 'hanging', name: 'Hanging' },
        burning: { id: 'burning', name: 'Burning at the Stake' },
        breaking_wheel: { id: 'breaking_wheel', name: 'Breaking Wheel' },
        quartering: { id: 'quartering', name: 'Drawing and Quartering' },
        drowning: { id: 'drowning', name: 'Drowning' },
        stoning: { id: 'stoning', name: 'Stoning' },
        crushing: { id: 'crushing', name: 'Crushing' },
        boiling: { id: 'boiling', name: 'Boiling Alive' },
        impaling: { id: 'impaling', name: 'Impaling' },
        guillotine: { id: 'guillotine', name: 'Guillotine' },
        firing_squad: { id: 'firing_squad', name: 'Firing Squad' },
        exposure: { id: 'exposure', name: 'Exposure' },
        starvation: { id: 'starvation', name: 'Starvation' }
    };

    // =========================================================================
    // 13. HELPER FUNCTIONS
    // =========================================================================

    /**
     * Gets all crime types (secular + religious)
     */
    function getAllCrimeTypes() {
        return Object.values(CRIME_TYPES);
    }

    /**
     * Gets secular crime types only
     */
    function getSecularCrimeTypes() {
        return [
            CRIME_TYPES.MURDER,
            CRIME_TYPES.EXECUTION,
            CRIME_TYPES.CRIME_OF_PASSION,
            CRIME_TYPES.ADULTERY,
            CRIME_TYPES.TREASON,
            CRIME_TYPES.THEFT,
            CRIME_TYPES.ESPIONAGE,
            CRIME_TYPES.ASSAULT,
            CRIME_TYPES.VENDETTA,
            CRIME_TYPES.VIOLENCE,
            CRIME_TYPES.ROBBERY,
            CRIME_TYPES.FRAUD,
            CRIME_TYPES.FORGERY,
            CRIME_TYPES.SMUGGLING
        ];
    }

    /**
     * Gets religious crime types only
     */
    function getReligiousCrimeTypes() {
        return [
            CRIME_TYPES.HERESY,
            CRIME_TYPES.BLASPHEMY,
            CRIME_TYPES.APOSTASY,
            CRIME_TYPES.SACRILEGE,
            CRIME_TYPES.WITCHCRAFT,
            CRIME_TYPES.IDOLATRY,
            CRIME_TYPES.SCHISM,
            CRIME_TYPES.EXCOMMUNICATION_VIOLATION,
            CRIME_TYPES.RELIGIOUS_IMPERSONATION,
            CRIME_TYPES.FALSE_PROPHECY,
            CRIME_TYPES.DESECRATION
        ];
    }

    /**
     * Checks if a crime type is religious
     */
    function isReligiousCrime(crimeType) {
        return getReligiousCrimeTypes().includes(crimeType);
    }

    /**
     * Gets the default severity for a crime type
     * @param {string} crimeType - Crime type
     * @returns {number} Default severity (1-10)
     */
    function getDefaultCrimeSeverity(crimeType) {
        return CRIME_SEVERITY[crimeType] || 5;
    }

    /**
     * Gets the law domain for a crime type
     */
    function getCrimeDomain(crimeType) {
        // This is now dynamic - use LAW_DOMAINS mapping
        var domainMap = {
            'murder': LAW_DOMAINS.VIOLENCE,
            'execution': LAW_DOMAINS.POLITICAL,
            'crime_of_passion': LAW_DOMAINS.VIOLENCE,
            'adultery': LAW_DOMAINS.SEXUAL,
            'treason': LAW_DOMAINS.POLITICAL,
            'theft': LAW_DOMAINS.ECONOMIC,
            'espionage': LAW_DOMAINS.POLITICAL,
            'assault': LAW_DOMAINS.VIOLENCE,
            'vendetta': LAW_DOMAINS.VIOLENCE,
            'violence': LAW_DOMAINS.VIOLENCE,
            'robbery': LAW_DOMAINS.ECONOMIC,
            'fraud': LAW_DOMAINS.ECONOMIC,
            'forgery': LAW_DOMAINS.ECONOMIC,
            'smuggling': LAW_DOMAINS.ECONOMIC,
            'heresy': LAW_DOMAINS.WORSHIP,
            'blasphemy': LAW_DOMAINS.WORSHIP,
            'apostasy': LAW_DOMAINS.WORSHIP,
            'sacrilege': LAW_DOMAINS.WORSHIP,
            'witchcraft': LAW_DOMAINS.WORSHIP,
            'idolatry': LAW_DOMAINS.WORSHIP,
            'schism': LAW_DOMAINS.WORSHIP,
            'excommunication_violation': LAW_DOMAINS.WORSHIP,
            'religious_impersonation': LAW_DOMAINS.WORSHIP,
            'false_prophecy': LAW_DOMAINS.WORSHIP,
            'desecration': LAW_DOMAINS.WORSHIP
        };
        return domainMap[crimeType] || LAW_DOMAINS.BEHAVIOR;
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    // Crime types
    if (typeof window.CRIME_TYPES === 'undefined') {
        window.CRIME_TYPES = CRIME_TYPES;
    }
    
    // Law types
    if (typeof window.LAW_TYPES === 'undefined') {
        window.LAW_TYPES = LAW_TYPES;
    }
    
    // Law categories
    if (typeof window.LAW_CATEGORIES === 'undefined') {
        window.LAW_CATEGORIES = LAW_CATEGORIES;
    }
    
    // Law domains
    if (typeof window.LAW_DOMAINS === 'undefined') {
        window.LAW_DOMAINS = LAW_DOMAINS;
    }
    
    // Law severity
    if (typeof window.LAW_SEVERITY === 'undefined') {
        window.LAW_SEVERITY = LAW_SEVERITY;
    }
    
    // Crime severity (defaults)
    if (typeof window.CRIME_SEVERITY === 'undefined') {
        window.CRIME_SEVERITY = CRIME_SEVERITY;
    }
    
    // Murder reasons (UI suggestions)
    if (typeof window.MURDER_REASONS === 'undefined') {
        window.MURDER_REASONS = MURDER_REASONS;
    }
    
    // Execution methods (UI selection)
    if (typeof window.EXECUTION_METHODS === 'undefined') {
        window.EXECUTION_METHODS = EXECUTION_METHODS;
    }
    
    // Vendetta status
    if (typeof window.VENDETTA_STATUS === 'undefined') {
        window.VENDETTA_STATUS = VENDETTA_STATUS;
    }
    
    // Religious punishments
    if (typeof window.RELIGIOUS_PUNISHMENTS === 'undefined') {
        window.RELIGIOUS_PUNISHMENTS = RELIGIOUS_PUNISHMENTS;
    }

    // Export as CrimeConstants for explicit access
    window.CrimeConstants = {
        CRIME_TYPES: CRIME_TYPES,
        LAW_TYPES: LAW_TYPES,
        LAW_CATEGORIES: LAW_CATEGORIES,
        LAW_DOMAINS: LAW_DOMAINS,
        LAW_SEVERITY: LAW_SEVERITY,
        CRIME_SEVERITY: CRIME_SEVERITY,
        MURDER_REASONS: MURDER_REASONS,
        EXECUTION_METHODS: EXECUTION_METHODS,
        VENDETTA_STATUS: VENDETTA_STATUS,
        RELIGIOUS_PUNISHMENTS: RELIGIOUS_PUNISHMENTS,
        getAllCrimeTypes: getAllCrimeTypes,
        getSecularCrimeTypes: getSecularCrimeTypes,
        getReligiousCrimeTypes: getReligiousCrimeTypes,
        isReligiousCrime: isReligiousCrime,
        getDefaultCrimeSeverity: getDefaultCrimeSeverity,
        getCrimeDomain: getCrimeDomain
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CRIME_TYPES: CRIME_TYPES,
            LAW_TYPES: LAW_TYPES,
            LAW_CATEGORIES: LAW_CATEGORIES,
            LAW_DOMAINS: LAW_DOMAINS,
            LAW_SEVERITY: LAW_SEVERITY,
            CRIME_SEVERITY: CRIME_SEVERITY,
            MURDER_REASONS: MURDER_REASONS,
            EXECUTION_METHODS: EXECUTION_METHODS,
            VENDETTA_STATUS: VENDETTA_STATUS,
            RELIGIOUS_PUNISHMENTS: RELIGIOUS_PUNISHMENTS,
            CrimeConstants: {
                CRIME_TYPES: CRIME_TYPES,
                LAW_TYPES: LAW_TYPES,
                LAW_CATEGORIES: LAW_CATEGORIES,
                LAW_DOMAINS: LAW_DOMAINS,
                LAW_SEVERITY: LAW_SEVERITY,
                CRIME_SEVERITY: CRIME_SEVERITY,
                MURDER_REASONS: MURDER_REASONS,
                EXECUTION_METHODS: EXECUTION_METHODS,
                VENDETTA_STATUS: VENDETTA_STATUS,
                RELIGIOUS_PUNISHMENTS: RELIGIOUS_PUNISHMENTS,
                getAllCrimeTypes: getAllCrimeTypes,
                getSecularCrimeTypes: getSecularCrimeTypes,
                getReligiousCrimeTypes: getReligiousCrimeTypes,
                isReligiousCrime: isReligiousCrime,
                getDefaultCrimeSeverity: getDefaultCrimeSeverity,
                getCrimeDomain: getCrimeDomain
            }
        };
    }

})();