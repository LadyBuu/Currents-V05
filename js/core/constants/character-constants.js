/**
 * STILL WATERS - Character Constants
 * Gender and attraction values. No labels, no icons — those are UI.
 *
 * LOCATION: js/core/constants/character-constants.js
 *
 * Canonical enum values for character-owned identity fields.
 * These are DATA, not presentation. Labels and icons live in the UI layer.
 *
 * SEMANTIC RULES:
 *   - Values listed here are the ONLY values the rest of the codebase
 *     treats as canonical. Anything else is normalized to 'unknown' by
 *     character-state.js (_normalizeGender) and character-factory.js.
 *   - 'other' is NOT a canonical gender. Earlier revisions listed it, but
 *     no writer produced it and every reader collapsed it to 'unknown'.
 *     Keeping it in the enum would advertise a value the pipeline silently
 *     discards, so it has been removed.
 *   - Attraction values are consumed verbatim by the relationship domain.
 *     No normalization exists for attraction; it is either canonical or a
 *     caller bug.
 *
 * DEPENDENCIES: None. Load early.
 *
 * ICON POLICY: No emojis. No icons.
 */
(function() {
    'use strict';

    /**
     * Canonical gender values.
     *
     *   'male'    — canonical
     *   'female'  — canonical
     *   'unknown' — canonical; also the normalization target for any
     *               unrecognized value.
     */
    window.GENDER_VALUES = Object.freeze(['male', 'female', 'unknown']);

    /**
     * Canonical attraction values.
     */
    window.ATTRACTION_VALUES = Object.freeze(['both', 'men', 'women', 'neither', 'unknown']);
})();
