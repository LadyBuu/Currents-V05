/**
 * =============================================================================
 * STILL WATERS - FAMILY STATISTICS (family-statistics.js)
 * =============================================================================
 * 
 * LOCATION: js/modules/relationships/family-statistics.js
 * 
 * SCOPE:
 *   Aggregate statistics for a character's family graph.
 * 
 * DEPENDENCIES:
 *   - family-accessors.js
 *   - household-queries.js (optional, for household info)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    function _requireFamily() {
        if (typeof window.FamilyAccessors === 'undefined') {
            throw new Error('family-statistics.js: family-accessors.js must load first.');
        }
    }

    function getFamilyStatistics(characterId) {
        _requireFamily();
        var fa = window.FamilyAccessors;
        var character = window.getCharacterById
            ? window.getCharacterById(characterId)
            : null;
        if (!character) return null;

        var parents = fa.getParents(characterId);
        var children = fa.getAllChildren(characterId, true);
        var siblings = fa.getSiblings(characterId, true, true, true);
        var grandchildren = fa.getGrandchildren(characterId, true);
        var spouses = fa.getSpouses(characterId, true);

        var livingChildren = children.filter(function(c) {
            return !c.character.isDeceased;
        });
        var livingSiblings = siblings.filter(function(s) {
            return !s.character.isDeceased;
        });
        var livingGrandchildren = grandchildren.filter(function(g) {
            return !g.isDeceased;
        });

        return {
            character: character,
            parents: {
                father: parents.father,
                mother: parents.mother,
                hasParents: parents.father !== null || parents.mother !== null
            },
            children: {
                total: children.length,
                living: livingChildren.length,
                biological: children.filter(function(c) { return c.biological; }).length,
                adopted: children.filter(function(c) { return c.adopted; }).length,
                eldest: fa.getEldestChild(characterId, true, true),
                youngest: fa.getYoungestChild(characterId, true, true)
            },
            siblings: {
                total: siblings.length,
                living: livingSiblings.length,
                full: siblings.filter(function(s) { return s.full; }).length,
                half: siblings.filter(function(s) { return s.half; }).length,
                adoptive: siblings.filter(function(s) { return s.adoptive; }).length,
                eldest: fa.getEldestSibling(characterId, true, true),
                youngest: fa.getYoungestSibling(characterId, true, true)
            },
            grandchildren: {
                total: grandchildren.length,
                living: livingGrandchildren.length
            },
            spouse: spouses.length > 0 ? {
                character: spouses[0].character,
                marriageYear: spouses[0].startYear
            } : null,
            isOrphan: fa.isOrphan(characterId, true),
            hasChildren: fa.hasChildren(characterId, true, false)
        };
    }

    window.getFamilyStatistics = getFamilyStatistics;
})();