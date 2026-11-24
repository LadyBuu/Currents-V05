/**
 * =============================================================================
 * STILL WATERS - RELIGION FORMAT (religion-format.js)
 * =============================================================================
 * 
 * LOCATION: js/religion/religion-format.js
 * 
 * Canonical display-name lookups for religion vocabulary.
 * Pure functions. Enum in, string out.
 * 
 * Does NOT contain colors, icons, or CSS class names.
 * Those are presentation concerns handled by the renderer + CSS.
 * 
 * DEPENDENCIES:
 *   - religion-constants.js: ReligionConstants
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - New module. Display-name lookups consolidated here.
 * 
 * PHASE 6 CLEANUP (2026):
 *   - Deleted legacy global aliases (window.getReligiousTraitName,
 *     window.getWorshipTypeName, window.getInheritanceRuleName,
 *     window.getConversionReasonName). Canonical access is
 *     ReligionFormat.* only.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _getConstants() {
        if (typeof window.ReligionConstants === 'undefined') {
            throw new Error(
                'ReligionFormat requires ReligionConstants to be loaded. ' +
                'Check script order in index.html.'
            );
        }
        return window.ReligionConstants;
    }

    // =========================================================================
    // 2. RELIGION VOCABULARY
    // =========================================================================

    function getReligiousTraitName(traitId) {
        if (traitId === undefined || traitId === null || traitId === '') return '';
        var names = _getConstants().RELIGIOUS_TRAIT_NAMES;
        return names[traitId] || traitId;
    }

    function getWorshipTypeName(typeId) {
        if (typeId === undefined || typeId === null || typeId === '') return '';
        var names = _getConstants().WORSHIP_TYPE_NAMES;
        return names[typeId] || typeId;
    }

    function getInheritanceRuleName(ruleId) {
        if (ruleId === undefined || ruleId === null || ruleId === '') return '';
        var names = _getConstants().INHERITANCE_RULE_NAMES;
        return names[ruleId] || ruleId;
    }

    function getConversionReasonName(reasonId) {
        if (reasonId === undefined || reasonId === null || reasonId === '') return '';
        var names = _getConstants().CONVERSION_REASON_NAMES;
        return names[reasonId] || reasonId;
    }

    // =========================================================================
    // 3. LAW VOCABULARY
    // =========================================================================

    var LAW_TYPE_NAMES = {
        'law': 'Law',
        'taboo': 'Taboo',
        'guideline': 'Guideline'
    };

    var LAW_CATEGORY_NAMES = {
        'religious': 'Religious Law',
        'civil': 'Civil Law',
        'custom': 'Custom Law'
    };

    var LAW_DOMAIN_NAMES = {
        'marriage': 'Marriage',
        'behavior': 'Behavior',
        'worship': 'Worship',
        'food': 'Food',
        'social': 'Social',
        'economic': 'Economic',
        'political': 'Political',
        'sexual': 'Sexual',
        'violence': 'Violence',
        'death': 'Death'
    };

    var LAW_SEVERITY_NAMES = {
        'minor': 'Minor',
        'major': 'Major',
        'mortal': 'Mortal'
    };

    function _findEnumDisplayName(source, value) {
        if (!source) return null;
        if (Array.isArray(source)) {
            for (var i = 0; i < source.length; i++) {
                if (source[i] && source[i].id === value &&
                    typeof source[i].name === 'string' && source[i].name) {
                    return source[i].name;
                }
            }
            return null;
        }
        if (typeof source === 'object') {
            if (source[value] && typeof source[value] === 'object' &&
                typeof source[value].name === 'string') {
                return source[value].name;
            }
            for (var key in source) {
                if (Object.prototype.hasOwnProperty.call(source, key) &&
                    source[key] === value) {
                    return key.toLowerCase().replace(/_/g, ' ')
                        .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
                }
            }
        }
        return null;
    }

    function _lawName(value, source, fallback) {
        if (value === undefined || value === null || value === '') return '';
        return _findEnumDisplayName(source, value) || fallback[value] || value;
    }

    function getLawTypeName(typeId) {
        var definitions = window.SettlementLawDefinitions;
        return _lawName(typeId, definitions && definitions.LAW_TYPES, LAW_TYPE_NAMES);
    }

    function getLawCategoryName(categoryId) {
        if (categoryId === undefined || categoryId === null || categoryId === '') return '';
        var constants = window.CrimeConstants;
        return LAW_CATEGORY_NAMES[categoryId] ||
            _lawName(categoryId, constants && constants.LAW_CATEGORIES, LAW_CATEGORY_NAMES);
    }

    function getLawDomainName(domainId) {
        var definitions = window.SettlementLawDefinitions;
        return _lawName(domainId, definitions && definitions.LAW_DOMAINS, LAW_DOMAIN_NAMES);
    }

    function getLawSeverityName(severityId) {
        var definitions = window.SettlementLawDefinitions;
        var constants = window.CrimeConstants;
        return _lawName(
            severityId,
            definitions && definitions.LAW_SEVERITIES
                ? definitions.LAW_SEVERITIES
                : (constants && constants.LAW_SEVERITY),
            LAW_SEVERITY_NAMES
        );
    }

    // =========================================================================
    // 4. GENERIC HELPERS
    // =========================================================================

    function humanize(value) {
        if (value === undefined || value === null || value === '') return '';
        var str = String(value);
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ReligionFormat = {
        // Religion vocabulary
        getReligiousTraitName: getReligiousTraitName,
        getWorshipTypeName: getWorshipTypeName,
        getInheritanceRuleName: getInheritanceRuleName,
        getConversionReasonName: getConversionReasonName,

        // Law vocabulary
        getLawTypeName: getLawTypeName,
        getLawCategoryName: getLawCategoryName,
        getLawDomainName: getLawDomainName,
        getLawSeverityName: getLawSeverityName,

        // Generic
        humanize: humanize
    };

    // =========================================================================
    // 6. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionFormat: window.ReligionFormat };
    }

})();
