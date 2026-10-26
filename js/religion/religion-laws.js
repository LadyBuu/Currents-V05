/**
 * =============================================================================
 * STILL WATERS - RELIGION LAWS (religion-laws.js)
 * =============================================================================
 *
 * LOCATION: js/core/religion/religion-laws.js
 *
 * Law/taboo QUERIES for religions.
 *
 * This module is queries only. It does not mutate. It does not save. It
 * does not touch canonical data directly. It reads through ReligionQueries
 * and ReligionState and returns clones or projections.
 *
 * The mutation half of this module (addLaw, updateLaw, removeLaw) moved to
 * ReligionCommands in phase 7. See the refactor history below.
 *
 * Law definitions are consumed by the Crime System. Crime Mapping fields
 * (crimeType, isEnforced, punishment, etc.) live on each law record and are
 * read here for dispatch. The Crime System is responsible for enforcement;
 * this module only exposes the definitions.
 *
 * DEPENDENCIES:
 *   - religion-state.js:   ReligionState (for getLawById clone access)
 *   - religion-queries.js: ReligionQueries (for law enumeration)
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 0: recursion guard removal.
 *   Phase 2: display-name helpers delegate to ReligionFormat.
 *   Phase 3: clone-before-mutate, empty-name rejection on update.
 *   Phase 6: deleted the four delegating formatting helpers; _validateLawInput
 *            delegated to ReligionValidation.
 *   Phase 7 (current): converge to the reference pattern.
 *     - Mutation functions (addLaw, updateLaw, removeLaw) moved to
 *       ReligionCommands. This module is now queries only.
 *     - Load-time verification of dependencies.
 *     - Reads route through ReligionQueries / ReligionState; no direct
 *       canonical access; every returned law is a clone.
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

    // =========================================================================
    // 2. CLONE HELPER
    // =========================================================================
    //
    // This module must return clones even after ReligionQueries is updated
    // to return clones (deliverable #4). Until then, and as a matter of
    // defense, we clone here.
    //

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

    function _cloneArray(list) {
        if (!list || !list.length) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 3. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        // State.getLawById returns a clone (see religion-state.js).
        return _state().getLawById(lawId);
    }

    function getLawsByReligion(religionId) {
        if (!religionId) return [];
        var laws = _queries().getLawsByReligion(religionId);
        return _cloneArray(laws);
    }

    function getLawsByDomain(religionId, domain) {
        if (!domain) return getLawsByReligion(religionId);
        var laws = getLawsByReligion(religionId);
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].domain === domain) result.push(laws[i]);
        }
        return result;
    }

    function getLawsByCategory(religionId, category) {
        if (!category) return getLawsByReligion(religionId);
        var laws = getLawsByReligion(religionId);
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].lawCategory === category) result.push(laws[i]);
        }
        return result;
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
    // 4. CRIME MAPPING QUERIES
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

    /**
     * Every law across every religion that maps to a given crime type.
     *
     * Returns an array of { law, religionId, religionName }. The law is a
     * clone; the religionId and religionName are snapshots taken at query
     * time.
     */
    function getLawsByCrimeType(crimeType) {
        if (!crimeType) return [];

        var allReligions = _queries().getAllReligions({ includeDeprecated: true });
        var result = [];

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (!Array.isArray(religion.laws)) continue;

            for (var j = 0; j < religion.laws.length; j++) {
                var law = religion.laws[j];
                if (law && law.crimeMapping && law.crimeMapping.crimeType === crimeType) {
                    result.push({
                        law: _clone(law),
                        religionId: religion.id,
                        religionName: religion.name
                    });
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
    // 5. STATISTICS
    // =========================================================================

    function getLawStatistics(religionId) {
        var religion = _queries().getReligion(religionId);
        if (!religion) return null;

        var laws = getLawsByReligion(religionId);

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
            var laws = getLawsByReligion(religion.id);

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
    // 6. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionState) {
            throw new Error(
                'religion-laws.js loaded but window.ReligionState is missing. ' +
                'Check script tag order (religion-state.js must load first).'
            );
        }
        if (!window.ReligionQueries) {
            throw new Error(
                'religion-laws.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order (religion-queries.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    window.ReligionLaws = {
        // Law queries
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
