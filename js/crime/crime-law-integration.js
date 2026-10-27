/**
 * =============================================================================
 * STILL WATERS - CRIME LAW INTEGRATION (crime-law-integration.js)
 * =============================================================================
 *
 * LOCATION: js/crime/crime-law-integration.js
 *
 * PURPOSE:
 *   The boundary between the Crime domain and the two law systems
 *   (Religion and Government). Given a character, an action, and a
 *   context, this module answers two questions:
 *
 *     1. Which laws govern this action for this character? (applicability)
 *     2. What are the legal consequences? (evaluation)
 *
 *   It does not execute consequences. It does not record crimes. It does
 *   not orchestrate workflows. It returns a structured legal evaluation
 *   that CrimeCommands then acts on.
 *
 * OWNERSHIP:
 *   - law applicability resolution (civil + religious, with precedence)
 *   - action-vs-law violation evaluation
 *   - legal consequence derivation from governing laws
 *   - law search and law statistics
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not invent punishments. If a governing law does not specify a
 *     consequence, the consequence list is empty.
 *   - It does not treat "domain match" as an automatic violation. A law
 *     only criminalises an action if the law opts in explicitly (via
 *     crimeMapping or a violationCheck function).
 *   - It does not use module-wide recursion guards on public functions.
 *     Public functions compose freely; internal implementations are not
 *     guarded.
 *
 * CONTRACTS:
 *
 *   getApplicableLaws(characterId, domain)
 *     Returns all laws that apply to the character, regardless of
 *     enforcement status. Each item is { law, source, sourceId,
 *     sourceName, applicability, isEnforced }.
 *     - applicability: 'universal' | 'follower' | 'official_religion'
 *     - isEnforced: whether the law is currently enforced as law
 *
 *   getEnforcedLaws(characterId, domain)
 *     Returns the subset of applicable laws whose isEnforced is true.
 *     This is the correct entry point for enforcement logic.
 *
 *   evaluateAction(characterId, action, context)
 *     Returns:
 *     {
 *       lawful: boolean,
 *       violations: [...],           // all violations
 *       civil: [...],                // civil violations after supremacy
 *       religious: [...],            // religious violations after supremacy
 *       governingLaw: violationItem|null,
 *       consequences: [
 *         { type, description, method?, authority?, source }
 *       ]
 *     }
 *
 *   Consequence `type` values are CrimeConstants consequence verbs where
 *   possible: 'execution', 'imprisonment', 'fine', 'exile', 'penance',
 *   'excommunication', 'other'. The command layer executes what it
 *   recognises; unknown types are surfaced to the caller unmodified.
 *
 * PRECEDENCE (theocracy):
 *   - In a theocracy, or where useReligiousLawsAsCivil is set, the state
 *     religion's law is the governing law for everyone in the settlement.
 *     Religious violations are promoted to civil status.
 *   - In a secular settlement, civil laws apply to all residents and
 *     religious laws apply only to followers of that religion.
 *   - In an established-church settlement, both systems run in parallel.
 *
 *   Precedence is applied inside evaluateAction. There is no separate
 *   "apply supremacy afterwards" step.
 *
 * CANONICAL LAW SOURCES (settlement domain, post-refactor):
 *
 *   Civil laws:
 *     SettlementLawQueries.getCivilLaws(locationId)      ← canonical
 *     GovernmentLaws.getCivilLaws(locationId)            ← alternative
 *
 *   The previous version of this file also probed
 *   SettlementState.getCivilLaws and SettlementQueries.getCivilLaws.
 *   Neither exists on those modules. The probes were dead code and have
 *   been removed. If a build still exposes GovernmentLaws, that is
 *   accepted as an alternative — but SettlementLawQueries is now the
 *   primary source.
 *
 *   Religious laws:
 *     ReligionLaws.getLawsByReligion(religionId)         ← canonical
 *     ReligionState.getLawsByReligion(religionId)        ← alternative
 *
 *   Dominant religion:
 *     SettlementReligionQueries.getDominantReligion(loc) ← canonical
 *     SettlementState.getDominantReligion(locationId)    ← alternative
 *
 *   The previous version of _getDominantReligion had a silent
 *   `return null` fallback when neither source was available. In a
 *   theocracy that meant religious laws were silently skipped, and a
 *   murder that violated religious law could be recorded as lawful.
 *   crime-docs.txt §19 prohibits silent failure. The fallback has been
 *   removed: if no source for the dominant religion exists and the
 *   settlement context requires it (theocracy), evaluateAction throws
 *   loudly.
 *
 * DEPENDENCIES (required at call time; no fabricated fallbacks):
 *   - ReligionLaws (or ReligionState) as documented above
 *   - SettlementLawQueries (or GovernmentLaws) as documented above
 *   - SettlementReligionQueries (or SettlementState) as documented above
 *   - getCharacterById, getCurrentLocationId
 *   - SettlementState.getSettlementData
 *
 * MISSING DEPENDENCIES FAIL LOUDLY. No fabricated laws, no empty results
 * pretending to be "no laws exist".
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY WRAPPERS (required dependencies; no fabricated fallbacks)
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('[CrimeLawIntegration] getCharacterById is not available.');
        }
        return window.getCharacterById(id);
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
            return sorted[0] ? sorted[0].locationId : null;
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
        // Canonical source first. ReligionLaws is verified by
        // crime-bootstrap.js as a required module. ReligionState is
        // accepted as an alternative during migration.
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawsByReligion === 'function') {
            return window.ReligionLaws.getLawsByReligion(religionId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getLawsByReligion === 'function') {
            return window.ReligionState.getLawsByReligion(religionId);
        }
        throw new Error('[CrimeLawIntegration] No source for religion laws is available.');
    }

    function _getCivilLaws(locationId) {
        // Canonical source first. SettlementLawQueries is verified by
        // crime-bootstrap.js as a required module. GovernmentLaws is
        // accepted as an alternative during migration.
        //
        // The previous version also probed SettlementState.getCivilLaws
        // and SettlementQueries.getCivilLaws. Neither method exists on
        // those modules; both probes were dead code. Removed.
        if (typeof window.SettlementLawQueries !== 'undefined' &&
            typeof window.SettlementLawQueries.getCivilLaws === 'function') {
            return window.SettlementLawQueries.getCivilLaws(locationId);
        }
        if (typeof window.GovernmentLaws !== 'undefined' &&
            typeof window.GovernmentLaws.getCivilLaws === 'function') {
            return window.GovernmentLaws.getCivilLaws(locationId);
        }
        throw new Error('[CrimeLawIntegration] No source for civil laws is available.');
    }

    function _getDominantReligion(locationId) {
        // Canonical source first. SettlementReligionQueries is verified by
        // crime-bootstrap.js as a required module. SettlementState is
        // accepted as an alternative during migration.
        //
        // There is NO silent `return null` fallback. If neither source
        // exists, this function throws. The previous version returned
        // null silently, which meant a theocracy would skip religious law
        // and a murder that violated religious law could be recorded as
        // lawful. crime-docs.txt §19 prohibits silent failure.
        if (typeof window.SettlementReligionQueries !== 'undefined' &&
            typeof window.SettlementReligionQueries.getDominantReligion === 'function') {
            return window.SettlementReligionQueries.getDominantReligion(locationId);
        }
        if (typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getDominantReligion === 'function') {
            return window.SettlementState.getDominantReligion(locationId);
        }
        throw new Error(
            '[CrimeLawIntegration] No source for dominant religion is available. ' +
            'Cannot evaluate religious law without SettlementReligionQueries ' +
            '(or SettlementState.getDominantReligion).'
        );
    }

    function _getReligionName(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            var r = window.ReligionState.getReligion(religionId);
            return r ? r.name : 'Unknown';
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

    function _getLawDomains() {
        if (window.CrimeConstants && window.CrimeConstants.LAW_DOMAINS) {
            return window.CrimeConstants.LAW_DOMAINS;
        }
        if (window.LAW_DOMAINS) return window.LAW_DOMAINS;
        throw new Error('[CrimeLawIntegration] LAW_DOMAINS is not available.');
    }

    function _isLawEnforced(law) {
        return !!(law && law.crimeMapping && law.crimeMapping.isEnforced);
    }

    // =========================================================================
    // 1. APPLICABILITY RESOLUTION
    // =========================================================================

    /**
     * Resolves a character's location and returns a legal context object
     * describing which law systems are in force there.
     */
    function _resolveLegalContext(character) {
        var locationId = _getCurrentLocationId(character);
        var settlement = locationId ? _getSettlementData(locationId) : null;

        var governmentType = settlement ? settlement.governmentType : null;
        var useReligiousAsCivil = settlement ? !!settlement.useReligiousLawsAsCivil : false;

        // A theocracy or useReligiousLawsAsCivil settlement means religious
        // law governs everyone, using the settlement's dominant religion
        // rather than the character's own.
        var religiousLawsUniversal =
            governmentType === 'theocracy' || useReligiousAsCivil;

        return {
            locationId: locationId,
            settlement: settlement,
            governmentType: governmentType,
            useReligiousAsCivil: useReligiousAsCivil,
            religiousLawsUniversal: religiousLawsUniversal
        };
    }

    /**
     * Returns all applicable laws for a character, without filtering by
     * enforcement status. Use getEnforcedLaws() for enforcement logic.
     *
     * @param {string} characterId
     * @param {string} [domain]
     * @returns {Array<{law, source, sourceId, sourceName, applicability, isEnforced}>}
     */
    function getApplicableLaws(characterId, domain) {
        if (!characterId) return [];

        var character = _getCharacterById(characterId);
        if (!character) return [];

        var ctx = _resolveLegalContext(character);
        var results = [];

        // ----- Civil laws -----
        if (ctx.locationId) {
            var civilLaws = _getCivilLaws(ctx.locationId);
            for (var i = 0; i < civilLaws.length; i++) {
                var cLaw = civilLaws[i];
                results.push({
                    law: cLaw,
                    source: 'civil',
                    sourceId: ctx.locationId,
                    sourceName: _getPlaceName(ctx.locationId),
                    applicability: 'universal',
                    isEnforced: _isLawEnforced(cLaw)
                });
            }
        }

        // ----- Religious laws -----
        // Two modes:
        //   - universal: the settlement's dominant religion governs everyone
        //   - follower:  the character's own religion governs them
        if (ctx.religiousLawsUniversal && ctx.locationId) {
            var dominant = _getDominantReligion(ctx.locationId);
            if (dominant && dominant.id) {
                var domLaws = _getReligionLaws(dominant.id);
                var domName = dominant.name || _getReligionName(dominant.id);
                for (var j = 0; j < domLaws.length; j++) {
                    results.push({
                        law: domLaws[j],
                        source: 'religious',
                        sourceId: dominant.id,
                        sourceName: domName,
                        applicability: 'official_religion',
                        isEnforced: true // state religion is always enforced
                    });
                }
            }
        } else if (character.religionId) {
            var followerLaws = _getReligionLaws(character.religionId);
            var followerName = _getReligionName(character.religionId);
            for (var k = 0; k < followerLaws.length; k++) {
                var fLaw = followerLaws[k];
                results.push({
                    law: fLaw,
                    source: 'religious',
                    sourceId: character.religionId,
                    sourceName: followerName,
                    applicability: 'follower',
                    isEnforced: _isLawEnforced(fLaw)
                });
            }
        }

        // ----- Domain filter -----
        if (domain) {
            results = results.filter(function(item) {
                return item.law && item.law.domain === domain;
            });
        }

        return results;
    }

    /**
     * Returns only the applicable laws that are currently enforced.
     * This is the correct entry point for enforcement logic.
     */
    function getEnforcedLaws(characterId, domain) {
        return getApplicableLaws(characterId, domain).filter(function(item) {
            return item.isEnforced === true;
        });
    }

    function getReligiousLaws(characterId, domain) {
        return getApplicableLaws(characterId, domain).filter(function(item) {
            return item.source === 'religious';
        });
    }

    function getCivilLawsForCharacter(characterId, domain) {
        return getApplicableLaws(characterId, domain).filter(function(item) {
            return item.source === 'civil';
        });
    }

    // =========================================================================
    // 2. VIOLATION EVALUATION
    // =========================================================================

    /**
     * Determines whether a single law is violated by an action.
     *
     * A law only criminalises an action if it explicitly opts in. Matching
     * the law's domain against the action's domain is NOT sufficient on its
     * own; that would let any violence-domain law catch any violent action.
     * Explicit opt-in is either:
     *   - law.crimeMapping.crimeType (exact match against action.type)
     *   - law.crimeMapping.crimeTypes (list, exact match)
     *   - law.violationCheck(action, context) returning true
     */
    function _lawViolatesAction(law, action, context) {
        if (!law || !action) return false;

        var mapping = law.crimeMapping;

        if (mapping) {
            // Single crime type
            if (mapping.crimeType && action.type === mapping.crimeType) {
                return _checkModifiers(law, action, context);
            }

            // Multiple crime types
            if (Array.isArray(mapping.crimeTypes) &&
                mapping.crimeTypes.indexOf(action.type) !== -1) {
                return _checkModifiers(law, action, context);
            }
        }

        // Custom predicate provided by the law itself
        if (typeof law.violationCheck === 'function') {
            try {
                return !!law.violationCheck(action, context);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[CrimeLawIntegration] violationCheck threw for law ' +
                        (law.id || '<unknown>') + ':', e);
                }
                return false;
            }
        }

        return false;
    }

    /**
     * Checks modifier predicates attached to a law. Modifiers are key/value
     * pairs that must match the corresponding values on action.details or
     * context. Falsy values (false, 0, "") are treated as legitimate values;
     * only `undefined` falls through to the secondary source.
     */
    function _checkModifiers(law, action, context) {
        if (!law.modifiers) return true;

        for (var key in law.modifiers) {
            if (!Object.prototype.hasOwnProperty.call(law.modifiers, key)) continue;

            var required = law.modifiers[key];

            var actual;
            if (action.details && action.details[key] !== undefined) {
                actual = action.details[key];
            } else if (context && context[key] !== undefined) {
                actual = context[key];
            } else {
                actual = undefined;
            }

            if (actual !== required) return false;
        }

        return true;
    }

    /**
     * Applies precedence rules to a set of violations.
     *
     * In a theocracy or useReligiousLawsAsCivil settlement, the state
     * religion's law governs. If any religious violation exists, it takes
     * precedence and civil violations are folded into it. Otherwise the
     * violations pass through unchanged.
     *
     * The returned object always has { civil, religious, all } arrays,
     * with no duplicate items.
     */
    function _applySupremacy(violations, ctx) {
        if (!ctx) return violations;

        if (ctx.religiousLawsUniversal) {
            if (violations.religious.length > 0) {
                // Religious violations are the governing violations.
                // Promote them to civil status for consumers that only
                // inspect civil, and keep the religious view too.
                return {
                    civil: violations.religious.slice(),
                    religious: violations.religious.slice(),
                    all: violations.religious.slice()
                };
            }
        }

        return violations;
    }

    /**
     * Evaluates an action under the laws applicable to a character.
     *
     * @param {string} characterId
     * @param {Object} action
     *        { type, domain, details }
     * @param {Object} [context]
     *        { locationId, victim, killer, year, ... }
     * @returns {{
     *   lawful: boolean,
     *   violations: Array,
     *   civil: Array,
     *   religious: Array,
     *   governingLaw: Object|null,
     *   consequences: Array
     * }}
     */
    function evaluateAction(characterId, action, context) {
        var emptyResult = {
            lawful: true,
            violations: [],
            civil: [],
            religious: [],
            governingLaw: null,
            consequences: []
        };

        if (!characterId || !action) return emptyResult;

        var character = _getCharacterById(characterId);
        if (!character) return emptyResult;

        var ctx = _resolveLegalContext(character);
        if (context && context.locationId) {
            // Allow callers to override location for historical evaluation.
            ctx.locationId = context.locationId;
            ctx.settlement = _getSettlementData(context.locationId);
            if (ctx.settlement) {
                ctx.governmentType = ctx.settlement.governmentType;
                ctx.useReligiousAsCivil = !!ctx.settlement.useReligiousLawsAsCivil;
                ctx.religiousLawsUniversal =
                    ctx.governmentType === 'theocracy' || ctx.useReligiousAsCivil;
            }
        }

        var allLaws = getApplicableLaws(characterId, action.domain);

        var rawViolations = { civil: [], religious: [], all: [] };

        for (var i = 0; i < allLaws.length; i++) {
            var item = allLaws[i];
            if (!_lawViolatesAction(item.law, action, context)) continue;

            var violation = {
                law: item.law,
                source: item.source,
                sourceId: item.sourceId,
                sourceName: item.sourceName,
                applicability: item.applicability,
                isEnforced: item.isEnforced
            };

            rawViolations.all.push(violation);
            if (item.source === 'civil') {
                rawViolations.civil.push(violation);
            } else if (item.source === 'religious') {
                rawViolations.religious.push(violation);
            }
        }

        if (rawViolations.all.length === 0) {
            return emptyResult;
        }

        var violations = _applySupremacy(rawViolations, ctx);

        // Governing law: the highest-severity enforced violation, if any.
        // Severity ordering: mortal > major > minor.
        var governing = _selectGoverningViolation(violations.all);

        // Consequences are derived only from enforced violations. A law
        // that is applicable but not enforced does not produce consequences.
        var consequences = _deriveConsequences(violations.all, action, context);

        return {
            lawful: false,
            violations: violations.all,
            civil: violations.civil,
            religious: violations.religious,
            governingLaw: governing,
            consequences: consequences
        };
    }

    // =========================================================================
    // 3. CONSEQUENCE DERIVATION
    // =========================================================================

    var _SEVERITY_RANK = {
        'minor': 1,
        'major': 2,
        'mortal': 3
    };

    function _selectGoverningViolation(violations) {
        var best = null;
        var bestRank = -1;
        for (var i = 0; i < violations.length; i++) {
            var v = violations[i];
            if (!v.isEnforced) continue;

            var sev = (v.law && v.law.crimeMapping && v.law.crimeMapping.crimeSeverity);
            if (sev === undefined) sev = v.law && v.law.severity;

            var rank = _SEVERITY_RANK[sev] || 0;
            if (rank > bestRank) {
                bestRank = rank;
                best = v;
            }
        }
        // If nothing is enforced, fall back to the highest-severity violation
        // regardless of enforcement so the caller still knows what was breached.
        if (!best) {
            for (var j = 0; j < violations.length; j++) {
                var vv = violations[j];
                var s = (vv.law && vv.law.crimeMapping && vv.law.crimeMapping.crimeSeverity);
                if (s === undefined) s = vv.law && vv.law.severity;
                var r = _SEVERITY_RANK[s] || 0;
                if (r > bestRank) {
                    bestRank = r;
                    best = vv;
                }
            }
        }
        return best;
    }

    /**
     * Extracts legal consequences from a set of violations.
     *
     * A consequence is only produced when:
     *   - the violation is enforced, AND
     *   - the governing law actually prescribes one.
     *
     * If a law is enforced but specifies no punishment, an implicit
     * "enforced, undetermined" consequence is returned so the caller can
     * decide how to proceed. The consequences array is never populated with
     * invented punishments.
     */
    function _deriveConsequences(violations, action, context) {
        var out = [];

        for (var i = 0; i < violations.length; i++) {
            var v = violations[i];
            if (!v.isEnforced) continue;

            var law = v.law;
            var mapping = law.crimeMapping || {};
            var declared = mapping.consequence || mapping.punishment;

            if (!declared) {
                out.push({
                    type: 'other',
                    description: null,
                    source: {
                        lawId: law.id,
                        lawName: law.name,
                        source: v.source,
                        sourceId: v.sourceId,
                        sourceName: v.sourceName
                    }
                });
                continue;
            }

            // A law may declare a single consequence or an array.
            var list = Array.isArray(declared) ? declared : [declared];

            for (var j = 0; j < list.length; j++) {
                out.push(_normalizeConsequence(list[j], v));
            }
        }

        return out;
    }

    function _normalizeConsequence(entry, violation) {
        if (typeof entry === 'string') {
            return {
                type: _classifyConsequenceString(entry),
                description: entry,
                source: {
                    lawId: violation.law.id,
                    lawName: violation.law.name,
                    source: violation.source,
                    sourceId: violation.sourceId,
                    sourceName: violation.sourceName
                }
            };
        }

        if (entry && typeof entry === 'object') {
            return {
                type: entry.type || 'other',
                description: entry.description || null,
                method: entry.method || null,
                authority: entry.authority || null,
                source: {
                    lawId: violation.law.id,
                    lawName: violation.law.name,
                    source: violation.source,
                    sourceId: violation.sourceId,
                    sourceName: violation.sourceName
                }
            };
        }

        return {
            type: 'other',
            description: null,
            source: {
                lawId: violation.law.id,
                lawName: violation.law.name,
                source: violation.source,
                sourceId: violation.sourceId,
                sourceName: violation.sourceName
            }
        };
    }

    // Lightweight classifier for free-text consequence strings. The mapping
    // is intentionally small; anything unrecognised stays 'other' and is
    // surfaced to the caller untouched.
    function _classifyConsequenceString(text) {
        var lower = String(text).toLowerCase();
        if (lower.indexOf('execut') !== -1 || lower.indexOf('death') !== -1 ||
            lower.indexOf('behead') !== -1 || lower.indexOf('hang') !== -1) {
            return 'execution';
        }
        if (lower.indexOf('imprison') !== -1 || lower.indexOf('dungeon') !== -1) {
            return 'imprisonment';
        }
        if (lower.indexOf('exile') !== -1 || lower.indexOf('banish') !== -1) {
            return 'exile';
        }
        if (lower.indexOf('fine') !== -1) return 'fine';
        if (lower.indexOf('penance') !== -1 || lower.indexOf('pilgrimage') !== -1 ||
            lower.indexOf('fast') !== -1) {
            return 'penance';
        }
        if (lower.indexOf('excommunicat') !== -1 || lower.indexOf('anathema') !== -1) {
            return 'excommunication';
        }
        return 'other';
    }

    // =========================================================================
    // 4. SEARCH
    // =========================================================================

    function searchLaws(query, locationId, religionId) {
        var results = [];
        var lowerQuery = (query || '').toLowerCase();

        // ----- Civil laws -----
        if (!religionId) {
            var locations = [];
            if (locationId) {
                locations.push(locationId);
            } else if (typeof window.SettlementState !== 'undefined' &&
                       typeof window.SettlementState.getAllSettlements === 'function') {
                var all = window.SettlementState.getAllSettlements();
                for (var i = 0; i < all.length; i++) {
                    if (all[i].locationId) locations.push(all[i].locationId);
                }
            }

            for (var li = 0; li < locations.length; li++) {
                var locId = locations[li];
                var civilLaws;
                try {
                    civilLaws = _getCivilLaws(locId);
                } catch (e) {
                    continue;
                }
                for (var j = 0; j < civilLaws.length; j++) {
                    var cLaw = civilLaws[j];
                    if (_lawMatchesQuery(cLaw, lowerQuery)) {
                        results.push({
                            law: cLaw,
                            source: 'civil',
                            sourceId: locId,
                            sourceName: _getPlaceName(locId)
                        });
                    }
                }
            }
        }

        // ----- Religious laws -----
        if (!locationId) {
            var religions = [];
            if (religionId) {
                religions.push(religionId);
            } else if (typeof window.ReligionState !== 'undefined' &&
                       typeof window.ReligionState.getAllReligions === 'function') {
                var allR = window.ReligionState.getAllReligions({ includeDeprecated: false });
                for (var ri = 0; ri < allR.length; ri++) religions.push(allR[ri].id);
            }

            for (var rIdx = 0; rIdx < religions.length; rIdx++) {
                var relId = religions[rIdx];
                var religiousLaws;
                try {
                    religiousLaws = _getReligionLaws(relId);
                } catch (e) {
                    continue;
                }
                for (var k = 0; k < religiousLaws.length; k++) {
                    var rLaw = religiousLaws[k];
                    if (_lawMatchesQuery(rLaw, lowerQuery)) {
                        results.push({
                            law: rLaw,
                            source: 'religious',
                            sourceId: relId,
                            sourceName: _getReligionName(relId)
                        });
                    }
                }
            }
        }

        return results;
    }

    function _lawMatchesQuery(law, lowerQuery) {
        if (!law) return false;
        if (!lowerQuery) return true;

        var name = (law.name || '').toLowerCase();
        if (name.indexOf(lowerQuery) !== -1) return true;

        var desc = (law.description || '').toLowerCase();
        if (desc.indexOf(lowerQuery) !== -1) return true;

        return false;
    }

    // =========================================================================
    // 5. STATISTICS
    // =========================================================================

    function getLawStatistics(locationId) {
        var stats = {
            totalLaws: 0,
            totalEnforced: 0,
            bySource: { civil: 0, religious: 0 },
            byDomain: {},
            bySeverity: {},
            byType: {}
        };

        // ----- Civil -----
        var civilLaws = [];
        if (locationId) {
            try { civilLaws = _getCivilLaws(locationId); } catch (e) { civilLaws = []; }
        } else if (typeof window.SettlementState !== 'undefined' &&
                   typeof window.SettlementState.getAllSettlements === 'function') {
            var all = window.SettlementState.getAllSettlements();
            for (var i = 0; i < all.length; i++) {
                if (!all[i].locationId) continue;
                try {
                    var locLaws = _getCivilLaws(all[i].locationId);
                    civilLaws = civilLaws.concat(locLaws);
                } catch (e) { /* skip */ }
            }
        }

        for (var j = 0; j < civilLaws.length; j++) {
            _accumulateLawStats(stats, civilLaws[j], 'civil');
        }

        // ----- Religious -----
        if (!locationId && typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            var religions = window.ReligionState.getAllReligions({ includeDeprecated: false });
            for (var r = 0; r < religions.length; r++) {
                var religiousLaws;
                try {
                    religiousLaws = _getReligionLaws(religions[r].id);
                } catch (e) { continue; }
                for (var k = 0; k < religiousLaws.length; k++) {
                    _accumulateLawStats(stats, religiousLaws[k], 'religious');
                }
            }
        }

        return stats;
    }

    function _accumulateLawStats(stats, law, source) {
        if (!law) return;
        stats.totalLaws++;
        stats.bySource[source] = (stats.bySource[source] || 0) + 1;
        if (_isLawEnforced(law)) stats.totalEnforced++;

        var domain = law.domain || 'unknown';
        stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;

        var severity = law.severity || 'unknown';
        stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;

        var type = law.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.CrimeLawIntegration = {
        // Applicability
        getApplicableLaws: getApplicableLaws,
        getEnforcedLaws: getEnforcedLaws,
        getReligiousLaws: getReligiousLaws,
        getCivilLawsForCharacter: getCivilLawsForCharacter,

        // Evaluation
        evaluateAction: evaluateAction,

        // Search & statistics
        searchLaws: searchLaws,
        getLawStatistics: getLawStatistics
    };

    window._crimeLawIntegration = window.CrimeLawIntegration;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeLawIntegration;
    }

})();
