/**
 * government-constants.js
 * Vocabulary, thresholds, and enumerations for the Government domain.
 * Frozen exports. No logic. No state. No I/O.
 *
 * Every other Government module imports from here. No inline numbers,
 * no inline enum arrays, no inline default values anywhere else.
 */
(function() {
    'use strict';

    // ---- Position / assignment defaults --------------------------------------

    var DEFAULT_POSITION_PRIORITY = 10;
    var DEFAULT_MIN_SKILL_LEVEL = 0;
    var DEFAULT_SKILL_LEVEL = 10;

    var MIN_POSITION_PRIORITY = 1;
    var MAX_POSITION_PRIORITY = 100;
    var MIN_SKILL_LEVEL = 0;
    var MAX_SKILL_LEVEL = 100;

    var MIN_DEPARTMENT_NAME_LENGTH = 2;
    var MIN_POSITION_NAME_LENGTH = 2;
    var MIN_GOVERNMENT_TYPE_NAME_LENGTH = 2;

    var MIN_CHARACTER_AGE = 18;

    // ---- Gender restrictions -------------------------------------------------

    var GENDER_EITHER = 'either';
    var GENDER_MALE = 'male';
    var GENDER_FEMALE = 'female';

    var GENDER_RESTRICTIONS = [GENDER_EITHER, GENDER_MALE, GENDER_FEMALE];

    // ---- Salary --------------------------------------------------------------

    // Tier selection is by position priority. Lower priority = higher tier.
    // maxPriority is inclusive. The last tier uses Infinity as the catch-all.
    var SALARY_TIERS = [
        { maxPriority: 3,        name: 'Minister', base: 100, multiplier: 1.5 },
        { maxPriority: 5,        name: 'Director', base: 60,  multiplier: 1.2 },
        { maxPriority: 8,        name: 'Officer',  base: 35,  multiplier: 1.0 },
        { maxPriority: 12,       name: 'Clerk',    base: 20,  multiplier: 0.8 },
        { maxPriority: Infinity, name: 'Staff',    base: 12,  multiplier: 0.6 }
    ];

    // Prosperity modifier: 0.8 base, +1 per 250 prosperity.
    var SALARY_PROSPERITY_BASE_MODIFIER = 0.8;
    var SALARY_PROSPERITY_DIVISOR = 250;

    // Experience modifier: +1 per 50 years, capped at 20 years.
    var SALARY_EXPERIENCE_CAP_YEARS = 20;
    var SALARY_EXPERIENCE_DIVISOR = 50;
    var SALARY_EXPERIENCE_BASE_MODIFIER = 1.0;

    var MAX_SALARY = 1000000;
    var MIN_SALARY = 0;

    // ---- Assignment lifecycle ------------------------------------------------

    var ASSIGNMENT_DEFAULT_END_REASON = 'Term ended';

    // Recognised end reasons. Not enforced — informational for UI dropdowns.
    var ASSIGNMENT_END_REASONS = [
        'Term ended',
        'Resigned',
        'Removed',
        'Death',
        'Promoted',
        'Demoted',
        'Retired',
        'Dismissed'
    ];

    // ---- Leader assignment ---------------------------------------------------

    var MAX_LEADER_START_YEAR_FUTURE_OFFSET = 10;

    // ---- Candidate scoring ---------------------------------------------------

    // scoreCandidate: rankPriority contributes (6 - priority) * 10.
    var SCORING_RANK_PRIORITY_BASE = 6;
    var SCORING_RANK_PRIORITY_MULTIPLIER = 10;

    // Experience: +2 per year, capped at 20 years.
    var SCORING_EXPERIENCE_CAP_YEARS = 20;
    var SCORING_EXPERIENCE_MULTIPLIER = 2;

    // Age bonuses.
    var SCORING_AGE_PRIME_MIN = 30;
    var SCORING_AGE_PRIME_MAX = 50;
    var SCORING_AGE_PRIME_BONUS = 20;
    var SCORING_AGE_ACCEPTABLE_MIN = 25;
    var SCORING_AGE_ACCEPTABLE_MAX = 55;
    var SCORING_AGE_ACCEPTABLE_BONUS = 10;

    // Score is clamped to [0, 100].
    var SCORING_MIN = 0;
    var SCORING_MAX = 100;

    // isCandidateReady thresholds.
    var READY_MIN_AGE = 25;
    var READY_MIN_EXPERIENCE_YEARS = 5;

    // ---- Succession / candidate listing --------------------------------------

    // Default cap on the successor candidate list.
    var SUCCESSION_CANDIDATE_LIMIT = 10;

    // ---- Deletion / cascade --------------------------------------------------

    // Nothing to enumerate — cascade is a boolean option. Kept as a section
    // marker so future options have a home.

    // ---- Government history / event types ------------------------------------

    var GOVERNMENT_HISTORY_EVENT_TYPES = {
        LEADER_ASSIGNED: 'leader_assigned',
        LEADER_TERM_ENDED: 'leader_term_ended',
        GOVERNMENT_ASSIGNED: 'government_assigned',
        GOVERNMENT_CHANGED: 'government_changed'
    };

    // ---- CustomEvent names (cross-domain) ------------------------------------

    var EVENTS = {
        DEPARTMENT_CREATED:   'governmentDepartmentCreated',
        DEPARTMENT_UPDATED:   'governmentDepartmentUpdated',
        DEPARTMENT_DELETED:   'governmentDepartmentDeleted',

        POSITION_ADDED:       'governmentPositionAdded',
        POSITION_UPDATED:     'governmentPositionUpdated',
        POSITION_DELETED:     'governmentPositionDeleted',

        CHARACTER_ASSIGNED:   'governmentCharacterAssigned',
        ASSIGNMENT_ENDED:     'governmentAssignmentEnded',
        ASSIGNMENT_REMOVED:   'governmentAssignmentRemoved',

        SALARY_OVERRIDDEN:    'governmentSalaryOverridden',

        TYPE_CREATED:         'governmentTypeCreated',
        TYPE_UPDATED:         'governmentTypeUpdated',
        TYPE_DELETED:         'governmentTypeDeleted',

        LEADER_ASSIGNED:      'governmentLeaderAssigned',
        LEADER_TERM_ENDED:    'governmentLeaderTermEnded',

        GOVERNMENT_ASSIGNED_TO_PLACE: 'governmentAssignedToPlace',

        JUSTICE_SEVERITY_UPDATED: 'governmentJusticeSeverityUpdated',
        WATCH_UPDATED:            'governmentWatchUpdated'
    };

    // ---- In-process State subscription event names ---------------------------

    var STATE_EVENTS = {
        INITIALIZED:       'initialized',
        HYDRATED:          'hydrated',
        CACHE_INVALIDATED: 'cacheInvalidated',
        UI_STATE_CHANGED:  'uiStateChanged'
    };

    // ---- Error codes ---------------------------------------------------------
    // Used as the `code` field of failed Command results. Stable strings.

    var CODES = {
        VALIDATION:        'VALIDATION',
        NOT_FOUND:         'NOT_FOUND',
        ALREADY_ASSIGNED:  'ALREADY_ASSIGNED',
        ALREADY_ENDED:     'ALREADY_ENDED',
        DECEASED:          'DECEASED',
        TOO_YOUNG:         'TOO_YOUNG',
        INELIGIBLE:        'INELIGIBLE',
        RANK:              'RANK',
        GENDER:            'GENDER',
        ROLE:              'ROLE',
        SKILL:             'SKILL',
        EXPERIENCE:        'EXPERIENCE',
        NO_FACTS:          'NO_FACTS',
        NO_START_YEAR:     'NO_START_YEAR',
        HAS_CHILDREN:      'HAS_CHILDREN',
        HAS_ASSIGNMENTS:   'HAS_ASSIGNMENTS',
        CYCLE:             'CYCLE',
        IN_USE:            'IN_USE',
        PROFESSION_FAILED: 'PROFESSION_FAILED',
        ATOMIC_ABORT:      'ATOMIC_ABORT',
        LOCATION_FAILED:   'LOCATION_FAILED',
        SETTLEMENT_FAILED: 'SETTLEMENT_FAILED',
        SAVE_UNAVAILABLE:  'SAVE_UNAVAILABLE',
        SAVE_FAILED:       'SAVE_FAILED'
    };

    // ---- Field allowlists ----------------------------------------------------
    // Owned by Government. Any other field on an update payload is rejected.

    var ALLOWED_DEPARTMENT_FIELDS = [
        'name',
        'description',
        'locationId',
        'parentDepartmentId',
        'isDeprecated'
    ];

    var ALLOWED_POSITION_FIELDS = [
        'name',
        'description',
        'priority',
        'parentPositionId',
        'requiredRoleId',
        'minSkillLevel',
        'genderRestriction',
        'requiredRankId',
        'minExperience'
    ];

    var ALLOWED_ASSIGNMENT_FIELDS = [
        'endYear',
        'endReason',
        'notes',
        'title',
        'roleIdAtAssignment',
        'skillLevelAtAssignment'
    ];

    var ALLOWED_GOVERNMENT_TYPE_FIELDS = [
        'name',
        'description',
        'allowedRankIds',
        'icon'
    ];

    // Fields owned by other domains. Rejected with a message pointing at the
    // owning domain's commands.
    var DOMAIN_OWNED_FIELDS = {
        // Character-owned
        characterName:      'CharacterCommands',
        characterFullName:  'CharacterCommands',
        // Location-owned
        placeName:          'LocationCommands',
        locationName:       'LocationCommands',
        governmentTypeId:   'LocationCommands',
        governmentStyle:    'LocationCommands',
        leaderId:           'LocationCommands',
        // Settlement-owned
        justiceSeverity:    'SettlementGovernmentCommands',
        hasWatch:           'SettlementGovernmentCommands',
        watchSize:          'SettlementGovernmentCommands'
    };

    // ---- Export --------------------------------------------------------------

    window.GovernmentConstants = {
        // Defaults
        DEFAULT_POSITION_PRIORITY: DEFAULT_POSITION_PRIORITY,
        DEFAULT_MIN_SKILL_LEVEL: DEFAULT_MIN_SKILL_LEVEL,
        DEFAULT_SKILL_LEVEL: DEFAULT_SKILL_LEVEL,

        // Bounds
        MIN_POSITION_PRIORITY: MIN_POSITION_PRIORITY,
        MAX_POSITION_PRIORITY: MAX_POSITION_PRIORITY,
        MIN_SKILL_LEVEL: MIN_SKILL_LEVEL,
        MAX_SKILL_LEVEL: MAX_SKILL_LEVEL,

        MIN_DEPARTMENT_NAME_LENGTH: MIN_DEPARTMENT_NAME_LENGTH,
        MIN_POSITION_NAME_LENGTH: MIN_POSITION_NAME_LENGTH,
        MIN_GOVERNMENT_TYPE_NAME_LENGTH: MIN_GOVERNMENT_TYPE_NAME_LENGTH,

        MIN_CHARACTER_AGE: MIN_CHARACTER_AGE,

        // Gender
        GENDER_EITHER: GENDER_EITHER,
        GENDER_MALE: GENDER_MALE,
        GENDER_FEMALE: GENDER_FEMALE,
        GENDER_RESTRICTIONS: GENDER_RESTRICTIONS,

        // Salary
        SALARY_TIERS: SALARY_TIERS,
        SALARY_PROSPERITY_BASE_MODIFIER: SALARY_PROSPERITY_BASE_MODIFIER,
        SALARY_PROSPERITY_DIVISOR: SALARY_PROSPERITY_DIVISOR,
        SALARY_EXPERIENCE_CAP_YEARS: SALARY_EXPERIENCE_CAP_YEARS,
        SALARY_EXPERIENCE_DIVISOR: SALARY_EXPERIENCE_DIVISOR,
        SALARY_EXPERIENCE_BASE_MODIFIER: SALARY_EXPERIENCE_BASE_MODIFIER,
        MAX_SALARY: MAX_SALARY,
        MIN_SALARY: MIN_SALARY,

        // Assignment lifecycle
        ASSIGNMENT_DEFAULT_END_REASON: ASSIGNMENT_DEFAULT_END_REASON,
        ASSIGNMENT_END_REASONS: ASSIGNMENT_END_REASONS,

        // Leader
        MAX_LEADER_START_YEAR_FUTURE_OFFSET: MAX_LEADER_START_YEAR_FUTURE_OFFSET,

        // Scoring
        SCORING_RANK_PRIORITY_BASE: SCORING_RANK_PRIORITY_BASE,
        SCORING_RANK_PRIORITY_MULTIPLIER: SCORING_RANK_PRIORITY_MULTIPLIER,
        SCORING_EXPERIENCE_CAP_YEARS: SCORING_EXPERIENCE_CAP_YEARS,
        SCORING_EXPERIENCE_MULTIPLIER: SCORING_EXPERIENCE_MULTIPLIER,
        SCORING_AGE_PRIME_MIN: SCORING_AGE_PRIME_MIN,
        SCORING_AGE_PRIME_MAX: SCORING_AGE_PRIME_MAX,
        SCORING_AGE_PRIME_BONUS: SCORING_AGE_PRIME_BONUS,
        SCORING_AGE_ACCEPTABLE_MIN: SCORING_AGE_ACCEPTABLE_MIN,
        SCORING_AGE_ACCEPTABLE_MAX: SCORING_AGE_ACCEPTABLE_MAX,
        SCORING_AGE_ACCEPTABLE_BONUS: SCORING_AGE_ACCEPTABLE_BONUS,
        SCORING_MIN: SCORING_MIN,
        SCORING_MAX: SCORING_MAX,

        READY_MIN_AGE: READY_MIN_AGE,
        READY_MIN_EXPERIENCE_YEARS: READY_MIN_EXPERIENCE_YEARS,

        SUCCESSION_CANDIDATE_LIMIT: SUCCESSION_CANDIDATE_LIMIT,

        // History + events
        GOVERNMENT_HISTORY_EVENT_TYPES: GOVERNMENT_HISTORY_EVENT_TYPES,
        EVENTS: EVENTS,
        STATE_EVENTS: STATE_EVENTS,

        // Codes
        CODES: CODES,

        // Allowlists
        ALLOWED_DEPARTMENT_FIELDS: ALLOWED_DEPARTMENT_FIELDS,
        ALLOWED_POSITION_FIELDS: ALLOWED_POSITION_FIELDS,
        ALLOWED_ASSIGNMENT_FIELDS: ALLOWED_ASSIGNMENT_FIELDS,
        ALLOWED_GOVERNMENT_TYPE_FIELDS: ALLOWED_GOVERNMENT_TYPE_FIELDS,
        DOMAIN_OWNED_FIELDS: DOMAIN_OWNED_FIELDS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentConstants;
    }
})();
