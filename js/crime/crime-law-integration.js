/**
 * =============================================================================
 * STILL WATERS - CRIME LAW INTEGRATION (crime-law-integration.js)
 * =============================================================================
 * 
 * LOCATION: js/core/crime/crime-law-integration.js
 * 
 * This file aggregates laws from both Religion and Government systems
 * for the Crime System to enforce.
 * 
 * DEPENDENCIES:
 *   - religion-laws.js: ReligionLaws
 *   - government-laws.js: GovernmentLaws
 *   - accessors.js: getCharacterById, getCurrentLocationId
 *   - settlement-state.js: getSettlementData
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingIntegration = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacterReligion(characterId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getCharacterReligion === 'function') {
            return window.ReligionQueries.getCharacterReligion(characterId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getCharacterReligion === 'function') {
            return window.ReligionState.getCharacterReligion(characterId);
        }
        var character = _getCharacterById(characterId);
        if (character && character.religionId) {
            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getReligion === 'function') {
                return window.ReligionState.getReligion(character.religionId);
            }
        }
        return null;
    }

    function _getCurrentLocationId(character) {
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(character);
        }
        if (!character) return null;
        if (character.currentLocationId) return character.currentLocationId;
        if (character.moves && character.moves.length > 0) {
            var sorted = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            return sorted[0]?.locationId || null;
        }
        return null;
    }

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getSettlementData === 'function') {
            return window.SettlementState.getSettlementData(locationId);
        }
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        return null;
    }

    function _getReligionLaws(religionId) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawsByReligion === 'function') {
            return window.ReligionLaws.getLawsByReligion(religionId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getLawsByReligion === 'function') {
            return window.ReligionState.getLawsByReligion(religionId);
        }
        return [];
    }

    function _getCivilLaws(locationId) {
        if (typeof window.GovernmentLaws !== 'undefined' &&
            typeof window.GovernmentLaws.getCivilLaws === 'function') {
            return window.GovernmentLaws.getCivilLaws(locationId);
        }
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getCivilLaws === 'function') {
            return window.SettlementState.getCivilLaws(locationId);
        }
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getCivilLaws === 'function') {
            return window.SettlementQueries.getCivilLaws(locationId);
        }
        return [];
    }

    function _getDominantReligion(locationId) {
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getDominantReligion === 'function') {
            return window.SettlementState.getDominantReligion(locationId);
        }
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getDominantReligion === 'function') {
            return window.SettlementQueries.getDominantReligion(locationId);
        }
        return null;
    }

    function _getSettlementGovernmentType(locationId) {
        var data = _getSettlementData(locationId);
        return data ? data.governmentType : null;
    }

    function _getUseReligiousLawsAsCivil(locationId) {
        var data = _getSettlementData(locationId);
        return data ? data.useReligiousLawsAsCivil : false;
    }

    function _getReligionName(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            var religion = window.ReligionState.getReligion(religionId);
            return religion ? religion.name : 'Unknown';
        }
        return 'Unknown';
    }

    function _getPlaceName(locationId) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(locationId);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(locationId);
            return place ? place.displayName : 'Unknown';
        }
        return 'Unknown';
    }

    function _isReligiousLawEnforced(law) {
        return law.crimeMapping && law.crimeMapping.isEnforced;
    }

    function _isCivilLawEnforced(law) {
        return law.crimeMapping && law.crimeMapping.isEnforced;
    }

    // =========================================================================
    // 3. LAW AGGREGATION
    // =========================================================================

    /**
     * Gets all applicable laws for a character
     * @param {string} characterId - Character ID
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of law objects with source info
     */
    function getApplicableLaws(characterId, domain) {
        if (_processingIntegration) {
            return [];
        }
        _processingIntegration = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var locationId = _getCurrentLocationId(character);
            var settlement = locationId ? _getSettlementData(locationId) : null;
            
            var laws = [];
            var governmentType = settlement ? settlement.governmentType : null;
            var useReligiousAsCivil = settlement ? settlement.useReligiousLawsAsCivil : false;

            // 1. Get civil laws from settlement
            if (locationId) {
                var civilLaws = _getCivilLaws(locationId);
                for (var i = 0; i < civilLaws.length; i++) {
                    var law = civilLaws[i];
                    // Only include enforced laws for criminal enforcement
                    // But include all for display purposes (UI will show all)
                    laws.push({
                        law: law,
                        source: 'civil',
                        sourceId: locationId,
                        sourceName: _getPlaceName(locationId),
                        isEnforced: _isCivilLawEnforced(law)
                    });
                }
            }

            // 2. Get religious laws
            // If theocracy, religious laws apply to ALL residents
            // If useReligiousLawsAsCivil is true, religious laws apply to ALL residents
            // Otherwise, only followers get religious laws
            var applyReligiousToAll = (governmentType === 'theocracy') || useReligiousAsCivil;
            var religionId = character.religionId;

            // For theocracy, use the dominant religion if character has no religion
            if (applyReligiousToAll && !religionId && locationId) {
                var dominant = _getDominantReligion(locationId);
                if (dominant) {
                    religionId = dominant.id;
                }
            }

            if (religionId) {
                var religiousLaws = _getReligionLaws(religionId);
                var religionName = _getReligionName(religionId);
                
                for (var i = 0; i < religiousLaws.length; i++) {
                    var law = religiousLaws[i];
                    var isEnforced = _isReligiousLawEnforced(law);
                    
                    // If applyReligiousToAll, all religious laws apply
                    // Otherwise, only enforced ones apply to followers
                    if (applyReligiousToAll || isEnforced) {
                        laws.push({
                            law: law,
                            source: 'religious',
                            sourceId: religionId,
                            sourceName: religionName,
                            isEnforced: isEnforced
                        });
                    }
                }
            }

            // 3. Filter by domain if specified
            if (domain) {
                laws = laws.filter(function(item) {
                    return item.law.domain === domain;
                });
            }

            return laws;

        } finally {
            _processingIntegration = false;
        }
    }

    /**
     * Gets only religious laws for a character
     * @param {string} characterId - Character ID
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of religious law objects with source info
     */
    function getReligiousLaws(characterId, domain) {
        var laws = getApplicableLaws(characterId, domain);
        return laws.filter(function(item) { return item.source === 'religious'; });
    }

    /**
     * Gets only civil laws for a character
     * @param {string} characterId - Character ID
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of civil law objects with source info
     */
    function getCivilLawsForCharacter(characterId, domain) {
        var laws = getApplicableLaws(characterId, domain);
        return laws.filter(function(item) { return item.source === 'civil'; });
    }

    /**
     * Gets all enforced laws for a character
     * @param {string} characterId - Character ID
     * @param {string} domain - Optional domain filter
     * @returns {Array} Array of enforced law objects
     */
    function getEnforcedLaws(characterId, domain) {
        var laws = getApplicableLaws(characterId, domain);
        return laws.filter(function(item) { return item.isEnforced; });
    }

    // =========================================================================
    // 4. LAW VIOLATION CHECKS
    // =========================================================================

    /**
     * Checks if an action violates any applicable laws
     * @param {string} characterId - Character ID
     * @param {Object} action - { type, domain, severity, details }
     * @param {Object} context - { locationId, targetId, victim, ... }
     * @returns {Object} { civil: [], religious: [], all: [] }
     */
    function checkLawViolations(characterId, action, context) {
        if (_processingIntegration) {
            return { civil: [], religious: [], all: [] };
        }
        _processingIntegration = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return { civil: [], religious: [], all: [] };

            var locationId = context?.locationId || _getCurrentLocationId(character);
            
            // Get all applicable laws
            var allLaws = getApplicableLaws(characterId, action?.domain);
            
            var violations = {
                civil: [],
                religious: [],
                all: []
            };

            for (var i = 0; i < allLaws.length; i++) {
                var item = allLaws[i];
                var law = item.law;

                // Check if this law is violated by the action
                if (_lawViolatesAction(law, action, context)) {
                    var violation = {
                        law: law,
                        source: item.source,
                        sourceId: item.sourceId,
                        sourceName: item.sourceName,
                        isEnforced: item.isEnforced
                    };
                    
                    violations.all.push(violation);
                    
                    if (item.source === 'civil') {
                        violations.civil.push(violation);
                    } else if (item.source === 'religious') {
                        violations.religious.push(violation);
                    }
                }
            }

            return violations;

        } finally {
            _processingIntegration = false;
        }
    }

    /**
     * Checks if a law is violated by an action
     * @param {Object} law - Law object
     * @param {Object} action - Action being performed
     * @param {Object} context - Context of the action
     * @returns {boolean}
     */
    function _lawViolatesAction(law, action, context) {
        if (!law || !action) return false;

        // If law has a crimeMapping with a crimeType, check if action matches
        if (law.crimeMapping && law.crimeMapping.crimeType) {
            // Direct match
            if (action.type === law.crimeMapping.crimeType) {
                // Check for additional modifiers if any
                return _checkModifiers(law, action, context);
            }
            
            // Check for partial match (e.g., "murder" matches "murder" and "attempted_murder")
            if (action.type && action.type.indexOf(law.crimeMapping.crimeType) !== -1) {
                return _checkModifiers(law, action, context);
            }
        }

        // If law has a domain, check if action matches
        if (law.domain && action.domain) {
            if (law.domain === action.domain) {
                return _checkModifiers(law, action, context);
            }
        }

        // If law has custom logic via function
        if (typeof law.violationCheck === 'function') {
            try {
                return law.violationCheck(action, context);
            } catch (e) {
                return false;
            }
        }

        return false;
    }

    /**
     * Checks additional modifiers for a law violation
     * @param {Object} law - Law object
     * @param {Object} action - Action being performed
     * @param {Object} context - Context of the action
     * @returns {boolean}
     */
    function _checkModifiers(law, action, context) {
        // If no modifiers defined, violation stands
        if (!law.modifiers) return true;

        // Check each modifier
        for (var key in law.modifiers) {
            if (law.modifiers.hasOwnProperty(key)) {
                var required = law.modifiers[key];
                var actual = action.details?.[key] || context?.[key];
                
                // If modifier doesn't match, no violation
                if (actual !== required) {
                    return false;
                }
            }
        }

        return true;
    }

    // =========================================================================
    // 5. SUPREMACY RULES (Theocracy)
    // =========================================================================

    /**
     * Applies supremacy rules based on settlement government type
     * @param {Object} violations - { civil, religious, all }
     * @param {string} locationId - Location ID
     * @returns {Object} Filtered violations
     */
    function applySupremacyRules(violations, locationId) {
        if (_processingIntegration) {
            return violations;
        }
        _processingIntegration = true;

        try {
            var settlement = locationId ? _getSettlementData(locationId) : null;
            if (!settlement) return violations;

            var governmentType = settlement.governmentType;
            var useReligiousAsCivil = settlement.useReligiousLawsAsCivil;

            // If theocracy: religious laws override civil laws
            if (governmentType === 'theocracy' || useReligiousAsCivil) {
                // If there are religious violations, only show those
                // (religious law IS civil law in a theocracy)
                if (violations.religious.length > 0) {
                    return {
                        civil: violations.religious, // Religious laws act as civil
                        religious: violations.religious,
                        all: violations.religious
                    };
                }
            }

            // If "established church" (state religion but not theocracy)
            // Religious laws apply to followers, civil to all
            // No override needed - both apply

            return violations;

        } finally {
            _processingIntegration = false;
        }
    }

    // =========================================================================
    // 6. LAW SEARCH & FILTER
    // =========================================================================

    /**
     * Searches for laws by name or description
     * @param {string} query - Search query
     * @param {string} locationId - Optional location filter
     * @param {string} religionId - Optional religion filter
     * @returns {Array} Matching laws with source info
     */
    function searchLaws(query, locationId, religionId) {
        if (_processingIntegration) {
            return [];
        }
        _processingIntegration = true;

        try {
            var results = [];
            var lowerQuery = (query || '').toLowerCase();

            // Search civil laws
            if (!religionId) {
                var locations = locationId ? [locationId] : [];
                if (locations.length === 0 && typeof window.SettlementState !== 'undefined') {
                    // Get all settlements
                    var allData = SettlementState.getAllSettlements ? 
                        SettlementState.getAllSettlements() : [];
                    for (var i = 0; i < allData.length; i++) {
                        locations.push(allData[i].locationId);
                    }
                }

                for (var i = 0; i < locations.length; i++) {
                    var locId = locations[i];
                    var civilLaws = _getCivilLaws(locId);
                    for (var j = 0; j < civilLaws.length; j++) {
                        var law = civilLaws[j];
                        if (!lowerQuery || 
                            law.name.toLowerCase().indexOf(lowerQuery) !== -1 ||
                            (law.description && law.description.toLowerCase().indexOf(lowerQuery) !== -1)) {
                            results.push({
                                law: law,
                                source: 'civil',
                                sourceId: locId,
                                sourceName: _getPlaceName(locId)
                            });
                        }
                    }
                }
            }

            // Search religious laws
            if (!locationId) {
                var religions = religionId ? [religionId] : [];
                if (religions.length === 0 && typeof window.ReligionState !== 'undefined') {
                    var allReligions = ReligionState.getAllReligions ? 
                        ReligionState.getAllReligions({ includeDeprecated: false }) : [];
                    for (var i = 0; i < allReligions.length; i++) {
                        religions.push(allReligions[i].id);
                    }
                }

                for (var i = 0; i < religions.length; i++) {
                    var relId = religions[i];
                    var religiousLaws = _getReligionLaws(relId);
                    for (var j = 0; j < religiousLaws.length; j++) {
                        var law = religiousLaws[j];
                        if (!lowerQuery || 
                            law.name.toLowerCase().indexOf(lowerQuery) !== -1 ||
                            (law.description && law.description.toLowerCase().indexOf(lowerQuery) !== -1)) {
                            results.push({
                                law: law,
                                source: 'religious',
                                sourceId: relId,
                                sourceName: _getReligionName(relId)
                            });
                        }
                    }
                }
            }

            return results;

        } finally {
            _processingIntegration = false;
        }
    }

    // =========================================================================
    // 7. LAW STATISTICS
    // =========================================================================

    /**
     * Gets global law statistics
     * @param {string} locationId - Optional location filter
     * @returns {Object} Law statistics
     */
    function getLawStatistics(locationId) {
        if (_processingIntegration) {
            return null;
        }
        _processingIntegration = true;

        try {
            var stats = {
                totalLaws: 0,
                totalEnforced: 0,
                bySource: { civil: 0, religious: 0 },
                byDomain: {},
                bySeverity: {},
                byType: {}
            };

            // Civil laws
            var civilLaws = [];
            if (locationId) {
                civilLaws = _getCivilLaws(locationId);
            } else if (typeof window.SettlementState !== 'undefined') {
                var allData = SettlementState.getAllSettlements ? 
                    SettlementState.getAllSettlements() : [];
                for (var i = 0; i < allData.length; i++) {
                    var locLaws = _getCivilLaws(allData[i].locationId);
                    civilLaws = civilLaws.concat(locLaws);
                }
            }

            for (var i = 0; i < civilLaws.length; i++) {
                var law = civilLaws[i];
                stats.totalLaws++;
                stats.bySource.civil++;
                if (_isCivilLawEnforced(law)) stats.totalEnforced++;
                
                if (!stats.byDomain[law.domain]) stats.byDomain[law.domain] = 0;
                stats.byDomain[law.domain]++;
                
                if (!stats.bySeverity[law.severity]) stats.bySeverity[law.severity] = 0;
                stats.bySeverity[law.severity]++;
                
                if (!stats.byType[law.type]) stats.byType[law.type] = 0;
                stats.byType[law.type]++;
            }

            // Religious laws (only if not filtered by location)
            if (!locationId) {
                if (typeof window.ReligionState !== 'undefined') {
                    var allReligions = ReligionState.getAllReligions ? 
                        ReligionState.getAllReligions({ includeDeprecated: false }) : [];
                    for (var i = 0; i < allReligions.length; i++) {
                        var religiousLaws = _getReligionLaws(allReligions[i].id);
                        for (var j = 0; j < religiousLaws.length; j++) {
                            var law = religiousLaws[j];
                            stats.totalLaws++;
                            stats.bySource.religious++;
                            if (_isReligiousLawEnforced(law)) stats.totalEnforced++;
                            
                            if (!stats.byDomain[law.domain]) stats.byDomain[law.domain] = 0;
                            stats.byDomain[law.domain]++;
                            
                            if (!stats.bySeverity[law.severity]) stats.bySeverity[law.severity] = 0;
                            stats.bySeverity[law.severity]++;
                            
                            if (!stats.byType[law.type]) stats.byType[law.type] = 0;
                            stats.byType[law.type]++;
                        }
                    }
                }
            }

            return stats;

        } finally {
            _processingIntegration = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CrimeLawIntegration = {
        // Law aggregation
        getApplicableLaws: getApplicableLaws,
        getReligiousLaws: getReligiousLaws,
        getCivilLawsForCharacter: getCivilLawsForCharacter,
        getEnforcedLaws: getEnforcedLaws,

        // Violation checking
        checkLawViolations: checkLawViolations,
        lawViolatesAction: _lawViolatesAction,

        // Supremacy rules
        applySupremacyRules: applySupremacyRules,

        // Search & statistics
        searchLaws: searchLaws,
        getLawStatistics: getLawStatistics
    };

    // Legacy aliases
    window._crimeLawIntegration = window.CrimeLawIntegration;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CrimeLawIntegration: window.CrimeLawIntegration
        };
    }

})();