/**
 * =============================================================================
 * STILL WATERS - CULTURE RULES
 * js/culture/culture-rules.js
 * =============================================================================
 *
 * Decision layer for culture, above Queries and below Commands.
 *
 * Queries answer "what exists". Commands answer "how do I write it".
 * Rules answer "is this allowed, and which one wins when several apply".
 *
 * RELATIONSHIP ATTRIBUTE POLICY
 * -----------------------------
 * relationship-bootstrap.js reads
 * window.CultureRules.supportsRelationshipAttribute(attributeId) at load
 * time to decide whether a relationship attribute is culture-supported.
 * This file supplies that function. The current policy is "every non-empty
 * string attribute id is culture-supported" — the culture subsystem does
 * not yet distinguish attributes by culture. When attribute-specific
 * policy is added, it goes in supportsRelationshipAttribute. Returning
 * `true` is a real answer to the question the bootstrap asks, not a
 * placeholder for missing logic.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A6):
 *     - Added supportsRelationshipAttribute(attributeId). Satisfies
 *       relationship-bootstrap.js's load-time check.
 *     - Header gains RELATIONSHIP ATTRIBUTE POLICY section.
 *   Previous revision:
 *     - Initial delivery. Exports label/icon policy, defaults,
 *       resolution, eligibility predicates, appearance categories,
 *       validateRules.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REQUIREMENT
    // =========================================================================

    function _requireQueries() {
        if (!window.CultureQueries) {
            throw new Error(
                'CultureRules requires CultureQueries for culture resolution.'
            );
        }
        return window.CultureQueries;
    }

    function _requireConstants() {
        if (!window.CULTURE_DEFAULT_APPEARANCE) {
            throw new Error(
                'CultureRules requires CULTURE_DEFAULT_APPEARANCE from culture-constants.js.'
            );
        }
        return {
            defaultAppearance: window.CULTURE_DEFAULT_APPEARANCE
        };
    }

    // =========================================================================
    // 2. RELATIONSHIP ATTRIBUTE POLICY
    // =========================================================================
    //
    // See RELATIONSHIP ATTRIBUTE POLICY in the module header. Called by
    // relationship-bootstrap.js at load time. Returns a boolean; throws
    // only if the argument is malformed, because the bootstrap calls it
    // once per attribute and a throw there aborts loading.

    function supportsRelationshipAttribute(attributeId) {
        if (typeof attributeId !== 'string' || attributeId.length === 0) {
            return false;
        }
        return true;
    }

    // =========================================================================
    // 3. LABEL / ICON POLICY
    // =========================================================================

    function labelFor(culture) {
        if (!culture) return '';
        if (window.CultureViewModels
            && typeof window.CultureViewModels.labelFor === 'function') {
            return window.CultureViewModels.labelFor(culture);
        }
        if (typeof culture.displayName === 'string' && culture.displayName.length > 0) {
            return culture.displayName;
        }
        if (typeof culture.name === 'string') return culture.name;
        return '';
    }

    function iconFor(culture, options) {
        if (!culture) return null;
        if (window.CultureViewModels
            && typeof window.CultureViewModels.iconFor === 'function') {
            return window.CultureViewModels.iconFor(culture, options);
        }
        if (typeof culture.icon === 'string' && culture.icon.length > 0) {
            return culture.icon;
        }
        if (options && options.iconPlaceholder !== undefined) {
            return options.iconPlaceholder;
        }
        return null;
    }

    // =========================================================================
    // 4. DEFAULT APPEARANCE
    // =========================================================================

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    function defaultAppearance() {
        return _clone(_requireConstants().defaultAppearance);
    }

    function defaultMythology() {
        return {
            creation: '',
            afterlife: '',
            keyDeities: [],
            keyEvents: [],
            cosmology: '',
            symbols: [],
            themes: []
        };
    }

    function appearanceFor(culture) {
        if (culture
            && culture.appearance
            && typeof culture.appearance === 'object'
            && Object.keys(culture.appearance).length > 0) {
            return _clone(culture.appearance);
        }
        return defaultAppearance();
    }

    function mythologyFor(culture) {
        if (culture
            && culture.mythology
            && typeof culture.mythology === 'object') {
            return _clone(culture.mythology);
        }
        return defaultMythology();
    }

    // =========================================================================
    // 5. RESOLUTION
    // =========================================================================

    function resolveCulture(options) {
        options = options || {};
        var queries = _requireQueries();

        if (typeof options.cultureId === 'string' && options.cultureId.length > 0) {
            var direct = queries.getCultureById(options.cultureId);
            if (direct) return direct;
        }

        if (typeof options.locationId === 'string' && options.locationId.length > 0) {
            var primary = queries.getPrimaryCultureForLocation(options.locationId);
            if (primary) return primary;

            var associated = queries.getAssociatedCulturesForLocation(options.locationId);
            if (associated && associated.length > 0) {
                return associated[0];
            }
        }

        if (typeof options.characterId === 'string' && options.characterId.length > 0) {
            var fromCharacter = queries.getCultureForCharacter(options.characterId);
            if (fromCharacter) return fromCharacter;
        }

        return null;
    }

    // =========================================================================
    // 6. ELIGIBILITY PREDICATES
    // =========================================================================

    var _ALLOWED_UPDATE_FIELDS = {
        name: true,
        displayName: true,
        description: true,
        icon: true,
        appearance: true,
        mythology: true,
        locations: true,
        religions: true,
        notes: true
    };

    function canCreateCulture(candidate) {
        if (!candidate || typeof candidate !== 'object') return false;
        if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
            return false;
        }
        return true;
    }

    function canUpdateCulture(cultureId, updates) {
        if (typeof cultureId !== 'string' || cultureId.length === 0) return false;
        if (!updates || typeof updates !== 'object') return false;
        var queries = _requireQueries();
        if (!queries.getCultureById(cultureId)) return false;

        for (var field in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
            if (!_ALLOWED_UPDATE_FIELDS[field]) return false;
        }
        return true;
    }

    function canDeleteCulture(cultureId) {
        if (typeof cultureId !== 'string' || cultureId.length === 0) return false;
        var queries = _requireQueries();
        return queries.getCultureById(cultureId) !== null;
    }

    function isUpdatableField(field) {
        return !!_ALLOWED_UPDATE_FIELDS[field];
    }

    // =========================================================================
    // 7. APPEARANCE CATEGORY NORMALIZATION
    // =========================================================================

    function appearanceCategories() {
        if (window.CULTURE_APPEARANCE_CATEGORIES) {
            var out = [];
            for (var key in window.CULTURE_APPEARANCE_CATEGORIES) {
                if (Object.prototype.hasOwnProperty.call(
                    window.CULTURE_APPEARANCE_CATEGORIES, key)) {
                    out.push(window.CULTURE_APPEARANCE_CATEGORIES[key]);
                }
            }
            return out;
        }
        return [
            'skinTones', 'eyeColors', 'hairColors', 'hairTypes',
            'buildTypes', 'height', 'commonFeatures'
        ];
    }

    // =========================================================================
    // 8. INTEGRITY REPORT
    // =========================================================================

    function validateRules() {
        var findings = [];
        var queries;
        try {
            queries = _requireQueries();
        } catch (e) {
            findings.push({ level: 'error', message: e.message });
            return findings;
        }

        var cultures = queries.getAllCultures();
        if (cultures.length === 0) {
            findings.push({
                level: 'info',
                message: 'No cultures defined. Culture rules are inert.'
            });
            return findings;
        }

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c || !c.id) continue;

            var hasAppearance = c.appearance
                && typeof c.appearance === 'object'
                && Object.keys(c.appearance).length > 0;
            if (!hasAppearance) {
                findings.push({
                    level: 'warn',
                    message: 'Culture "' + labelFor(c) +
                             '" has no appearance; the default template applies.'
                });
            }

            var hasMythology = c.mythology && (
                c.mythology.creation ||
                c.mythology.afterlife ||
                (c.mythology.keyDeities && c.mythology.keyDeities.length > 0)
            );
            if (!hasMythology) {
                findings.push({
                    level: 'info',
                    message: 'Culture "' + labelFor(c) + '" has no mythology content.'
                });
            }
        }

        return findings;
    }

    // =========================================================================
    // 9. PUBLIC API
    // =========================================================================

    window.CultureRules = {
        // Relationship attribute policy
        supportsRelationshipAttribute: supportsRelationshipAttribute,

        // Label / icon policy
        labelFor: labelFor,
        iconFor: iconFor,

        // Defaults
        defaultAppearance: defaultAppearance,
        defaultMythology: defaultMythology,
        appearanceFor: appearanceFor,
        mythologyFor: mythologyFor,

        // Resolution
        resolveCulture: resolveCulture,

        // Eligibility
        canCreateCulture: canCreateCulture,
        canUpdateCulture: canUpdateCulture,
        canDeleteCulture: canDeleteCulture,
        isUpdatableField: isUpdatableField,

        // Appearance vocabulary
        appearanceCategories: appearanceCategories,

        // Diagnostics
        validateRules: validateRules
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureRules;
    }

})();
