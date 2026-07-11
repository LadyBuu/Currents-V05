/**
 * =============================================================================
 * STILL WATERS - CRIME CONSTANTS (crime-constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-constants.js
 * 
 * This file contains ALL crime and vendetta related constants.
 * These are referenced from the main constants.js but can stand alone.
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
        MURDER: 'murder',
        EXECUTION: 'execution',
        CRIME_OF_PASSION: 'crime_of_passion',
        ADULTERY: 'adultery',
        TREASON: 'treason',
        THEFT: 'theft',
        ESPIONAGE: 'espionage',
        BLASPHEMY: 'blasphemy',
        WITCHCRAFT: 'witchcraft',
        ASSAULT: 'assault',
        VENDETTA: 'vendetta',
        VIOLENCE: 'violence',
        ROBBERY: 'robbery',
        FRAUD: 'fraud',
        FORGERY: 'forgery',
        SMUGGLING: 'smuggling'
    };

    // =========================================================================
    // 2. CRIME SEVERITY (1-10)
    // =========================================================================

    var CRIME_SEVERITY = {
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
        'execution': 10
    };

    // =========================================================================
    // 3. CRIME PUNISHMENTS
    // =========================================================================

    var CRIME_PUNISHMENTS = {
        'theft': ['Fine', 'Branding', 'Maiming', 'Execution'],
        'robbery': ['Fine', 'Maiming', 'Exile', 'Execution'],
        'fraud': ['Fine', 'Branding', 'Exile'],
        'forgery': ['Fine', 'Maiming', 'Execution'],
        'smuggling': ['Fine', 'Exile', 'Execution'],
        'assault': ['Fine', 'Maiming', 'Exile', 'Execution'],
        'adultery': ['Fine', 'Public Shaming', 'Exile', 'Execution'],
        'blasphemy': ['Fine', 'Public Shaming', 'Exile', 'Execution'],
        'witchcraft': ['Exile', 'Execution', 'Imprisonment'],
        'espionage': ['Execution', 'Imprisonment', 'Exile'],
        'crime_of_passion': ['Exile', 'Execution', 'Life Service'],
        'violence': ['Fine', 'Maiming', 'Exile'],
        'treason': ['Execution', 'Life Imprisonment', 'Exile'],
        'murder': ['Execution', 'Exile', 'Blood Price', 'Life Imprisonment'],
        'vendetta': ['Execution', 'Exile', 'Blood Feud']
    };

    // =========================================================================
    // 4. MURDER REASONS (Categorized)
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
            'Crime of passion - lover\'s quarrel',
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
    // 5. EXECUTION REASONS (Categorized)
    // =========================================================================

    var EXECUTION_REASONS = {
        treason: [
            'Treason against the Crown',
            'Regicide',
            'Rebellion or Insurrection',
            'Revolutionary activity',
            'Coup attempt',
            'Conspiracy against the state'
        ],
        murder: [
            'Murder of a noble',
            'Murder of a clergy member',
            'Murder of a child',
            'Multiple murders',
            'Particularly brutal murder',
            'Premeditated murder',
            'Political assassination'
        ],
        adultery: [
            'Adultery with a noble\'s spouse',
            'Adultery with clergy',
            'Repeated adultery',
            'Adultery resulting in bastard child',
            'Adultery during mourning period'
        ],
        crime: [
            'Highway robbery',
            'Counterfeiting currency',
            'Arson',
            'Espionage or spying',
            'Piracy',
            'Smuggling',
            'Large-scale theft'
        ],
        military: [
            'Desertion from military',
            'Cowardice in battle',
            'Insubordination',
            'Abandoning post in battle',
            'Treasonous collaboration'
        ],
        religious: [
            'Blasphemy',
            'Sacrilege',
            'Witchcraft or sorcery',
            'Heresy',
            'Violation of sacred grounds',
            'Breaking a blood oath'
        ],
        social: [
            'Violation of sacred taboos',
            'Disrespecting a ruler or chief',
            'Incest',
            'Breaking social customs',
            'Dueling (illegal)'
        ],
        common: [
            'Murder',
            'Treason',
            'Rebellion',
            'Adultery',
            'Witchcraft',
            'Cowardice in battle',
            'Desertion',
            'Espionage',
            'Blasphemy'
        ]
    };

    // =========================================================================
    // 6. EXECUTION METHODS
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
    // 7. VENDETTA STATUS
    // =========================================================================

    var VENDETTA_STATUS = {
        ACTIVE: 'active',
        ESCALATED: 'escalated',
        RESOLVED: 'resolved'
    };

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    // Only set if not already defined (prevent conflicts with constants.js)
    if (typeof window.CRIME_TYPES === 'undefined') {
        window.CRIME_TYPES = CRIME_TYPES;
    }
    if (typeof window.CRIME_SEVERITY === 'undefined') {
        window.CRIME_SEVERITY = CRIME_SEVERITY;
    }
    if (typeof window.CRIME_PUNISHMENTS === 'undefined') {
        window.CRIME_PUNISHMENTS = CRIME_PUNISHMENTS;
    }
    if (typeof window.MURDER_REASONS === 'undefined') {
        window.MURDER_REASONS = MURDER_REASONS;
    }
    if (typeof window.EXECUTION_REASONS === 'undefined') {
        window.EXECUTION_REASONS = EXECUTION_REASONS;
    }
    if (typeof window.EXECUTION_METHODS === 'undefined') {
        window.EXECUTION_METHODS = EXECUTION_METHODS;
    }
    if (typeof window.VENDETTA_STATUS === 'undefined') {
        window.VENDETTA_STATUS = VENDETTA_STATUS;
    }

    // Also export as CrimeConstants for explicit access
    window.CrimeConstants = {
        CRIME_TYPES: CRIME_TYPES,
        CRIME_SEVERITY: CRIME_SEVERITY,
        CRIME_PUNISHMENTS: CRIME_PUNISHMENTS,
        MURDER_REASONS: MURDER_REASONS,
        EXECUTION_REASONS: EXECUTION_REASONS,
        EXECUTION_METHODS: EXECUTION_METHODS,
        VENDETTA_STATUS: VENDETTA_STATUS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CRIME_TYPES: CRIME_TYPES,
            CRIME_SEVERITY: CRIME_SEVERITY,
            CRIME_PUNISHMENTS: CRIME_PUNISHMENTS,
            MURDER_REASONS: MURDER_REASONS,
            EXECUTION_REASONS: EXECUTION_REASONS,
            EXECUTION_METHODS: EXECUTION_METHODS,
            VENDETTA_STATUS: VENDETTA_STATUS,
            CrimeConstants: {
                CRIME_TYPES: CRIME_TYPES,
                CRIME_SEVERITY: CRIME_SEVERITY,
                CRIME_PUNISHMENTS: CRIME_PUNISHMENTS,
                MURDER_REASONS: MURDER_REASONS,
                EXECUTION_REASONS: EXECUTION_REASONS,
                EXECUTION_METHODS: EXECUTION_METHODS,
                VENDETTA_STATUS: VENDETTA_STATUS
            }
        };
    }

})();