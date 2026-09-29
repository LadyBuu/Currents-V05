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
 * Three sections:
 *   1. Law mutation operations (add, update, remove)
 *   2. Law query operations (read-only, from canonical data)
 *   3. Law validation
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState (rebuildIndexes, notify)
 *   - religion-queries.js: ReligionQueries (for reading religion data)
 *   - religion-format.js: ReligionFormat (display names)
 *   - crime-constants.js: CRIME_TYPES, LAW_TYPES, LAW_CATEGORIES, LAW_DOMAINS, LAW_SEVERITY
 *   - ids.js: generateId
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingLaw re-entry guard.
 * 
 * PHASE 2 VOCABULARY CONSOLIDATION (2026):
 *   - Display name helpers delegate to ReligionFormat.
 *   - Deleted getLawSeverityColor / getLawTypeIcon (presentation).
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - No more calls to ReligionState._updateReligion. Law mutations now
 *     write to religion.laws directly and commit through a local _commit()
 *     that mirrors the pattern in religion-commands.js.
 *   - updateLaw clones the law object before mutating; replaces the array
 *     entry rather than editing the live canonical object.
 *   - removeLaw clones the laws array before splicing.
 *   - updateLaw now rejects empty names (parity with addLaw).
 *   - Validation is inline in this file for now. Phase 5 extracts to
 *     religion-law-validation.js and unifies create/update validation.
 *   - _findReligionByLawId helper added; replaces three inline scans.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionLaws requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _getQueries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionLaws requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error('ReligionLaws requires ids.generateId.');
        }
        return window.generateId(prefix);
    }

    function _save() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('ReligionLaws requires storage.saveMasterData.');
        }
        window.saveMasterData();
    }

    function _getCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('masterData.data is not initialized.');
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            window.masterData.data.religions = [];
        }
        return window.masterData.data.religions;
    }

    // =========================================================================
    // 2. TRANSACTION BOUNDARY
    // =========================================================================
    // Mirrors religion-commands.js. Law mutations go through the same
    // sequence: mutate canonical data → rebuild indexes → save → notify.

    function _commit(eventType, eventData) {
        _getState().rebuildIndexes();
        _save();
        _getState().notify({
            type: eventType,
            data: eventData,
            timestamp: Date.now()
        });
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
    // 4. VALIDATION (extracted to religion-law-validation.js in Phase 5)
    // =========================================================================

    function _validateLawInput(input, options) {
        options = options || {};
        var requireName = options.requireName === true;
        var errors = [];

        if (requireName) {
            if (!input.name || input.name.trim() === '') {
                errors.push('Law name is required');
            }
        } else if (input.name !== undefined) {
            // Update path: name is optional, but if provided it must be non-empty.
            if (!input.name || input.name.trim() === '') {
                errors.push('Law name cannot be empty');
            }
        }

        if (input.domain !== undefined && input.domain !== null) {
            var validDomains = Object.values(_LAW_DOMAINS);
            if (validDomains.indexOf(input.domain) === -1) {
                errors.push('Invalid law domain: ' + input.domain);
            }
        }

        if (input.lawCategory !== undefined && input.lawCategory !== null) {
            var validCategories = Object.values(_LAW_CATEGORIES);
            if (validCategories.indexOf(input.lawCategory) === -1) {
                errors.push('Invalid law category: ' + input.lawCategory);
            }
        }

        if (input.severity !== undefined && input.severity !== null) {
            var validSeverities = Object.values(_LAW_SEVERITY);
            if (validSeverities.indexOf(input.severity) === -1) {
                errors.push('Invalid law severity: ' + input.severity);
            }
        }

        if (input.type !== undefined && input.type !== null) {
            var validTypes = Object.values(_LAW_TYPES);
            if (validTypes.indexOf(input.type) === -1) {
                errors.push('Invalid law type: ' + input.type);
            }
        }

        if (input.crimeType !== undefined && input.crimeType !== null && input.crimeType !== '') {
            var crimeTypes = Object.values(_CRIME_TYPES);
            if (crimeTypes.indexOf(input.crimeType) === -1) {
                errors.push('Invalid crime type: ' + input.crimeType);
            }
        }

        return { isValid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 5. LAW MUTATION OPERATIONS
    // =========================================================================

    function addLaw(religionId, lawData) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var validation = _validateLawInput(lawData, { requireName: true });
        if (!validation.isValid) {
            return { success: false, reason: validation.errors.join(', ') };
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
                isEnforced: lawData.isEnforced === true,
                punishment: lawData.punishment || null,
                notes: lawData.crimeNotes || ''
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            notes: lawData.notes || ''
        };

        // Clone before push.
        var laws = (religion.laws || []).slice();
        laws.push(law);
        religion.laws = laws;
        religion.updatedAt = Date.now();

        _commit('religion_law_added', {
            religionId: religionId,
            law: law
        });

        return { success: true, data: law, reason: 'Law added successfully' };
    }

    function updateLaw(lawId, updates) {
        var owner = _findReligionByLawId(lawId);
        if (!owner) {
            return { success: false, reason: 'Law not found' };
        }

        var validation = _validateLawInput(updates, { requireName: false });
        if (!validation.isValid) {
            return { success: false, reason: validation.errors.join(', ') };
        }

        var lawIndex = -1;
        for (var i = 0; i < owner.laws.length; i++) {
            if (owner.laws[i].id === lawId) {
                lawIndex = i;
                break;
            }
        }
        if (lawIndex === -1) {
            return { success: false, reason: 'Law not found in religion' };
        }

        // Clone the law, then apply updates to the copy (ADR Decision 6).
        var original = owner.laws[lawIndex];
        var updated = {
            id: original.id,
            name: updates.name !== undefined ? updates.name.trim() : original.name,
            type: updates.type !== undefined ? updates.type : original.type,
            lawCategory: updates.lawCategory !== undefined ? updates.lawCategory : original.lawCategory,
            domain: updates.domain !== undefined ? updates.domain : original.domain,
            description: updates.description !== undefined ? updates.description : original.description,
            severity: updates.severity !== undefined ? updates.severity : original.severity,
            crimeMapping: _mergeCrimeMapping(original.crimeMapping, updates.crimeMapping),
            createdAt: original.createdAt,
            updatedAt: Date.now(),
            notes: updates.notes !== undefined ? updates.notes : original.notes
        };

        var laws = owner.laws.slice();
        laws[lawIndex] = updated;
        owner.laws = laws;
        owner.updatedAt = Date.now();

        _commit('religion_law_updated', {
            religionId: owner.id,
            law: updated
        });

        return { success: true, data: updated, reason: 'Law updated successfully' };
    }

    function removeLaw(religionId, lawId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.laws || religion.laws.length === 0) {
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

        // Clone the array before splicing.
        var laws = religion.laws.slice();
        laws.splice(index, 1);
        religion.laws = laws;
        religion.updatedAt = Date.now();

        _commit('religion_law_removed', {
            religionId: religionId,
            lawId: lawId
        });

        return { success: true, reason: 'Law removed successfully' };
    }

    function _mergeCrimeMapping(original, updates) {
        var base = original || {
            crimeType: null,
            crimeSeverity: null,
            isEnforced: false,
            punishment: null,
            notes: ''
        };

        if (!updates) {
            return {
                crimeType: base.crimeType,
                crimeSeverity: base.crimeSeverity,
                isEnforced: base.isEnforced,
                punishment: base.punishment,
                notes: base.notes
            };
        }

        return {
            crimeType: updates.crimeType !== undefined ? updates.crimeType : base.crimeType,
            crimeSeverity: updates.crimeSeverity !== undefined ? updates.crimeSeverity : base.crimeSeverity,
            isEnforced: updates.isEnforced !== undefined ? updates.isEnforced : base.isEnforced,
            punishment: updates.punishment !== undefined ? updates.punishment : base.punishment,
            notes: updates.notes !== undefined ? updates.notes : base.notes
        };
    }

    // =========================================================================
    // 6. LAW QUERY OPERATIONS
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        // Delegates to ReligionQueries which reads the index.
        return _getQueries().getLaw(lawId);
    }

    function getLawsByReligion(religionId) {
        return _getQueries().getLawsByReligion(religionId);
    }

    function getLawsByDomain(religionId, domain) {
        return _getQueries().getLawsByDomain(religionId, domain);
    }

    function getLawsByCategory(religionId, category) {
        return _getQueries().getLawsByCategory(religionId, category);
    }

    function getLawsByType(religionId, type) {
        var laws = getLawsByReligion(religionId);
        if (!type) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].type === type) result.push(laws[i]);
        }
        return result;
    }

    function getLawsBySeverity(religionId, severity) {
        var laws = getLawsByReligion(religionId);
        if (!severity) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].severity === severity) result.push(laws[i]);
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
        // Stub. Phase 5 replaces with ReligionRules.getApplicableLaws.
        return getLawsByDomain(religionId, domain);
    }

    // =========================================================================
    // 7. CRIME MAPPING QUERIES
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

        var allReligions = _getQueries().getAllReligions({ includeDeprecated: true });
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
    // 8. STATISTICS
    // =========================================================================

    function getLawStatistics(religionId) {
        var religion = _getQueries().getReligion(religionId);
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
        var allReligions = _getQueries().getAllReligions({ includeDeprecated: false });

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
    // 9. INTERNAL HELPERS
    // =========================================================================

    function _findReligionByLawId(lawId) {
        if (!lawId) return null;

        // Fast path via index.
        var state = _getState();
        var law = state.getLawByIdIndex(lawId);
        if (!law) return null;

        // Find owning religion.
        var religions = _getCanonicalReligions();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (r.laws) {
                for (var j = 0; j < r.laws.length; j++) {
                    if (r.laws[j].id === lawId) {
                        return r;
                    }
                }
            }
        }
        return null;
    }

    // =========================================================================
    // 10. FORMATTING DELEGATES
    // =========================================================================
    // Kept for backward compatibility. Removed in Phase 6.

    function getLawTypeName(type) {
        return window.ReligionFormat.getLawTypeName(type);
    }

    function getLawCategoryName(category) {
        return window.ReligionFormat.getLawCategoryName(category);
    }

    function getLawDomainName(domain) {
        return window.ReligionFormat.getLawDomainName(domain);
    }

    function getLawSeverityName(severity) {
        return window.ReligionFormat.getLawSeverityName(severity);
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ReligionLaws = {
        // Mutations
        addLaw: addLaw,
        updateLaw: updateLaw,
        removeLaw: removeLaw,

        // Queries
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getLawsByDomain: getLawsByDomain,
        getLawsByCategory: getLawsByCategory,
        getLawsByType: getLawsByType,
        getLawsBySeverity: getLawsBySeverity,
        getEnforcedLaws: getEnforcedLaws,
        getApplicableLaws: getApplicableLaws,

        // Crime mapping
        getCrimeMappingForLaw: getCrimeMappingForLaw,
        getLawsByCrimeType: getLawsByCrimeType,
        getEnforcedLawsByCrimeType: getEnforcedLawsByCrimeType,

        // Statistics
        getLawStatistics: getLawStatistics,
        getGlobalLawStatistics: getGlobalLawStatistics,

        // Formatting (delegates to ReligionFormat; removed in Phase 6)
        getLawTypeName: getLawTypeName,
        getLawCategoryName: getLawCategoryName,
        getLawDomainName: getLawDomainName,
        getLawSeverityName: getLawSeverityName,

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
