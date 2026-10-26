/**
 * =============================================================================
 * STILL WATERS - SELECTOR BASE HELPERS (js/selectors/selector-base.js)
 * =============================================================================
 *
 * LOCATION: js/selectors/selector-base.js
 *
 * PURPOSE
 * -------
 * Shared helpers for the character / household / residence selector
 * modals. Provides:
 *
 *   - Filter defaults and normalisation for selector filterConfig
 *   - Character match predicates (gender, status, age, location)
 *   - Relationship predicates (isBloodRelativeBasic, isSpouseBasic)
 *   - Display helpers (displayName, fallback initials)
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not the selector modal itself. The modal files
 *     (modals-char-selector.js, modals-household-selector.js) use these
 *     helpers to build their own filter UI and match predicates.
 *   - Not domain policy. Family semantics live in family-rules.js.
 *     Relationship semantics live in the relationship domain.
 *   - Not a mutation boundary. Everything here is a read.
 *
 * RELATIONSHIP PREDICATES (REVISED)
 * ---------------------------------
 *   The on-disk version's `isBloodRelativeBasic` and `isSpouseBasic`
 *   read `char.motherId`, `char.fatherId`, and `char.relationships` —
 *   all dead fields. The character record no longer carries any of
 *   them:
 *
 *     - Parentage lives in `parentChildEdges` (FamilyState).
 *     - Spousal / romantic links live in the relationship domain.
 *
 *   So both predicates returned `false` for every pair on any dataset
 *   created with the current factory. The behaviour was silently wrong:
 *   selector UIs that filtered out blood relatives or spouses
 *   (e.g., the matchmaker's "exclude relatives" filter) silently stopped
 *   filtering.
 *
 *   This rewrite delegates:
 *
 *     isBloodRelativeBasic(aId, bId)
 *       → FamilyQueries.isBloodRelated(aId, bId)
 *       Falls back to `false` when FamilyQueries isn't loaded. Family
 *       is a required dependency in the current tree; the fallback
 *       exists so this module can be loaded and tested before
 *       family-queries.js.
 *
 *     isSpouseBasic(aId, bId)
 *       → RelationshipQueries.getRelationshipBetween(aId, bId)
 *         filtered to `type === 'marriage' && status === 'ongoing'`.
 *       Returns `false` when the relationship domain isn't loaded. Also
 *       returns `false` when the two characters have no relationship
 *       at all — the common case in selectors.
 *
 *   Both predicates keep their "Basic" suffix: they are one-hop checks
 *   used inside list filters. `isBloodRelativeBasic` is one-hop in the
 *   sense that it delegates to `FamilyQueries.isBloodRelated`, which
 *   itself does bounded traversal via `FamilyRules.classifyKinship`.
 *   Neither predicate is a "deep kinship" check — see
 *   `FamilyQueries.classifyKinship` for that.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - None. Every dependency is checked at call time so this module
 *     can load first in the selector block.
 *
 * DEPENDENCIES (checked at call time):
 *   - accessors.js:        getCharacterById, getPlaceById, getCharacters
 *   - query-helpers.js:    (not used here — kept out of the dependency graph)
 *   - family-queries.js:   isBloodRelated (for isBloodRelativeBasic)
 *   - relationship domain: getRelationshipBetween (for isSpouseBasic)
 *   - time.js:             getCurrentYearSafe (for age display and filters)
 *   - formatting.js:       (not used here — display strings are plain)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME PRECONDITION
    // =========================================================================

    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'selector-base.js: accessors.js must load first ' +
            '(getCharacterById missing).'
        );
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _characterAge(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;

        if (character.isDeceased === true
            && typeof character.deathYear === 'number') {
            return character.deathYear - character.birthYear;
        }

        var year = _currentYear();
        if (year === null) return null;
        var age = year - character.birthYear;
        return age >= 0 ? age : null;
    }

    // =========================================================================
    // 2. FILTER DEFAULTS AND NORMALISATION
    // =========================================================================

    /**
     * Default filterConfig for selector modals. Every selector gets the
     * same shape; each modal decides which fields to actually render.
     *
     *   - gender:    'any' | 'male' | 'female' | 'unknown'
     *   - status:    'any' | 'living' | 'deceased'
     *   - minAge:    integer or null
     *   - maxAge:    integer or null
     *   - locationId: string id or null (null = any location)
     *   - relationshipFilter: 'any' | 'exclude_blood_relative'
     *                         | 'exclude_spouse'
     *                         | 'exclude_blood_relative_and_spouse'
     *   - excludeIds: array of ids to omit from results (e.g. the anchor
     *                 character of a matchmaker, or a currently selected
     *                 entity)
     *   - showDeceased: boolean (when true, `status` filter is bypassed
     *                   for display — the caller wants deceased shown)
     */
    function getDefaultFilterConfig() {
        return {
            gender: 'any',
            status: 'any',
            minAge: null,
            maxAge: null,
            locationId: null,
            relationshipFilter: 'any',
            excludeIds: [],
            showDeceased: false
        };
    }

    var _VALID_GENDERS = ['any', 'male', 'female', 'unknown'];
    var _VALID_STATUS = ['any', 'living', 'deceased'];
    var _VALID_RELATIONSHIP_FILTERS = [
        'any',
        'exclude_blood_relative',
        'exclude_spouse',
        'exclude_blood_relative_and_spouse'
    ];

    /**
     * Merges a caller-supplied filterConfig over the default config,
     * validating enum fields. Unknown enum values are treated as the
     * default (with a console warning). Unknown keys are preserved so
     * caller-supplied extensions don't get silently dropped.
     */
    function normalizeFilterConfig(config) {
        var defaults = getDefaultFilterConfig();
        if (_isMissing(config) || typeof config !== 'object' || Array.isArray(config)) {
            return defaults;
        }

        var out = {};
        for (var key in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
            out[key] = defaults[key];
        }
        for (var k2 in config) {
            if (!Object.prototype.hasOwnProperty.call(config, k2)) continue;
            out[k2] = config[k2];
        }

        if (_VALID_GENDERS.indexOf(out.gender) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid gender filter "' + out.gender +
                    '"; falling back to "any".'
                );
            }
            out.gender = 'any';
        }
        if (_VALID_STATUS.indexOf(out.status) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid status filter "' + out.status +
                    '"; falling back to "any".'
                );
            }
            out.status = 'any';
        }
        if (_VALID_RELATIONSHIP_FILTERS.indexOf(out.relationshipFilter) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid relationshipFilter "' +
                    out.relationshipFilter + '"; falling back to "any".'
                );
            }
            out.relationshipFilter = 'any';
        }

        if (out.minAge !== null && typeof out.minAge !== 'number') out.minAge = null;
        if (out.maxAge !== null && typeof out.maxAge !== 'number') out.maxAge = null;

        if (!Array.isArray(out.excludeIds)) out.excludeIds = [];

        if (out.locationId !== null && typeof out.locationId !== 'string') {
            out.locationId = null;
        }

        return out;
    }

    // =========================================================================
    // 3. CHARACTER MATCH PREDICATES
    // =========================================================================
    //
    // Predicates are pure: (character, config) → boolean. They never
    // mutate and never touch state. The config is the normalized form
    // from normalizeFilterConfig, not the raw caller input.

    function matchGender(character, config) {
        if (!character) return false;
        if (!config || config.gender === 'any') return true;
        if (config.gender === 'unknown') {
            return character.gender !== 'male' && character.gender !== 'female';
        }
        return character.gender === config.gender;
    }

    function matchStatus(character, config) {
        if (!character) return false;
        if (!config) return true;
        if (config.showDeceased === true) return true;
        var isDeceased = character.isDeceased === true;
        if (config.status === 'living') return !isDeceased;
        if (config.status === 'deceased') return isDeceased;
        return true;
    }

    function matchAge(character, config) {
        if (!character) return false;
        if (!config) return true;
        var hasMin = typeof config.minAge === 'number';
        var hasMax = typeof config.maxAge === 'number';
        if (!hasMin && !hasMax) return true;
        var age = _characterAge(character);
        if (age === null) return false;
        if (hasMin && age < config.minAge) return false;
        if (hasMax && age > config.maxAge) return false;
        return true;
    }

    function matchLocation(character, config) {
        if (!character) return false;
        if (!config || !_hasId(config.locationId)) return true;
        if (!_hasId(character.currentLocationId)) return false;
        return character.currentLocationId === config.locationId;
    }

    function matchExcludeIds(character, config) {
        if (!character) return false;
        if (!config || !Array.isArray(config.excludeIds)) return true;
        if (config.excludeIds.length === 0) return true;
        if (!_hasId(character.id)) return true;
        return config.excludeIds.indexOf(character.id) === -1;
    }

    // =========================================================================
    // 4. RELATIONSHIP PREDICATES (REVISED)
    // =========================================================================

    /**
     * True if the two characters share a biological ancestor at any
     * bounded depth, or are directly parent/child.
     *
     * Delegates to FamilyQueries.isBloodRelated. The predicate is a
     * filter helper, so it fails closed: if FamilyQueries isn't loaded,
     * it returns `false` (i.e., "cannot confirm blood relation"). That
     * means a "exclude blood relatives" filter would fall through and
     * show the candidate, which is a defensive default (the user sees
     * more options rather than fewer).
     *
     * @param {string} aId
     * @param {string} bId
     * @returns {boolean}
     */
    function isBloodRelativeBasic(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        if (aId === bId) return false;
        if (typeof window.FamilyQueries === 'undefined'
            || typeof window.FamilyQueries.isBloodRelated !== 'function') {
            return false;
        }
        try {
            return window.FamilyQueries.isBloodRelated(aId, bId) === true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: FamilyQueries.isBloodRelated threw', e
                );
            }
            return false;
        }
    }

    /**
     * True if the two characters have an ongoing marriage relationship.
     *
     * Delegates to RelationshipQueries.getRelationshipBetween. The
     * relationship domain is optional in the current tree (per
     * character-system.js, the relationship rebuild is partial), so this
     * fails closed: if the domain isn't loaded, it returns `false`.
     *
     * "Spouse" here means specifically `type === 'marriage' &&
     * status === 'ongoing'`. It does not cover betrothal, engagement,
     * concubinage, or romance. A caller that needs a broader "romantically
     * linked" predicate should use the relationship domain directly.
     *
     * @param {string} aId
     * @param {string} bId
     * @returns {boolean}
     */
    function isSpouseBasic(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        if (aId === bId) return false;
        if (typeof window.getRelationshipBetween !== 'function') return false;

        var rel = null;
        try {
            rel = window.getRelationshipBetween(aId, bId);
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: getRelationshipBetween threw', e
                );
            }
            return false;
        }
        if (!rel) return false;
        return rel.type === 'marriage' && rel.status === 'ongoing';
    }

    /**
     * Applies the relationshipFilter from config to a candidate.
     *
     *   'any'                                 → true
     *   'exclude_blood_relative'              → !isBloodRelativeBasic
     *   'exclude_spouse'                      → !isSpouseBasic
     *   'exclude_blood_relative_and_spouse'   → both false
     *
     * @param {string} anchorId   the "subject" of the filter (e.g., the
     *                            matchmaker's anchor character)
     * @param {string} candidateId
     * @param {Object} config
     * @returns {boolean}
     */
    function matchRelationship(anchorId, candidateId, config) {
        if (!config || config.relationshipFilter === 'any') return true;
        if (!_hasId(anchorId) || !_hasId(candidateId)) return true;
        if (anchorId === candidateId) return false;

        var filter = config.relationshipFilter;
        if (filter === 'exclude_blood_relative') {
            return !isBloodRelativeBasic(anchorId, candidateId);
        }
        if (filter === 'exclude_spouse') {
            return !isSpouseBasic(anchorId, candidateId);
        }
        if (filter === 'exclude_blood_relative_and_spouse') {
            return !isBloodRelativeBasic(anchorId, candidateId)
                && !isSpouseBasic(anchorId, candidateId);
        }
        return true;
    }

    // =========================================================================
    // 5. COMPOSITE MATCH
    // =========================================================================

    /**
     * True if a character passes every configured filter.
     *
     * @param {Object} character
     * @param {Object} config     normalized config
     * @param {string} [anchorId] the subject of relationship filters
     *                            (optional; only needed when
     *                            config.relationshipFilter !== 'any')
     * @returns {boolean}
     */
    function matchesCharacter(character, config, anchorId) {
        if (!character) return false;
        if (!matchExcludeIds(character, config)) return false;
        if (!matchGender(character, config)) return false;
        if (!matchStatus(character, config)) return false;
        if (!matchAge(character, config)) return false;
        if (!matchLocation(character, config)) return false;
        if (_hasId(anchorId) && !matchRelationship(anchorId, character.id, config)) {
            return false;
        }
        return true;
    }

    // =========================================================================
    // 6. DISPLAY HELPERS
    // =========================================================================

    function getCharacterDisplayName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        var full = (name + ' ' + surname).trim();
        return full.length > 0 ? full : '';
    }

    function getCharacterInitials(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        var n = name.trim().charAt(0).toUpperCase();
        var s = surname.trim().charAt(0).toUpperCase();
        if (n && s) return n + s;
        if (n) return n;
        if (s) return s;
        return '';
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    /**
     * Public namespace used by modals-char-selector.js,
     * modals-household-selector.js, and locationDropdown.js (indirectly
     * via the character selector).
     *
     * The surface is stable; new helpers should be added here, not as
     * separate window.* globals, to keep the selector dependency graph
     * tight.
     */
    window.SelectorHelpers = {
        // Filter config
        getDefaultFilterConfig: getDefaultFilterConfig,
        normalizeFilterConfig: normalizeFilterConfig,

        // Predicates
        matchGender: matchGender,
        matchStatus: matchStatus,
        matchAge: matchAge,
        matchLocation: matchLocation,
        matchExcludeIds: matchExcludeIds,
        matchRelationship: matchRelationship,
        matchesCharacter: matchesCharacter,

        // Relationship predicates
        isBloodRelativeBasic: isBloodRelativeBasic,
        isSpouseBasic: isSpouseBasic,

        // Display
        getCharacterDisplayName: getCharacterDisplayName,
        getCharacterInitials: getCharacterInitials,

        // Diagnostics
        version: 2
    };

    // Backward-compat aliases — the on-disk version exposed
    // `_SelectorBaseHelpers` and a handful of flat globals. Those are
    // preserved so any caller that hasn't migrated continues to work.
    window._SelectorBaseHelpers = window.SelectorHelpers;
    window.getCharacterDisplayName = getCharacterDisplayName;
    window.getCharacterInitials = getCharacterInitials;
    window.isBloodRelativeBasic = isBloodRelativeBasic;
    window.isSpouseBasic = isSpouseBasic;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SelectorHelpers;
    }

})();
