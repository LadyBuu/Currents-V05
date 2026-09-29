/**
 * =============================================================================
 * STILL WATERS - RELIGION LAWS (religion-laws.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-laws.js
 * 
 * Law/taboo definitions for religions.
 * These are definitions only - enforcement will be handled by the Crime System.
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState
 *   - crime-constants.js: CRIME_TYPES, LAW_TYPES, LAW_CATEGORIES, LAW_DOMAINS, LAW_SEVERITY
 *   - ids.js: generateId
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingLaw re-entry guard. It was a boolean flag guarding
 *     pure compositional functions, causing composite queries to silently
 *     return empty results (getLawsByDomain, getLawsByCategory, getLawsByType,
 *     getLawsBySeverity, getEnforcedLaws, getApplicableLaws, getCrimeMappingForLaw,
 *     getEnforcedLawsByCrimeType were all broken).
 *   - Statistics now compute correctly because nested query calls succeed.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getReligion(id) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getAllReligions(options) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions(options);
        }
        return [];
    }

    function _updateReligion(religionId, updates) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState._updateReligion === 'function') {
            return window.ReligionState._updateReligion(religionId, updates);
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

    function _invalidateCaches() {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.invalidateCache === 'function') {
            window.ReligionState.invalidateCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 2. CONSTANTS REFERENCE
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
    // 3. LAW CRUD
    // =========================================================================

    function addLaw(religionId, lawData) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!lawData.name || lawData.name.trim() === '') {
            return { success: false, reason: 'Law name is required' };
        }

        // Validate domain
        var validDomains = Object.values(_LAW_DOMAINS);
        if (lawData.domain && validDomains.indexOf(lawData.domain) === -1) {
            return { success: false, reason: 'Invalid law domain: ' + lawData.domain };
        }

        // Validate category
        var validCategories = Object.values(_LAW_CATEGORIES);
        if (lawData.lawCategory && validCategories.indexOf(lawData.lawCategory) === -1) {
            return { success: false, reason: 'Invalid law category: ' + lawData.lawCategory };
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
            id: _generateId('law'),
            name: lawData.name.trim(),
            type: lawData.type || _LAW_TYPES.LAW,
            lawCategory: lawData.lawCategory || _LAW_CATEGORIES.RELIGIOUS,
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

        var laws = religion.laws || [];
        laws.push(law);

        var result = _updateReligion(religionId, {
            laws: laws,
            updatedAt: Date.now()
        });

        if (result) {
            _invalidateCaches();
            return {
                success: true,
                data: law,
                reason: 'Law added successfully'
            };
        }

        return { success: false, reason: 'Failed to add law' };
    }

    function updateLaw(lawId, updates) {
        // Find which religion contains this law
        var allReligions = _getAllReligions({ includeDeprecated: true });
        var targetReligion = null;
        var lawIndex = -1;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.laws) {
                for (var j = 0; j < religion.laws.length; j++) {
                    if (religion.laws[j].id === lawId) {
                        targetReligion = religion;
                        lawIndex = j;
                        break;
                    }
                }
            }
            if (targetReligion) break;
        }

        if (!targetReligion) {
            return { success: false, reason: 'Law not found' };
        }

        var law = targetReligion.laws[lawIndex];

        // Update fields
        if (updates.name !== undefined) law.name = updates.name.trim();
        if (updates.type !== undefined) {
            var validTypes = Object.values(_LAW_TYPES);
            if (validTypes.indexOf(updates.type) === -1) {
                return { success: false, reason: 'Invalid law type: ' + updates.type };
            }
            law.type = updates.type;
        }
        if (updates.lawCategory !== undefined) {
            var validCategories = Object.values(_LAW_CATEGORIES);
            if (validCategories.indexOf(updates.lawCategory) === -1) {
                return { success: false, reason: 'Invalid law category: ' + updates.lawCategory };
            }
            law.lawCategory = updates.lawCategory;
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

        var result = _updateReligion(targetReligion.id, {
            laws: targetReligion.laws,
            updatedAt: Date.now()
        });

        if (result) {
            _invalidateCaches();
            return {
                success: true,
                data: law,
                reason: 'Law updated successfully'
            };
        }

        return { success: false, reason: 'Failed to update law' };
    }

    function removeLaw(religionId, lawId) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.laws) {
            return { success: false, reason: 'No laws found in this religion' };
        }

        var index = -1;
        for (var i = 0; i < religion.laws.length; i++) {
            if (religion.laws[i].id === lawId) {
                index = i;
                break;
            }
        }

        if (index === -1) {
            return { success: false, reason: 'Law not found in this religion' };
        }

        religion.laws.splice(index, 1);

        var result = _updateReligion(religionId, {
            laws: religion.laws,
            updatedAt: Date.now()
        });

        if (result) {
            _invalidateCaches();
            return {
                success: true,
                reason: 'Law removed successfully'
            };
        }

        return { success: false, reason: 'Failed to remove law' };
    }

    // =========================================================================
    // 4. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;

        var allReligions = _getAllReligions({ includeDeprecated: true });

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.laws) {
                for (var j = 0; j < religion.laws.length; j++) {
                    if (religion.laws[j].id === lawId) {
                        return religion.laws[j];
                    }
                }
            }
        }

        return null;
    }

    function getLawsByReligion(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) return [];
        return religion.laws || [];
    }

    function getLawsByDomain(religionId, domain) {
        var laws = getLawsByReligion(religionId);
        if (!domain) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].domain === domain) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getLawsByCategory(religionId, category) {
        var laws = getLawsByReligion(religionId);
        if (!category) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].lawCategory === category) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getLawsByType(religionId, type) {
        var laws = getLawsByReligion(religionId);
        if (!type) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].type === type) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getLawsBySeverity(religionId, severity) {
        var laws = getLawsByReligion(religionId);
        if (!severity) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].severity === severity) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getEnforcedLaws(religionId) {
        var laws = getLawsByReligion(religionId);
        var result = [];

        for (var i = 0; i < laws.length; i++) {
            if (laws[i].crimeMapping && laws[i].crimeMapping.isEnforced) {
                result.push(laws[i]);
            }
        }

        return result;
    }

    function getApplicableLaws(religionId, characterId, domain) {
        // Stub: filters laws based on character is not yet implemented.
        return getLawsByDomain(religionId, domain);
    }

    // =========================================================================
    // 5. CRIME MAPPING
    // =========================================================================

    function getCrimeMappingForLaw(lawId) {
        var law = getLaw(lawId);
        if (!law) return null;

        return {
            law: law,
            crimeMapping: law.crimeMapping || {
                crimeType: null,
                crimeSeverity: null,
                isEnforced: false,
                punishment: null,
                notes: ''
            }
        };
    }

    function getLawsByCrimeType(crimeType) {
        if (!crimeType) return [];

        var allReligions = _getAllReligions({ includeDeprecated: true });
        var result = [];

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.laws) {
                for (var j = 0; j < religion.laws.length; j++) {
                    var law = religion.laws[j];
                    if (law.crimeMapping && law.crimeMapping.crimeType === crimeType) {
                        result.push({
                            law: law,
                            religionId: religion.id,
                            religionName: religion.name
                        });
                    }
                }
            }
        }

        return result;
    }

    function getEnforcedLawsByCrimeType(crimeType) {
        var all = getLawsByCrimeType(crimeType);
        var result = [];

        for (var i = 0; i < all.length; i++) {
            if (all[i].law.crimeMapping && all[i].law.crimeMapping.isEnforced) {
                result.push(all[i]);
            }
        }

        return result;
    }

    // =========================================================================
    // 6. LAW STATISTICS
    // =========================================================================

    function getLawStatistics(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) return null;

        var laws = religion.laws || [];

        var stats = {
            totalLaws: laws.length,
            byType: {},
            byCategory: {},
            byDomain: {},
            bySeverity: {},
            enforced: 0,
            notEnforced: 0
        };

        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];

            if (!stats.byType[law.type]) stats.byType[law.type] = 0;
            stats.byType[law.type]++;

            if (!stats.byCategory[law.lawCategory]) stats.byCategory[law.lawCategory] = 0;
            stats.byCategory[law.lawCategory]++;

            if (!stats.byDomain[law.domain]) stats.byDomain[law.domain] = 0;
            stats.byDomain[law.domain]++;

            if (!stats.bySeverity[law.severity]) stats.bySeverity[law.severity] = 0;
            stats.bySeverity[law.severity]++;

            if (law.crimeMapping && law.crimeMapping.isEnforced) {
                stats.enforced++;
            } else {
                stats.notEnforced++;
            }
        }

        return stats;
    }

    function getGlobalLawStatistics() {
        var allReligions = _getAllReligions({ includeDeprecated: false });

        var stats = {
            totalReligionsWithLaws: 0,
            totalLaws: 0,
            totalEnforced: 0,
            byDomain: {},
            byCategory: {},
            bySeverity: {},
            religions: []
        };

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            var laws = religion.laws || [];

            if (laws.length > 0) {
                stats.totalReligionsWithLaws++;
                stats.religions.push({
                    id: religion.id,
                    name: religion.name,
                    lawCount: laws.length
                });
            }

            for (var j = 0; j < laws.length; j++) {
                var law = laws[j];
                stats.totalLaws++;

                if (law.crimeMapping && law.crimeMapping.isEnforced) {
                    stats.totalEnforced++;
                }

                if (!stats.byDomain[law.domain]) stats.byDomain[law.domain] = 0;
                stats.byDomain[law.domain]++;

                if (!stats.byCategory[law.lawCategory]) stats.byCategory[law.lawCategory] = 0;
                stats.byCategory[law.lawCategory]++;

                if (!stats.bySeverity[law.severity]) stats.bySeverity[law.severity] = 0;
                stats.bySeverity[law.severity]++;
            }
        }

        return stats;
    }

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    function getLawTypeName(type) {
        var names = {
            'law': 'Law',
            'taboo': 'Taboo',
            'guideline': 'Guideline'
        };
        return names[type] || type;
    }

    function getLawCategoryName(category) {
        var names = {
            'religious': 'Religious Law',
            'civil': 'Civil Law',
            'custom': 'Custom Law'
        };
        return names[category] || category;
    }

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

    function getLawSeverityName(severity) {
        var names = {
            'minor': 'Minor',
            'major': 'Major',
            'mortal': 'Mortal'
        };
        return names[severity] || severity;
    }

    function getLawSeverityColor(severity) {
        var colors = {
            'minor': 'var(--text-dim)',
            'major': 'var(--warning)',
            'mortal': 'var(--error)'
        };
        return colors[severity] || 'var(--text)';
    }

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

    window.ReligionLaws = {
        // Law CRUD
        addLaw: addLaw,
        updateLaw: updateLaw,
        removeLaw: removeLaw,

        // Law Queries
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getLawsByDomain: getLawsByDomain,
        getLawsByCategory: getLawsByCategory,
        getLawsByType: getLawsByType,
        getLawsBySeverity: getLawsBySeverity,
        getEnforcedLaws: getEnforcedLaws,
        getApplicableLaws: getApplicableLaws,

        // Crime Mapping
        getCrimeMappingForLaw: getCrimeMappingForLaw,
        getLawsByCrimeType: getLawsByCrimeType,
        getEnforcedLawsByCrimeType: getEnforcedLawsByCrimeType,

        // Statistics
        getLawStatistics: getLawStatistics,
        getGlobalLawStatistics: getGlobalLawStatistics,

        // Helpers
        getLawTypeName: getLawTypeName,
        getLawCategoryName: getLawCategoryName,
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
            ReligionLaws: window.ReligionLaws
        };
    }

})();
