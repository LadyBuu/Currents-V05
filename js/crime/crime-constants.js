/**
 * =============================================================================
 * STILL WATERS - CRIME CONSTANTS (crime-constants.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-constants.js
 *
 * PURPOSE:
 *   Vocabulary and defaults for the Crime domain. This module is pure data
 *   plus small, side-effect-free helpers over that data. It does not read
 *   state, does not depend on other domain modules, and does not decide
 *   legal consequences.
 *
 * OWNERSHIP:
 *   - CRIME_TYPES, CRIME_SEVERITY (defaults), VENDETTA_STATUS
 *   - MURDER_REASONS (UI/input vocabulary, not legal truth)
 *   - EXECUTION_METHODS (UI/system selection vocabulary; legal eligibility
 *     and permitted methods are determined by the law layer)
 *   - RELIGIOUS_PUNISHMENTS (vocabulary; actual punishments come from laws)
 *   - SEVERITY_BANDS and classifySeverity (severity band thresholds)
 *   - CONSEQUENCE_TYPES (the vocabulary emitted by the law layer and
 *     executed by the command layer)
 *   - CODES (error codes for structured command results)
 *   - EVENTS, STATE_EVENTS (subscription and cross-domain event names)
 *   - Default analysis windows and history caps
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not map crimes to law domains. That is owned by the law layer.
 *   - It does not define punishments. Those come from laws.
 *   - It does not invent fallbacks for unknown crime types. Unknown is
 *     unknown; callers must handle it explicitly.
 *
 * DEPENDENCIES: None.
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

    // Canonical categorization of crime types.
    // SECULAR_CRIME_TYPES and RELIGIOUS_CRIME_TYPES are the single source.
    // Any new crime type must be added to exactly one of these arrays.
    // The helper functions below derive from these, so nothing else needs
    // to be updated when a crime type is added.

    var SECULAR_CRIME_TYPES = [
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

    var RELIGIOUS_CRIME_TYPES = [
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

    // =========================================================================
    // 2. LAW VOCABULARY (classification only; consequences come from laws)
    // =========================================================================

    var LAW_TYPES = {
        LAW: 'law',
        TABOO: 'taboo',
        GUIDELINE: 'guideline'
    };

    var LAW_CATEGORIES = {
        RELIGIOUS: 'religious',
        CIVIL: 'civil',
        CUSTOM: 'custom'
    };

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

    var LAW_SEVERITY = {
        MINOR: 'minor',
        MAJOR: 'major',
        MORTAL: 'mortal'
    };

    // =========================================================================
    // 3. CRIME SEVERITY (defaults, overridden by laws)
    // =========================================================================

    // Defaults only. Laws may override per crime type via crimeMapping.
    // A crime type absent from this map has no default severity. Callers
    // must treat that as "unknown" rather than silently substituting a value.

    var CRIME_SEVERITY = {
        // Secular
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

        // Religious
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
    // 4. SEVERITY BANDS (single source of truth)
    // =========================================================================

    // Severity is numeric (1-10). Bands are the single source for
    // classification. No other module re-derives the thresholds.

    var SEVERITY_BANDS = {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
    };

    /**
     * Classifies a numeric severity (1-10) into a band.
     * Returns null for non-numeric input. This is the ONLY place the
     * thresholds live.
     *
     * @param {number} severity
     * @returns {string|null}
     */
    function classifySeverity(severity) {
        if (typeof severity !== 'number' || isNaN(severity)) return null;
        if (severity <= 3) return SEVERITY_BANDS.LOW;
        if (severity <= 6) return SEVERITY_BANDS.MEDIUM;
        if (severity <= 8) return SEVERITY_BANDS.HIGH;
        return SEVERITY_BANDS.CRITICAL;
    }

    // =========================================================================
    // 5. CONSEQUENCE TYPES
    // =========================================================================

    // The vocabulary the law layer emits and the command layer executes.
    // Adding a new type requires updating _classifyConsequenceString and
    // _executeConsequence together in the modules that produce and consume
    // these values. Unknown types remain 'other' and are surfaced without
    // being executed.

    var CONSEQUENCE_TYPES = {
        EXECUTION: 'execution',
        IMPRISONMENT: 'imprisonment',
        EXILE: 'exile',
        FINE: 'fine',
        PENANCE: 'penance',
        EXCOMMUNICATION: 'excommunication',
        OTHER: 'other'
    };

    // =========================================================================
    // 6. VENDETTA STATUS
    // =========================================================================

    var VENDETTA_STATUS = {
        ACTIVE: 'active',
        ESCALATED: 'escalated',
        RESOLVED: 'resolved'
    };

    // Escalation threshold. Single source of truth for "3 deaths escalates".
    var VENDETTA_ESCALATION_THRESHOLD = 3;

    // =========================================================================
    // 7. RELIGIOUS PUNISHMENT VOCABULARY
    // =========================================================================

    // These are labels for consequences that laws may prescribe.
    // They are not consequences in themselves; a law must reference them.

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
    // 8. MURDER REASONS (UI/input vocabulary)
    // =========================================================================

    // These are suggestions for UI and manual data entry. They are not the
    // legal cause of death and do not determine consequences. A murder may
    // be recorded with any free-text reason.

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
    // 9. EXECUTION METHODS (UI/system selection vocabulary)
    // =========================================================================

    // Legal eligibility and permitted methods are determined by the law
    // layer. This catalog only enumerates the methods that may be selected
    // once a law has prescribed execution.

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
    // 10. ERROR CODES
    // =========================================================================

    // Used as the `code` field of failed Command results. Stable strings.
    // Additive only; codes are never removed once they have appeared in a
    // shipped result. Callers may switch on these values.

    var CODES = {
        VALIDATION: 'VALIDATION',
        NOT_FOUND: 'NOT_FOUND',
        ALREADY_DECEASED: 'ALREADY_DECEASED',
        ALREADY_SOLVED: 'ALREADY_SOLVED',
        ALREADY_RESOLVED: 'ALREADY_RESOLVED',
        SAME_CHARACTER: 'SAME_CHARACTER',
        SAME_HOUSEHOLD: 'SAME_HOUSEHOLD',
        NO_HOUSEHOLD: 'NO_HOUSEHOLD',
        DUPLICATE_VENDETTA: 'DUPLICATE_VENDETTA',
        ESCALATION_FAILED: 'ESCALATION_FAILED',
        PROFESSION_FAILED: 'PROFESSION_FAILED',
        KILL_FAILED: 'KILL_FAILED',
        PERSIST_FAILED: 'PERSIST_FAILED',
        STATE_MUTATING: 'STATE_MUTATING',
        MISSING_DEPENDENCY: 'MISSING_DEPENDENCY'
    };

    // =========================================================================
    // 11. EVENT NAMES
    // =========================================================================

    // Cross-domain events, fired as CustomEvents in the command commit tail.
    // Consumers subscribe to these instead of polling.

    var EVENTS = {
        CRIME_RECORDED:     'crimeRecorded',
        CRIME_SOLVED:       'crimeSolved',
        CRIME_DELETED:      'crimeDeleted',
        VENDETTA_CREATED:   'vendettaCreated',
        VENDETTA_DEATH:     'vendettaDeath',
        VENDETTA_ESCALATED: 'vendettaEscalated',
        VENDETTA_RESOLVED:  'vendettaResolved',
        VENDETTA_DELETED:   'vendettaDeleted'
    };

    // In-process State subscription event names (State.publish).

    var STATE_EVENTS = {
        HYDRATED:       'hydrated',
        CACHE_RELOADED: 'cacheReloaded'
    };

    // =========================================================================
    // 12. DEFAULTS
    // =========================================================================

    // Analysis windows and history caps that were previously inline in
    // crime-queries.js and crime-state.js. Moving them here means no other
    // module re-derives the default.

    var DEFAULT_STATS_WINDOW_YEARS = 5;
    var DEFAULT_TREND_YEARS = 10;
    var DEFAULT_CLEARANCE_WINDOW = 10;
    var DEFAULT_VENDETTA_MAX_HISTORY = 100;

    // =========================================================================
    // 13. HELPER FUNCTIONS (pure, no state, no fallbacks)
    // =========================================================================

    function getAllCrimeTypes() {
        return Object.values(CRIME_TYPES);
    }

    function getSecularCrimeTypes() {
        return SECULAR_CRIME_TYPES.slice();
    }

    function getReligiousCrimeTypes() {
        return RELIGIOUS_CRIME_TYPES.slice();
    }

    function isReligiousCrime(crimeType) {
        return RELIGIOUS_CRIME_TYPES.indexOf(crimeType) !== -1;
    }

    function isSecularCrime(crimeType) {
        return SECULAR_CRIME_TYPES.indexOf(crimeType) !== -1;
    }

    function isKnownCrimeType(crimeType) {
        return Object.prototype.hasOwnProperty.call(CRIME_TYPES, crimeType) ||
               getAllCrimeTypes().indexOf(crimeType) !== -1;
    }

    /**
     * Returns the default severity for a crime type, or undefined if the
     * crime type has no configured default. Unknown crime types are NOT
     * silently assigned a severity.
     *
     * @param {string} crimeType
     * @returns {number|undefined}
     */
    function getDefaultCrimeSeverity(crimeType) {
        return Object.prototype.hasOwnProperty.call(CRIME_SEVERITY, crimeType)
            ? CRIME_SEVERITY[crimeType]
            : undefined;
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    // Canonical API. New code should use CrimeConstants.* exclusively.
    window.CrimeConstants = {
        // Vocabulary
        CRIME_TYPES: CRIME_TYPES,
        LAW_TYPES: LAW_TYPES,
        LAW_CATEGORIES: LAW_CATEGORIES,
        LAW_DOMAINS: LAW_DOMAINS,
        LAW_SEVERITY: LAW_SEVERITY,
        CRIME_SEVERITY: CRIME_SEVERITY,
        SEVERITY_BANDS: SEVERITY_BANDS,
        CONSEQUENCE_TYPES: CONSEQUENCE_TYPES,
        VENDETTA_STATUS: VENDETTA_STATUS,
        VENDETTA_ESCALATION_THRESHOLD: VENDETTA_ESCALATION_THRESHOLD,
        RELIGIOUS_PUNISHMENTS: RELIGIOUS_PUNISHMENTS,
        MURDER_REASONS: MURDER_REASONS,
        EXECUTION_METHODS: EXECUTION_METHODS,

        // Error codes
        CODES: CODES,

        // Event names
        EVENTS: EVENTS,
        STATE_EVENTS: STATE_EVENTS,

        // Defaults
        DEFAULT_STATS_WINDOW_YEARS: DEFAULT_STATS_WINDOW_YEARS,
        DEFAULT_TREND_YEARS: DEFAULT_TREND_YEARS,
        DEFAULT_CLEARANCE_WINDOW: DEFAULT_CLEARANCE_WINDOW,
        DEFAULT_VENDETTA_MAX_HISTORY: DEFAULT_VENDETTA_MAX_HISTORY,

        // Helpers
        getAllCrimeTypes: getAllCrimeTypes,
        getSecularCrimeTypes: getSecularCrimeTypes,
        getReligiousCrimeTypes: getReligiousCrimeTypes,
        isReligiousCrime: isReligiousCrime,
        isSecularCrime: isSecularCrime,
        isKnownCrimeType: isKnownCrimeType,
        getDefaultCrimeSeverity: getDefaultCrimeSeverity,
        classifySeverity: classifySeverity
    };

    // Legacy global aliases. Retained during migration so that older modules
    // (and any UI still reading window.CRIME_TYPES) continue to work.
    // New code should not read these directly. Removed once every consumer
    // has migrated to CrimeConstants.*.
    window.CRIME_TYPES = CRIME_TYPES;
    window.LAW_TYPES = LAW_TYPES;
    window.LAW_CATEGORIES = LAW_CATEGORIES;
    window.LAW_DOMAINS = LAW_DOMAINS;
    window.LAW_SEVERITY = LAW_SEVERITY;
    window.CRIME_SEVERITY = CRIME_SEVERITY;
    window.VENDETTA_STATUS = VENDETTA_STATUS;
    window.RELIGIOUS_PUNISHMENTS = RELIGIOUS_PUNISHMENTS;
    window.MURDER_REASONS = MURDER_REASONS;
    window.EXECUTION_METHODS = EXECUTION_METHODS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeConstants;
    }

})();
