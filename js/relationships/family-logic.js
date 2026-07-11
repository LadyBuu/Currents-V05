/**
 * =============================================================================
 * STILL WATERS - FAMILY LOGIC
 * =============================================================================
 * 
 * Family-specific business logic built on top of the relationship registry.
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 4. PARENT-CHILD RELATIONSHIPS
    // =========================================================================

    function setParent(childId, parentId, parentType, options) {
        options = options || {};
        var child = _getCharacterById(childId);
        var parent = _getCharacterById(parentId);

        if (!child || !parent) return null;
        if (childId === parentId) return null;

        var existing = _getRelationshipBetween(parentId, childId);
        if (existing && existing.type === ARCHETYPES.PARENT_CHILD) {
            if (options.biological !== undefined) {
                _updateRelationship(existing.id, {
                    metadata: {
                        ...existing.metadata,
                        parentType: parentType,
                        biological: options.biological !== false
                    }
                });
            }
            return existing;
        }

        var startYear = options.startYear || child.birthYear || _getCurrentYear();
        var biological = options.biological !== undefined ? options.biological : true;

        var relationship = _createRelationship(parentId, childId, {
            type: ARCHETYPES.PARENT_CHILD,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                parentType: parentType,
                biological: biological,
                notes: options.notes || ''
            }
        });

        if (relationship) {
            _logEvent('family', 'Parent Set',
                parent.name + ' set as ' + parentType + ' of ' + child.name,
                [parent, child]);
            _synchronizeSiblingRelationships(parentId, childId);
        }

        return relationship;
    }

    function removeParent(childId, parentId, options) {
        options = options || {};
        var relationship = _getRelationshipBetween(parentId, childId);

        if (!relationship || relationship.type !== ARCHETYPES.PARENT_CHILD) {
            return false;
        }

        var endYear = options.endYear || _getCurrentYear();
        var result = _endRelationship(relationship.id, endYear, options.reason || 'Parent removed');

        if (result) {
            _cleanupSiblingRelationships(parentId, childId);
            _saveMasterData();
        }

        return result;
    }

    function getParents(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.PARENT_CHILD,
            activeOnly: true
        });

        var father = null;
        var mother = null;

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var parentId = rel.participantA;
            var parentType = rel.metadata?.parentType;
            var parent = _getCharacterById(parentId);
            if (!parent) continue;

            if (parentType === 'father' || parentType === 'male') {
                father = parent;
            } else if (parentType === 'mother' || parentType === 'female') {
                mother = parent;
            } else if (parent.gender === 'male') {
                father = parent;
            } else if (parent.gender === 'female') {
                mother = parent;
            }
        }

        return { father: father, mother: mother };
    }

    function getChildren(characterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var allChars = _getCharacters();
        var children = [];

        for (var i = 0; i < allChars.length; i++) {
            var child = allChars[i];
            if (child.id === characterId) continue;

            var rel = _getRelationshipBetween(characterId, child.id);
            if (rel && rel.type === ARCHETYPES.PARENT_CHILD) {
                if (activeOnly && rel.status !== STATUS.ONGOING) continue;
                children.push(child);
            }
        }

        return children;
    }

    // =========================================================================
    // 5. SIBLING RELATIONSHIPS
    // =========================================================================

    function _synchronizeSiblingRelationships(parentId, childId) {
        var parent = _getCharacterById(parentId);
        if (!parent) return;

        var allChars = _getCharacters();
        var siblings = [];

        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (c.id === parentId) continue;
            var rel = _getRelationshipBetween(parentId, c.id);
            if (rel && rel.type === ARCHETYPES.PARENT_CHILD) {
                siblings.push(c);
            }
        }

        for (var i = 0; i < siblings.length; i++) {
            for (var j = i + 1; j < siblings.length; j++) {
                var siblingA = siblings[i];
                var siblingB = siblings[j];

                var existing = _getRelationshipBetween(siblingA.id, siblingB.id);
                if (!existing) {
                    _createRelationship(siblingA.id, siblingB.id, {
                        type: ARCHETYPES.SIBLING,
                        status: STATUS.ONGOING,
                        startYear: Math.min(siblingA.birthYear || 0, siblingB.birthYear || 0) || _getCurrentYear(),
                        metadata: {
                            sharedParentId: parentId,
                            created: 'auto'
                        }
                    });
                }
            }
        }
    }

    function _cleanupSiblingRelationships(parentId, childId) {
        var child = _getCharacterById(childId);
        if (!child) return;

        var siblings = getSiblings(childId);

        for (var i = 0; i < siblings.length; i++) {
            var sibling = siblings[i];
            var sharesParent = false;

            var relA = _getRelationshipBetween(parentId, childId);
            var relB = _getRelationshipBetween(parentId, sibling.id);
            if (relA && relA.type === ARCHETYPES.PARENT_CHILD &&
                relB && relB.type === ARCHETYPES.PARENT_CHILD) {
                sharesParent = true;
            }

            if (!sharesParent) {
                var siblingRel = _getRelationshipBetween(childId, sibling.id);
                if (siblingRel && siblingRel.type === ARCHETYPES.SIBLING) {
                    _endRelationship(siblingRel.id, _getCurrentYear(), 'No longer share a parent');
                }
            }
        }
    }

    function getSiblings(characterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.SIBLING
        });

        var siblings = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;

            var siblingId = rel.participantA === characterId ? rel.participantB : rel.participantA;
            var sibling = _getCharacterById(siblingId);
            if (sibling) {
                siblings.push(sibling);
            }
        }

        return siblings;
    }

    // =========================================================================
    // 6. GRANDPARENT RELATIONSHIPS
    // =========================================================================

    function getGrandparents(characterId, generation) {
        generation = generation || 1;
        var result = [];

        if (generation === 0) {
            var parents = getParents(characterId);
            if (parents.father) result.push(parents.father);
            if (parents.mother) result.push(parents.mother);
            return result;
        }

        var parents = getParents(characterId);
        if (parents.father) {
            var fatherParents = getParents(parents.father.id);
            if (fatherParents.father) result.push(fatherParents.father);
            if (fatherParents.mother) result.push(fatherParents.mother);
        }
        if (parents.mother) {
            var motherParents = getParents(parents.mother.id);
            if (motherParents.father) result.push(motherParents.father);
            if (motherParents.mother) result.push(motherParents.mother);
        }

        return result;
    }

    function getGrandchildren(characterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var children = getChildren(characterId, activeOnly);
        var grandchildren = [];

        for (var i = 0; i < children.length; i++) {
            var childChildren = getChildren(children[i].id, activeOnly);
            for (var j = 0; j < childChildren.length; j++) {
                grandchildren.push(childChildren[j]);
            }
        }

        return grandchildren;
    }

    // =========================================================================
    // 7. CONSANGUINITY
    // =========================================================================

    function getConsanguinityDegree(charId1, charId2) {
        if (charId1 === charId2) return 'Self';

        var char1 = _getCharacterById(charId1);
        var char2 = _getCharacterById(charId2);
        if (!char1 || !char2) return null;

        var rel1 = _getRelationshipBetween(charId2, charId1);
        var rel2 = _getRelationshipBetween(charId1, charId2);

        if (rel1 && rel1.type === ARCHETYPES.PARENT_CHILD) return 'Parent';
        if (rel2 && rel2.type === ARCHETYPES.PARENT_CHILD) return 'Child';

        var siblings = getSiblings(charId1);
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i].id === charId2) return 'Sibling';
        }

        var grandparents = getGrandparents(charId1);
        for (var i = 0; i < grandparents.length; i++) {
            if (grandparents[i].id === charId2) return 'Grandparent';
        }

        var grandchildren = getGrandchildren(charId1);
        for (var i = 0; i < grandchildren.length; i++) {
            if (grandchildren[i].id === charId2) return 'Grandchild';
        }

        var parents = getParents(charId1);
        for (var i = 0; i < 2; i++) {
            var parent = i === 0 ? parents.father : parents.mother;
            if (parent) {
                var parentSiblings = getSiblings(parent.id);
                for (var j = 0; j < parentSiblings.length; j++) {
                    if (parentSiblings[j].id === charId2) {
                        return parent.gender === 'male' ? 'Uncle' : 'Aunt';
                    }
                }
            }
        }

        var grandparents1 = getGrandparents(charId1);
        var grandparents2 = getGrandparents(charId2);
        for (var i = 0; i < grandparents1.length; i++) {
            for (var j = 0; j < grandparents2.length; j++) {
                if (grandparents1[i].id === grandparents2[j].id) {
                    return 'Cousin';
                }
            }
        }

        return null;
    }

    function getRelationshipDescription(charId1, charId2) {
        var degree = getConsanguinityDegree(charId1, charId2);
        return degree || 'Unrelated';
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.FamilyLogic = {
        setParent: setParent,
        removeParent: removeParent,
        getParents: getParents,
        getChildren: getChildren,
        getSiblings: getSiblings,
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,
        getConsanguinityDegree: getConsanguinityDegree,
        getRelationshipDescription: getRelationshipDescription
    };

    // Legacy aliases
    window.setParent = setParent;
    window.removeParent = removeParent;
    window.getParents = getParents;
    window.getChildren = getChildren;
    window.getSiblings = getSiblings;
    window.getGrandparents = getGrandparents;
    window.getGrandchildren = getGrandchildren;
    window.getConsanguinityDegree = getConsanguinityDegree;
    window.getRelationshipDescription = getRelationshipDescription;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyLogic;
    }

})();