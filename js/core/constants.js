/**
 * =============================================================================
 * STILL WATERS - GLOBAL CONSTANTS (constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/constants.js
 * 
 * This file contains ALL global constants used across the application.
 * Load this file FIRST before any other modules to prevent duplicate declarations.
 * 
 * DEPENDENCIES: None (pure constants, no external dependencies)
 * 
 * =============================================================================
 * LOAD ORDER (must be loaded first):
 * =============================================================================
 * 
 * <script src="js/core/constants.js"></script>
 * <!-- Then load other modules -->
 * 
 * =============================================================================
 * CONSTANTS INCLUDED:
 * =============================================================================
 * 
 * Location/Tree Constants:
 *   - LOCATION_LEVELS - Cascading location filter levels (1-5)
 * 
 * Crime System Constants:
 *   - CRIME_TYPES - Crime type IDs (MURDER, EXECUTION, THEFT, etc.)
 *   - CRIME_SEVERITY - Severity scores for each crime type (1-10)
 *   - CRIME_PUNISHMENTS - Possible punishments by crime type
 *   - MURDER_REASONS - Categorized murder reasons
 *   - EXECUTION_REASONS - Categorized execution reasons
 *   - EXECUTION_METHODS - Execution methods with icons and descriptions
 *   - VENDETTA_STATUS - Vendetta status values (ACTIVE, DORMANT, etc.)
 * 
 * Character/UI Constants:
 *   - AGE_GROUPS - Age group array for character tree (0-10, 11-20, ...)
 *   - AGE_GROUPS_MAP - Age groups with emojis and labels
 *   - LIFE_STAGES - Life stage definitions (INFANT, YOUTH, ADULT, etc.)
 *   - RELATIONSHIP_STATUS - Relationship status values
 *   - GENDER_OPTIONS - Gender choices for dropdowns
 *   - ATTRACTION_OPTIONS - Attraction/orientation choices
 * 
 * Storage Keys:
 *   - STORAGE_KEYS - Centralized localStorage key names
 * 
 * =============================================================================
 */

// =============================================================================
// 1. PREVENT DUPLICATE INITIALIZATION
// =============================================================================

if (typeof window.__CONSTANTS_LOADED !== 'undefined') {
    console.warn('Constants already loaded, skipping re-initialization');
} else {
    window.__CONSTANTS_LOADED = true;

// =============================================================================
// 2. LOCATION / TREE CONSTANTS
// =============================================================================

window.LOCATION_LEVELS = {
    1: { name: 'Country', icon: '👑', display: 'Country' },
    2: { name: 'Region / District', icon: '🏰', display: 'Region / District' },
    3: { name: 'County / Duchy', icon: '⚜️', display: 'County / Duchy' },
    4: { name: 'Town / Village', icon: '🏘️', display: 'Town / Village' },
    5: { name: 'Locality / Compound', icon: '🏠', display: 'Locality / Compound' }
};

// =============================================================================
// 3. CRIME SYSTEM CONSTANTS
// =============================================================================

window.CRIME_TYPES = {
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

window.CRIME_SEVERITY = {
    [window.CRIME_TYPES.THEFT]: 3,
    [window.CRIME_TYPES.ROBBERY]: 5,
    [window.CRIME_TYPES.FRAUD]: 4,
    [window.CRIME_TYPES.FORGERY]: 4,
    [window.CRIME_TYPES.SMUGGLING]: 5,
    [window.CRIME_TYPES.ASSAULT]: 5,
    [window.CRIME_TYPES.ADULTERY]: 7,
    [window.CRIME_TYPES.BLASPHEMY]: 8,
    [window.CRIME_TYPES.WITCHCRAFT]: 9,
    [window.CRIME_TYPES.ESPIONAGE]: 9,
    [window.CRIME_TYPES.CRIME_OF_PASSION]: 8,
    [window.CRIME_TYPES.VIOLENCE]: 6,
    [window.CRIME_TYPES.TREASON]: 10,
    [window.CRIME_TYPES.MURDER]: 10,
    [window.CRIME_TYPES.VENDETTA]: 9
};

window.CRIME_PUNISHMENTS = {
    [window.CRIME_TYPES.THEFT]: ['Fine', 'Branding', 'Maiming', 'Execution'],
    [window.CRIME_TYPES.ROBBERY]: ['Fine', 'Maiming', 'Exile', 'Execution'],
    [window.CRIME_TYPES.FRAUD]: ['Fine', 'Branding', 'Exile'],
    [window.CRIME_TYPES.FORGERY]: ['Fine', 'Maiming', 'Execution'],
    [window.CRIME_TYPES.SMUGGLING]: ['Fine', 'Exile', 'Execution'],
    [window.CRIME_TYPES.ASSAULT]: ['Fine', 'Maiming', 'Exile', 'Execution'],
    [window.CRIME_TYPES.ADULTERY]: ['Fine', 'Public Shaming', 'Exile', 'Execution'],
    [window.CRIME_TYPES.BLASPHEMY]: ['Fine', 'Public Shaming', 'Exile', 'Execution'],
    [window.CRIME_TYPES.WITCHCRAFT]: ['Exile', 'Execution', 'Imprisonment'],
    [window.CRIME_TYPES.ESPIONAGE]: ['Execution', 'Imprisonment', 'Exile'],
    [window.CRIME_TYPES.CRIME_OF_PASSION]: ['Exile', 'Execution', 'Life Service'],
    [window.CRIME_TYPES.VIOLENCE]: ['Fine', 'Maiming', 'Exile'],
    [window.CRIME_TYPES.TREASON]: ['Execution', 'Life Imprisonment', 'Exile'],
    [window.CRIME_TYPES.MURDER]: ['Execution', 'Exile', 'Blood Price', 'Life Imprisonment'],
    [window.CRIME_TYPES.VENDETTA]: ['Execution', 'Exile', 'Blood Feud']
};

window.MURDER_REASONS = {
    political: [
        "Political rivalry", "Treason", "Espionage", "Succession dispute",
        "Religious conflict", "Rebellion", "Coup attempt", "Court intrigue"
    ],
    personal: [
        "Personal vendetta", "Jealousy", "Revenge", "Crime of passion",
        "Honor killing", "Blood feud", "Love triangle", "Family dispute",
        "Betrayal", "Insult or dishonor"
    ],
    criminal: [
        "Robbery gone wrong", "Contract killing", "Gang violence",
        "Land dispute", "Inheritance dispute", "Debt collection gone wrong",
        "Banditry", "Rivalry between criminals"
    ],
    accidental: [
        "Self-defense gone wrong", "Accidental killing", "Mistaken identity",
        "Hunting accident", "Bar fight gone wrong", "Drunken brawl", "Negligence"
    ],
    affair: [
        "Crime of passion - lover's quarrel", "Spouse discovered affair",
        "Lover murdered by jealous spouse", "Affair partner eliminated for secrecy",
        "Blackmail from affair gone wrong", "Love triangle murder", "Murder to legitimize affair"
    ],
    conflict: [
        "Escalated from argument", "Escalated from dispute", "Escalated from confrontation",
        "Escalated from physical fight", "Feud escalation"
    ],
    other: [
        "Madness or insanity", "Fear of exposure", "Silencing a witness",
        "Impersonation", "Unknown perpetrator", "Duel to the death"
    ]
};

window.EXECUTION_REASONS = {
    treason: [
        "Treason against the Crown", "Regicide", "Rebellion or Insurrection",
        "Revolutionary activity", "Coup attempt", "Conspiracy against the state"
    ],
    murder: [
        "Murder of a noble", "Murder of a clergy member", "Murder of a child",
        "Multiple murders", "Particularly brutal murder", "Premeditated murder",
        "Political assassination"
    ],
    adultery: [
        "Adultery with a noble's spouse", "Adultery with clergy", "Repeated adultery",
        "Adultery resulting in bastard child", "Adultery during mourning period"
    ],
    crime: [
        "Highway robbery", "Counterfeiting currency", "Arson", "Espionage or spying",
        "Piracy", "Smuggling", "Large-scale theft"
    ],
    military: [
        "Desertion from military", "Cowardice in battle", "Insubordination",
        "Abandoning post in battle", "Treasonous collaboration"
    ],
    religious: [
        "Blasphemy", "Sacrilege", "Witchcraft or sorcery", "Heresy",
        "Violation of sacred grounds", "Breaking a blood oath"
    ],
    social: [
        "Violation of sacred taboos", "Disrespecting a ruler or chief", "Incest",
        "Breaking social customs", "Dueling (illegal)"
    ],
    common: [
        "Murder", "Treason", "Rebellion", "Adultery", "Witchcraft",
        "Cowardice in battle", "Desertion", "Espionage", "Blasphemy"
    ]
};

window.EXECUTION_METHODS = {
    beheading: { id: 'beheading', name: 'Beheading', icon: '⚔️', description: 'Death by decapitation using sword or axe' },
    hanging: { id: 'hanging', name: 'Hanging', icon: '🪢', description: 'Death by hanging from a gallows' },
    burning: { id: 'burning', name: 'Burning at the Stake', icon: '🔥', description: 'Death by fire at a stake' },
    breaking_wheel: { id: 'breaking_wheel', name: 'Breaking Wheel', icon: '⚙️', description: 'Death by breaking on a wheel' },
    quartering: { id: 'quartering', name: 'Drawing and Quartering', icon: '🏹', description: 'Death by being drawn and quartered' },
    drowning: { id: 'drowning', name: 'Drowning', icon: '💧', description: 'Death by drowning' },
    stoning: { id: 'stoning', name: 'Stoning', icon: '🪨', description: 'Death by being stoned by the community' },
    crushing: { id: 'crushing', name: 'Crushing', icon: '🗿', description: 'Death by being crushed with weights' },
    boiling: { id: 'boiling', name: 'Boiling Alive', icon: '🍲', description: 'Death by being boiled in oil or water' },
    impaling: { id: 'impaling', name: 'Impaling', icon: '🔱', description: 'Death by being impaled on a stake' },
    guillotine: { id: 'guillotine', name: 'Guillotine', icon: '⚔️', description: 'Death by guillotine' },
    firing_squad: { id: 'firing_squad', name: 'Firing Squad', icon: '🔫', description: 'Death by gunfire from a firing squad' },
    exposure: { id: 'exposure', name: 'Exposure', icon: '🏔️', description: 'Death by exposure to elements' },
    starvation: { id: 'starvation', name: 'Starvation', icon: '🍽️', description: 'Death by starvation in a cell' }
};

window.VENDETTA_STATUS = {
    ACTIVE: 'active',
    DORMANT: 'dormant',
    ESCALATED: 'escalated',
    RESOLVED: 'resolved'
};

// =============================================================================
// 4. CHARACTER / UI CONSTANTS
// =============================================================================

// Age groups for character tree (10 groups)
window.AGE_GROUPS = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];

// Age groups with emojis and labels for UI display
window.AGE_GROUPS_MAP = {
    '0-10': { label: '0-10 years', emoji: '👶' },
    '11-20': { label: '11-20 years', emoji: '🧑' },
    '21-30': { label: '21-30 years', emoji: '👨' },
    '31-40': { label: '31-40 years', emoji: '👨' },
    '41-50': { label: '41-50 years', emoji: '👩' },
    '51-60': { label: '51-60 years', emoji: '👩' },
    '61-70': { label: '61-70 years', emoji: '👵' },
    '71-80': { label: '71-80 years', emoji: '👵' },
    '81-90': { label: '81-90 years', emoji: '🧓' },
    '91+': { label: '91+ years', emoji: '👴' }
};

// Life stages (for character lifecycle)
window.LIFE_STAGES = {
    INFANT: { min: 0, max: 10, name: 'Child', emoji: '👶', group: '0-10' },
    YOUTH: { min: 11, max: 20, name: 'Youth', emoji: '🧑', group: '11-20' },
    YOUNG_ADULT: { min: 21, max: 30, name: 'Young Adult', emoji: '👨', group: '21-30' },
    ADULT: { min: 31, max: 40, name: 'Adult', emoji: '👨', group: '31-40' },
    MIDDLE_ADULT: { min: 41, max: 50, name: 'Middle Adult', emoji: '👩', group: '41-50' },
    MATURE: { min: 51, max: 60, name: 'Mature', emoji: '👩', group: '51-60' },
    SENIOR: { min: 61, max: 70, name: 'Senior', emoji: '👵', group: '61-70' },
    ELDER: { min: 71, max: 80, name: 'Elder', emoji: '👵', group: '71-80' },
    AGED: { min: 81, max: 90, name: 'Aged', emoji: '🧓', group: '81-90' },
    ANCIENT: { min: 91, max: 150, name: 'Ancient', emoji: '👴', group: '91+' }
};

// Relationship status values
window.RELATIONSHIP_STATUS = {
    ONGOING: 'ongoing',
    ENDED: 'ended',
    WIDOWED: 'widowed',
    SINGLE: 'single',
    PARTNERED: 'partnered'
};

// Gender options for dropdowns
window.GENDER_OPTIONS = [
    { value: 'male', label: '♂ Male', icon: '♂' },
    { value: 'female', label: '♀ Female', icon: '♀' },
    { value: 'unknown', label: '⚥ Unknown', icon: '⚥' }
];

// Attraction/sexuality options
window.ATTRACTION_OPTIONS = [
    { value: 'both', label: 'Both', icon: '💕' },
    { value: 'men', label: 'Men', icon: '♂' },
    { value: 'women', label: 'Women', icon: '♀' },
    { value: 'neither', label: 'Neither', icon: '💔' }
];

// Filter age groups (for census/filters - different grouping)
window.FILTER_AGE_GROUPS = {
    '0-19': { min: 0, max: 19, label: '0-19 years', icon: '👶' },
    '20-35': { min: 20, max: 35, label: '20-35 years', icon: '🧑' },
    '36-50': { min: 36, max: 50, label: '36-50 years', icon: '👨' },
    '50+': { min: 50, max: 999, label: '50+ years', icon: '👵' }
};

// Death causes (natural only - murder/execution are in crimeSystem)
window.DEATH_CAUSES = [
    { text: "Old age", weight: 25, minAge: 60 },
    { text: "Old age, natural causes", weight: 15, minAge: 60 },
    { text: "Fever", weight: 12 },
    { text: "Consumption (tuberculosis)", weight: 10 },
    { text: "Pneumonia", weight: 8 },
    { text: "Infection", weight: 6 },
    { text: "Plague", weight: 8 },
    { text: "Dysentery", weight: 5 },
    { text: "Drowning", weight: 5 },
    { text: "Fell from a height", weight: 4 },
    { text: "Hunting accident", weight: 3 },
    { text: "Fire", weight: 3 },
    { text: "Animal attack", weight: 3 },
    { text: "Accident", weight: 5 },
    { text: "Childbed fever", weight: 4, minAge: 14, maxAge: 45 }
];

// =============================================================================
// 5. STORAGE KEYS (Centralized)
// =============================================================================

window.STORAGE_KEYS = {
    // Tree states
    LOCATION_TREE_STATE: 'location_tree_state',
    CHARACTER_TREE_STATE: 'character_tree_state_v3',
    RANK_TREE_STATE: 'rank_tree_state',
    HOUSEHOLD_TREE_STATE: 'household_tree_state',
    
    // Filter states
    CHARACTER_FILTERS: 'stillwaters_filter_character_filters',
    LOCATION_FILTERS: 'stillwaters_filter_location_filters',
    FILTER_PRESETS: 'stillwaters_filter_presets',
    
    // UI states
    IDENTITY_TAB_COLLAPSED: 'identityTab_collapsed',
    HEARTBREAK_COLLAPSED: 'heartbreak_collapsed',
    
    // Custom data
    CUSTOM_FEATURES: 'stillwaters_custom_features',
    ADOPTION_AGENCY_STATE: 'adoption_agency_state',
    
    // ===== CENSUS STORAGE KEYS =====
    CENSUS_PRESETS: 'census_presets',
    CENSUS_CURRENT_VIEW: 'census_current_view',
    CENSUS_SELECTED_LOCATION: 'census_selected_location',
    CENSUS_FILTERS_COLLAPSED: 'census_filters_collapsed',
    
    // ===== TIMELINE STORAGE KEYS =====
    TIMELINE_FILTERS: 'timeline_filters',
    TIMELINE_COLLAPSED: 'timeline_collapsed'
};

// =============================================================================
// 6. ROLE CATEGORY CONSTANTS
// =============================================================================

window.DEFAULT_ROLE_CATEGORIES = {
    combat: { id: 'combat', name: 'Combat & Military', icon: '⚔️' },
    craft: { id: 'craft', name: 'Craftsmanship', icon: '🔨' },
    trade: { id: 'trade', name: 'Trade & Commerce', icon: '💰' },
    agriculture: { id: 'agriculture', name: 'Agriculture & Fishing', icon: '🌾' },
    academic: { id: 'academic', name: 'Academic & Scholar', icon: '📚' },
    religious: { id: 'religious', name: 'Religious', icon: '⛪' },
    admin: { id: 'admin', name: 'Administration', icon: '📜' },
    service: { id: 'service', name: 'Service', icon: '🛡️' },
    art: { id: 'art', name: 'Artistic', icon: '🎨' }
};

// =============================================================================
// 7. HELPER FUNCTIONS (optional utilities)
// =============================================================================

/**
 * Gets emoji for an age group
 * @param {string} group - Age group key (e.g., '0-10')
 * @returns {string} Emoji for the group
 */
window.getAgeGroupEmoji = function(group) {
    return window.AGE_GROUPS_MAP[group]?.emoji || '👤';
};

/**
 * Gets label for an age group
 * @param {string} group - Age group key
 * @returns {string} Label for the group
 */
window.getAgeGroupLabel = function(group) {
    return window.AGE_GROUPS_MAP[group]?.label || group;
};

/**
 * Gets icon for gender
 * @param {string} gender - 'male', 'female', or 'unknown'
 * @returns {string} Gender icon
 */
window.getGenderIcon = function(gender) {
    const icons = { male: '♂', female: '♀', unknown: '⚥' };
    return icons[gender] || '⚥';
};

}

// =============================================================================
// 8. EXPORTS (for ES module compatibility)
// =============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LOCATION_LEVELS: window.LOCATION_LEVELS,
        CRIME_TYPES: window.CRIME_TYPES,
        CRIME_SEVERITY: window.CRIME_SEVERITY,
        CRIME_PUNISHMENTS: window.CRIME_PUNISHMENTS,
        MURDER_REASONS: window.MURDER_REASONS,
        EXECUTION_REASONS: window.EXECUTION_REASONS,
        EXECUTION_METHODS: window.EXECUTION_METHODS,
        VENDETTA_STATUS: window.VENDETTA_STATUS,
        AGE_GROUPS: window.AGE_GROUPS,
        AGE_GROUPS_MAP: window.AGE_GROUPS_MAP,
        LIFE_STAGES: window.LIFE_STAGES,
        RELATIONSHIP_STATUS: window.RELATIONSHIP_STATUS,
        GENDER_OPTIONS: window.GENDER_OPTIONS,
        ATTRACTION_OPTIONS: window.ATTRACTION_OPTIONS,
        FILTER_AGE_GROUPS: window.FILTER_AGE_GROUPS,
        DEATH_CAUSES: window.DEATH_CAUSES,
        STORAGE_KEYS: window.STORAGE_KEYS,
        getAgeGroupEmoji: window.getAgeGroupEmoji,
        getAgeGroupLabel: window.getAgeGroupLabel,
        getGenderIcon: window.getGenderIcon
    };
}