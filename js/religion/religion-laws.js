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
 *   - religion-queries.js: ReligionQueries
 *   - religion-validation.js: ReligionValidation (via direct call)
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
 *   - Deleted getLawSeverityColor / getLawTypeIcon.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Law mutations write to religion.laws directly and commit.
 *   - Clone-before-mutate.
 *   - Empty-name rejection on update.
 * 
 * PHASE 6 CLEANUP (2026):
 *   - Deleted the four delegating formatting helpers (getLawTypeName,
 *     getLawCategoryName, getLawDomainName, getLawSeverityName). Consumers
 *     call ReligionFormat.* directly.
 *   - _validateLawInput now delegates to ReligionValidation.validateLawInput.
 *     The local copy is deleted; validation is one source of truth.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _state() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionLaws requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _queries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionLaws requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _validation() {
        if (typeof window.ReligionValidation === 'undefined') {
            throw new Error('ReligionLaws requires ReligionValidation.');
        }
        return window.ReligionValidation;
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

    function _commit(eventType, eventData) {
        _state().rebuildIndexes();
        _save();
        _state().notify({
            type: eventType,
            data: eventData,
            timestamp: Date.now()
        });
    }

    // =========================================================================
    // 3. CONSTANTS REFERENCE
    // =========================================================================
    // Law enums still live on window globals. When they migrate to
    // ReligionConstants, only the reads in this file change.

    function _getLawTypes() {
        return window.LAW_TYPES || {};
    }
    function _getLawCategories() {
        return window.LAW_CATEGORIES || {};
    }
    function _getLawDomains() {
        return window.LAW_DOMAINS || {};
    }
    function _getLawSeverity() {
        return window.LAW_SEVERITY || {};
    }

    // =========================================================================
    // 4. LAW MUTATION OPERATIONS
    // =========================================================================

    function addLaw(religionId, lawData) {
        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var validation = _validation().validateLawInput(lawData, { requireName: true });
        if (!validation.valid) {
            return { success: false, reason: validation.errors.join(', ') };
        }

        var types = _getLawTypes();
        var categories = _getLawCategories();
        var domains = _getLawDomains();
        var severities = _getLawSeverity();

        var law = {
            id: _generateId('law'),
            name: lawData.name.trim(),
            type: lawData.type || types.LAW || 'law',
            lawCategory: lawData.lawCategory || categories.RELIGIOUS || 'religious',
            domain: lawData.domain || domains.BEHAVIOR || 'behavior',
            description: lawData.description || '',
            severity: lawData.severity || severities.MINOR || 'minor',
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

        var validation = _validation().validateLawInput(updates, { requireName: false });
        if (!validation.valid) {
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
        var religion = _queries().getReligion(religionId);
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
    // 5. LAW QUERY OPERATIONS
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        return _queries().getLaw(lawId);
    }

    function getLawsByReligion(religionId) {
        return _queries().getLawsByReligion(religionId);
    }

    function getLawsByDomain(religionId, domain) {
        return _queries().getLawsByDomain(religionId, domain);
    }

    function getLawsByCategory(religionId, category) {
        return _queries().getLawsByCategory(religionId, category);
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

    // =========================================================================
    // 6. CRIME MAPPING QUERIES
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

        var allReligions = _queries().getAllReligions({ includeDeprecated: true });
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
    // 7. STATISTICS
    // =========================================================================

    function getLawStatistics(religionId) {
        var religion = _queries().getReligion(religionId);
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
        var allReligions = _queries().getAllReligions({ includeDeprecated: false });

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
    // 8. INTERNAL HELPERS
    // =========================================================================

    function _findReligionByLawId(lawId) {
        if (!lawId) return null;

        var law = _state().getLawByIdIndex(lawId);
        if (!law) return null;

        var religions = _getCanonicalReligions();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (r.laws) {
                for (var j = 0; j < r.laws.length; j++) {
                    if (r.laws[j].id === lawId) return r;
                }
            }
        }
        return null;
    }

    // =========================================================================
    // 9. EXPORTS
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

        // Crime mapping
        getCrimeMappingForLaw: getCrimeMappingForLaw,
        getLawsByCrimeType: getLawsByCrimeType,
        getEnforcedLawsByCrimeType: getEnforcedLawsByCrimeType,

        // Statistics
        getLawStatistics: getLawStatistics,
        getGlobalLawStatistics: getGlobalLawStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionLaws: window.ReligionLaws };
    }

})();
