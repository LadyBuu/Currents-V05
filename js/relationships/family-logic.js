/**
 * =============================================================================
 * STILL WATERS - FAMILY LOGIC (js/social/family-logic.js)
 * =============================================================================
 * 
 * Family-specific business logic built on top of FamilyAccessors and
 * the relationship registry.
 * 
 * FEATURES:
 *   - Parent-child relationship management
 *   - Sibling relationship management
 *   - Grandparent/grandchild queries
 *   - Consanguinity calculations
 *   - Relationship descriptions
 *   - FAMILY ACCESSORS - Uses FamilyAccessors for data access
 *   - RELATIONSHIP REGISTRY - Uses social system for relationship tracking
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - family-accessors.js (FamilyAccessors) - NEW
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

    function _invalidateCaches() {
        if (typeof window.clearFamilyCache === 'function') {
            window.clearFamilyCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    // =========================================================================
    // 2. FAMILY ACCESSORS WRAPPER (NEW)
    // =========================================================================

    function _getFamilyAccessors() {
        return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
    }

    function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getAllChildren === 'function') {
            var result = fa.getAllChildren(parentId, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getParentsViaFamilyAccessors(childId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getParents === 'function') {
            return fa.getParents(childId);
        }
        return null;
    }

    function _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSiblings === 'function') {
            var result = fa.getSiblings(childId, includeHalfSiblings !== false, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getGrandparentsViaFamilyAccessors(childId, generation) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandparents === 'function') {
            return fa.getGrandparents(childId, generation || 1);
        }
        return null;
    }

    function _getGrandchildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandchildren === 'function') {
            return fa.getGrandchildren(parentId, includeDeceased || false);
        }
        return null;
    }

    function _getSpousesViaFamilyAccessors(characterId, activeOnly) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSpouses === 'function') {
            var result = fa.getSpouses(characterId, activeOnly !== false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getConsanguinityViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getConsanguinity === 'function') {
            return fa.getConsanguinity(id1, id2);
        }
        return null;
    }

    function _getRelationshipDescriptionViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getRelationshipDescription === 'function') {
            return fa.getRelationshipDescription(id1, id2);
        }
        return null;
    }

    function _getConsanguinityDegreeViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getConsanguinityDegree === 'function') {
            return fa.getConsanguinityDegree(id1, id2);
        }
        return null;
    }

    // =========================================================================
    // 3. RELATIONSHIP REGISTRY WRAPPERS
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
    // 4. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 5. PARENT-CHILD RELATIONSHIPS (UPDATED)
    // =========================================================================

    function setParent(childId, parentId, parentType, options) {
        options = options || {};
        var child = _getCharacterById(childId);
        var parent = _getCharacterById(parentId);

        if (!child || !parent) return null;
        if (childId === parentId) return null;

        // ================================================================
        // NEW: Use FamilyAccessors for data validation
        // ================================================================
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getParents === 'function') {
            var existingParents = fa.getParents(childId);
            // Check if this parent already exists
            if (parentType === 'father' && existingParents.father && existingParents.father.id === parentId) {
                // Update existing relationship metadata
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
            }
            if (parentType === 'mother' && existingParents.mother && existingParents.mother.id === parentId) {
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
            }
        }

        // Check for existing relationship
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

        // ================================================================
        // NEW: Also update child's direct parent references for compatibility
        // ================================================================
        if (parentType === 'father' && !child.fatherId) {
            child.fatherId = parentId;
        } else if (parentType === 'mother' && !child.motherId) {
            child.motherId = parentId;
        }

        // Create relationship
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
            _saveMasterData();
            _invalidateCaches();
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
            // ================================================================
            // NEW: Also remove from direct parent references for compatibility
            // ================================================================
            var child = _getCharacterById(childId);
            if (child) {
                if (child.fatherId === parentId) child.fatherId = null;
                if (child.motherId === parentId) child.motherId = null;
            }

            _cleanupSiblingRelationships(parentId, childId);
            _saveMasterData();
            _invalidateCaches();
        }

        return result;
    }

    function getParents(characterId) {
        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getParentsViaFamilyAccessors(characterId);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: use relationship registry
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

        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getChildrenViaFamilyAccessors(characterId, false);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: use relationship registry
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
    // 6. SIBLING RELATIONSHIPS (UPDATED)
    // =========================================================================

    function _synchronizeSiblingRelationships(parentId, childId) {
        var parent = _getCharacterById(parentId);
        if (!parent) return;

        // ================================================================
        // UPDATED: Use FamilyAccessors to get children
        // ================================================================
        var siblings = [];
        var faResult = _getChildrenViaFamilyAccessors(parentId, false);
        if (faResult !== null) {
            siblings = faResult;
        } else {
            var allChars = _getCharacters();
            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                if (c.id === parentId) continue;
                var rel = _getRelationshipBetween(parentId, c.id);
                if (rel && rel.type === ARCHETYPES.PARENT_CHILD) {
                    siblings.push(c);
                }
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

            // ================================================================
            // UPDATED: Check if they still share a parent using FamilyAccessors
            // ================================================================
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getParents === 'function') {
                var childParents = fa.getParents(childId);
                var siblingParents = fa.getParents(sibling.id);
                if (childParents.father && siblingParents.father && childParents.father.id === siblingParents.father.id) {
                    sharesParent = true;
                }
                if (childParents.mother && siblingParents.mother && childParents.mother.id === siblingParents.mother.id) {
                    sharesParent = true;
                }
            }

            if (!sharesParent) {
                var relA = _getRelationshipBetween(parentId, childId);
                var relB = _getRelationshipBetween(parentId, sibling.id);
                if (relA && relA.type === ARCHETYPES.PARENT_CHILD &&
                    relB && relB.type === ARCHETYPES.PARENT_CHILD) {
                    sharesParent = true;
                }
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

        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getSiblingsViaFamilyAccessors(characterId, true, false);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: use relationship registry
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
    // 7. GRANDPARENT RELATIONSHIPS (UPDATED)
    // =========================================================================

    function getGrandparents(characterId, generation) {
        generation = generation || 1;

        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getGrandparentsViaFamilyAccessors(characterId, generation);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: manual calculation
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

        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getGrandchildrenViaFamilyAccessors(characterId, false);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: manual calculation
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
    // 8. CONSANGUINITY (UPDATED)
    // =========================================================================

    function getConsanguinityDegree(charId1, charId2) {
        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getConsanguinityViaFamilyAccessors(charId1, charId2);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: manual calculation
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
        // ================================================================
        // UPDATED: Prefer FamilyAccessors
        // ================================================================
        var faResult = _getRelationshipDescriptionViaFamilyAccessors(charId1, charId2);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: manual calculation
        var degree = getConsanguinityDegree(charId1, charId2);
        return degree || 'Unrelated';
    }

    // =========================================================================
    // 9. SPOUSE RELATIONSHIPS (NEW)
    // =========================================================================

    function getSpouses(characterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;

        // Prefer FamilyAccessors
        var faResult = _getSpousesViaFamilyAccessors(characterId, activeOnly);
        if (faResult !== null) {
            return faResult;
        }

        // Fallback: use relationship registry
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var spouses = [];

        if (character.relationships) {
            for (var i = 0; i < character.relationships.length; i++) {
                var rel = character.relationships[i];
                if (activeOnly && rel.status !== 'ongoing' && rel.status !== 'active') continue;

                var isMarriage = rel.type === 'marriage' || rel.type === 'committed' || rel.type === 'romance';
                if (!isMarriage) continue;

                var spouseId = rel.participantB || rel.partnerId;
                if (spouseId === characterId) {
                    spouseId = rel.participantA;
                }
                var spouse = _getCharacterById(spouseId);
                if (spouse) {
                    spouses.push(spouse);
                }
            }
        }

        return spouses;
    }

    function getCurrentSpouse(characterId) {
        var spouses = getSpouses(characterId, true);
        return spouses.length > 0 ? spouses[0] : null;
    }

    // =========================================================================
    // 10. FAMILY STATISTICS (NEW)
    // =========================================================================

    function getFamilyStatistics(characterId) {
        // Prefer FamilyAccessors
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getFamilyStatistics === 'function') {
            return fa.getFamilyStatistics(characterId);
        }

        // Fallback: manual calculation
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var children = getChildren(characterId, false);
        var livingChildren = children.filter(function(c) { return !c.isDeceased; });
        var siblings = getSiblings(characterId, false);
        var livingSiblings = siblings.filter(function(s) { return !s.isDeceased; });
        var grandchildren = getGrandchildren(characterId, false);
        var livingGrandchildren = grandchildren.filter(function(g) { return !g.isDeceased; });
        var spouses = getSpouses(characterId, true);
        var currentSpouse = spouses.length > 0 ? spouses[0] : null;
        var parents = getParents(characterId);

        var fullSiblings = [];
        var halfSiblings = [];
        for (var i = 0; i < siblings.length; i++) {
            var s = siblings[i];
            var sharesFather = parents.father && s.fatherId && parents.father.id === s.fatherId;
            var sharesMother = parents.mother && s.motherId && parents.mother.id === s.motherId;
            if (sharesFather && sharesMother) {
                fullSiblings.push(s);
            } else if (sharesFather || sharesMother) {
                halfSiblings.push(s);
            }
        }

        return {
            character: character,
            parents: {
                father: parents.father || null,
                mother: parents.mother || null,
                hasParents: parents.father !== null || parents.mother !== null
            },
            children: {
                total: children.length,
                living: livingChildren.length,
                eldest: children.length > 0 ? children[0] : null,
                youngest: children.length > 0 ? children[children.length - 1] : null
            },
            siblings: {
                total: siblings.length,
                living: livingSiblings.length,
                full: fullSiblings.length,
                half: halfSiblings.length,
                eldest: siblings.length > 0 ? siblings[0] : null,
                youngest: siblings.length > 0 ? siblings[siblings.length - 1] : null
            },
            grandchildren: {
                total: grandchildren.length,
                living: livingGrandchildren.length
            },
            spouse: currentSpouse ? {
                character: currentSpouse
            } : null,
            isOrphan: !parents.father && !parents.mother,
            hasChildren: children.length > 0,
            totalFamilyMembers: 1 + children.length + siblings.length + grandchildren.length
        };
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.FamilyLogic = {
        // Parent-child
        setParent: setParent,
        removeParent: removeParent,
        getParents: getParents,
        getChildren: getChildren,

        // Siblings
        getSiblings: getSiblings,

        // Grandparents
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,

        // Spouses (NEW)
        getSpouses: getSpouses,
        getCurrentSpouse: getCurrentSpouse,

        // Consanguinity
        getConsanguinityDegree: getConsanguinityDegree,
        getRelationshipDescription: getRelationshipDescription,

        // Statistics (NEW)
        getFamilyStatistics: getFamilyStatistics
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
    window.getSpouses = getSpouses;
    window.getCurrentSpouse = getCurrentSpouse;
    window.getFamilyStatistics = getFamilyStatistics;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyLogic;
    }

})();