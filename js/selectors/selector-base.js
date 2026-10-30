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
 * RELATIONSHIP PREDICATES
 * -----------------------
 *   isBloodRelativeBasic(aId, bId)
 *     → FamilyQueries.isBloodRelated(aId, bId)
 *     Fails closed (returns false) when FamilyQueries isn't loaded.
 *
 *   isSpouseBasic(aId, bId)
 *     → RelationshipQueries.getRelationshipBetween(aId, bId)
 *       filtered to `type === 'marriage' && status === 'ongoing'`.
 *     Fails closed when the relationship domain isn't loaded.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - accessors.js: getCharacterById
 *
 * DEPENDENCIES (checked at call time):
 *   - accessors.js:        getCharacters, getPlaceById
 *   - family-queries.js:   isBloodRelated (for isBloodRelativeBasic)
 *   - relationship domain: getRelationshipBetween (for isSpouseBasic)
 *   - time.js:             getCurrentYear (via getCurrentYearSafe alias fallback)
 *   - icons.js:            getGenderIcon (optional; used by getGenderSymbol)
 *
 * ICON POLICY: No emojis. Icons come from icons.js via window.getGenderIcon
 * or window.Icons if available. Text glyph fallbacks are prohibited.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getGenderSymbol(gender) RESTORED. It was removed in a prior
 *       refactor, and modals-char-selector.js's _buildList still calls
 *       it via _Helpers.getGenderSymbol(char.gender). The selector
 *       threw TypeError on first character row render. Fixed by
 *       delegating to icons.js::getGenderIcon when available; falls
 *       back to a plain-text label from formatting.js::getGenderLabel
 *       otherwise.
 *     - getGenderLabel(gender) added for symmetry. Delegates to
 *       formatting.js::getGenderLabel when available; falls back to
 *       the same local classifier.
 *     - _currentYear() now prefers window.getCurrentYear (canonical)
 *       over window.getCurrentYearSafe (deprecated alias). Prior
 *       revisions called the deprecated alias only.
 *   Previous revisions:
 *     - Relationship predicates rewritten to delegate to
 *       FamilyQueries / RelationshipQueries (dead-field bug fix).
 *     - Flat globals aliased onto SelectorHelpers.
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
        // Prefer the canonical accessor. The deprecated alias is used
        // only if the canonical accessor is not exposed.
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
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
    //
    //   - gender:    'any' | 'male' | 'female' | 'unknown'
    //   - status:    'any' | 'living' | 'deceased'
    //   - minAge:    integer or null
    //   - maxAge:    integer or null
    //   - locationId: string id or null (null = any location)
    //   - relationshipFilter: 'any' | 'exclude_blood_relative'
    //                         | 'exclude_spouse'
    //                         | 'exclude_blood_relative_and_spouse'
    //   - excludeIds: array of ids to omit from results
    //   - showDeceased: boolean

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
    // 4. RELATIONSHIP PREDICATES
    // =========================================================================

    /**
     * True if the two characters share a biological ancestor, or are
     * directly parent/child. Delegates to FamilyQueries.isBloodRelated.
     * Fails closed (returns false) if FamilyQueries is missing.
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
     * Delegates to RelationshipQueries.getRelationshipBetween (or the
     * flat global equivalent). Fails closed (returns false) if the
     * relationship domain is missing.
     *
     * @param {string} aId
     * @param {string} bId
     * @returns {boolean}
     */
    function isSpouseBasic(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        if (aId === bId) return false;

        var getRel = null;
        if (typeof window.getRelationshipBetween === 'function') {
            getRel = window.getRelationshipBetween;
        } else if (typeof window.RelationshipQueries !== 'undefined'
            && window.RelationshipQueries
            && typeof window.RelationshipQueries.getRelationshipBetween === 'function') {
            getRel = window.RelationshipQueries.getRelationshipBetween;
        }
        if (!getRel) return false;

        var rel = null;
        try {
            rel = getRel(aId, bId);
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
     * @param {string} anchorId   the "subject" of the filter
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

    /**
     * Returns the gender label ('Male' / 'Female' / 'Unknown').
     * Delegates to formatting.js::getGenderLabel when available;
     * otherwise a local classifier with identical output.
     *
     * @param {string} gender
     * @returns {string}
     */
    function getGenderLabel(gender) {
        if (typeof window.getGenderLabel === 'function') {
            var fromFormatting = window.getGenderLabel(gender);
            if (typeof fromFormatting === 'string' && fromFormatting.length > 0) {
                return fromFormatting;
            }
        }
        switch (gender) {
            case 'male': return 'Male';
            case 'female': return 'Female';
            default: return 'Unknown';
        }
    }

    /**
     * Returns the gender symbol as trusted HTML (an SVG from icons.js)
     * when icons are available, or a plain-text label as a fallback.
     *
     * modals-char-selector.js::_buildList calls this via
     * _Helpers.getGenderSymbol(char.gender). The output is inserted
     * into the selector row via innerHTML, so the returned string must
     * be either trusted SVG (from icons.js) or HTML-escaped text.
     *
     * Priority:
     *   1. window.getGenderIcon(gender)   — SVG markup (icons.js)
     *   2. window.Icons[GENDER_ICON_NAME] — SVG markup by name
     *   3. plain-text label from getGenderLabel, HTML-escaped
     *
     * @param {string} gender
     * @returns {string}
     */
    function getGenderSymbol(gender) {
        if (typeof window.getGenderIcon === 'function') {
            try {
                var icon = window.getGenderIcon(gender);
                if (typeof icon === 'string' && icon.length > 0) {
                    return icon;
                }
            } catch (e) {
                // Fall through to the local lookup.
            }
        }

        if (window.Icons && typeof window.Icons === 'object') {
            var iconName = 'GENDER_NEUTRAL';
            if (gender === 'male') iconName = 'MALE';
            else if (gender === 'female') iconName = 'FEMALE';
            var svg = window.Icons[iconName];
            if (typeof svg === 'string' && svg.length > 0) {
                return svg;
            }
        }

        // Text fallback. Escape in case a caller inserts into innerHTML.
        return _escapeText(getGenderLabel(gender));
    }

    function _escapeText(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

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
        getGenderLabel: getGenderLabel,
        getGenderSymbol: getGenderSymbol,

        // Diagnostics
        version: 3
    };

    // Backward-compat aliases.
    window._SelectorBaseHelpers = window.SelectorHelpers;
    window.getCharacterDisplayName = getCharacterDisplayName;
    window.getCharacterInitials = getCharacterInitials;
    window.isBloodRelativeBasic = isBloodRelativeBasic;
    window.isSpouseBasic = isSpouseBasic;
    window.getGenderLabel = getGenderLabel;
    window.getGenderSymbol = getGenderSymbol;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SelectorHelpers;
    }

})();
