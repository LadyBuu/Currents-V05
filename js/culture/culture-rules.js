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
 * It owns:
 *   - the default-appearance shape used when a culture declares none
 *   - the fallback-chain resolution for "which culture applies here"
 *   - the eligibility predicates for create / update / delete
 *   - the label and icon policy used by non-UI consumers
 *
 * It does NOT:
 *   - mutate canonical data
 *   - persist
 *   - render
 *   - build view models
 *   - own modal flow
 *   - know about characters, places, or religions by direct read
 *
 * Those are Queries' job. Rules composes Queries; it does not replace it.
 *
 * DEPENDENCIES (call-time, guarded per call):
 *   CultureQueries          resolve / list cultures
 *   CultureConstants        CULTURE_DEFAULT_APPEARANCE
 *   CultureViewModels       labelFor (optional; falls back to local policy)
 *
 * None of the supplied culture modules read window.CultureRules. The
 * supplied CultureQueries / Generation / ViewModels / UI / Modals do not
 * hard-guard on it. This file exists so any caller outside the culture
 * batch that DOES read window.CultureRules gets a real, documented
 * decision surface instead of a silent undefined.
 *
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
    // 2. LABEL / ICON POLICY
    // =========================================================================
    //
    // Mirrors CultureViewModels.labelFor / iconFor. Kept here so that a
    // caller who reaches CultureRules does not have to also reach
    // CultureViewModels. If ViewModels is present, delegate to it so the
    // policy lives in exactly one place.

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
    // 3. DEFAULT APPEARANCE
    // =========================================================================
    //
    // The "what does a culture with no appearance look like" answer.
    // Deep-copied so a caller cannot mutate the constant through the
    // rules layer.

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

    /**
     * The appearance to use for a culture. Returns the culture's own
     * appearance when it is a non-empty object; otherwise the constant
     * default. Never returns null/undefined.
     */
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
    // 4. RESOLUTION
    // =========================================================================
    //
    // "Which culture applies here" with an explicit precedence chain.
    // CultureQueries.getPrimaryCultureForLocation already walks the place
    // hierarchy; this method adds the caller-facing fallback rules on top:
    //
    //   1. explicit cultureId argument
    //   2. primary culture for the supplied locationId
    //   3. first culture whose `locations` array contains locationId
    //   4. null
    //
    // Callers who want strict resolution should call Queries directly.
    // Callers who want "best effort with documented precedence" call this.

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
    // 5. ELIGIBILITY PREDICATES
    // =========================================================================
    //
    // Thin, named booleans over the shapes the Commands layer already
    // enforces. They exist so callers can ask "can I?" before building a
    // modal, without duplicating the field allowlist.

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
    // 6. APPEARANCE CATEGORY NORMALIZATION
    // =========================================================================
    //
    // CultureConstants defines CULTURE_APPEARANCE_CATEGORIES but no supplied
    // module reads it. This helper is the read path for a caller that wants
    // the canonical category list without reaching into the constant.

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
    // 7. INTEGRITY REPORT
    // =========================================================================
    //
    // CultureState.validateIntegrity reports data problems. This method
    // reports rule-level problems: a culture whose appearance categories
    // are all empty, a culture whose locations all point at missing places,
    // and so on. It is warn-only, like the State check, and is meant to be
    // called by bootstrap after hydration.

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
    // 8. LOAD-TIME VERIFICATION
    // =========================================================================
    //
    // CultureRules is deliberately permissive at load. The modules that
    // depend on it (whatever they are) may load before or after it, and
    // CultureQueries may or may not exist at parse time. Resolution
    // fails loudly at call time via _requireQueries; it does not fail
    // the page at parse time. This matches the "verification is a
    // load-time concern only for hard, unambiguous dependencies"
    // posture in culture-bootstrap.js.

    // =========================================================================
    // 9. PUBLIC API
    // =========================================================================

    window.CultureRules = {
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
