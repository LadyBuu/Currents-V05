/**
 * =============================================================================
 * STILL WATERS - GLOBAL CONSTANTS (constants.js)
 * =============================================================================
 *
 * LOCATION: js/core/constants/constants.js
 *
 * SCOPE:
 *   Application-wide identifiers that do not belong to any single domain.
 *   Specifically:
 *     - localStorage keys
 *     - Cross-cutting configuration
 *
 * OUT OF SCOPE (belongs in domain modules):
 *   - Crime constants        → js/crime/crime-constants.js
 *   - Character/age constants → js/core/constants/age-constants.js
 *   - Character identity enums → js/core/constants/character-constants.js
 *   - Relationship constants → js/relationships/relationship-constants.js
 *   - Location constants     → js/location/location-constants.js
 *   - Role constants         → js/roles/role-constants.js
 *   - UI options             → js/core/constants/character-constants.js
 *                              (the legacy ui-options.js duplicate has been
 *                               removed; GENDER_VALUES / ATTRACTION_VALUES
 *                               live in character-constants.js)
 *
 * DEPENDENCIES: None. Load FIRST.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * STORAGE KEY CANONICALITY
 * ------------------------
 *   This table enumerates every localStorage key the application uses.
 *   Every module that reads or writes localStorage MUST use these constants,
 *   not a literal string.
 *
 *   The location domain's expansion key is the one that has caused the
 *   most confusion across revisions. History:
 *
 *     - The first location-ui-state.js used the literal
 *       'location_tree_expanded'.
 *     - A later constants.js revision renamed the entry to
 *       'location_tree_state', which silently orphaned every user's
 *       persisted expansion the first time constants.js loaded.
 *     - A still later location-ui-state.js revision added a fallback
 *       literal 'location_tree_expanded' to guard against missing
 *       constants.js, which produced three inconsistent values
 *       depending on load order (constants present → 'location_tree_state';
 *       constants absent → 'location_tree_expanded'; docs → both).
 *
 *   This revision canonicalizes the key back to 'location_tree_expanded'.
 *   That is the value location-ui-state.js's fallback uses, the value
 *   location-docs.txt §9 documents, and the value every currently deployed
 *   save carries in localStorage. Renaming to 'location_tree_state' again
 *   without a migration shim would repeat the same orphaning bug.
 *
 *   If you ever want to rename a storage key:
 *     1. Add the new key alongside the old one.
 *     2. Add a migration shim that reads the old key, writes the new key,
 *        and removes the old one.
 *     3. Remove the old key from this table only after the shim has
 *        shipped and been deployed long enough that no live save uses it.
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
 *
 * All modules that read or write localStorage MUST use these constants.
 * No literal key strings anywhere else in the codebase.
 *
 * The MASTER and UI_STATE entries were previously absent while
 * storage.js and ui-state.js hardcoded them. That inconsistency has been
 * corrected: this table now enumerates every key the application uses.
 *
 * Every LOCATION_TREE_STATE read or write goes through here. The
 * location-ui-state.js fallback ('location_tree_expanded') matches this
 * entry. location-docs.txt §9 documents this entry. See STORAGE KEY
 * CANONICALITY in the module header.
 */
window.LOCAL_STORAGE_KEYS = Object.freeze({
    // Canonical application data (owned by storage.js)
    MASTER: 'stillwaters_master',

    // Panel UI state (owned by ui-state.js)
    UI_STATE: 'stillwaters_ui_state',

    // Tree states
    LOCATION_TREE_STATE: 'location_tree_expanded',
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
