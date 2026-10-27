/**
 * =============================================================================
 * STILL WATERS - CHARACTER TRAIT VOCABULARY (character-traits.js)
 * =============================================================================
 *
 * LOCATION: js/core/constants/character-traits.js
 *
 * Canonical vocabulary for character traits. Single source of truth for
 * what a valid trait id is. Every consumer — relationship domain,
 * settlement domain, generator, modals, validation — reads from here.
 *
 * SCOPE:
 *   - Trait id declarations with category metadata
 *   - Canonical ordered list of trait ids
 *   - A frozen lookup map for O(1) "is this a known trait" checks
 *
 * OUT OF SCOPE:
 *   - Trait presentation (labels, icons, descriptions) → UI layer
 *   - Trait acquisition rules → commands
 *   - Trait effects on domain mechanics → each domain's rules module
 *     (jealousy-rules.js applies its own trait modifiers, etc.)
 *   - Trait schema validation → validation.js, character-factory.js
 *
 * DECISION RECORD:
 *   `polygamous` is deliberately NOT in this vocabulary.
 *
 *   Multi-spouse permission is a property of a character's RANK, not
 *   their personality. It is expressed by `rank.allowsMultipleSpouses`,
 *   which `romance-commands.js` reads directly.
 *
 *   Earlier revisions of the relationship domain also checked for a
 *   `polygamous` trait as a fallback path. That branch has been removed:
 *   the rank field is the sole source of truth. If a character should
 *   be able to take multiple spouses, the caller must set
 *   `rank.allowsMultipleSpouses = true` on the relevant rank; there is
 *   no trait that produces the same effect.
 *
 * CATEGORIES:
 *   personality  — enduring character qualities. The default category.
 *   temperament  — dispositional tendencies. Currently unused; reserved
 *                  for future expansion.
 *
 * SEMANTIC RULES:
 *   - Trait ids are lowercase snake_case strings.
 *   - The lookup map is frozen at load; mutation is a programming error.
 *   - CHARACTER_TRAIT_VALUES preserves declaration order, which is the
 *     order the modal checkboxes render in. It is not alphabetical
 *     because grouping by conceptual family reads better in the UI.
 *
 * DEPENDENCIES: None. Load early, after character-constants.js.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. TRAIT DEFINITIONS
    // =========================================================================
    //
    // Each entry is a frozen { id, category } object. The id is the
    // canonical trait string; the category is metadata used by the UI
    // for grouping and by future domain rules for coarse filtering.
    //
    // Declaration order is preserved in CHARACTER_TRAIT_VALUES and is
    // the render order the modals use. Do not sort this object.

    var CHARACTER_TRAITS = Object.freeze({
        // ----- Positive / prosocial dispositions -----
        WISE:        Object.freeze({ id: 'wise',        category: 'personality' }),
        JUST:        Object.freeze({ id: 'just',        category: 'personality' }),
        PATIENT:     Object.freeze({ id: 'patient',     category: 'personality' }),
        SECURE:      Object.freeze({ id: 'secure',      category: 'personality' }),
        CHARISMATIC: Object.freeze({ id: 'charismatic', category: 'personality' }),
        DIPLOMATIC:  Object.freeze({ id: 'diplomatic',  category: 'personality' }),

        // ----- Negative / antisocial dispositions -----
        CRUEL:       Object.freeze({ id: 'cruel',       category: 'personality' }),
        TYRANT:      Object.freeze({ id: 'tyrant',      category: 'personality' }),
        INCOMPETENT: Object.freeze({ id: 'incompetent', category: 'personality' }),
        CORRUPT:     Object.freeze({ id: 'corrupt',     category: 'personality' }),
        JEALOUS:     Object.freeze({ id: 'jealous',     category: 'personality' }),
        CALCULATING: Object.freeze({ id: 'calculating', category: 'personality' }),
        HOT_HEADED:  Object.freeze({ id: 'hot_headed',  category: 'personality' }),
        COWARDLY:    Object.freeze({ id: 'cowardly',    category: 'personality' }),
        VIOLENT:     Object.freeze({ id: 'violent',     category: 'personality' }),
        SECRETIVE:   Object.freeze({ id: 'secretive',   category: 'personality' })
    });

    // =========================================================================
    // 2. ORDERED VALUES
    // =========================================================================
    //
    // The canonical ordered list of trait ids. Renders in this order in
    // the modal checkboxes. Order groups conceptually related traits
    // (positive first, negative second) so the UI does not require a
    // separate sort or grouping pass.

    var CHARACTER_TRAIT_VALUES = Object.freeze(
        Object.keys(CHARACTER_TRAITS).map(function (key) {
            return CHARACTER_TRAITS[key].id;
        })
    );

    // =========================================================================
    // 3. LOOKUP MAP
    // =========================================================================
    //
    // O(1) membership test by trait id. Consumers that just need
    // "is this a valid trait?" use this; consumers that need category
    // metadata look up CHARACTER_TRAITS by the uppercase key.

    var CHARACTER_TRAIT_LOOKUP = (function () {
        var map = Object.create(null);
        for (var i = 0; i < CHARACTER_TRAIT_VALUES.length; i++) {
            map[CHARACTER_TRAIT_VALUES[i]] = true;
        }
        return Object.freeze(map);
    })();

    // =========================================================================
    // 4. HELPERS
    // =========================================================================

    /**
     * True if `id` is a canonical trait id.
     * @param {*} id
     * @returns {boolean}
     */
    function isKnownTrait(id) {
        if (typeof id !== 'string' || id.length === 0) return false;
        return CHARACTER_TRAIT_LOOKUP[id] === true;
    }

    /**
     * Returns the trait definition for a given id, or null.
     * The id must be a canonical trait string ('wise', not 'WISE').
     * @param {string} id
     * @returns {{ id: string, category: string }|null}
     */
    function getTraitDefinition(id) {
        if (typeof id !== 'string' || id.length === 0) return null;
        for (var key in CHARACTER_TRAITS) {
            if (Object.prototype.hasOwnProperty.call(CHARACTER_TRAITS, key)) {
                var def = CHARACTER_TRAITS[key];
                if (def.id === id) return def;
            }
        }
        return null;
    }

    /**
     * Returns the canonical id list, optionally filtered by category.
     * With no argument, returns the full ordered list.
     * @param {string} [category]
     * @returns {string[]}
     */
    function getTraitIds(category) {
        if (category === undefined || category === null) {
            return CHARACTER_TRAIT_VALUES.slice();
        }
        if (typeof category !== 'string' || category.length === 0) return [];

        var out = [];
        for (var i = 0; i < CHARACTER_TRAIT_VALUES.length; i++) {
            var id = CHARACTER_TRAIT_VALUES[i];
            var def = getTraitDefinition(id);
            if (def && def.category === category) out.push(id);
        }
        return out;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.CHARACTER_TRAITS = CHARACTER_TRAITS;
    window.CHARACTER_TRAIT_VALUES = CHARACTER_TRAIT_VALUES;
    window.CHARACTER_TRAIT_LOOKUP = CHARACTER_TRAIT_LOOKUP;

    window.isKnownTrait = isKnownTrait;
    window.getTraitDefinition = getTraitDefinition;
    window.getTraitIds = getTraitIds;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CHARACTER_TRAITS: CHARACTER_TRAITS,
            CHARACTER_TRAIT_VALUES: CHARACTER_TRAIT_VALUES,
            CHARACTER_TRAIT_LOOKUP: CHARACTER_TRAIT_LOOKUP,
            isKnownTrait: isKnownTrait,
            getTraitDefinition: getTraitDefinition,
            getTraitIds: getTraitIds
        };
    }
})();
