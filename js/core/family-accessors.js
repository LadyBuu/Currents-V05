/**
 * =============================================================================
 * STILL WATERS - FAMILY ACCESSORS (js/core/family-accessors.js)
 * =============================================================================
 *
 * PURE read-only accessors for family relationships.
 * NO system dependencies beyond core accessors.
 * NO UI. NO mutations. NO household semantics. NO relationship semantics.
 *
 * SCOPE:
 *   - Parent accessors
 *   - Child accessors
 *   - Sibling accessors
 *   - Grandparent / grandchild accessors
 *   - Extended family (aunts/uncles, first cousins, nieces/nephews)
 *   - Limited kinship classifier (see KINSHIP section)
 *
 * OUT OF SCOPE:
 *   - Partner/spouse semantics → relationship-queries.js
 *   - Household membership → household-queries.js
 *   - Family statistics aggregation → family-statistics.js
 *   - Time calculations → time.js
 *   - Adoption consistency policy → integrity.js
 *
 * SEMANTIC RULES:
 *   - Missing/invalid character → null (singular) or [] (collection).
 *   - Biological and adopted are independent facts, both preserved.
 *   - Siblings share a parent, not a "type". Adoptive siblings share an
 *     adoptive parent regardless of the other child's own type.
 *   - Birth-year sorting: only integer birth years participate in ordering.
 *     Invalid years sort last, in stable input order.
 *   - No silent normalization of caller input. Unsupported values throw.
 *   - No presentation strings.
 *   - Explicit missing checks only. Truthiness is not a domain predicate.
 *
 * ADOPTION AUTHORITY:
 *   The adoption graph can in principle be represented from both sides
 *   (`character.adoptedParents` on the child, `character.adoptedChildren`
 *   on the parent). This module reads BOTH and treats them as independent
 *   facts, the same way biological and adoptive are treated as independent
 *   on the child side. If the two sides disagree, that is a data integrity
 *   problem for integrity.js to report, not for this module to silently
 *   resolve. Callers who need a single authoritative direction should
 *   build it on top of the data integrity audit.
 *
 * EXTENDED FAMILY AND ADOPTION:
 *   Extended-family relationships (aunts/uncles, cousins, nieces/nephews)
 *   currently follow BIOLOGICAL ancestry only. Adoptive siblings are not
 *   promoted to aunts/uncles, and their children are not promoted to
 *   cousins. This is a deliberate policy: extended-family traversal
 *   through adoptive links would balloon the graph and produce surprising
 *   classifications. If this policy changes, it should change here and be
 *   documented in the changelog.
 *
 * KINSHIP:
 *   getKinship is a LIMITED classifier. It recognizes: Self, Parent,
 *   Child, Sibling, Grandparent, Grandchild, Aunt/Uncle, Niece/Nephew,
 *   Cousin (first), and Spouse. It does NOT recognize great-grandparents,
 *   second cousins, or any degree beyond what is listed. Unrecognized
 *   relationships return Unrelated, which is intentional: the classifier
 *   answers "what is the closest recognized relationship between these
 *   two people?" not "what is the mathematical kinship coefficient?"
 *
 *   Spouse is included in getKinship for UI convenience, but it is
 *   affinity, not consanguinity. Do not use getKinshipCloseness as a
 *   blood-relationship measure.
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

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * True if `id` is a non-empty string.
     * @private
     */
    function _hasId(id) {
        return typeof id === 'string' && id.length > 0;
    }

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    /**
     * True if `year` is a valid integer birth year shape for sorting.
     * Range validation is time.js's concern; this predicate only answers
     * "can this value participate in integer comparison?"
     * @private
     */
    function _isSortableBirthYear(year) {
        return typeof year === 'number'
            && Number.isFinite(year)
            && Number.isInteger(year);
    }

    /**
     * Sort comparator for entities with birthYear. Unknown or invalid
     * birth years sort last, in stable input order.
     * @private
     */
    function _compareBirthYear(a, b) {
        var aYear = a && a.birthYear;
        var bYear = b && b.birthYear;
        var aValid = _isSortableBirthYear(aYear);
        var bValid = _isSortableBirthYear(bYear);

        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
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
            var id;
            if (_hasId(item.id)) {
                id = item.id;
            } else if (item.character && _hasId(item.character.id)) {
                id = item.character.id;
            } else {
                continue;
            }
            if (seen.has(id)) continue;
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
        if (!character) return null;
        if (!_hasId(character.fatherId)) return null;
        return _getCharacterById(character.fatherId);
    }

    /**
     * Gets the mother of a character.
     */
    function getMother(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        if (!_hasId(character.motherId)) return null;
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
            father: _hasId(character.fatherId) ? _getCharacterById(character.fatherId) : null,
            mother: _hasId(character.motherId) ? _getCharacterById(character.motherId) : null
        };
    }

    /**
     * Gets all parents (biological and, optionally, adoptive).
     *
     * Each parent appears ONCE. A parent who is both biological and
     * adoptive has both flags set on a single entry. This mirrors
     * getAllChildren()'s merge policy and makes it possible to ask
     * "who is X's parent?" without filtering duplicates.
     *
     * @param {string} characterId
     * @param {boolean} [includeAdoptive] - default false
     * @returns {Array<{
     *   character: Object,
     *   type: 'father'|'mother'|'parent',
     *   biological: boolean,
     *   adoptive: boolean,
     *   adoptionType?: string,
     *   adoptionYear?: number
     * }>}
     */
    function getAllParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return [];

        var byId = new Map();

        function ensure(id, characterObj, baseType) {
            if (byId.has(id)) return byId.get(id);
            var entry = {
                character: characterObj,
                type: baseType,
                biological: false,
                adoptive: false
            };
            byId.set(id, entry);
            return entry;
        }

        function pickParentType(parent) {
            if (parent.gender === 'male') return 'father';
            if (parent.gender === 'female') return 'mother';
            return 'parent';
        }

        // Biological
        if (_hasId(character.fatherId)) {
            var father = _getCharacterById(character.fatherId);
            if (father) {
                var fe = ensure(father.id, father, 'father');
                fe.biological = true;
            }
        }
        if (_hasId(character.motherId)) {
            var mother = _getCharacterById(character.motherId);
            if (mother) {
                var me = ensure(mother.id, mother, 'mother');
                me.biological = true;
            }
        }

        // Adoptive
        if (includeAdoptive && Array.isArray(character.adoptedParents)) {
            for (var i = 0; i < character.adoptedParents.length; i++) {
                var ap = character.adoptedParents[i];
                if (ap.status === 'ended') continue;
                if (!_hasId(ap.parentId)) continue;
                var parent = _getCharacterById(ap.parentId);
                if (!parent) continue;

                var type = _isMissing(ap.parentType)
                    ? pickParentType(parent)
                    : ap.parentType;

                var entry = ensure(parent.id, parent, type);
                entry.adoptive = true;
                if (type === 'father' || type === 'mother' || type === 'parent') {
                    // Only override a neutral 'parent' label with a specific one.
                    if (entry.type === 'parent' && type !== 'parent') entry.type = type;
                }
                if (!_isMissing(ap.type)) entry.adoptionType = ap.type;
                if (!_isMissing(ap.year)) entry.adoptionYear = ap.year;
            }
        }

        var result = [];
        byId.forEach(function(e) { result.push(e); });
        return result;
    }

    /**
     * True if the character has any parents (biological, and optionally
     * adoptive).
     */
    function hasParents(characterId, includeAdoptive) {
        includeAdoptive = includeAdoptive === true;
        var character = _getCharacterById(characterId);
        if (!character) return false;

        if (_hasId(character.fatherId) || _hasId(character.motherId)) return true;

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
     *
     * @returns {boolean|null} null if the character does not exist.
     */
    function isOrphan(characterId, includeAdoptive) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

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
            if (!_hasId(ac.childId)) continue;
            var child = _getCharacterById(ac.childId);
            if (!child) continue;
            if (!includeDeceased && child.isDeceased) continue;
            result.push({
                character: child,
                adoptionType: _isMissing(ac.type) ? 'legal' : ac.type,
                adoptionYear: _isMissing(ac.year) ? null : ac.year,
                notes: _isMissing(ac.notes) ? '' : ac.notes
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
        return children[0].character;
    }

    function getYoungestChild(characterId, includeAdopted, includeDeceased) {
        includeAdopted = includeAdopted !== false;
        var children = getAllChildren(characterId, includeDeceased === true);
        if (!includeAdopted) {
            children = children.filter(function(c) { return c.biological; });
        }
        if (children.length === 0) return null;
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

            var sharedFather = _hasId(character.fatherId)
                && _hasId(s.fatherId)
                && character.fatherId === s.fatherId;
            var sharedMother = _hasId(character.motherId)
                && _hasId(s.motherId)
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

        // Adoptive siblings: children who share at least one adoptive
        // parent with this character. The sibling relationship is defined
        // by the shared adoptive parent, not by the sibling's own type.
        if (includeAdopted) {
            var myAdoptiveParents = getAllParents(characterId, true).filter(function(p) {
                return p.adoptive;
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

    function getFullSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, false, includeDeceased === true, false)
            .filter(function(s) { return s.full; })
            .map(function(s) { return s.character; });
    }

    function getHalfSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, true, includeDeceased === true, false)
            .filter(function(s) { return s.half && !s.full; })
            .map(function(s) { return s.character; });
    }

    function getAdoptiveSiblings(characterId, includeDeceased) {
        return getSiblings(characterId, false, includeDeceased === true, true)
            .filter(function(s) { return s.adoptive; })
            .map(function(s) { return s.character; });
    }

    function getEldestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        return siblings[0].character;
    }

    function getYoungestSibling(characterId, includeHalfSiblings, includeDeceased) {
        var siblings = getSiblings(characterId, includeHalfSiblings === true, includeDeceased === true, false);
        if (siblings.length === 0) return null;
        return siblings[siblings.length - 1].character;
    }

    function areSiblings(charId1, charId2, includeHalfSiblings, includeAdopted) {
        if (!_hasId(charId1) || !_hasId(charId2) || charId1 === charId2) return false;
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
    //
    // Extended-family traversal follows BIOLOGICAL ancestry only. See
    // EXTENDED FAMILY AND ADOPTION in the file header.

    /**
     * Gets aunts and uncles of a character (biological parents' siblings).
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
     * Gets first cousins of a character (aunts' and uncles' children).
     *
     * Only first cousins are supported. Second cousins and beyond would
     * require a general relationship-traversal API, which this module
     * does not provide.
     *
     * @returns {Array<Object>}
     */
    function getFirstCousins(characterId, includeDeceased) {
        includeDeceased = includeDeceased === true;
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
     * Gets nieces and nephews of a character (biological siblings' children).
     *
     * @returns {Array<{ character, through: Array<Object>, type }>}
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
    // 7. KINSHIP (LIMITED CLASSIFIER)
    // =========================================================================
    //
    // See KINSHIP in the file header for the classification's scope and
    // limitations. This is NOT a general kinship engine. It is a bounded
    // classifier that answers "what is the closest recognized relationship
    // between these two people?" Spouse is included for UI convenience but
    // is affinity, not consanguinity.

    /**
     * Gets a structured relationship descriptor between two characters.
     *
     * Returns { degree, closeness } or null when inputs are invalid or
     * one party is missing.
     *
     * Degrees: Self, Parent, Child, Sibling, Grandparent, Grandchild,
     *          Uncle, Aunt, UncleOrAunt, Nephew, Niece, Nibling,
     *          Cousin, Unrelated
     *
     * Closeness: 0 = self, 1 = immediate, 2 = sibling/grandparent,
     *            3 = aunt/uncle/niece/nephew, 4 = cousin, 99 = unrelated.
     */
    function getKinship(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (charId1 === charId2) return { degree: 'Self', closeness: 0 };

        var char1 = _getCharacterById(charId1);
        var char2 = _getCharacterById(charId2);
        if (!char1 || !char2) return null;

        if (char1.fatherId === charId2 || char1.motherId === charId2) {
            return { degree: 'Parent', closeness: 1 };
        }
        if (char2.fatherId === charId1 || char2.motherId === charId1) {
            return { degree: 'Child', closeness: 1 };
        }

        if (areSiblings(charId1, charId2, true, true)) {
            return { degree: 'Sibling', closeness: 2 };
        }

        var gps = getGrandparents(charId1, false);
        for (var i = 0; i < gps.length; i++) {
            if (gps[i].id === charId2) return { degree: 'Grandparent', closeness: 2 };
        }
        var gcs = getGrandchildren(charId1);
        for (var j = 0; j < gcs.length; j++) {
            if (gcs[j].id === charId2) return { degree: 'Grandchild', closeness: 2 };
        }

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

        var cousins = getFirstCousins(charId1, false);
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
    // 8. EXPORTS
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
        getFirstCousins: getFirstCousins,
        getNiecesAndNephews: getNiecesAndNephews,

        // Kinship (limited classifier)
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

    /**
     * @deprecated Use getFirstCousins instead. Second cousins and beyond
     * were never supported; the previous signature pretended otherwise.
     */
    window.getCousins = getFirstCousins;

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