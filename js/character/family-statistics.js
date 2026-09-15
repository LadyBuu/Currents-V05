/**
 * =============================================================================
 * STILL WATERS - FAMILY STATISTICS (js/character/family-statistics.js)
 * =============================================================================
 *
 * Aggregate family measurements for a character.
 *
 * SCOPE:
 *   - Counting parents, children, siblings, grandchildren, and spouses
 *   - Classifying children (biological/adopted) and siblings
 *     (full/half/adopted)
 *   - Determining orphan status
 *   - Producing a single statistics object suitable for UI and succession
 *
 * OUT OF SCOPE:
 *   - Reading the family graph → FamilyAccessors
 *   - Deciding what a "spouse" is → relationship-queries.js
 *   - Determining heirs → succession-queries.js
 *   - Presentation → CharacterUI / modals
 *
 * SEMANTIC RULES:
 *   - Missing character → null (singular) or the documented empty result.
 *   - Existing character with no family → statistics object with zero
 *     counts and null members.
 *   - This module does NOT mutate.
 *   - This module does NOT decide succession. It reports counts.
 *   - This module does NOT decide relationship type (partner vs. spouse).
 *     It consumes whatever the relationship layer reports.
 *
 * SPOUSE HANDLING:
 *   This module reports what the relationship layer says. If the
 *   relationship layer reports multiple active partners, the statistics
 *   object reflects that. It does NOT pick "the" spouse. Callers who need
 *   a single spouse must decide which one and ask the relationship layer
 *   for it.
 *
 *   If `RelationshipQueries` is not loaded, spouse-related fields are
 *   reported as empty (count 0, list []). This is not a failure; spouse
 *   data is a separate domain and its absence is a legitimate state.
 *
 * DEPENDENCIES (REQUIRED):
 *   - FamilyAccessors: getAllParents, getAllChildren, getSiblings,
 *                      getGrandchildren, isOrphan
 *
 * DEPENDENCIES (OPTIONAL):
 *   - relationship-queries.js (RelationshipQueries): getActivePartners
 *     — used only for spouse counts. Absent → spouse fields empty.
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

    function _requireFamilyAccessors() {
        if (typeof window.FamilyAccessors === 'undefined') {
            throw new Error(
                'family-statistics.js: family-accessors.js must load first.'
            );
        }
        var required = [
            'getAllParents',
            'getAllChildren',
            'getSiblings',
            'getGrandchildren',
            'isOrphan'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window.FamilyAccessors[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'family-statistics.js: FamilyAccessors is missing: ' +
                missing.join(', ')
            );
        }
    }

    _requireFamilyAccessors();

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isLiving(character) {
        return character && character.isDeceased !== true;
    }

    function _countLiving(characters) {
        if (!Array.isArray(characters)) return 0;
        var count = 0;
        for (var i = 0; i < characters.length; i++) {
            if (_isLiving(characters[i])) count++;
        }
        return count;
    }

    /**
     * Resolves the character object from the family accessor's return
     * shape. FamilyAccessors returns either bare character objects or
     * { character, ... } wrapper objects depending on the function.
     */
    function _unwrap(entry) {
        if (!entry) return null;
        if (entry.character) return entry.character;
        return entry;
    }

    /**
     * Extracts the living-aware eldest and youngest from a sorted list
     * of unwrapped characters.
     */
    function _firstAndLast(characters) {
        if (!Array.isArray(characters) || characters.length === 0) {
            return { eldest: null, youngest: null };
        }
        return {
            eldest: characters[0],
            youngest: characters[characters.length - 1]
        };
    }

    // =========================================================================
    // 2. SPOUSE QUERIES (OPTIONAL DEPENDENCY)
    // =========================================================================

    /**
     * Returns active partners as an array of character objects.
     * If RelationshipQueries is not loaded, returns [].
     *
     * This module does not define what a "partner" is. It asks the
     * relationship layer.
     */
    function _getActivePartners(characterId) {
        if (typeof window.RelationshipQueries === 'undefined') return [];
        if (typeof window.RelationshipQueries.getActivePartners !== 'function') return [];

        var partners = window.RelationshipQueries.getActivePartners(characterId);
        if (!Array.isArray(partners)) return [];

        // Partners may be returned as character objects or as wrapper
        // records. Normalize.
        var result = [];
        for (var i = 0; i < partners.length; i++) {
            var p = _unwrap(partners[i]);
            if (p && _hasId(p.id)) result.push(p);
        }
        return result;
    }

    // =========================================================================
    // 3. PUBLIC API
    // =========================================================================

    /**
     * Returns comprehensive family statistics for a character.
     *
     * @param {string} characterId
     * @returns {{
     *   characterId: string,
     *   parents: { father, mother, all, hasParents },
     *   children: {
     *     total, living, biological, adopted,
     *     eldest, youngest,
     *     all: Array<{ character, biological, adopted, birthYear }>
     *   },
     *   siblings: {
     *     total, living, full, half, adoptive,
     *     eldest, youngest,
     *     all: Array<{ character, full, half, adoptive, sameFather, sameMother }>
     *   },
     *   grandchildren: { total, living, all: Array<Object> },
     *   partners: { total, all: Array<Object> },
     *   isOrphan: boolean,
     *   hasParents: boolean,
     *   hasChildren: boolean,
     *   hasSiblings: boolean,
     *   totalFamilyMembers: number
     * }|null}
     */
    function getFamilyStatistics(characterId) {
        if (!_hasId(characterId)) return null;

        var fa = window.FamilyAccessors;

        // Parents
        var allParents = fa.getAllParents(characterId, false);
        if (!Array.isArray(allParents)) allParents = [];

        var father = null;
        var mother = null;
        for (var i = 0; i < allParents.length; i++) {
            var entry = allParents[i];
            var parentChar = _unwrap(entry);
            if (!parentChar) continue;
            if (entry && entry.type === 'father' && !father) father = parentChar;
            else if (entry && entry.type === 'mother' && !mother) mother = parentChar;
        }
        var hasParents = allParents.length > 0;

        // Children (all, including deceased)
        var allChildren = fa.getAllChildren(characterId, true);
        if (!Array.isArray(allChildren)) allChildren = [];

        // Normalize each child entry to a common shape.
        var normalizedChildren = [];
        var biologicalCount = 0;
        var adoptedCount = 0;
        for (var ci = 0; ci < allChildren.length; ci++) {
            var ce = allChildren[ci];
            var childChar = _unwrap(ce);
            if (!childChar) continue;
            var isBio = ce && ce.biological === true;
            var isAdopt = ce && ce.adopted === true;
            if (isBio) biologicalCount++;
            if (isAdopt) adoptedCount++;
            normalizedChildren.push({
                character: childChar,
                biological: isBio,
                adopted: isAdopt,
                birthYear: childChar.birthYear
            });
        }

        var livingChildren = [];
        for (var lc = 0; lc < normalizedChildren.length; lc++) {
            if (_isLiving(normalizedChildren[lc].character)) {
                livingChildren.push(normalizedChildren[lc].character);
            }
        }

        var allChildChars = normalizedChildren.map(function(e) { return e.character; });
        var childExtremes = _firstAndLast(allChildChars);

        // Siblings (including half, including deceased)
        var allSiblings = fa.getSiblings(characterId, true, true, true);
        if (!Array.isArray(allSiblings)) allSiblings = [];

        var fullCount = 0;
        var halfCount = 0;
        var adoptiveCount = 0;
        var normalizedSiblings = [];
        for (var si = 0; si < allSiblings.length; si++) {
            var se = allSiblings[si];
            var sibChar = _unwrap(se);
            if (!sibChar) continue;
            var isFull = se && se.full === true;
            var isHalf = se && se.half === true && !isFull;
            var isAdoptive = se && se.adoptive === true;
            if (isFull) fullCount++;
            else if (isHalf) halfCount++;
            if (isAdoptive) adoptiveCount++;
            normalizedSiblings.push({
                character: sibChar,
                full: isFull,
                half: isHalf,
                adoptive: isAdoptive,
                sameFather: se ? se.sameFather === true : false,
                sameMother: se ? se.sameMother === true : false
            });
        }

        var livingSiblings = [];
        for (var ls = 0; ls < normalizedSiblings.length; ls++) {
            if (_isLiving(normalizedSiblings[ls].character)) {
                livingSiblings.push(normalizedSiblings[ls].character);
            }
        }

        var allSibChars = normalizedSiblings.map(function(e) { return e.character; });
        var siblingExtremes = _firstAndLast(allSibChars);

        // Grandchildren (including deceased)
        var allGrandchildren = fa.getGrandchildren(characterId, true, true);
        if (!Array.isArray(allGrandchildren)) allGrandchildren = [];

        var normalizedGrandchildren = [];
        for (var gi = 0; gi < allGrandchildren.length; gi++) {
            var gChar = _unwrap(allGrandchildren[gi]);
            if (gChar && _hasId(gChar.id)) normalizedGrandchildren.push(gChar);
        }
        var livingGrandchildren = _countLiving(normalizedGrandchildren);

        // Partners (optional dependency)
        var partners = _getActivePartners(characterId);

        // Orphan status
        var orphan = fa.isOrphan(characterId, false);
        // isOrphan returns null for missing character; since we reached
        // this point, character exists; null should not occur.
        if (orphan === null) orphan = false;

        // Total unique family members (deduplicated by ID, excluding self)
        var seen = new Set();
        function addAll(list) {
            for (var i = 0; i < list.length; i++) {
                var c = _unwrap(list[i]);
                if (c && _hasId(c.id)) seen.add(c.id);
            }
        }
        addAll(allParents);
        addAll(allChildren);
        addAll(allSiblings);
        addAll(normalizedGrandchildren);
        for (var pi = 0; pi < partners.length; pi++) {
            if (_hasId(partners[pi].id)) seen.add(partners[pi].id);
        }
        // The queried character is not counted as their own family member.
        seen.delete(characterId);

        return {
            characterId: characterId,
            parents: {
                father: father,
                mother: mother,
                all: allParents,
                hasParents: hasParents
            },
            children: {
                total: normalizedChildren.length,
                living: livingChildren.length,
                biological: biologicalCount,
                adopted: adoptedCount,
                eldest: childExtremes.eldest,
                youngest: childExtremes.youngest,
                all: normalizedChildren
            },
            siblings: {
                total: normalizedSiblings.length,
                living: livingSiblings.length,
                full: fullCount,
                half: halfCount,
                adoptive: adoptiveCount,
                eldest: siblingExtremes.eldest,
                youngest: siblingExtremes.youngest,
                all: normalizedSiblings
            },
            grandchildren: {
                total: normalizedGrandchildren.length,
                living: livingGrandchildren,
                all: normalizedGrandchildren
            },
            partners: {
                total: partners.length,
                all: partners
            },
            isOrphan: orphan,
            hasParents: hasParents,
            hasChildren: normalizedChildren.length > 0,
            hasSiblings: normalizedSiblings.length > 0,
            totalFamilyMembers: seen.size
        };
    }

    /**
     * Returns a lightweight summary suitable for UI rendering. Avoids the
     * full statistics object when only counts are needed.
     *
     * @param {string} characterId
     * @returns {{
     *   childCount: number,
     *   livingChildCount: number,
     *   siblingCount: number,
     *   grandchildCount: number,
     *   partnerCount: number,
     *   isOrphan: boolean
     * }|null}
     */
    function getFamilySummary(characterId) {
        if (!_hasId(characterId)) return null;

        var fa = window.FamilyAccessors;

        var children = fa.getAllChildren(characterId, true);
        if (!Array.isArray(children)) children = [];

        var livingChildCount = 0;
        for (var i = 0; i < children.length; i++) {
            var c = _unwrap(children[i]);
            if (_isLiving(c)) livingChildCount++;
        }

        var siblings = fa.getSiblings(characterId, true, true, true);
        if (!Array.isArray(siblings)) siblings = [];

        var grandchildren = fa.getGrandchildren(characterId, true, true);
        if (!Array.isArray(grandchildren)) grandchildren = [];

        var partners = _getActivePartners(characterId);

        var orphan = fa.isOrphan(characterId, false);
        if (orphan === null) orphan = false;

        return {
            childCount: children.length,
            livingChildCount: livingChildCount,
            siblingCount: siblings.length,
            grandchildCount: grandchildren.length,
            partnerCount: partners.length,
            isOrphan: orphan
        };
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.FamilyStatistics = {
        getFamilyStatistics: getFamilyStatistics,
        getFamilySummary: getFamilySummary
    };

    // Convenience global. CharacterLifecycle and modals both expect this
    // to exist on the module namespace; keeping it on window as a top-level
    // function matches the existing call pattern in the fixed callers.
    window.getFamilyStatistics = getFamilyStatistics;

})();