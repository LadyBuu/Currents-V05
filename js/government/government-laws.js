/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT LAWS (government-laws.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/government/government-laws.js
 * 
 * Civil law definitions for settlements.
 * Mirrors religion-laws.js structure.
 * 
 * DEPENDENCIES:
 *   - settlement-state.js: SettlementState
 *   - crime-constants.js: LAW_TYPES, LAW_CATEGORIES, LAW_DOMAINS, LAW_SEVERITY
 *   - ids.js: generateId
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingLaw = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        if (typeof window.updateSettlementData === 'function') {
            return window.updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(id);
            return place ? place.displayName : 'Unknown';
        }
        return 'Unknown';
    }

    // =========================================================================
    // 3. CONSTANTS REFERENCE
    // =========================================================================

    var _LAW_TYPES = window.LAW_TYPES || {
        LAW: 'law',
        TABOO: 'taboo',
        GUIDELINE: 'guideline'
    };

    var _LAW_CATEGORIES = window.LAW_CATEGORIES || {
        RELIGIOUS: 'religious',
        CIVIL: 'civil',
        CUSTOM: 'custom'
    };

    var _LAW_DOMAINS = window.LAW_DOMAINS || {
        MARRIAGE: 'marriage',
        BEHAVIOR: 'behavior',
        WORSHIP: 'worship',
        FOOD: 'food',
        SOCIAL: 'social',
        ECONOMIC: 'economic',
        POLITICAL: 'political',
        SEXUAL: 'sexual',
        VIOLENCE: 'violence',
        DEATH: 'death'
    };

    var _LAW_SEVERITY = window.LAW_SEVERITY || {
        MINOR: 'minor',
        MAJOR: 'major',
        MORTAL: 'mortal'
    };

    var _CRIME_TYPES = window.CRIME_TYPES || {};

    // =========================================================================
    // 4. LAW CRUD
    // =========================================================================

    /**
     * Adds a civil law to a settlement
     * @param {string} locationId - Settlement location ID
     * @param {Object} lawData - Law data
     * @returns {Object} { success, data, reason }
     */
    function addCivilLaw(locationId, lawData) {
        if (_processingLaw) {
            return { success: false, reason: 'Law operation already in progress' };
        }

        _processingLaw = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) {
                return { success: false, reason: 'Settlement not found' };
            }

            if (!lawData.name || lawData.name.trim() === '') {
                return { success: false, reason: 'Law name is required' };
            }

            // Validate domain
            var validDomains = Object.values(_LAW_DOMAINS);
            if (lawData.domain && validDomains.indexOf(lawData.domain) === -1) {
                return { success: false, reason: 'Invalid law domain: ' + lawData.domain };
            }

            // Validate severity
            var validSeverities = Object.values(_LAW_SEVERITY);
            if (lawData.severity && validSeverities.indexOf(lawData.severity) === -1) {
                return { success: false, reason: 'Invalid law severity: ' + lawData.severity };
            }

            // Validate law type
            var validTypes = Object.values(_LAW_TYPES);
            if (lawData.type && validTypes.indexOf(lawData.type) === -1) {
                return { success: false, reason: 'Invalid law type: ' + lawData.type };
            }

            // Validate crime type if provided
            if (lawData.crimeType && _CRIME_TYPES) {
                var crimeTypes = Object.values(_CRIME_TYPES);
                if (crimeTypes.indexOf(lawData.crimeType) === -1) {
                    return { success: false, reason: 'Invalid crime type: ' + lawData.crimeType };
                }
            }

            var law = {
                id: _generateId('civillaw'),
                name: lawData.name.trim(),
                type: lawData.type || _LAW_TYPES.LAW,
                lawCategory: 'civil',
                domain: lawData.domain || _LAW_DOMAINS.BEHAVIOR,
                description: lawData.description || '',
                severity: lawData.severity || _LAW_SEVERITY.MINOR,
                crimeMapping: {
                    crimeType: lawData.crimeType || null,
                    crimeSeverity: lawData.crimeSeverity || null,
                    isEnforced: lawData.isEnforced || false,
                    punishment: lawData.punishment || null,
                    notes: lawData.crimeNotes || ''
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                notes: lawData.notes || ''
            };

            if (!settlement.civilLaws) {
                settlement.civilLaws = [];
            }

            settlement.civilLaws.push(law);

            var result = _updateSettlementData(locationId, {
                civilLaws: settlement.civilLaws
            });

            if (result) {
                _showToast('Civil law added: ' + law.name, 'success');
                return {
                    success: true,
                    data: law,
                    reason: 'Civil law added successfully'
                };
            }

            return { success: false, reason: 'Failed to add civil law' };

        } catch (e) {
            return { success: false, reason: e.message || 'Unknown error' };
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Updates a civil law
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} { success, data, reason }
     */
    function updateCivilLaw(locationId, lawId, updates) {
        if (_processingLaw) {
            return { success: false, reason: 'Law operation already in progress' };
        }

        _processingLaw = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement || !settlement.civilLaws) {
                return { success: false, reason: 'Settlement or laws not found' };
            }

            var index = -1;
            for (var i = 0; i < settlement.civilLaws.length; i++) {
                if (settlement.civilLaws[i].id === lawId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, reason: 'Law not found' };
            }

            var law = settlement.civilLaws[index];

            // Update fields
            if (updates.name !== undefined) law.name = updates.name.trim();
            if (updates.type !== undefined) {
                var validTypes = Object.values(_LAW_TYPES);
                if (validTypes.indexOf(updates.type) === -1) {
                    return { success: false, reason: 'Invalid law type: ' + updates.type };
                }
                law.type = updates.type;
            }
            if (updates.domain !== undefined) {
                var validDomains = Object.values(_LAW_DOMAINS);
                if (validDomains.indexOf(updates.domain) === -1) {
                    return { success: false, reason: 'Invalid law domain: ' + updates.domain };
                }
                law.domain = updates.domain;
            }
            if (updates.description !== undefined) law.description = updates.description;
            if (updates.severity !== undefined) {
                var validSeverities = Object.values(_LAW_SEVERITY);
                if (validSeverities.indexOf(updates.severity) === -1) {
                    return { success: false, reason: 'Invalid law severity: ' + updates.severity };
                }
                law.severity = updates.severity;
            }
            if (updates.notes !== undefined) law.notes = updates.notes;

            // Update crime mapping
            if (updates.crimeMapping !== undefined) {
                if (updates.crimeMapping.crimeType !== undefined) {
                    if (updates.crimeMapping.crimeType && _CRIME_TYPES) {
                        var crimeTypes = Object.values(_CRIME_TYPES);
                        if (crimeTypes.indexOf(updates.crimeMapping.crimeType) === -1) {
                            return { success: false, reason: 'Invalid crime type: ' + updates.crimeMapping.crimeType };
                        }
                    }
                    law.crimeMapping.crimeType = updates.crimeMapping.crimeType;
                }
                if (updates.crimeMapping.crimeSeverity !== undefined) {
                    law.crimeMapping.crimeSeverity = updates.crimeMapping.crimeSeverity;
                }
                if (updates.crimeMapping.isEnforced !== undefined) {
                    law.crimeMapping.isEnforced = updates.crimeMapping.isEnforced;
                }
                if (updates.crimeMapping.punishment !== undefined) {
                    law.crimeMapping.punishment = updates.crimeMapping.punishment;
                }
                if (updates.crimeMapping.notes !== undefined) {
                    law.crimeMapping.notes = updates.crimeMapping.notes;
                }
            }

            law.updatedAt = Date.now();

            var result = _updateSettlementData(locationId, {
                civilLaws: settlement.civilLaws
            });

            if (result) {
                _showToast('Civil law updated: ' + law.name, 'success');
                return {
                    success: true,
                    data: law,
                    reason: 'Civil law updated successfully'
                };
            }

            return { success: false, reason: 'Failed to update civil law' };

        } catch (e) {
            return { success: false, reason: e.message || 'Unknown error' };
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Removes a civil law
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @returns {Object} { success, reason }
     */
    function removeCivilLaw(locationId, lawId) {
        if (_processingLaw) {
            return { success: false, reason: 'Law operation already in progress' };
        }

        _processingLaw = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement || !settlement.civilLaws) {
                return { success: false, reason: 'Settlement or laws not found' };
            }

            var index = -1;
            for (var i = 0; i < settlement.civilLaws.length; i++) {
                if (settlement.civilLaws[i].id === lawId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, reason: 'Law not found' };
            }

            var removedLaw = settlement.civilLaws[index];
            settlement.civilLaws.splice(index, 1);

            var result = _updateSettlementData(locationId, {
                civilLaws: settlement.civilLaws
            });

            if (result) {
                _showToast('Civil law removed: ' + removedLaw.name, 'info');
                return {
                    success: true,
                    reason: 'Civil law removed successfully'
                };
            }

            return { success: false, reason: 'Failed to remove civil law' };

        } catch (e) {
            return { success: false, reason: e.message || 'Unknown error' };
        } finally {
            _processingLaw = false;
        }
    }

    // =========================================================================
    // 5. LAW QUERIES
    // =========================================================================

    /**
     * Gets all civil laws for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Array} Array of law objects
     */
    function getCivilLaws(locationId) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return [];
            return settlement.civilLaws || [];
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets civil laws by domain
     * @param {string} locationId - Settlement location ID
     * @param {string} domain - Law domain
     * @returns {Array} Array of law objects
     */
    function getCivilLawsByDomain(locationId, domain) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            var laws = getCivilLaws(locationId);
            if (!domain) return laws;

            var result = [];
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].domain === domain) {
                    result.push(laws[i]);
                }
            }
            return result;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets civil laws by severity
     * @param {string} locationId - Settlement location ID
     * @param {string} severity - Law severity
     * @returns {Array} Array of law objects
     */
    function getCivilLawsBySeverity(locationId, severity) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            var laws = getCivilLaws(locationId);
            if (!severity) return laws;

            var result = [];
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].severity === severity) {
                    result.push(laws[i]);
                }
            }
            return result;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets enforced civil laws
     * @param {string} locationId - Settlement location ID
     * @returns {Array} Array of law objects
     */
    function getEnforcedCivilLaws(locationId) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            var laws = getCivilLaws(locationId);
            var result = [];

            for (var i = 0; i < laws.length; i++) {
                if (laws[i].crimeMapping && laws[i].crimeMapping.isEnforced) {
                    result.push(laws[i]);
                }
            }

            return result;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets a single civil law by ID
     * @param {string} locationId - Settlement location ID
     * @param {string} lawId - Law ID
     * @returns {Object|null} Law object or null
     */
    function getCivilLaw(locationId, lawId) {
        if (_processingLaw) return null;
        _processingLaw = true;

        try {
            var laws = getCivilLaws(locationId);
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].id === lawId) {
                    return laws[i];
                }
            }
            return null;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets civil law count for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {number} Number of laws
     */
    function getCivilLawCount(locationId) {
        if (_processingLaw) return 0;
        _processingLaw = true;

        try {
            var laws = getCivilLaws(locationId);
            return laws.length;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets laws by crime type
     * @param {string} locationId - Settlement location ID
     * @param {string} crimeType - Crime type
     * @returns {Array} Array of law objects
     */
    function getCivilLawsByCrimeType(locationId, crimeType) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            if (!crimeType) return [];

            var laws = getCivilLaws(locationId);
            var result = [];

            for (var i = 0; i < laws.length; i++) {
                if (laws[i].crimeMapping && laws[i].crimeMapping.crimeType === crimeType) {
                    result.push(laws[i]);
                }
            }

            return result;
        } finally {
            _processingLaw = false;
        }
    }

    /**
     * Gets enforced laws by crime type
     * @param {string} locationId - Settlement location ID
     * @param {string} crimeType - Crime type
     * @returns {Array} Array of law objects
     */
    function getEnforcedCivilLawsByCrimeType(locationId, crimeType) {
        if (_processingLaw) return [];
        _processingLaw = true;

        try {
            var laws = getCivilLawsByCrimeType(locationId, crimeType);
            var result = [];

            for (var i = 0; i < laws.length; i++) {
                if (laws[i].crimeMapping && laws[i].crimeMapping.isEnforced) {
                    result.push(laws[i]);
                }
            }

            return result;
        } finally {
            _processingLaw = false;
        }
    }

    // =========================================================================
    // 6. LAW STATISTICS
    // =========================================================================

    /**
     * Gets law statistics for a settlement
     * @param {string} locationId - Settlement location ID
     * @returns {Object} Statistics object
     */
    function getCivilLawStatistics(locationId) {
        if (_processingLaw) return null;
        _processingLaw = true;

        try {
            var settlement = _getSettlementData(locationId);
            if (!settlement) return null;

            var laws = settlement.civilLaws || [];

            var stats = {
                totalLaws: laws.length,
                byDomain: {},
                bySeverity: {},
                enforced: 0,
                notEnforced: 0,
                byCrimeType: {}
            };

            for (var i = 0; i < laws.length; i++) {
                var law = laws[i];

                // By domain
                if (!stats.byDomain[law.domain]) stats.byDomain[law.domain] = 0;
                stats.byDomain[law.domain]++;

                // By severity
                if (!stats.bySeverity[law.severity]) stats.bySeverity[law.severity] = 0;
                stats.bySeverity[law.severity]++;

                // Enforced
                if (law.crimeMapping && law.crimeMapping.isEnforced) {
                    stats.enforced++;
                } else {
                    stats.notEnforced++;
                }

                // By crime type
                if (law.crimeMapping && law.crimeMapping.crimeType) {
                    if (!stats.byCrimeType[law.crimeMapping.crimeType]) {
                        stats.byCrimeType[law.crimeMapping.crimeType] = 0;
                    }
                    stats.byCrimeType[law.crimeMapping.crimeType]++;
                }
            }

            stats.locationName = _getPlaceName(locationId);

            return stats;
        } finally {
            _processingLaw = false;
        }
    }

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    /**
     * Gets display name for law type
     */
    function getLawTypeName(type) {
        var names = {
            'law': 'Law',
            'taboo': 'Taboo',
            'guideline': 'Guideline'
        };
        return names[type] || type;
    }

    /**
     * Gets display name for law domain
     */
    function getLawDomainName(domain) {
        var names = {
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
        return names[domain] || domain;
    }

    /**
     * Gets display name for law severity
     */
    function getLawSeverityName(severity) {
        var names = {
            'minor': 'Minor',
            'major': 'Major',
            'mortal': 'Mortal'
        };
        return names[severity] || severity;
    }

    /**
     * Gets color for law severity
     */
    function getLawSeverityColor(severity) {
        var colors = {
            'minor': 'var(--text-dim)',
            'major': 'var(--warning)',
            'mortal': 'var(--error)'
        };
        return colors[severity] || 'var(--text)';
    }

    /**
     * Gets icon for law type
     */
    function getLawTypeIcon(type) {
        var icons = {
            'law': '◉',
            'taboo': '✕',
            'guideline': '○'
        };
        return icons[type] || '◉';
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.GovernmentLaws = {
        // CRUD
        addCivilLaw: addCivilLaw,
        updateCivilLaw: updateCivilLaw,
        removeCivilLaw: removeCivilLaw,

        // Queries
        getCivilLaws: getCivilLaws,
        getCivilLawsByDomain: getCivilLawsByDomain,
        getCivilLawsBySeverity: getCivilLawsBySeverity,
        getEnforcedCivilLaws: getEnforcedCivilLaws,
        getCivilLaw: getCivilLaw,
        getCivilLawCount: getCivilLawCount,
        getCivilLawsByCrimeType: getCivilLawsByCrimeType,
        getEnforcedCivilLawsByCrimeType: getEnforcedCivilLawsByCrimeType,

        // Statistics
        getCivilLawStatistics: getCivilLawStatistics,

        // Helpers
        getLawTypeName: getLawTypeName,
        getLawDomainName: getLawDomainName,
        getLawSeverityName: getLawSeverityName,
        getLawSeverityColor: getLawSeverityColor,
        getLawTypeIcon: getLawTypeIcon,

        // Constants reference
        LAW_TYPES: _LAW_TYPES,
        LAW_CATEGORIES: _LAW_CATEGORIES,
        LAW_DOMAINS: _LAW_DOMAINS,
        LAW_SEVERITY: _LAW_SEVERITY
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            GovernmentLaws: window.GovernmentLaws
        };
    }

})();