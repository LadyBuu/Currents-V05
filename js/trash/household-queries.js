/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/modules/households/household-queries.js
 * 
 * SCOPE:
 *   - Character → household lookup
 *   - Household member queries
 *   - Household head resolution
 * 
 * OUT OF SCOPE:
 *   - Family relationship semantics (see family-accessors.js)
 *   - Household CRUD (see household-commands.js)
 * 
 * DEPENDENCIES:
 *   - accessors.js: getCharacterById, getHouseholdById
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    function _requireAccessors() {
        if (typeof window.getCharacterById !== 'function'
            || typeof window.getHouseholdById !== 'function') {
            throw new Error('household-queries.js: accessors.js must load first.');
        }
    }

    /**
     * Gets the household of a character.
     * @returns {Object|null}
     */
    function getCharacterHousehold(characterId) {
        _requireAccessors();
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        var householdId = character.household || character.householdId;
        if (!householdId) return null;
        return window.getHouseholdById(householdId);
    }

    /**
     * Gets family members in a character's household.
     * @returns {Array<{ character, role, isHead, type, joinedYear }>}
     */
    function getHouseholdFamilyMembers(characterId, includeNonFamily) {
        _requireAccessors();
        includeNonFamily = includeNonFamily === true;
        var household = getCharacterHousehold(characterId);
        if (!household || !Array.isArray(household.members)) return [];

        var members = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var char = window.getCharacterById(member.characterId);
            if (!char) continue;

            var isFamily = member.type === 'family'
                || member.type === 'child'
                || member.type === 'parent'
                || member.type === 'spouse';
            if (!isFamily && !includeNonFamily) continue;

            members.push({
                character: char,
                role: member.role || 'member',
                isHead: member.isHead === true,
                type: member.type || 'family',
                joinedYear: member.joinedYear
            });
        }
        return members;
    }

    /**
     * Gets the head of a character's household.
     * @returns {Object|null}
     */
    function getHouseholdHead(characterId) {
        _requireAccessors();
        var household = getCharacterHousehold(characterId);
        if (!household || !Array.isArray(household.members)) return null;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                return window.getCharacterById(household.members[i].characterId);
            }
        }
        return null;
    }

    window.getCharacterHousehold = getCharacterHousehold;
    window.getHouseholdFamilyMembers = getHouseholdFamilyMembers;
    window.getHouseholdHead = getHouseholdHead;
})();
