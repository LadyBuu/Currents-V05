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
 * SEMANTIC RULES:
 *   - Missing/invalid character → null or []
 *   - Pre-birth / impossible chronology → null
 *   - Deceased filtered only when explicitly requested
 *   - Adopted filtered only when explicitly excluded
 *   - Sibling sort: unknown birth years last
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-accessors: getCharacterById is required. Ensure accessors.js is loaded.');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('family-accessors: getCharacters is required. Ensure accessors.js is loaded.');
        }
        return window.getCharacters();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        throw new Error('family-accessors: getCurrentYearSafe is required. Ensure time.js is loaded.');
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        throw new Error('family-accessors: calculateAge is required. Ensure time.js is loaded.');
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    /**
     * Sort comparator for entities with birthYear. Unknown birth years sort last.
     * @private
     */
    function _compareBirthYear(a, b) {
        var aYear = a && a.birthYear;
        var bYear = b && b.birthYear;
        if (aYear == null && bYear == null) return 0;
        if (aYear == null) return 1;
        if (bYear == null) return -1;
        return aYear - bYear;
    }

    /**
     * Deduplicate an array of characters by ID, preserving first occurrence.
     * @private
     */
    function _dedupeById(list) {
        var seen = {};
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) continue;
            var id = item.id || item.character && item.character.id;
            if (!id || seen[id]) continue;
            seen[id] = true;
            out.push(item);
        }
        return out;
    }

    // =========================================================================
    // 3. PARENT ACCESSORS
    // =========================================================================

    /**
     * Gets the father of a character.
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getFather(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.fatherId) return null;
        return _getCharacterById(character.fatherId);
    }

    /**
     * Gets the mother of a character.
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getMother(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.motherId) return null;
        return _getCharacterById(character.motherId);
    }

    /**
     * Gets both parents of a character.
     * @param {string} characterId
     * @returns {{father: Object|null, mother: Object|null}}
     */
    function getParents(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return { father: null, mother: null };
        return {
            father: character.fatherId ? _getCharacterById(character.fatherId) : null,
            mother: character.motherId ? _getCharacterById(character.motherId) : null
        };
    }

    /**
     * Gets all parents of a character (biological + optionally adoptive).
     * @param {string} characterId
     * @param {boolean} includeAdoptive - default false
     * @returns {Array} Array of { character, type, biological, ... }
     */
    function getAllParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var parents = [];

        if (character.fatherId) {
            var father = _getCharacterById(character.fatherId);
            if (father) parents.push({ character: father, type: 'father', biological: true });
        }
        if (character.motherId) {
            var mother = _getCharacterById(character.motherId);
            if (mother) parents.push({ character: mother, type: 'mother', biological: true });
        }

        if (includeAdoptive && character.adoptedParents) {
            for (var i = 0; i < character.adoptedParents.length; i++) {
                var ap = character.adoptedParents[i];
                if (ap.status === 'ended') continue;
                var parent = _getCharacterById(ap.parentId);
                if (!parent) continue;
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

        return parents;
    }

    /**
     * Checks if a character has parents.
     * @param {string} characterId
     * @param {boolean} includeAdoptive - default false
     * @returns {boolean}
     */
    function hasParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return false;

        if (character.fatherId || character.motherId) return true;

        if (includeAdoptive && character.adoptedParents) {
            for (var i = 0; i < character.adoptedParents.length; i++) {
                if (character.adoptedParents[i].status !== 'ended') return true;
            }
        }
        return false;
    }

    /**
     * Checks if a character is an orphan (no living parents).
     * @param {string} characterId
     * @param {boolean} includeAdoptive - default false
     * @returns {boolean}
     */
    function isOrphan(characterId, includeAdoptive) {
        var parents = getAllParents(characterId, includeAdoptive === true);
        for (var i = 0; i < parents.length; i++) {
            var parent = parents[i].character;
            if (parent && !parent.isDeceased) return false;
        }
        return true;
    }

    // =========================================================================
    // 4. CHILD ACCESSORS
    // =========================================================================

    /**
     * Gets all biological children of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array}
     */
    function getBiologicalChildren(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
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
    }

    /**
     * Gets all adopted children of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array} Array of { character, adoptionType, adoptionYear, notes }
     */
    function getAdoptedChildren(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var result = [];
        if (!character.adoptedChildren) return result;

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
        return result;
    }

    /**
     * Gets all children (biological + adopted) of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array} Array of { character, type, birthYear, ... }
     */
    function getAllChildren(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var result = [];
        var seenIds = {};

        var biological = getBiologicalChildren(characterId, includeDeceased);
        for (var i = 0; i < biological.length; i++) {
            var b = biological[i];
            if (seenIds[b.id]) continue;
            seenIds[b.id] = true;
            result.push({
                character: b,
                type: 'biological',
                birthYear: b.birthYear
            });
        }

        var adopted = getAdoptedChildren(characterId, includeDeceased);
        for (var j = 0; j < adopted.length; j++) {
            var a = adopted[j];
            if (seenIds[a.character.id]) continue;
            seenIds[a.character.id] = true;
            result.push({
                character: a.character,
                type: 'adopted',
                adoptionType: a.adoptionType,
                adoptionYear: a.adoptionYear,
                birthYear: a.character.birthYear
            });
        }

        result.sort(function(x, y) {
            return _compareBirthYear(x.character, y.character);
        });

        return result;
    }

    /**
     * Gets living children count.
     * @param {string} characterId
     * @param {boolean} includeAdopted - default true
     * @returns {number}
     */
    function getLivingChildrenCount(characterId, includeAdopted) {
        includeAdopted = includeAdopted !== false;
        var all = getAllChildren(characterId, false);
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            if (!includeAdopted && all[i].type === 'adopted') continue;
            if (!all[i].character.isDeceased) count++;
        }
        return count;
    }

    /**
     * Gets total children count.
     * @param {string} characterId
     * @param {boolean} includeAdopted - default true
     * @param {boolean} includeDeceased - default true
     * @returns {number}
     */
    function getTotalChildrenCount(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        includeDeceased = includeDeceased !== false;
        var all = getAllChildren(characterId, includeDeceased);
        if (includeAdopted) return all.length;
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            if (all[i].type === 'biological') count++;
        }
        return count;
    }

    /**
     * Checks if a character has children.
     * @param {string} characterId
     * @param {boolean} includeAdopted - default true
     * @param {boolean} includeDeceased - default false
     * @returns {boolean}
     */
    function hasChildren(characterId, includeAdopted, includeDeceased) {
        return getTotalChildrenCount(characterId, includeAdopted, includeDeceased) > 0;
    }

    /**
     * Gets the eldest child.
     * @param {string} characterId
     * @param {boolean} includeAdopted - default true
     * @param {boolean} includeDeceased - default false
     * @returns {Object|null}
     */
    function getEldestChild(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        var children = getAllChildren(characterId, includeDeceased === true);
        if (!includeAdopted) {
            children = children.filter(function(c) { return c.type === 'biological'; });
        }
        if (children.length === 0) return null;
        // Already sorted by birthYear ascending, unknown last
        var withYear = children.filter(function(c) { return c.character.birthYear != null; });
        if (withYear.length > 0) return withYear[0].character;
        return children[0].character;
    }

    /**
     * Gets the youngest child.
     * @param {string} characterId
     * @param {boolean} includeAdopted - default true
     * @param {boolean} includeDeceased - default false
     * @returns {Object|null}
     */
    function getYoungestChild(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        var children = getAllChildren(characterId, includeDeceased === true);
        if (!includeAdopted) {
            children = children.filter(function(c) { return c.type === 'biological'; });
        }
        if (children.length === 0) return null;
        var withYear = children.filter(function(c) { return c.character.birthYear != null; });
        if (withYear.length > 0) return withYear[withYear.length - 1].character;
        return children[children.length - 1].character;
    }

    // =========================================================================
    // 5. SIBLING ACCESSORS
    // =========================================================================

    /**
     * Gets all siblings of a character.
     * @param {string} characterId
     * @param {boolean} includeHalfSiblings - default true
     * @param {boolean} includeDeceased - default false
     * @param {boolean} includeAdopted - default true
     * @returns {Array} Array of { character, type, sameFather, sameMother, ... }
     */
    function getSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        includeHalfSiblings = includeHalfSiblings !== false;
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var character = _getCharacterById(characterId);
        if (!character) return [];

        var allChars = _getCharacters();
        var siblings = [];
        var seenIds = {};

        // Full siblings
        for (var i = 0; i < allChars.length; i++) {
            var s = allChars[i];
            if (s.id === characterId) continue;
            if (!includeDeceased && s.isDeceased) continue;

            var sameFather = character.fatherId && s.fatherId && character.fatherId === s.fatherId;
            var sameMother = character.motherId && s.motherId && character.motherId === s.motherId;

            if (sameFather && sameMother) {
                if (!seenIds[s.id]) {
                    seenIds[s.id] = true;
                    siblings.push({
                        character: s,
                        type: 'full',
                        sameFather: true,
                        sameMother: true
                    });
                }
            }
        }

        // Half siblings
        if (includeHalfSiblings) {
            for (var j = 0; j < allChars.length; j++) {
                var h = allChars[j];
                if (h.id === characterId) continue;
                if (seenIds[h.id]) continue;
                if (!includeDeceased && h.isDeceased) continue;

                var sharedFather = character.fatherId && h.fatherId && character.fatherId === h.fatherId;
                var sharedMother = character.motherId && h.motherId && character.motherId === h.motherId;

                if (sharedFather || sharedMother) {
                    seenIds[h.id] = true;
                    siblings.push({
                        character: h,
                        type: 'half',
                        sameFather: !!sharedFather,
                        sameMother: !!sharedMother
                    });
                }
            }
        }

        // Adopted siblings (share an adoptive parent)
        if (includeAdopted) {
            var adoptiveParents = getAllParents(characterId, true).filter(function(p) {
                return !p.biological;
            });
            for (var k = 0; k < adoptiveParents.length; k++) {
                var ap = adoptiveParents[k];
                var apChildren = getAllChildren(ap.character.id, includeDeceased);
                for (var m = 0; m < apChildren.length; m++) {
                    var sib = apChildren[m];
                    if (sib.character.id === characterId) continue;
                    if (seenIds[sib.character.id]) continue;
                    if (sib.type !== 'adopted') continue;
                    if (!includeDeceased && sib.character.isDeceased) continue;
                    seenIds[sib.character.id] = true;
                    siblings.push({
                        character: sib.character,
                        type: 'adopted',
                        sameFather: false,
                        sameMother: false,
                        adoptionType: sib.adoptionType || 'legal'
                    });
                }
            }
        }

        siblings.sort(function(x, y) {
            return _compareBirthYear(x.character, y.character);
        });

        return siblings;
    }

    /**
     * Gets full siblings (same father AND mother).
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array}
     */
    function getFullSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, false, includeDeceased === true, false)
            .map(function(s) { return s.character; });
    }

    /**
     * Gets half-siblings (share exactly one parent).
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array}
     */
    function getHalfSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, true, includeDeceased === true, false)
            .filter(function(s) { return s.type === 'half'; })
            .map(function(s) { return s.character; });
    }

    /**
     * Gets the eldest sibling.
     * @param {string} characterId
     * @param {boolean} includeHalfSiblings - default false
     * @param {boolean} includeDeceased - default false
     * @returns {Object|null}
     */
    function getEldestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        var withYear = siblings.filter(function(s) { return s.character.birthYear != null; });
        if (withYear.length > 0) return withYear[0].character;
        return siblings[0].character;
    }

    /**
     * Gets the youngest sibling.
     * @param {string} characterId
     * @param {boolean} includeHalfSiblings - default false
     * @param {boolean} includeDeceased - default false
     * @returns {Object|null}
     */
    function getYoungestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        var withYear = siblings.filter(function(s) { return s.character.birthYear != null; });
        if (withYear.length > 0) return withYear[withYear.length - 1].character;
        return siblings[siblings.length - 1].character;
    }

    /**
     * Checks if two characters are siblings.
     * @param {string} charId1
     * @param {string} charId2
     * @param {boolean} includeHalfSiblings - default true
     * @param {boolean} includeAdopted - default true
     * @returns {boolean}
     */
    function areSiblings(charId1, charId2, includeHalfSiblings, includeAdopted) {
        if (!charId1 || !charId2 || charId1 === charId2) return false;
        var siblings = getSiblings(charId1, includeHalfSiblings !== false, true, includeAdopted !== false);
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i].character.id === charId2) return true;
        }
        return false;
    }

    // =========================================================================
    // 6. GRANDPARENT ACCESSORS
    // =========================================================================

    /**
     * Gets grandparents of a character.
     * Note: generation parameter is accepted for API compatibility but
     * currently only generation 1 (grandparents) is fully supported.
     * 
     * @param {string} characterId
     * @param {number} generation - 0 = parents, 1 = grandparents (default 1)
     * @param {boolean} includeAdoptive - default false
     * @returns {Array}
     */
    function getGrandparents(characterId, generation, includeAdoptive) {
        generation = (generation === undefined || generation === null) ? 1 : generation;
        includeAdoptive = includeAdoptive === true;

        if (generation === 0) {
            var parents = getAllParents(characterId, includeAdoptive);
            return parents.map(function(p) { return p.character; });
        }

        if (generation !== 1) {
            // Only generation 1 is implemented. Higher generations return [].
            return [];
        }

        var parents = getAllParents(characterId, includeAdoptive);
        var grandparents = [];
        for (var i = 0; i < parents.length; i++) {
            var parent = parents[i].character;
            if (!parent) continue;
            var parentParents = getAllParents(parent.id, includeAdoptive);
            for (var j = 0; j < parentParents.length; j++) {
                grandparents.push(parentParents[j].character);
            }
        }
        return _dedupeById(grandparents);
    }

    /**
     * Gets grandchildren of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @param {boolean} includeAdopted - default true
     * @returns {Array}
     */
    function getGrandchildren(characterId, includeDeceased, includeAdopted) {
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var children = getAllChildren(characterId, includeDeceased);
        var grandchildren = [];
        for (var i = 0; i < children.length; i++) {
            var childEntry = children[i];
            if (!includeAdopted && childEntry.type === 'adopted') continue;
            var childChildren = getAllChildren(childEntry.character.id, includeDeceased);
            for (var j = 0; j < childChildren.length; j++) {
                var gcEntry = childChildren[j];
                if (!includeAdopted && gcEntry.type === 'adopted') continue;
                grandchildren.push(gcEntry.character);
            }
        }
        return _dedupeById(grandchildren);
    }

    // =========================================================================
    // 7. EXTENDED FAMILY ACCESSORS
    // =========================================================================

    /**
     * Gets aunts and uncles of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array} Array of { character, relation, type }
     */
    function getAuntsAndUncles(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var parents = getParents(characterId);
        var result = [];

        function collect(parentObj, relation) {
            if (!parentObj) return;
            var parentSiblings = getSiblings(parentObj.id, true, includeDeceased, false);
            for (var i = 0; i < parentSiblings.length; i++) {
                var sib = parentSiblings[i].character;
                var isMale = sib.gender === 'male';
                var isFemale = sib.gender === 'female';
                var type = isMale ? 'uncle' : (isFemale ? 'aunt' : 'aunt-or-uncle');
                result.push({
                    character: sib,
                    relation: relation,
                    type: type
                });
            }
        }

        collect(parents.father, 'paternal');
        collect(parents.mother, 'maternal');

        return _dedupeById(result.map(function(r) {
            return { id: r.character.id, character: r.character, relation: r.relation, type: r.type };
        }));
    }

    /**
     * Gets cousins of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @param {number} degree - default 1
     * @returns {Array}
     */
    function getCousins(characterId, includeDeceased, degree) {
        includeDeceased = includeDeceased === true;
        degree = (degree === undefined || degree === null) ? 1 : degree;

        if (degree !== 1) {
            // Only first cousins implemented; higher degrees would require graph walking
            return [];
        }

        var auntsUncles = getAuntsAndUncles(characterId, includeDeceased);
        var cousins = [];
        for (var i = 0; i < auntsUncles.length; i++) {
            var au = auntsUncles[i].character;
            var auChildren = getAllChildren(au.id, includeDeceased);
            for (var j = 0; j < auChildren.length; j++) {
                var c = auChildren[j].character;
                if (c.id !== characterId) cousins.push(c);
            }
        }
        return _dedupeById(cousins);
    }

    /**
     * Gets nieces and nephews of a character.
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array} Array of { character, through, type }
     */
    function getNiecesAndNephews(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var siblings = getSiblings(characterId, true, includeDeceased, false);
        var result = [];

        for (var i = 0; i < siblings.length; i++) {
            var sib = siblings[i].character;
            var sibChildren = getAllChildren(sib.id, includeDeceased);
            for (var j = 0; j < sibChildren.length; j++) {
                var child = sibChildren[j].character;
                if (!child) continue;
                var isMale = child.gender === 'male';
                var isFemale = child.gender === 'female';
                var type = isMale ? 'nephew' : (isFemale ? 'niece' : 'nibling');
                result.push({
                    character: child,
                    through: sib,
                    type: type
                });
            }
        }
        return result;
    }

    // =========================================================================
    // 8. IN-LAW ACCESSORS
    // =========================================================================

    /**
     * Gets spouse(s) of a character.
     * @param {string} characterId
     * @param {boolean} activeOnly - default true
     * @returns {Array} Array of { character, relationship, status, startYear, endYear }
     */
    function getSpouses(characterId, activeOnly) {
        activeOnly = activeOnly !== false;
        var character = _getCharacterById(characterId);
        if (!character) return [];
        if (!character.relationships) return [];

        var spouses = [];
        for (var i = 0; i < character.relationships.length; i++) {
            var rel = character.relationships[i];
            if (activeOnly && rel.status !== 'ongoing' && rel.status !== 'active') continue;

            var relType = rel.type || (rel.details && rel.details.type);
            var isMarriage = relType === 'marriage'
                || relType === 'committed'
                || relType === 'romance';
            if (!isMarriage) continue;

            var spouseId = rel.participantB || rel.partnerId;
            if (spouseId === characterId) spouseId = rel.participantA;
            var spouse = _getCharacterById(spouseId);
            if (!spouse) continue;

            spouses.push({
                character: spouse,
                relationship: rel,
                status: rel.status,
                startYear: rel.startYear || (rel.details && rel.details.startYear),
                endYear: rel.endYear || (rel.details && rel.details.endYear)
            });
        }
        return spouses;
    }

    /**
     * Gets the current spouse (first active).
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getCurrentSpouse(characterId) {
        var spouses = getSpouses(characterId, true);
        if (spouses.length === 0) return null;
        return spouses[0].character;
    }

    /**
     * Gets siblings-in-law of a character (siblings of current spouse).
     * @param {string} characterId
     * @param {boolean} includeDeceased - default false
     * @returns {Array}
     */
    function getSiblingsInLaw(characterId, includeDeceased) {
        var spouse = getCurrentSpouse(characterId);
        if (!spouse) return [];
        return getSiblings(spouse.id, true, includeDeceased === true, false)
            .map(function(s) { return s.character; });
    }

    // =========================================================================
    // 9. HOUSEHOLD ACCESSORS
    // =========================================================================

    /**
     * Gets the household of a character.
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getCharacterHousehold(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        var householdId = character.household || character.householdId;
        if (!householdId) return null;

        if (typeof window.getHouseholdById === 'function') {
            return window.getHouseholdById(householdId);
        }
        if (typeof window.getHousehold === 'function') {
            return window.getHousehold(householdId);
        }
        return null;
    }

    /**
     * Gets family members in a character's household.
     * @param {string} characterId
     * @param {boolean} includeNonFamily - default false
     * @returns {Array} Array of { character, role, isHead, type, joinedYear }
     */
    function getHouseholdFamilyMembers(characterId, includeNonFamily) {
        includeNonFamily = includeNonFamily === true;
        var household = getCharacterHousehold(characterId);
        if (!household || !household.members) return [];

        var members = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var char = _getCharacterById(member.characterId);
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
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getHouseholdHead(characterId) {
        var household = getCharacterHousehold(characterId);
        if (!household || !household.members) return null;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                return _getCharacterById(household.members[i].characterId);
            }
        }
        return null;
    }

    // =========================================================================
    // 10. RELATIONSHIP DESCRIPTION
    // =========================================================================

    /**
     * Gets a structured relationship descriptor between two characters.
     * Returns { degree, closeness } or null.
     * 
     * Degrees: Self, Parent, Child, Sibling, Grandparent, Grandchild,
     *          Uncle/Aunt, Nephew/Niece, Cousin, Spouse, Unrelated
     * Closeness: 0 = self, 1 = immediate (parent/child/spouse), etc.
     * 
     * @param {string} charId1
     * @param {string} charId2
     * @returns {Object|null}
     */
    function getKinship(charId1, charId2) {
        if (!charId1 || !charId2) return null;
        if (charId1 === charId2) return { degree: 'Self', closeness: 0 };

        var char1 = _getCharacterById(charId1);
        var char2 = _getCharacterById(charId2);
        if (!char1 || !char2) return null;

        // Parent / child
        if (char1.fatherId === charId2 || char1.motherId === charId2) {
            return { degree: 'Parent', closeness: 1 };
        }
        if (char2.fatherId === charId1 || char2.motherId === charId1) {
            return { degree: 'Child', closeness: 1 };
        }

        // Spouse
        var spouse = getCurrentSpouse(charId1);
        if (spouse && spouse.id === charId2) {
            return { degree: 'Spouse', closeness: 1 };
        }

        // Sibling
        if (areSiblings(charId1, charId2, true, true)) {
            return { degree: 'Sibling', closeness: 2 };
        }

        // Grandparent
        var gps1 = getGrandparents(charId1, 1);
        for (var i = 0; i < gps1.length; i++) {
            if (gps1[i].id === charId2) return { degree: 'Grandparent', closeness: 2 };
        }

        // Grandchild
        var gcs1 = getGrandchildren(charId1);
        for (var j = 0; j < gcs1.length; j++) {
            if (gcs1[j].id === charId2) return { degree: 'Grandchild', closeness: 2 };
        }

        // Aunt/Uncle
        var auntsUncles = getAuntsAndUncles(charId1);
        for (var k = 0; k < auntsUncles.length; k++) {
            if (auntsUncles[k].character.id === charId2) {
                var type = auntsUncles[k].type;
                var label = type === 'uncle' ? 'Uncle' : (type === 'aunt' ? 'Aunt' : 'UncleOrAunt');
                return { degree: label, closeness: 3 };
            }
        }

        // Niece/Nephew
        var niecesNephews = getNiecesAndNephews(charId1);
        for (var m = 0; m < niecesNephews.length; m++) {
            if (niecesNephews[m].character.id === charId2) {
                var nt = niecesNephews[m].type;
                var nlabel = nt === 'nephew' ? 'Nephew' : (nt === 'niece' ? 'Niece' : 'Nibling');
                return { degree: nlabel, closeness: 3 };
            }
        }

        // Cousin (first only)
        var cousins = getCousins(charId1, false, 1);
        for (var n = 0; n < cousins.length; n++) {
            if (cousins[n].id === charId2) return { degree: 'Cousin', closeness: 4 };
        }

        return { degree: 'Unrelated', closeness: 99 };
    }

    /**
     * Gets a human-readable relationship description.
     * NOTE: This is presentation and may eventually move to formatting.js.
     * @param {string} charId1
     * @param {string} charId2
     * @returns {string}
     */
    function getRelationshipDescription(charId1, charId2) {
        var k = getKinship(charId1, charId2);
        if (!k) return 'Unknown';

        var degree = k.degree;
        var other = _getCharacterById(charId2);

        switch (degree) {
            case 'Parent':
                if (other) {
                    var p = getParents(charId1);
                    if (p.father && p.father.id === charId2) return 'Father';
                    if (p.mother && p.mother.id === charId2) return 'Mother';
                }
                return 'Parent';

            case 'Child': {
                var children = getAllChildren(charId2);
                for (var i = 0; i < children.length; i++) {
                    if (children[i].character.id === charId1) {
                        if (children[i].type === 'adopted') return 'Adopted Child';
                        return 'Child';
                    }
                }
                return 'Child';
            }

            case 'Spouse':
                if (other) {
                    if (other.gender === 'male') return 'Husband';
                    if (other.gender === 'female') return 'Wife';
                }
                return 'Spouse';

            case 'Sibling': {
                var sibList = getSiblings(charId1, true, true, true);
                for (var j = 0; j < sibList.length; j++) {
                    if (sibList[j].character.id === charId2) {
                        var t = sibList[j].type;
                        if (t === 'half') return 'Half-Sibling';
                        if (t === 'adopted') return 'Adopted Sibling';
                        return 'Sibling';
                    }
                }
                return 'Sibling';
            }

            case 'Grandparent':
                if (other) {
                    if (other.gender === 'male') return 'Grandfather';
                    if (other.gender === 'female') return 'Grandmother';
                }
                return 'Grandparent';

            case 'Grandchild':
                if (other) {
                    if (other.gender === 'male') return 'Grandson';
                    if (other.gender === 'female') return 'Granddaughter';
                }
                return 'Grandchild';

            case 'Uncle':
            case 'Aunt': {
                var au = getAuntsAndUncles(charId1);
                for (var k2 = 0; k2 < au.length; k2++) {
                    if (au[k2].character.id === charId2) {
                        var prefix = au[k2].relation === 'paternal' ? 'Paternal ' : 'Maternal ';
                        return prefix + degree;
                    }
                }
                return degree;
            }

            case 'Nephew':
            case 'Niece': {
                var nn = getNiecesAndNephews(charId1);
                for (var k3 = 0; k3 < nn.length; k3++) {
                    if (nn[k3].character.id === charId2) {
                        return nn[k3].type === 'nephew' ? 'Nephew' : 'Niece';
                    }
                }
                return degree;
            }

            case 'Cousin':
                return 'Cousin';

            default:
                return degree;
        }
    }

    /**
     * Gets the closeness score for two characters.
     * @param {string} charId1
     * @param {string} charId2
     * @returns {number} Closeness (0 = self, 99 = unrelated)
     */
    function getConsanguinityDegree(charId1, charId2) {
        var k = getKinship(charId1, charId2);
        return k ? k.closeness : 99;
    }

    // =========================================================================
    // 11. FAMILY STATISTICS
    // =========================================================================

    /**
     * Gets family statistics for a character.
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getFamilyStatistics(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var parents = getParents(characterId);
        var children = getAllChildren(characterId, true);
        var siblings = getSiblings(characterId, true, true, true);
        var grandchildren = getGrandchildren(characterId, true);
        var spouses = getSpouses(characterId, true);

        var livingChildren = children.filter(function(c) { return !c.character.isDeceased; });
        var livingSiblings = siblings.filter(function(s) { return !s.character.isDeceased; });
        var livingGrandchildren = grandchildren.filter(function(g) { return !g.isDeceased; });

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
            spouse: spouses.length > 0 ? {
                character: spouses[0].character,
                marriageYear: spouses[0].startYear || null
            } : null,
            household: getCharacterHousehold(characterId),
            isOrphan: isOrphan(characterId, true),
            hasChildren: hasChildren(characterId, true, false)
        };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.FamilyAccessors = {
        // Parents
        getFather: getFather,
        getMother: getMother,
        getParents: getParents,
        getAllParents: getAllParents,
        hasParents: hasParents,
        isOrphan: isOrphan,

        // Children
        getBiologicalChildren: getBiologicalChildren,
        getAdoptedChildren: getAdoptedChildren,
        getAllChildren: getAllChildren,
        getLivingChildrenCount: getLivingChildrenCount,
        getTotalChildrenCount: getTotalChildrenCount,
        hasChildren: hasChildren,
        getEldestChild: getEldestChild,
        getYoungestChild: getYoungestChild,

        // Siblings
        getSiblings: getSiblings,
        getFullSiblings: getFullSiblings,
        getHalfSiblings: getHalfSiblings,
        getEldestSibling: getEldestSibling,
        getYoungestSibling: getYoungestSibling,
        areSiblings: areSiblings,

        // Grandparents
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,

        // Extended family
        getAuntsAndUncles: getAuntsAndUncles,
        getCousins: getCousins,
        getNiecesAndNephews: getNiecesAndNephews,

        // In-law
        getSpouses: getSpouses,
        getCurrentSpouse: getCurrentSpouse,
        getSiblingsInLaw: getSiblingsInLaw,

        // Household
        getCharacterHousehold: getCharacterHousehold,
        getHouseholdFamilyMembers: getHouseholdFamilyMembers,
        getHouseholdHead: getHouseholdHead,

        // Relationship descriptors
        getKinship: getKinship,
        getRelationshipDescription: getRelationshipDescription,
        getConsanguinityDegree: getConsanguinityDegree,

        // Statistics
        getFamilyStatistics: getFamilyStatistics
    };

    // Backward compatibility aliases
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

    // Deprecated alias — was named getConsanguinity, now getKinship
    window.getConsanguinity = getKinship;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyAccessors;
    }

})();