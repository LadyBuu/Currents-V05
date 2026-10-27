/**
 * =============================================================================
 * STILL WATERS - QUERY HELPERS (js/core/query-helpers.js)
 * =============================================================================
 * 
 * LOCATION: js/core/query-helpers.js
 * 
 * SCOPE:
 *   Cross-domain structural queries over canonical core data. These functions:
 *   - operate only on character, parent, and location STRUCTURE
 *   - do not depend on system modules (relationships, world, education, etc.)
 *   - do not format, resolve display names, or interpret domain semantics
 *   - do not fall back to alternate implementations
 * 
 * OUT OF SCOPE (belongs elsewhere):
 *   - Current location resolution → world.js (getCurrentLocationId)
 *   - Relationship status → relationship domain
 *   - Location hierarchy display → formatting.js (with resolved hierarchy)
 *   - Current-year fallback → time.js (getCurrentYearSafe)
 *   - Age calculation → time.js (calculateAge)
 *   - Family graph accessors → family-accessors.js
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getPlaces)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - constants.js (AGE_GROUPS, AGE_GROUPS_MAP)
 * 
 * SEMANTIC RULES:
 *   - Return null for missing/invalid input; never fabricate.
 *   - No `||` defaults that could destroy 0 or ''.
 *   - Missing dependencies fail loudly.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY GUARDS
    // =========================================================================

    function _requireAccessors() {
        if (typeof window.getCharacterById !== 'function'
            || typeof window.getCharacters !== 'function'
            || typeof window.getPlaceById !== 'function'
            || typeof window.getPlaces !== 'function') {
            throw new Error('query-helpers.js: accessors.js is required.');
        }
    }

    function _requireTime() {
        if (typeof window.calculateAge !== 'function'
            || typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('query-helpers.js: time.js is required.');
        }
    }

    // =========================================================================
    // 2. CHARACTER ROLES (structural only — no formatting)
    // =========================================================================

    /**
     * Gets the raw profession records of a character.
     * Does not normalize to names — returns the underlying records.
     * 
     * @param {Object} char
     * @returns {Array} Array of profession records
     */
    function getCharacterProfessionRecords(char) {
        if (!char || !Array.isArray(char.professions)) return [];
        return char.professions;
    }

    // =========================================================================
    // 3. PARENT / CHILD STRUCTURAL QUERIES
    // =========================================================================

    /**
     * Gets father and mother objects.
     * @param {Object} char
     * @returns {{father: Object|null, mother: Object|null}}
     */
    function getCharacterParents(char) {
        if (!char) return { father: null, mother: null };
        return {
            father: char.fatherId ? window.getCharacterById(char.fatherId) : null,
            mother: char.motherId ? window.getCharacterById(char.motherId) : null
        };
    }

    /**
     * Gets biological children of a character.
     * Note: For richer family queries, use family-accessors.js.
     * This is a lean, self-contained scan.
     * 
     * @param {Object} char
     * @returns {Array}
     */
    function getCharacterChildren(char) {
        if (!char) return [];
        var all = window.getCharacters();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (c.motherId === char.id || c.fatherId === char.id) {
                result.push(c);
            }
        }
        return result;
    }

    /**
     * Checks if a character has biological children.
     * Short-circuits as soon as one is found.
     * @param {Object} char
     * @returns {boolean}
     */
    function getCharacterHasChildren(char) {
        if (!char) return false;
        var all = window.getCharacters();
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (c.motherId === char.id || c.fatherId === char.id) return true;
        }
        return false;
    }

    /**
     * Checks if a character has a father or mother.
     * @param {Object} char
     * @returns {boolean}
     */
    function getCharacterHasParents(char) {
        if (!char) return false;
        return !!(char.fatherId || char.motherId);
    }

    // =========================================================================
    // 4. AGE GROUP
    // =========================================================================

    /**
     * Gets the age group key for a given age.
     * Returns null for invalid age.
     * 
     * @param {number} age
     * @returns {string|null}
     */
    function getAgeGroupForAge(age) {
        if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return null;
        var groups = window.AGE_GROUPS;
        if (!Array.isArray(groups) || groups.length === 0) return null;
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0], 10);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1], 10);
            if (age >= min && age <= max) return groups[i];
        }
        return groups[groups.length - 1];
    }

    /**
     * Gets the human label for an age group.
     * @param {string} group
     * @returns {string}
     */
    function getAgeGroupLabel(group) {
        if (!group) return '';
        var map = window.AGE_GROUPS_MAP;
        if (map && map[group] && map[group].label) return map[group].label;
        return group + ' years';
    }

    // =========================================================================
    // 5. LOCATION HIERARCHY (structural only — no formatting)
    // =========================================================================

    /**
     * Gets the parent chain for a place, ordered root → leaf.
     * Includes the place itself as the last element.
     * 
     * @param {Object} place
     * @returns {Array}
     */
    function getLocationHierarchy(place) {
        if (!place) return [];
        var hierarchy = [];
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            hierarchy.unshift(current);
            if (!current.parentId) break;
            current = window.getPlaceById(current.parentId);
            safety++;
        }
        return hierarchy;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.QueryHelpers = {
        // Character structure
        getCharacterProfessionRecords: getCharacterProfessionRecords,
        getCharacterParents: getCharacterParents,
        getCharacterChildren: getCharacterChildren,
        getCharacterHasChildren: getCharacterHasChildren,
        getCharacterHasParents: getCharacterHasParents,

        // Age group
        getAgeGroupForAge: getAgeGroupForAge,
        getAgeGroupLabel: getAgeGroupLabel,

        // Location structure
        getLocationHierarchy: getLocationHierarchy
    };

    // Backward-compatible globals for these specific structural queries
    window.getCharacterParents = getCharacterParents;
    window.getCharacterChildren = getCharacterChildren;
    window.getCharacterHasChildren = getCharacterHasChildren;
    window.getCharacterHasParents = getCharacterHasParents;
    window.getAgeGroupForAge = getAgeGroupForAge;
    window.getAgeGroupLabel = getAgeGroupLabel;
    window.getLocationHierarchy = getLocationHierarchy;

})();
