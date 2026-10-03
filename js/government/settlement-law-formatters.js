/**
 * settlement-law-formatters.js
 * UI formatters for civil-law display values. Presentation only.
 * No domain logic. No state. No icons as Unicode.
 *
 * Requires: window.Icons, window._getIcon (via icons.js / modals-core.js)
 */
(function() {
    'use strict';

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }

    var _LAW_TYPE_NAMES = {
        law: 'Law',
        taboo: 'Taboo',
        guideline: 'Guideline'
    };

    var _LAW_DOMAIN_NAMES = {
        marriage: 'Marriage',
        behavior: 'Behavior',
        worship: 'Worship',
        food: 'Food',
        social: 'Social',
        economic: 'Economic',
        political: 'Political',
        sexual: 'Sexual',
        violence: 'Violence',
        death: 'Death'
    };

    var _LAW_CATEGORY_NAMES = {
        religious: 'Religious',
        civil: 'Civil',
        custom: 'Custom'
    };

    var _LAW_SEVERITY_NAMES = {
        minor: 'Minor',
        major: 'Major',
        mortal: 'Mortal'
    };

    function getLawTypeName(type) {
        return _LAW_TYPE_NAMES[type] || type || '';
    }

    function getLawDomainName(domain) {
        return _LAW_DOMAIN_NAMES[domain] || domain || '';
    }

    function getLawCategoryName(category) {
        return _LAW_CATEGORY_NAMES[category] || category || '';
    }

    function getLawSeverityName(severity) {
        return _LAW_SEVERITY_NAMES[severity] || severity || '';
    }

    function getLawSeverityColor(severity) {
        switch (severity) {
            case 'minor':  return 'var(--text-dim)';
            case 'major':  return 'var(--warning)';
            case 'mortal': return 'var(--error)';
            default:       return 'var(--text)';
        }
    }

    /**
     * Returns an icon element for a law type. Uses icons.js via _getIcon.
     * Falls back to empty string if the icon isn't defined. No Unicode.
     */
    function getLawTypeIcon(type) {
        switch (type) {
            case 'law':       return _getIcon('SHIELD');
            case 'taboo':     return _getIcon('X_HEAVY');
            case 'guideline': return _getIcon('CIRCLE_DOT');
            default:          return _getIcon('SHIELD');
        }
    }

    /**
     * Returns an icon element for a law severity. Uses icons.js.
     */
    function getLawSeverityIcon(severity) {
        switch (severity) {
            case 'minor':  return _getIcon('CIRCLE_DOT');
            case 'major':  return _getIcon('WARNING');
            case 'mortal': return _getIcon('X_HEAVY');
            default:       return _getIcon('CIRCLE_DOT');
        }
    }

    /**
     * Convenience: returns a formatted severity descriptor.
     */
    function formatSeverity(severity) {
        return {
            id: severity,
            name: getLawSeverityName(severity),
            color: getLawSeverityColor(severity),
            icon: getLawSeverityIcon(severity)
        };
    }

    /**
     * Convenience: returns a formatted type descriptor.
     */
    function formatType(type) {
        return {
            id: type,
            name: getLawTypeName(type),
            icon: getLawTypeIcon(type)
        };
    }

    /**
     * Convenience: returns a formatted domain descriptor.
     */
    function formatDomain(domain) {
        return {
            id: domain,
            name: getLawDomainName(domain)
        };
    }

    window.SettlementLawFormatters = {
        getLawTypeName: getLawTypeName,
        getLawDomainName: getLawDomainName,
        getLawCategoryName: getLawCategoryName,
        getLawSeverityName: getLawSeverityName,
        getLawSeverityColor: getLawSeverityColor,
        getLawTypeIcon: getLawTypeIcon,
        getLawSeverityIcon: getLawSeverityIcon,
        formatSeverity: formatSeverity,
        formatType: formatType,
        formatDomain: formatDomain
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SettlementLawFormatters;
    }
})();
