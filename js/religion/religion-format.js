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

    function getLawTypeName(typeId) {
        if (typeId === undefined || typeId === null || typeId === '') return '';
        return LAW_TYPE_NAMES[typeId] || typeId;
    }

    function getLawCategoryName(categoryId) {
        if (categoryId === undefined || categoryId === null || categoryId === '') return '';
        return LAW_CATEGORY_NAMES[categoryId] || categoryId;
    }

    function getLawDomainName(domainId) {
        if (domainId === undefined || domainId === null || domainId === '') return '';
        return LAW_DOMAIN_NAMES[domainId] || domainId;
    }

    function getLawSeverityName(severityId) {
        if (severityId === undefined || severityId === null || severityId === '') return '';
        return LAW_SEVERITY_NAMES[severityId] || severityId;
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
