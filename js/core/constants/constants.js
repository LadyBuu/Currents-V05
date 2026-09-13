/**
 * =============================================================================
 * STILL WATERS - GLOBAL CONSTANTS (constants.js)
 * =============================================================================
 * 
 * LOCATION: js/core/constants.js
 * 
 * SCOPE:
 *   Application-wide identifiers that do not belong to any single domain.
 *   Specifically:
 *     - localStorage keys
 *     - Cross-cutting configuration
 * 
 * OUT OF SCOPE (belongs in domain modules):
 *   - Crime constants → js/modules/crime/crime-constants.js
 *   - Character/age constants → js/core/age-constants.js
 *   - Relationship constants → js/modules/relationships/relationship-constants.js
 *   - Location constants → js/modules/locations/location-constants.js
 *   - Role constants → js/modules/roles/role-constants.js
 *   - UI options → js/ui/options.js
 * 
 * DEPENDENCIES: None. Load FIRST.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. PREVENT DUPLICATE INITIALIZATION
// =============================================================================

if (typeof window.__CONSTANTS_LOADED === 'undefined') {

window.__CONSTANTS_LOADED = true;

// =============================================================================
// 2. LOCAL STORAGE KEYS
// =============================================================================

/**
 * Canonical localStorage key names.
 * All modules must use these — no literal strings.
 */
window.LOCAL_STORAGE_KEYS = Object.freeze({
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

    // Census
    CENSUS_PRESETS: 'census_presets',
    CENSUS_CURRENT_VIEW: 'census_current_view',
    CENSUS_SELECTED_LOCATION: 'census_selected_location',
    CENSUS_FILTERS_COLLAPSED: 'census_filters_collapsed',

    // Timeline
    TIMELINE_FILTERS: 'timeline_filters',
    TIMELINE_COLLAPSED: 'timeline_collapsed',

    // RNG
    RNG_SEED: 'stillwaters_rng_seed',

    // Integrity
    LAST_AUDIT: 'stillwaters_last_audit'
});

// Backward-compat alias
window.STORAGE_KEYS = window.LOCAL_STORAGE_KEYS;

// =============================================================================
// 3. CROSS-CUTTING CONFIGURATION
// =============================================================================

/**
 * Application-wide numeric limits and defaults.
 * Domain-specific constants belong in domain files.
 */
window.APP_CONSTANTS = Object.freeze({
    MAX_NAME_DISPLAY_LENGTH: 200,
    DEFAULT_UI_TIMEOUT_MS: 5000,
    MAX_HIERARCHY_DEPTH: 20
});

} // end duplicate-init guard

// =============================================================================
// 4. MODULE EXPORTS
// =============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LOCAL_STORAGE_KEYS: window.LOCAL_STORAGE_KEYS,
        STORAGE_KEYS: window.STORAGE_KEYS,
        APP_CONSTANTS: window.APP_CONSTANTS
    };
}