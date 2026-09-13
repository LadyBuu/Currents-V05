/**
 * =============================================================================
 * STILL WATERS - FAMILY ACCESSORS (js/core/family-accessors.js)
 * =============================================================================
 * 
 * PURE read-only accessors for family relationships.
 * NO system dependencies beyond core accessors.
 * NO UI. NO business logic. NO mutations. NO household semantics.
 * 
 * SCOPE:
 *   - Parent accessors
 *   - Child accessors
 *   - Sibling accessors
 *   - Grandparent / grandchild accessors
 *   - Extended family (aunts/uncles, cousins, nieces/nephews)
 *   - In-law accessors (spouses, siblings-in-law)
 *   - Kinship description
 * 
 * OUT OF SCOPE:
 *   - Household membership → household-queries.js
 *   - Family statistics aggregation → family-statistics.js
 *   - Relationship semantics (what counts as a "partner") → relationship-queries.js
 *   - Time calculations → time.js
 * 
 * SEMANTIC RULES:
 *   - Missing/invalid character → null (singular) or [] (collection).
 *   - Biological and adopted are independent facts, both preserved.
 *   - Siblings share a parent, not a "type". Adoptive siblings share an
 *     adoptive parent regardless of the other child's own type.
 *   - No silent normalization of caller input.
 *   - No presentation strings.
 * 
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js: getCharacterById, getCharacters
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireAccessors() {
        if (typeof window.getCharacterById !== 'function'
            || typeof window.getCharacters !== 'function') {
            throw new Error(
                'family-accessors.js: accessors.js must load first.'
            );
        }
    }

    function _getCharacterById(id) {
        _requireAccessors();
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        _requireAccessors();
        return window.getCharacters();
    }

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    /**
     * Sort comparator for entities with birthYear. Unknown birth years sort
     * last, preserving relative order among unknowns (stable sort).
     * @private
     */
    function _compareBirthYear(a, b) {
        var aYear = a && a.birthYear;
        var bYear = b && b.birthYear;
        var aMissing = (aYear === null || aYear === undefined);
        var bMissing = (bYear === null || bYear === undefined);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return aYear - bYear;
    }

    /**
     * Deduplicates a list of characters or character-wrapping entries by
     * the character's ID. Uses a Set (prototype-safe).
     * @private
     */
    function _dedupeById(list) {
        var seen = new Set();
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) continue;
            var id = item.id || (item.character && item.character.id);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(item);
        }
        return out;
    }

    // =========================================================================
    // 2. PARENT ACCESSORS
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
     */
    function getMother(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.motherId) return null;
        return _getCharacterById(character.motherId);
    }

    /**
     * Gets both biological parents.
     * @returns {{ father: Object|null, mother: Object|null }}
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
     * Gets all parents (biological + optionally adoptive).
     * Each entry includes flags for whether the relationship is biological
     * and/or adoptive, so callers can distinguish.
     * 
     * @param {string} characterId
     * @param {boolean} [includeAdoptive] - default false
     * @returns {Array<{ character, type, biological, adoptionType?, adoptionYear? }>}
     */
    function getAllParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var parents = [];

        if (character.fatherId) {
            var father = _getCharacterById(character.fatherId);
            if (father) {
                parents.push({
                    character: father,
                    type: 'father',
                    biological: true
                });
            }
        }
        if (character.motherId) {
            var mother = _getCharacterById(character.motherId);
            if (mother) {
                parents.push({
                    character: mother,
                    type: 'mother',
                    biological: true
                });
            }
        }

        if (includeAdoptive && Array.isArray(character.adoptedParents)) {
            for (var i = 0; i < character.adoptedParents.length; i++) {
                var ap = character.adoptedParents[i];
                if (ap.status === 'ended') continue;
                var parent = _getCharacterById(ap.parentId);
                if (!parent) continue;

                // Parent type: prefer explicit parentType. Otherwise map by
                // gender to 'father' / 'mother' / neutral 'parent'.
                var type;
                if (ap.parentType) {
                    type = ap.parentType;
                } else if (parent.gender === 'male') {
                    type = 'father';
                } else if (parent.gender === 'female') {
                    type = 'mother';
                } else {
                    type = 'parent';
                }

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
     * True if the character has any parents (biological, and optionally
     * adoptive).
     */
    function hasParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return false;

        if (character.fatherId || character.motherId) return true;

        if (includeAdoptive && Array.isArray(character.adoptedParents)) {
            for (var i = 0; i < character.adoptedParents.length; i++) {
                if (character.adoptedParents[i].status !== 'ended') return true;
            }
        }
        return false;
    }

    /**
     * True if the character has no living parents (biological, and
     * optionally adoptive).
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
    // 3. CHILD ACCESSORS
    // =========================================================================

    /**
     * Gets all biological children of a character.
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
     * Gets all adopted children (via the parent's adoptedChildren list).
     * @returns {Array<{ character, adoptionType, adoptionYear, notes }>}
     */
    function getAdoptedChildren(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var result = [];
        if (!Array.isArray(character.adoptedChildren)) return result;

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
     * Gets all children (biological + adopted).
     * 
     * A child who is both biological and adopted appears ONCE with both
     * flags set.
     * 
     * @returns {Array<{
     *   character,
     *   biological: boolean,
     *   adopted: boolean,
     *   birthYear,
     *   adoptionType?: string,
     *   adoptionYear?: number
     * }>}
     */
    function getAllChildren(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        // Map: childId -> merged record
        var byId = new Map();

        var biological = getBiologicalChildren(characterId, includeDeceased);
        for (var i = 0; i < biological.length; i++) {
            var b = biological[i];
            byId.set(b.id, {
                character: b,
                biological: true,
                adopted: false,
                birthYear: b.birthYear
            });
        }

        var adopted = getAdoptedChildren(characterId, includeDeceased);
        for (var j = 0; j < adopted.length; j++) {
            var a = adopted[j];
            var existing = byId.get(a.character.id);
            if (existing) {
                // Already in list as biological; add adopted flag
                existing.adopted = true;
                existing.adoptionType = a.adoptionType;
                existing.adoptionYear = a.adoptionYear;
            } else {
                byId.set(a.character.id, {
                    character: a.character,
                    biological: false,
                    adopted: true,
                    birthYear: a.character.birthYear,
                    adoptionType: a.adoptionType,
                    adoptionYear: a.adoptionYear
                });
            }
        }

        var result = [];
        byId.forEach(function(entry) { result.push(entry); });

        result.sort(function(x, y) {
            return _compareBirthYear(x.character, y.character);
        });

        return result;
    }

    /**
     * Number of living children (biological + optionally adopted).
     */
    function getLivingChildrenCount(characterId, includeAdopted) {
        includeAdopted = includeAdopted !== false;
        var all = getAllChildren(characterId, false);
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            if (!includeAdopted && !all[i].biological) continue;
            if (!all[i].character.isDeceased) count++;
        }
        return count;
    }

    /**
     * Total children count.
     */
    function getTotalChildrenCount(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        includeDeceased = includeDeceased !== false;
        var all = getAllChildren(characterId, includeDeceased);
        if (includeAdopted) return all.length;
        var count = 0;
        for (var i = 0; i < all.length; i++) {
            if (all[i].biological) count++;
        }
        return count;
    }

    function hasChildren(characterId, includeAdopted, includeDeceased) {
        return getTotalChildrenCount(characterId, includeAdopted, includeDeceased) > 0;
    }

    function getEldestChild(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        var children = getAllChildren(characterId, includeDeceased === true);
        if (!includeAdopted) {
            children = children.filter(function(c) { return c.biological; });
        }
        if (children.length === 0) return null;
        var withYear = children.filter(function(c) {
            return c.character.birthYear !== null && c.character.birthYear !== undefined;
        });
        if (withYear.length > 0) return withYear[0].character;
        return children[0].character;
    }

    function getYoungestChild(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        var children = getAllChildren(characterId, includeDeceased === true);
        if (!includeAdopted) {
            children = children.filter(function(c) { return c.biological; });
        }
        if (children.length === 0) return null;
        var withYear = children.filter(function(c) {
            return c.character.birthYear !== null && c.character.birthYear !== undefined;
        });
        if (withYear.length > 0) return withYear[withYear.length - 1].character;
        return children[children.length - 1].character;
    }

    // =========================================================================
    // 4. SIBLING ACCESSORS
    // =========================================================================

    /**
     * Gets all siblings of a character.
     * 
     * A sibling is anyone who shares at least one parent (biological or
     * adoptive) with this character.
     * 
     * Each result includes flags showing HOW the sibling relationship exists:
     *   - full: share both biological parents
     *   - half: share exactly one biological parent
     *   - adoptive: share an adoptive parent (possibly also biological)
     * 
     * If a sibling qualifies via multiple paths (e.g., full + adoptive),
     * the entry contains both.
     * 
     * @returns {Array<{
     *   character,
     *   full: boolean,
     *   half: boolean,
     *   adoptive: boolean,
     *   sameFather: boolean,
     *   sameMother: boolean
     * }>}
     */
    function getSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        includeHalfSiblings = includeHalfSiblings !== false;
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var character = _getCharacterById(characterId);
        if (!character) return [];

        var allChars = _getCharacters();
        var byId = new Map();

        function ensure(id) {
            if (!byId.has(id)) {
                byId.set(id, {
                    character: null,
                    full: false,
                    half: false,
                    adoptive: false,
                    sameFather: false,
                    sameMother: false
                });
            }
            return byId.get(id);
        }

        // Biological siblings
        for (var i = 0; i < allChars.length; i++) {
            var s = allChars[i];
            if (s.id === characterId) continue;
            if (!includeDeceased && s.isDeceased) continue;

            var sharedFather = character.fatherId
                && s.fatherId
                && character.fatherId === s.fatherId;
            var sharedMother = character.motherId
                && s.motherId
                && character.motherId === s.motherId;

            if (sharedFather && sharedMother) {
                var entry = ensure(s.id);
                entry.character = s;
                entry.full = true;
                entry.sameFather = true;
                entry.sameMother = true;
            } else if (includeHalfSiblings && (sharedFather || sharedMother)) {
                var entryH = ensure(s.id);
                entryH.character = s;
                entryH.half = true;
                entryH.sameFather = !!sharedFather;
                entryH.sameMother = !!sharedMother;
            }
        }

        // Adoptive siblings: children who share at least one adoptive parent
        // with this character. NOTE: the sibling is defined by the shared
        // adoptive parent, NOT by the sibling's own type.
        if (includeAdopted) {
            var myAdoptiveParents = getAllParents(characterId, true).filter(function(p) {
                return !p.biological;
            });

            for (var ap = 0; ap < myAdoptiveParents.length; ap++) {
                var parentId = myAdoptiveParents[ap].character.id;
                var coChildren = getAllChildren(parentId, includeDeceased);

                for (var c = 0; c < coChildren.length; c++) {
                    var co = coChildren[c];
                    if (co.character.id === characterId) continue;
                    if (!includeDeceased && co.character.isDeceased) continue;

                    var entryA = ensure(co.character.id);
                    entryA.character = co.character;
                    entryA.adoptive = true;
                    // Do not overwrite sameFather/sameMother flags from the
                    // biological detection above.
                }
            }
        }

        var result = [];
        byId.forEach(function(entry) {
            if (entry.character) result.push(entry);
        });

        result.sort(function(x, y) {
            return _compareBirthYear(x.character, y.character);
        });

        return result;
    }

    /**
     * Gets full siblings (share both biological parents).
     */
    function getFullSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, false, includeDeceased === true, false)
            .filter(function(s) { return s.full; })
            .map(function(s) { return s.character; });
    }

    /**
     * Gets half-siblings (share exactly one biological parent).
     */
    function getHalfSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, true, includeDeceased === true, false)
            .filter(function(s) { return s.half && !s.full; })
            .map(function(s) { return s.character; });
    }

    /**
     * Gets adoptive siblings (share an adoptive parent, regardless of
     * whether they're also biological).
     */
    function getAdoptiveSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, false, includeDeceased === true, true)
            .filter(function(s) { return s.adoptive; })
            .map(function(s) { return s.character; });
    }

    function getEldestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        var withYear = siblings.filter(function(s) {
            return s.character.birthYear !== null && s.character.birthYear !== undefined;
        });
        if (withYear.length > 0) return withYear[0].character;
        return siblings[0].character;
    }

    function getYoungestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        var withYear = siblings.filter(function(s) {
            return s.character.birthYear !== null && s.character.birthYear !== undefined;
        });
        if (withYear.length > 0) return withYear[withYear.length - 1].character;
        return siblings[siblings.length - 1].character;
    }

    function areSiblings(charId1, charId2, includeHalfSiblings, includeAdopted) {
        if (!charId1 || !charId2 || charId1 === charId2) return false;
        var siblings = getSiblings(
            charId1,
            includeHalfSiblings !== false,
            true,
            includeAdopted !== false
        );
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i].character.id === charId2) return true;
        }
        return false;
    }

    // =========================================================================
    // 5. GRANDPARENT ACCESSORS
    // =========================================================================

    /**
     * Gets grandparents of a character (two generations up).
     * 
     * @param {string} characterId
     * @param {boolean} [includeAdoptive] - default false
     * @returns {Array}
     */
    function getGrandparents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
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
     * Gets grandchildren of a character (two generations down).
     */
    function getGrandchildren(characterId, includeDeceased, includeAdopted) {
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var children = getAllChildren(characterId, includeDeceased);
        var grandchildren = [];

        for (var i = 0; i < children.length; i++) {
            var childEntry = children[i];
            if (!includeAdopted && !childEntry.biological) continue;
            var childChildren = getAllChildren(childEntry.character.id, includeDeceased);
            for (var j = 0; j < childChildren.length; j++) {
                var gcEntry = childChildren[j];
                if (!includeAdopted && !gcEntry.biological) continue;
                grandchildren.push(gcEntry.character);
            }
        }
        return _dedupeById(grandchildren);
    }

    // =========================================================================
    // 6. EXTENDED FAMILY
    // =========================================================================

    /**
     * Gets aunts and uncles of a character.
     * 
     * If someone is both a paternal AND maternal aunt/uncle, the entry
     * contains both relations. Otherwise one or the other.
     * 
     * @returns {Array<{
     *   character,
     *   relations: Array<'paternal'|'maternal'>,
     *   type: 'aunt' | 'uncle' | 'aunt-or-uncle'
     * }>}
     */
    function getAuntsAndUncles(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var parents = getParents(characterId);
        var byId = new Map();

        function collect(parentObj, relation) {
            if (!parentObj) return;
            var parentSiblings = getSiblings(parentObj.id, true, includeDeceased, false);
            for (var i = 0; i < parentSiblings.length; i++) {
                var sib = parentSiblings[i].character;
                var isMale = sib.gender === 'male';
                var isFemale = sib.gender === 'female';
                var type = isMale ? 'uncle' : (isFemale ? 'aunt' : 'aunt-or-uncle');

                var entry = byId.get(sib.id);
                if (!entry) {
                    entry = { character: sib, relations: [], type: type };
                    byId.set(sib.id, entry);
                }
                if (entry.relations.indexOf(relation) === -1) {
                    entry.relations.push(relation);
                }
            }
        }

        collect(parents.father, 'paternal');
        collect(parents.mother, 'maternal');

        var result = [];
        byId.forEach(function(e) { result.push(e); });
        return result;
    }

    /**
     * Gets first cousins of a character.
     * 
     * Only degree 1 is supported. Higher degrees return [] (not a
     * meaningful answer, but documented).
     * 
     * @param {number} [degree] - must be 1
     */
    function getCousins(characterId, includeDeceased, degree) {
        includeDeceased = includeDeceased === true;
        degree = (degree === undefined || degree === null) ? 1 : degree;

        if (degree !== 1) {
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
     * 
     * Deduplicated by child ID.
     * 
     * @returns {Array<{ character, through: Object, type }>}
     */
    function getNiecesAndNephews(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
        var siblings = getSiblings(characterId, true, includeDeceased, false);
        var byId = new Map();

        for (var i = 0; i < siblings.length; i++) {
            var sib = siblings[i].character;
            var sibChildren = getAllChildren(sib.id, includeDeceased);
            for (var j = 0; j < sibChildren.length; j++) {
                var child = sibChildren[j].character;
                if (!child) continue;

                var isMale = child.gender === 'male';
                var isFemale = child.gender === 'female';
                var type = isMale ? 'nephew' : (isFemale ? 'niece' : 'nibling');

                var entry = byId.get(child.id);
                if (!entry) {
                    entry = { character: child, through: [], type: type };
                    byId.set(child.id, entry);
                }
                entry.through.push(sib);
            }
        }

        var result = [];
        byId.forEach(function(e) { result.push(e); });
        return result;
    }

    // =========================================================================
    // 7. IN-LAW ACCESSORS
    // =========================================================================

    /**
     * Gets spouses of a character.
     * 
     * Semantics of "spouse": relationships whose type is one of
     * marriage, committed, or romance. This is a domain rule that could
     * eventually migrate to relationship-queries.js.
     * 
     * Year 0 is preserved in startYear/endYear.
     * 
     * @param {string} characterId
     * @param {boolean} [activeOnly] - default true
     * @returns {Array<{ character, relationship, status, startYear, endYear }>}
     */
    function getSpouses(characterId, activeOnly) {
        activeOnly = activeOnly !== false;
        var character = _getCharacterById(characterId);
        if (!character) return [];
        if (!Array.isArray(character.relationships)) return [];

        var spouses = [];
        for (var i = 0; i < character.relationships.length; i++) {
            var rel = character.relationships[i];

            if (activeOnly && rel.status !== 'ongoing' && rel.status !== 'active') {
                continue;
            }

            var relType = rel.type || (rel.details && rel.details.type);
            var isPartnerRel = relType === 'marriage'
                || relType === 'committed'
                || relType === 'romance';
            if (!isPartnerRel) continue;

            // Determine the other party
            var spouseId = rel.participantB;
            if (!spouseId && rel.partnerId) spouseId = rel.partnerId;
            if (spouseId === characterId) spouseId = rel.participantA;
            if (!spouseId || spouseId === characterId) continue;

            var spouse = _getCharacterById(spouseId);
            if (!spouse) continue;

            // Preserve year 0; only fall back when truly missing.
            var startYear = rel.startYear;
            if (startYear === undefined || startYear === null) {
                startYear = (rel.details && rel.details.startYear !== undefined)
                    ? rel.details.startYear
                    : null;
            }

            var endYear = rel.endYear;
            if (endYear === undefined || endYear === null) {
                endYear = (rel.details && rel.details.endYear !== undefined)
                    ? rel.details.endYear
                    : null;
            }

            spouses.push({
                character: spouse,
                relationship: rel,
                status: rel.status,
                startYear: startYear,
                endYear: endYear
            });
        }
        return spouses;
    }

    function getCurrentSpouse(characterId) {
        var spouses = getSpouses(characterId, true);
        if (spouses.length === 0) return null;
        return spouses[0].character;
    }

    function getSiblingsInLaw(characterId, includeDeceased) {
        var spouse = getCurrentSpouse(characterId);
        if (!spouse) return [];
        return getSiblings(spouse.id, true, includeDeceased === true, false)
            .map(function(s) { return s.character; });
    }

    // =========================================================================
    // 8. KINSHIP
    // =========================================================================

    /**
     * Gets a structured relationship descriptor between two characters.
     * 
     * Returns { degree, closeness } or null when inputs are invalid or
     * one party is missing.
     * 
     * Degrees: Self, Parent, Child, Sibling, Grandparent, Grandchild,
     *          Uncle, Aunt, UncleOrAunt, Nephew, Niece, Nibling,
     *          Cousin, Spouse, Unrelated
     * 
     * Closeness: 0 = self, 1 = immediate, 2 = sibling/grandparent/spouse,
     *            3 = aunt/uncle/niece/nephew, 4 = cousin, 99 = unrelated.
     * 
     * Note: this includes spouse, which is affinity, not consanguinity.
     * Use getKinshipCloseness for a UI sort score; do not use this as a
     * blood-relationship measure.
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

        // Grandparent / grandchild
        var gps = getGrandparents(charId1, false);
        for (var i = 0; i < gps.length; i++) {
            if (gps[i].id === charId2) return { degree: 'Grandparent', closeness: 2 };
        }
        var gcs = getGrandchildren(charId1);
        for (var j = 0; j < gcs.length; j++) {
            if (gcs[j].id === charId2) return { degree: 'Grandchild', closeness: 2 };
        }

        // Aunt / uncle
        var auntsUncles = getAuntsAndUncles(charId1, false);
        for (var k = 0; k < auntsUncles.length; k++) {
            if (auntsUncles[k].character.id === charId2) {
                var t = auntsUncles[k].type;
                var label = (t === 'uncle') ? 'Uncle'
                    : (t === 'aunt') ? 'Aunt'
                    : 'UncleOrAunt';
                return { degree: label, closeness: 3 };
            }
        }

        // Niece / nephew
        var nn = getNiecesAndNephews(charId1, false);
        for (var m = 0; m < nn.length; m++) {
            if (nn[m].character.id === charId2) {
                var nt = nn[m].type;
                var nlabel = (nt === 'nephew') ? 'Nephew'
                    : (nt === 'niece') ? 'Niece'
                    : 'Nibling';
                return { degree: nlabel, closeness: 3 };
            }
        }

        // Cousin
        var cousins = getCousins(charId1, false, 1);
        for (var n = 0; n < cousins.length; n++) {
            if (cousins[n].id === charId2) {
                return { degree: 'Cousin', closeness: 4 };
            }
        }

        return { degree: 'Unrelated', closeness: 99 };
    }

    /**
     * Gets the closeness score for two characters.
     * Returns the closeness integer from getKinship (or 99 for unrelated).
     * 
     * This is a UI sort score, NOT a consanguinity coefficient.
     */
    function getKinshipCloseness(charId1, charId2) {
        var k = getKinship(charId1, charId2);
        return k ? k.closeness : 99;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    var api = {
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
        getAdoptiveSiblings: getAdoptiveSiblings,
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

        // Kinship
        getKinship: getKinship,
        getKinshipCloseness: getKinshipCloseness
    };

    window.FamilyAccessors = api;

    // Backward-compatible global aliases (deprecated)
    window.getFather = getFather;
    window.getMother = getMother;
    window.getParents = getParents;
    window.getChildren = getAllChildren;
    window.getSiblings = getSiblings;
    window.getGrandparents = getGrandparents;
    window.getGrandchildren = getGrandchildren;
    window.getCurrentSpouse = getCurrentSpouse;

    /**
     * @deprecated Use getKinshipCloseness instead. The name suggested
     * a blood-relationship coefficient, but the value is a UI sort score
     * that includes spouse (affinity).
     */
    window.getConsanguinityDegree = getKinshipCloseness;

    /**
     * @deprecated Use getKinship instead.
     */
    window.getConsanguinity = getKinship;

    /**
     * @deprecated Use getKinship instead.
     */
    window.getRelationshipDescription = function(charId1, charId2) {
        var k = getKinship(charId1, charId2);
        return k ? k.degree : 'Unknown';
    };

    // CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();