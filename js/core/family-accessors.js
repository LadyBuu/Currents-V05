/**
 * =============================================================================
 * STILL WATERS - FAMILY ACCESSORS (js/core/family-accessors.js)
 * =============================================================================
 * 
 * PURE read-only accessors for family relationships.
 * NO system dependencies - uses only core accessors.
 * NO UI, NO business logic, NO mutations.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (calculateAge, getCurrentYearSafe)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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

    // =========================================================================
    // 3. PARENT ACCESSORS
    // =========================================================================

    /**
     * Gets the father of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Father character or null
     */
    function getFather(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return null;
            if (!character.fatherId) return null;
            return _getCharacterById(character.fatherId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the mother of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Mother character or null
     */
    function getMother(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return null;
            if (!character.motherId) return null;
            return _getCharacterById(character.motherId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets both parents of a character
     * @param {string} characterId - Character ID
     * @returns {Object} { father, mother }
     */
    function getParents(characterId) {
        if (_processing) return { father: null, mother: null };
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return { father: null, mother: null };

            return {
                father: character.fatherId ? _getCharacterById(character.fatherId) : null,
                mother: character.motherId ? _getCharacterById(character.motherId) : null
            };
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all biological parents of a character (including adoptive if flagged)
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdoptive - Include adoptive parents (default: false)
     * @returns {Array} Array of parent objects with type info
     */
    function getAllParents(characterId, includeAdoptive) {
        if (_processing) return [];
        _processing = true;

        try {
            includeAdoptive = includeAdoptive || false;
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var parents = [];

            if (character.fatherId) {
                var father = _getCharacterById(character.fatherId);
                if (father) {
                    parents.push({ character: father, type: 'father', biological: true });
                }
            }

            if (character.motherId) {
                var mother = _getCharacterById(character.motherId);
                if (mother) {
                    parents.push({ character: mother, type: 'mother', biological: true });
                }
            }

            // Add adoptive parents from adoptedParents array
            if (includeAdoptive && character.adoptedParents) {
                for (var i = 0; i < character.adoptedParents.length; i++) {
                    var ap = character.adoptedParents[i];
                    if (ap.status === 'ended') continue;
                    var parent = _getCharacterById(ap.parentId);
                    if (parent) {
                        var type = ap.parentType || (parent.gender === 'male' ? 'father' : 'mother');
                        parents.push({
                            character: parent,
                            type: type,
                            biological: false,
                            adoptionType: ap.type || 'legal',
                            adoptionYear: ap.year
                        });
                    }
                }
            }

            return parents;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a character has parents
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdoptive - Include adoptive parents (default: false)
     * @returns {boolean}
     */
    function hasParents(characterId, includeAdoptive) {
        if (_processing) return false;
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return false;

            if (character.fatherId || character.motherId) return true;

            if (includeAdoptive && character.adoptedParents) {
                for (var i = 0; i < character.adoptedParents.length; i++) {
                    if (character.adoptedParents[i].status !== 'ended') {
                        return true;
                    }
                }
            }

            return false;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a character is an orphan (no living parents)
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdoptive - Include adoptive parents (default: false)
     * @returns {boolean}
     */
    function isOrphan(characterId, includeAdoptive) {
        if (_processing) return true;
        _processing = true;

        try {
            var parents = getAllParents(characterId, includeAdoptive);
            for (var i = 0; i < parents.length; i++) {
                var parent = parents[i].character;
                if (parent && !parent.isDeceased) {
                    return false;
                }
            }
            return true;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. CHILDREN ACCESSORS
    // =========================================================================

    /**
     * Gets all biological children of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {Array} Array of child characters
     */
    function getBiologicalChildren(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var allChars = _getCharacters();
            var children = [];

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                if (child.id === characterId) continue;
                if (!includeDeceased && child.isDeceased) continue;

                if (child.fatherId === characterId || child.motherId === characterId) {
                    children.push(child);
                }
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all adopted children of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {Array} Array of child characters with adoption info
     */
    function getAdoptedChildren(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var result = [];

            if (character.adoptedChildren) {
                for (var i = 0; i < character.adoptedChildren.length; i++) {
                    var ac = character.adoptedChildren[i];
                    if (ac.status === 'ended') continue;
                    var child = _getCharacterById(ac.childId);
                    if (!child) continue;
                    if (!includeDeceased && child.isDeceased) continue;
                    result.push({
                        character: child,
                        adoptionType: ac.type || 'legal',
                        adoptionYear: ac.year,
                        notes: ac.notes || ''
                    });
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all children (biological + adopted) of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {Array} Array of child objects with type info
     */
    function getAllChildren(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var result = [];
            var seenIds = {};

            var biological = getBiologicalChildren(characterId, includeDeceased);
            for (var i = 0; i < biological.length; i++) {
                var child = biological[i];
                if (!seenIds[child.id]) {
                    seenIds[child.id] = true;
                    result.push({
                        character: child,
                        type: 'biological',
                        birthYear: child.birthYear
                    });
                }
            }

            var adopted = getAdoptedChildren(characterId, includeDeceased);
            for (var i = 0; i < adopted.length; i++) {
                var child = adopted[i];
                if (!seenIds[child.character.id]) {
                    seenIds[child.character.id] = true;
                    result.push({
                        character: child.character,
                        type: 'adopted',
                        adoptionType: child.adoptionType,
                        adoptionYear: child.adoptionYear,
                        birthYear: child.character.birthYear
                    });
                }
            }

            // Sort by birth year (eldest first)
            result.sort(function(a, b) {
                return (a.birthYear || 0) - (b.birthYear || 0);
            });

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets living children count for a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @returns {number}
     */
    function getLivingChildrenCount(characterId, includeAdopted) {
        if (_processing) return 0;
        _processing = true;

        try {
            includeAdopted = includeAdopted !== false;
            var all = getAllChildren(characterId, false);
            var count = 0;
            for (var i = 0; i < all.length; i++) {
                if (!all[i].character.isDeceased) {
                    count++;
                }
            }
            return count;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets total children count for a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @param {boolean} includeDeceased - Include deceased children (default: true)
     * @returns {number}
     */
    function getTotalChildrenCount(characterId, includeAdopted, includeDeceased) {
        if (_processing) return 0;
        _processing = true;

        try {
            includeAdopted = includeAdopted !== false;
            includeDeceased = includeDeceased !== false;
            var all = getAllChildren(characterId, includeDeceased);
            if (!includeAdopted) {
                var count = 0;
                for (var i = 0; i < all.length; i++) {
                    if (all[i].type === 'biological') {
                        count++;
                    }
                }
                return count;
            }
            return all.length;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a character has children
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {boolean}
     */
    function hasChildren(characterId, includeAdopted, includeDeceased) {
        if (_processing) return false;
        _processing = true;

        try {
            return getTotalChildrenCount(characterId, includeAdopted, includeDeceased) > 0;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the eldest child of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {Object|null} Child character or null
     */
    function getEldestChild(characterId, includeAdopted, includeDeceased) {
        if (_processing) return null;
        _processing = true;

        try {
            var children = getAllChildren(characterId, includeDeceased);
            if (!includeAdopted) {
                children = children.filter(function(c) { return c.type === 'biological'; });
            }
            if (children.length === 0) return null;
            return children[0].character;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the youngest child of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @returns {Object|null} Child character or null
     */
    function getYoungestChild(characterId, includeAdopted, includeDeceased) {
        if (_processing) return null;
        _processing = true;

        try {
            var children = getAllChildren(characterId, includeDeceased);
            if (!includeAdopted) {
                children = children.filter(function(c) { return c.type === 'biological'; });
            }
            if (children.length === 0) return null;
            return children[children.length - 1].character;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. SIBLING ACCESSORS
    // =========================================================================

    /**
     * Gets all siblings of a character (sharing at least one parent)
     * @param {string} characterId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings (default: true)
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @param {boolean} includeAdopted - Include adopted siblings (default: true)
     * @returns {Array} Array of sibling characters with relationship info
     */
    function getSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;

        try {
            includeHalfSiblings = includeHalfSiblings !== false;
            includeDeceased = includeDeceased || false;
            includeAdopted = includeAdopted !== false;

            var character = _getCharacterById(characterId);
            if (!character) return [];

            var allChars = _getCharacters();
            var siblings = [];
            var seenIds = {};

            // Get full siblings (same father AND mother)
            for (var i = 0; i < allChars.length; i++) {
                var sibling = allChars[i];
                if (sibling.id === characterId) continue;
                if (!includeDeceased && sibling.isDeceased) continue;

                var sameFather = character.fatherId && sibling.fatherId && character.fatherId === sibling.fatherId;
                var sameMother = character.motherId && sibling.motherId && character.motherId === sibling.motherId;

                if (sameFather && sameMother) {
                    if (!seenIds[sibling.id]) {
                        seenIds[sibling.id] = true;
                        siblings.push({
                            character: sibling,
                            type: 'full',
                            sameFather: true,
                            sameMother: true
                        });
                    }
                }
            }

            // Get half-siblings (share one parent)
            if (includeHalfSiblings) {
                for (var i = 0; i < allChars.length; i++) {
                    var sibling = allChars[i];
                    if (sibling.id === characterId) continue;
                    if (seenIds[sibling.id]) continue;
                    if (!includeDeceased && sibling.isDeceased) continue;

                    var sameFatherOnly = character.fatherId && sibling.fatherId && character.fatherId === sibling.fatherId;
                    var sameMotherOnly = character.motherId && sibling.motherId && character.motherId === sibling.motherId;

                    if (sameFatherOnly || sameMotherOnly) {
                        seenIds[sibling.id] = true;
                        siblings.push({
                            character: sibling,
                            type: 'half',
                            sameFather: sameFatherOnly,
                            sameMother: sameMotherOnly
                        });
                    }
                }
            }

            // Get adopted siblings (share adoptive parent)
            if (includeAdopted) {
                var adoptiveParents = getAllParents(characterId, true);
                for (var i = 0; i < adoptiveParents.length; i++) {
                    var parent = adoptiveParents[i];
                    if (!parent.biological) {
                        var parentChars = getAllChildren(parent.character.id, includeDeceased);
                        for (var j = 0; j < parentChars.length; j++) {
                            var sibling = parentChars[j];
                            if (sibling.character.id === characterId) continue;
                            if (seenIds[sibling.character.id]) continue;
                            if (!includeDeceased && sibling.character.isDeceased) continue;
                            if (sibling.type === 'adopted') {
                                seenIds[sibling.character.id] = true;
                                siblings.push({
                                    character: sibling.character,
                                    type: 'adopted',
                                    sameFather: false,
                                    sameMother: false,
                                    adoptionType: sibling.adoptionType || 'legal'
                                });
                            }
                        }
                    }
                }
            }

            // Sort by birth year
            siblings.sort(function(a, b) {
                return (a.character.birthYear || 0) - (b.character.birthYear || 0);
            });

            return siblings;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets full siblings of a character (same father AND mother)
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @returns {Array} Array of sibling characters
     */
    function getFullSiblings(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            var siblings = getSiblings(characterId, false, includeDeceased, false);
            return siblings.map(function(s) { return s.character; });
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets half-siblings of a character (share one parent)
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @returns {Array} Array of sibling characters
     */
    function getHalfSiblings(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            var siblings = getSiblings(characterId, true, includeDeceased, false);
            return siblings
                .filter(function(s) { return s.type === 'half'; })
                .map(function(s) { return s.character; });
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the eldest sibling of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings (default: false)
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @returns {Object|null} Sibling character or null
     */
    function getEldestSibling(characterId, includeHalfSiblings, includeDeceased) {
        if (_processing) return null;
        _processing = true;

        try {
            var siblings = getSiblings(characterId, includeHalfSiblings, includeDeceased, false);
            if (siblings.length === 0) return null;
            return siblings[0].character;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the youngest sibling of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings (default: false)
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @returns {Object|null} Sibling character or null
     */
    function getYoungestSibling(characterId, includeHalfSiblings, includeDeceased) {
        if (_processing) return null;
        _processing = true;

        try {
            var siblings = getSiblings(characterId, includeHalfSiblings, includeDeceased, false);
            if (siblings.length === 0) return null;
            return siblings[siblings.length - 1].character;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if two characters are siblings
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings (default: true)
     * @param {boolean} includeAdopted - Include adopted siblings (default: true)
     * @returns {boolean}
     */
    function areSiblings(charId1, charId2, includeHalfSiblings, includeAdopted) {
        if (_processing) return false;
        _processing = true;

        try {
            if (charId1 === charId2) return false;

            var siblings = getSiblings(charId1, includeHalfSiblings, true, includeAdopted);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].character.id === charId2) {
                    return true;
                }
            }
            return false;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. GRANDPARENT ACCESSORS
    // =========================================================================

    /**
     * Gets grandparents of a character
     * @param {string} characterId - Character ID
     * @param {number} generation - 1 = grandparents, 2 = great-grandparents, etc.
     * @param {boolean} includeAdoptive - Include adoptive grandparents (default: false)
     * @returns {Array} Array of grandparent characters
     */
    function getGrandparents(characterId, generation, includeAdoptive) {
        if (_processing) return [];
        _processing = true;

        try {
            generation = generation || 1;
            includeAdoptive = includeAdoptive || false;

            if (generation === 0) {
                var parents = getParents(characterId);
                var result = [];
                if (parents.father) result.push(parents.father);
                if (parents.mother) result.push(parents.mother);
                return result;
            }

            var parents = getAllParents(characterId, includeAdoptive);
            var grandparents = [];

            for (var i = 0; i < parents.length; i++) {
                var parent = parents[i].character;
                if (parent) {
                    var parentParents = getAllParents(parent.id, includeAdoptive);
                    for (var j = 0; j < parentParents.length; j++) {
                        grandparents.push(parentParents[j].character);
                    }
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueGrandparents = [];
            for (var i = 0; i < grandparents.length; i++) {
                var gp = grandparents[i];
                if (gp && !seenIds[gp.id]) {
                    seenIds[gp.id] = true;
                    uniqueGrandparents.push(gp);
                }
            }

            return uniqueGrandparents;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets grandchildren of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased grandchildren (default: false)
     * @param {boolean} includeAdopted - Include adopted grandchildren (default: true)
     * @returns {Array} Array of grandchild characters
     */
    function getGrandchildren(characterId, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            includeAdopted = includeAdopted !== false;

            var children = getAllChildren(characterId, includeDeceased);
            var grandchildren = [];

            for (var i = 0; i < children.length; i++) {
                var child = children[i].character;
                var childChildren = getAllChildren(child.id, includeDeceased);
                for (var j = 0; j < childChildren.length; j++) {
                    grandchildren.push(childChildren[j].character);
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueGrandchildren = [];
            for (var i = 0; i < grandchildren.length; i++) {
                var gc = grandchildren[i];
                if (gc && !seenIds[gc.id]) {
                    seenIds[gc.id] = true;
                    uniqueGrandchildren.push(gc);
                }
            }

            return uniqueGrandchildren;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. EXTENDED FAMILY ACCESSORS
    // =========================================================================

    /**
     * Gets aunts and uncles of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased relatives (default: false)
     * @returns {Array} Array of aunt/uncle characters with relationship info
     */
    function getAuntsAndUncles(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var parents = getParents(characterId);
            var result = [];

            if (parents.father) {
                var fatherSiblings = getSiblings(parents.father.id, true, includeDeceased);
                for (var i = 0; i < fatherSiblings.length; i++) {
                    result.push({
                        character: fatherSiblings[i].character,
                        relation: 'paternal',
                        type: fatherSiblings[i].character.gender === 'male' ? 'uncle' : 'aunt'
                    });
                }
            }

            if (parents.mother) {
                var motherSiblings = getSiblings(parents.mother.id, true, includeDeceased);
                for (var i = 0; i < motherSiblings.length; i++) {
                    result.push({
                        character: motherSiblings[i].character,
                        relation: 'maternal',
                        type: motherSiblings[i].character.gender === 'male' ? 'uncle' : 'aunt'
                    });
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueResult = [];
            for (var i = 0; i < result.length; i++) {
                var item = result[i];
                if (item.character && !seenIds[item.character.id]) {
                    seenIds[item.character.id] = true;
                    uniqueResult.push(item);
                }
            }

            return uniqueResult;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets cousins of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased cousins (default: false)
     * @param {number} degree - 1 = first cousins, 2 = second cousins, etc.
     * @returns {Array} Array of cousin characters
     */
    function getCousins(characterId, includeDeceased, degree) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            degree = degree || 1;

            if (degree === 1) {
                var auntsUncles = getAuntsAndUncles(characterId, includeDeceased);
                var cousins = [];

                for (var i = 0; i < auntsUncles.length; i++) {
                    var uncleAunt = auntsUncles[i].character;
                    var uncleAuntChildren = getAllChildren(uncleAunt.id, includeDeceased);
                    for (var j = 0; j < uncleAuntChildren.length; j++) {
                        if (uncleAuntChildren[j].character.id !== characterId) {
                            cousins.push(uncleAuntChildren[j].character);
                        }
                    }
                }

                // Remove duplicates
                var seenIds = {};
                var uniqueCousins = [];
                for (var i = 0; i < cousins.length; i++) {
                    var cousin = cousins[i];
                    if (cousin && !seenIds[cousin.id]) {
                        seenIds[cousin.id] = true;
                        uniqueCousins.push(cousin);
                    }
                }

                return uniqueCousins;
            }

            // For higher degrees, recursively get cousins of cousins
            var result = getCousins(characterId, includeDeceased, 1);
            var currentDegree = 1;
            var currentCousins = result;

            while (currentDegree < degree) {
                var nextCousins = [];
                for (var i = 0; i < currentCousins.length; i++) {
                    var cousinChildren = getCousins(currentCousins[i].id, includeDeceased, 1);
                    for (var j = 0; j < cousinChildren.length; j++) {
                        nextCousins.push(cousinChildren[j]);
                    }
                }
                currentCousins = nextCousins;
                currentDegree++;
            }

            return currentCousins;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets nieces and nephews of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased relatives (default: false)
     * @returns {Array} Array of niece/nephew characters with relationship info
     */
    function getNiecesAndNephews(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var siblings = getSiblings(characterId, true, includeDeceased);
            var result = [];

            for (var i = 0; i < siblings.length; i++) {
                var sibling = siblings[i].character;
                var siblingChildren = getAllChildren(sibling.id, includeDeceased);
                for (var j = 0; j < siblingChildren.length; j++) {
                    var child = siblingChildren[j].character;
                    if (child) {
                        result.push({
                            character: child,
                            relation: sibling.gender === 'male' ? 'paternal' : 'maternal',
                            type: child.gender === 'male' ? 'nephew' : 'niece',
                            through: sibling
                        });
                    }
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. IN-LAW ACCESSORS
    // =========================================================================

    /**
     * Gets spouse(s) of a character
     * @param {string} characterId - Character ID
     * @param {boolean} activeOnly - Only active relationships (default: true)
     * @returns {Array} Array of spouse characters with relationship info
     */
    function getSpouses(characterId, activeOnly) {
        if (_processing) return [];
        _processing = true;

        try {
            activeOnly = activeOnly !== false;
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
                        spouses.push({
                            character: spouse,
                            relationship: rel,
                            status: rel.status,
                            startYear: rel.startYear || rel.details?.startYear,
                            endYear: rel.endYear || rel.details?.endYear
                        });
                    }
                }
            }

            return spouses;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the current spouse of a character (first active spouse)
     * @param {string} characterId - Character ID
     * @returns {Object|null} Spouse character or null
     */
    function getCurrentSpouse(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var spouses = getSpouses(characterId, true);
            if (spouses.length === 0) return null;
            return spouses[0].character;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets siblings-in-law of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased relatives (default: false)
     * @returns {Array} Array of sibling-in-law characters
     */
    function getSiblingsInLaw(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            includeDeceased = includeDeceased || false;
            var spouse = getCurrentSpouse(characterId);
            if (!spouse) return [];

            var spousesSiblings = getSiblings(spouse.id, true, includeDeceased);
            var result = [];

            for (var i = 0; i < spousesSiblings.length; i++) {
                result.push(spousesSiblings[i].character);
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. HOUSEHOLD ACCESSORS
    // =========================================================================

    /**
     * Gets the household of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Household object or null
     */
    function getCharacterHousehold(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.household) return null;

            if (typeof window.getHousehold === 'function') {
                return window.getHousehold(character.household);
            }

            // Fallback: try to find in masterData
            var allHouseholds = [];
            if (typeof window.getHouseholds === 'function') {
                allHouseholds = window.getHouseholds();
            } else if (window.masterData && window.masterData.data && window.masterData.data.households) {
                allHouseholds = window.masterData.data.households;
            }

            for (var i = 0; i < allHouseholds.length; i++) {
                if (allHouseholds[i].id === character.household) {
                    return allHouseholds[i];
                }
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all family members in a character's household
     * @param {string} characterId - Character ID
     * @param {boolean} includeNonFamily - Include non-family members (default: false)
     * @returns {Array} Array of household member characters
     */
    function getHouseholdFamilyMembers(characterId, includeNonFamily) {
        if (_processing) return [];
        _processing = true;

        try {
            includeNonFamily = includeNonFamily || false;
            var household = getCharacterHousehold(characterId);
            if (!household || !household.members) return [];

            var members = [];

            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                var character = _getCharacterById(member.characterId);
                if (!character) continue;

                var isFamily = false;
                if (member.type === 'family' || member.type === 'child' || member.type === 'parent') {
                    isFamily = true;
                }

                if (isFamily || includeNonFamily) {
                    members.push({
                        character: character,
                        role: member.role || 'member',
                        isHead: member.isHead || false,
                        type: member.type || 'family',
                        joinedYear: member.joinedYear
                    });
                }
            }

            return members;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the head of a character's household
     * @param {string} characterId - Character ID
     * @returns {Object|null} Household head character or null
     */
    function getHouseholdHead(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var household = getCharacterHousehold(characterId);
            if (!household || !household.members) return null;

            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].isHead) {
                    return _getCharacterById(household.members[i].characterId);
                }
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. CONSANGUINITY ACCESSORS
    // =========================================================================

    /**
     * Gets the consanguinity relationship between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {Object} { degree: string, closeness: number } or null
     */
    function getConsanguinity(charId1, charId2) {
        if (_processing) return null;
        _processing = true;

        try {
            if (charId1 === charId2) {
                return { degree: 'Self', closeness: 0 };
            }

            var char1 = _getCharacterById(charId1);
            var char2 = _getCharacterById(charId2);
            if (!char1 || !char2) return null;

            // Check parent-child
            if (char1.fatherId === charId2 || char1.motherId === charId2) {
                return { degree: 'Parent', closeness: 1 };
            }
            if (char2.fatherId === charId1 || char2.motherId === charId1) {
                return { degree: 'Child', closeness: 1 };
            }

            // Check siblings
            if (areSiblings(charId1, charId2, true, true)) {
                return { degree: 'Sibling', closeness: 2 };
            }

            // Check grandparents
            var grandparents1 = getGrandparents(charId1, 1);
            for (var i = 0; i < grandparents1.length; i++) {
                if (grandparents1[i].id === charId2) {
                    return { degree: 'Grandparent', closeness: 2 };
                }
            }

            var grandparents2 = getGrandparents(charId2, 1);
            for (var i = 0; i < grandparents2.length; i++) {
                if (grandparents2[i].id === charId1) {
                    return { degree: 'Grandchild', closeness: 2 };
                }
            }

            // Check aunts/uncles
            var auntsUncles = getAuntsAndUncles(charId1);
            for (var i = 0; i < auntsUncles.length; i++) {
                if (auntsUncles[i].character.id === charId2) {
                    return { degree: auntsUncles[i].type === 'uncle' ? 'Uncle' : 'Aunt', closeness: 3 };
                }
            }

            // Check nieces/nephews
            var niecesNephews = getNiecesAndNephews(charId1);
            for (var i = 0; i < niecesNephews.length; i++) {
                if (niecesNephews[i].character.id === charId2) {
                    return { degree: niecesNephews[i].type === 'nephew' ? 'Nephew' : 'Niece', closeness: 3 };
                }
            }

            // Check cousins (first cousins)
            var cousins = getCousins(charId1);
            for (var i = 0; i < cousins.length; i++) {
                if (cousins[i].id === charId2) {
                    return { degree: 'Cousin', closeness: 4 };
                }
            }

            // Check in-laws
            var spouse = getCurrentSpouse(charId1);
            if (spouse && spouse.id === charId2) {
                return { degree: 'Spouse', closeness: 1 };
            }

            return { degree: 'Unrelated', closeness: 99 };
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets a human-readable relationship description
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {string} Relationship description
     */
    function getRelationshipDescription(charId1, charId2) {
        if (_processing) return 'Unknown';
        _processing = true;

        try {
            var consanguinity = getConsanguinity(charId1, charId2);
            if (!consanguinity) return 'Unknown';

            var degree = consanguinity.degree;

            // Add gender-specific details
            if (degree === 'Parent') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var parents = getParents(charId1);
                    if (parents.father && parents.father.id === charId2) return 'Father';
                    if (parents.mother && parents.mother.id === charId2) return 'Mother';
                }
            }

            if (degree === 'Child') {
                var char1 = _getCharacterById(charId1);
                if (char1) {
                    var children = getAllChildren(charId2);
                    for (var i = 0; i < children.length; i++) {
                        if (children[i].character.id === charId1) {
                            if (children[i].type === 'adopted') return 'Adopted Child';
                            if (charId2.gender === 'male') return 'Son';
                            if (charId2.gender === 'female') return 'Daughter';
                            return 'Child';
                        }
                    }
                }
            }

            if (degree === 'Grandparent') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var grandparents = getGrandparents(charId1, 1);
                    for (var i = 0; i < grandparents.length; i++) {
                        if (grandparents[i].id === charId2) {
                            if (char2.gender === 'male') return 'Grandfather';
                            if (char2.gender === 'female') return 'Grandmother';
                            return 'Grandparent';
                        }
                    }
                }
            }

            if (degree === 'Grandchild') {
                var char1 = _getCharacterById(charId1);
                if (char1) {
                    var grandchildren = getGrandchildren(charId2);
                    for (var i = 0; i < grandchildren.length; i++) {
                        if (grandchildren[i].id === charId1) {
                            if (char1.gender === 'male') return 'Grandson';
                            if (char1.gender === 'female') return 'Granddaughter';
                            return 'Grandchild';
                        }
                    }
                }
            }

            if (degree === 'Sibling') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var siblings = getSiblings(charId1, true, true);
                    for (var i = 0; i < siblings.length; i++) {
                        if (siblings[i].character.id === charId2) {
                            if (siblings[i].type === 'half') {
                                return 'Half-' + (char2.gender === 'male' ? 'Brother' : 'Sister');
                            }
                            if (siblings[i].type === 'adopted') {
                                return 'Adopted ' + (char2.gender === 'male' ? 'Brother' : 'Sister');
                            }
                            return char2.gender === 'male' ? 'Brother' : 'Sister';
                        }
                    }
                }
            }

            if (degree === 'Uncle' || degree === 'Aunt') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var auntsUncles = getAuntsAndUncles(charId1);
                    for (var i = 0; i < auntsUncles.length; i++) {
                        if (auntsUncles[i].character.id === charId2) {
                            var prefix = auntsUncles[i].relation === 'paternal' ? 'Paternal ' : 'Maternal ';
                            return prefix + degree;
                        }
                    }
                }
            }

            if (degree === 'Nephew' || degree === 'Nieace') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var niecesNephews = getNiecesAndNephews(charId1);
                    for (var i = 0; i < niecesNephews.length; i++) {
                        if (niecesNephews[i].character.id === charId2) {
                            var prefix = niecesNephews[i].relation === 'paternal' ? 'Paternal ' : 'Maternal ';
                            return prefix + degree;
                        }
                    }
                }
            }

            if (degree === 'Cousin') {
                var char2 = _getCharacterById(charId2);
                if (char2) {
                    var grandparents1 = getGrandparents(charId1, 1);
                    var grandparents2 = getGrandparents(charId2, 1);

                    for (var i = 0; i < grandparents1.length; i++) {
                        for (var j = 0; j < grandparents2.length; j++) {
                            if (grandparents1[i].id === grandparents2[j].id) {
                                var prefix = grandparents1[i].gender === 'male' ? 'Paternal ' : 'Maternal ';
                                return prefix + 'Cousin';
                            }
                        }
                    }
                }
            }

            if (degree === 'Spouse') {
                var spouse = getCurrentSpouse(charId1);
                if (spouse && spouse.id === charId2) {
                    var char2 = _getCharacterById(charId2);
                    if (char2) {
                        if (char2.gender === 'male') return 'Husband';
                        if (char2.gender === 'female') return 'Wife';
                        return 'Spouse';
                    }
                }
            }

            return degree;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the consanguinity degree (closeness) between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {number} Closeness degree (0 = self, 1 = parent/child/spouse, 2 = sibling, etc.)
     */
    function getConsanguinityDegree(charId1, charId2) {
        if (_processing) return 99;
        _processing = true;

        try {
            var consanguinity = getConsanguinity(charId1, charId2);
            if (!consanguinity) return 99;
            return consanguinity.closeness;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. FAMILY STATISTICS
    // =========================================================================

    /**
     * Gets family statistics for a character
     * @param {string} characterId - Character ID
     * @returns {Object} Family statistics
     */
    function getFamilyStatistics(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return null;

            var parents = getParents(characterId);
            var children = getAllChildren(characterId, true);
            var siblings = getSiblings(characterId, true, true);
            var grandchildren = getGrandchildren(characterId, true);

            var livingChildren = children.filter(function(c) { return !c.character.isDeceased; });
            var livingSiblings = siblings.filter(function(s) { return !s.character.isDeceased; });
            var livingGrandchildren = grandchildren.filter(function(g) { return !g.isDeceased; });

            var spouses = getSpouses(characterId, true);
            var currentSpouse = spouses.length > 0 ? spouses[0].character : null;

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
                    biological: children.filter(function(c) { return c.type === 'biological'; }).length,
                    adopted: children.filter(function(c) { return c.type === 'adopted'; }).length,
                    eldest: getEldestChild(characterId, true, true),
                    youngest: getYoungestChild(characterId, true, true)
                },
                siblings: {
                    total: siblings.length,
                    living: livingSiblings.length,
                    full: siblings.filter(function(s) { return s.type === 'full'; }).length,
                    half: siblings.filter(function(s) { return s.type === 'half'; }).length,
                    adopted: siblings.filter(function(s) { return s.type === 'adopted'; }).length,
                    eldest: getEldestSibling(characterId, true, true),
                    youngest: getYoungestSibling(characterId, true, true)
                },
                grandchildren: {
                    total: grandchildren.length,
                    living: livingGrandchildren.length
                },
                spouse: currentSpouse ? {
                    character: currentSpouse,
                    marriageYear: spouses[0]?.startYear || null
                } : null,
                household: getCharacterHousehold(characterId),
                isOrphan: isOrphan(characterId, true),
                hasChildren: hasChildren(characterId, true, false),
                totalFamilyMembers: 1 + children.length + siblings.length + grandchildren.length
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.FamilyAccessors = {
        // Parent accessors
        getFather: getFather,
        getMother: getMother,
        getParents: getParents,
        getAllParents: getAllParents,
        hasParents: hasParents,
        isOrphan: isOrphan,

        // Child accessors
        getBiologicalChildren: getBiologicalChildren,
        getAdoptedChildren: getAdoptedChildren,
        getAllChildren: getAllChildren,
        getLivingChildrenCount: getLivingChildrenCount,
        getTotalChildrenCount: getTotalChildrenCount,
        hasChildren: hasChildren,
        getEldestChild: getEldestChild,
        getYoungestChild: getYoungestChild,

        // Sibling accessors
        getSiblings: getSiblings,
        getFullSiblings: getFullSiblings,
        getHalfSiblings: getHalfSiblings,
        getEldestSibling: getEldestSibling,
        getYoungestSibling: getYoungestSibling,
        areSiblings: areSiblings,

        // Grandparent accessors
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,

        // Extended family
        getAuntsAndUncles: getAuntsAndUncles,
        getCousins: getCousins,
        getNiecesAndNephews: getNiecesAndNephews,

        // In-law accessors
        getSpouses: getSpouses,
        getCurrentSpouse: getCurrentSpouse,
        getSiblingsInLaw: getSiblingsInLaw,

        // Household accessors
        getCharacterHousehold: getCharacterHousehold,
        getHouseholdFamilyMembers: getHouseholdFamilyMembers,
        getHouseholdHead: getHouseholdHead,

        // Consanguinity
        getConsanguinity: getConsanguinity,
        getRelationshipDescription: getRelationshipDescription,
        getConsanguinityDegree: getConsanguinityDegree,

        // Statistics
        getFamilyStatistics: getFamilyStatistics
    };

    // Legacy aliases for backward compatibility
    window.getFather = getFather;
    window.getMother = getMother;
    window.getParents = getParents;
    window.getChildren = getAllChildren;
    window.getSiblings = getSiblings;
    window.getGrandparents = getGrandparents;
    window.getGrandchildren = getGrandchildren;
    window.getCurrentSpouse = getCurrentSpouse;
    window.getCharacterHousehold = getCharacterHousehold;
    window.getRelationshipDescription = getRelationshipDescription;
    window.getConsanguinityDegree = getConsanguinityDegree;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyAccessors;
    }

})();