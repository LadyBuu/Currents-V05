/**
 * family-statistics.js
 *
 * Aggregates family projections for a character.
 * Depends only on FamilyQueries and CharacterQueries.
 * No policy, no mutation, no persistence.
 */

(function() {
    'use strict';

    function _requireDeps() {
        if (!window.FamilyQueries) {
            throw new Error('family-statistics.js: FamilyQueries must load first');
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-statistics.js: getCharacterById required');
        }
    }

    function _isLiving(characterId) {
        var c = window.getCharacterById(characterId);
        return !!(c && !c.isDeceased);
    }

    function getFamilyStatistics(characterId) {
        _requireDeps();
        var FQ = window.FamilyQueries;
        var character = window.getCharacterById(characterId);
        if (!character) return null;

        var parents = FQ.getParents(characterId, { activeOnly: true });
        var childrenIds = FQ.getChildren(characterId, { activeOnly: true });
        var siblings = FQ.getSiblings(characterId, { activeOnly: true });
        var grandchildrenIds = FQ.getGrandchildren(characterId, { activeOnly: true });
        var spouses = FQ.getSpouseIds(characterId);

        var livingChildren = childrenIds.filter(_isLiving);
        var livingSiblings = siblings.filter(function(s) {
            return _isLiving(s.siblingId);
        });
        var livingGrandchildren = grandchildrenIds.filter(_isLiving);

        var fullSiblings = siblings.filter(function(s) {
            return s.siblingType === 'full';
        }).length;
        var halfSiblings = siblings.filter(function(s) {
            return s.siblingType === 'half';
        }).length;
        var stepSiblings = siblings.filter(function(s) {
            return s.siblingType === 'step';
        }).length;
        var adoptiveSiblings = siblings.filter(function(s) {
            return s.siblingType === 'adoptive';
        }).length;

        return {
            characterId: characterId,

            parents: {
                fathers: parents.fathers,
                mothers: parents.mothers,
                others: parents.others,
                total: parents.fathers.length +
                       parents.mothers.length +
                       parents.others.length,
                hasParents: (parents.fathers.length +
                             parents.mothers.length +
                             parents.others.length) > 0
            },

            children: {
                total: childrenIds.length,
                living: livingChildren.length,
                ids: childrenIds
            },

            siblings: {
                total: siblings.length,
                living: livingSiblings.length,
                full: fullSiblings,
                half: halfSiblings,
                step: stepSiblings,
                adoptive: adoptiveSiblings,
                entries: siblings
            },

            grandchildren: {
                total: grandchildrenIds.length,
                living: livingGrandchildren.length,
                ids: grandchildrenIds
            },

            spouses: spouses,

            isOrphan: FQ.isOrphan(characterId),
            hasChildren: childrenIds.length > 0,
            hasSiblings: siblings.length > 0
        };
    }

    window.getFamilyStatistics = getFamilyStatistics;
    window.FamilyStatistics = {
        getFamilyStatistics: getFamilyStatistics
    };

})();
