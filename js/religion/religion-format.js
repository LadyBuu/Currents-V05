/**
 * =============================================================================
 * STILL WATERS - RELIGION FORMAT (religion-format.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-format.js
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
 *   - New module. Display-name lookups from religion-constants.js,
 *     religion-laws.js, and religion-inheritance.js all consolidate here.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================
    // Requires ReligionConstants to be loaded. No fallback vocabulary maps.
    // See ADR Decision 8: required dependencies fail loudly.

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
        var constants = _getConstants();
        var names = constants.RELIGIOUS_TRAIT_NAMES;
        return names[traitId] || traitId;
    }

    function getWorshipTypeName(typeId) {
        if (typeId === undefined || typeId === null || typeId === '') return '';
        var constants = _getConstants();
        var names = constants.WORSHIP_TYPE_NAMES;
        return names[typeId] || typeId;
    }

    function getInheritanceRuleName(ruleId) {
        if (ruleId === undefined || ruleId === null || ruleId === '') return '';
        var constants = _getConstants();
        var names = constants.INHERITANCE_RULE_NAMES;
        return names[ruleId] || ruleId;
    }

    function getConversionReasonName(reasonId) {
        if (reasonId === undefined || reasonId === null || reasonId === '') return '';
        var constants = _getConstants();
        var names = constants.CONVERSION_REASON_NAMES;
        return names[reasonId] || reasonId;
    }

    // =========================================================================
    // 3. LAW VOCABULARY
    // =========================================================================
    // Law enums currently live on the window global (LAW_TYPES, etc.) rather
    // than in ReligionConstants. Phase 3 will decide whether to migrate them.
    // For now, this module reads them from window, matching the current
    // reality without adding a second vocabulary source.

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
    // Capitalize-first-word helper, used by renderers that need a sensible
    // fallback label for an enum value with no explicit display name.

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
    // 6. LEGACY GLOBAL ALIASES
    // =========================================================================
    // Restore the four globals that religion-constants.js stopped defining in
    // Phase 2 file 1. Consumers currently calling window.getReligiousTraitName
    // etc. will keep working through Phase 2–5. Removed in Phase 6.

    if (typeof window.getReligiousTraitName === 'undefined') {
        window.getReligiousTraitName = getReligiousTraitName;
    }
    if (typeof window.getWorshipTypeName === 'undefined') {
        window.getWorshipTypeName = getWorshipTypeName;
    }
    if (typeof window.getInheritanceRuleName === 'undefined') {
        window.getInheritanceRuleName = getInheritanceRuleName;
    }
    if (typeof window.getConversionReasonName === 'undefined') {
        window.getConversionReasonName = getConversionReasonName;
    }

    // =========================================================================
    // 7. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionFormat: window.ReligionFormat
        };
    }

})();
