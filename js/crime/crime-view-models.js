/**
 * =============================================================================
 * STILL WATERS - CRIME VIEW MODELS (crime-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-view-models.js
 *
 * PURPOSE:
 *   Presentation-shaping for Crime UI. Pure transforms from already-fetched
 *   records (crimes, vendettas, evaluations, statistics) into the stable
 *   shapes the renderers consume.
 *
 *   No DOM. No queries. No state. No commands. Every function takes the data
 *   it needs as an argument. If a view model needs extra data (a character
 *   for name formatting, a place for a location label), the caller fetches
 *   and passes it in.
 *
 * OWNERSHIP:
 *   - the shape every renderer consumes
 *   - presentation vocabulary: label lookups (crime type names, vendetta
 *     status labels, gender/severity labels)
 *   - icon *names* (not rendered icons — the UI layer resolves names via
 *     _getIcon)
 *   - defaults for modal fields
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not render HTML.
 *   - It does not resolve icons. It returns icon names.
 *   - It does not read CrimeState, CrimeQueries, or CrimeCommands.
 *   - It does not re-derive severity bands. (CrimeConstants.classifySeverity)
 *   - It does not carry its own copy of crime type vocabulary. Labels that
 *     are missing from the label map fall through to a snake_case-to-Title
 *     transformation of the identifier, which the renderer displays.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants
 *
 * ICON POLICY: No emojis. Icons are exposed as name strings only.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.CrimeConstants;
    if (!C) {
        throw new Error('crime-view-models.js requires CrimeConstants');
    }

    // =========================================================================
    // 1. LABEL MAPS (presentation vocabulary; canonical ids from CrimeConstants)
    // =========================================================================

    // Display labels for crime types. A type not present here falls through
    // to snake_case-to-Title. Adding a new crime type to CrimeConstants does
    // not require adding it here; it only requires adding it if you want a
    // nicer label than the automated one.

    var _TYPE_LABELS = {
        murder: 'Murder',
        execution: 'Execution',
        crime_of_passion: 'Crime of Passion',
        adultery: 'Adultery',
        treason: 'Treason',
        theft: 'Theft',
        espionage: 'Espionage',
        assault: 'Assault',
        vendetta: 'Vendetta Violence',
        violence: 'Violence',
        robbery: 'Robbery',
        fraud: 'Fraud',
        forgery: 'Forgery',
        smuggling: 'Smuggling',
        heresy: 'Heresy',
        blasphemy: 'Blasphemy',
        apostasy: 'Apostasy',
        sacrilege: 'Sacrilege',
        witchcraft: 'Witchcraft',
        idolatry: 'Idolatry',
        schism: 'Schism',
        excommunication_violation: 'Violation of Excommunication',
        religious_impersonation: 'Religious Impersonation',
        false_prophecy: 'False Prophecy',
        desecration: 'Desecration'
    };

    // Icon names for crime types. Returned as strings; the UI layer resolves
    // each name via _getIcon. This is the single place crime-to-icon mapping
    // lives.

    var _TYPE_ICON_NAMES = {
        murder: 'X_HEAVY',
        execution: 'X_HEAVY',
        crime_of_passion: 'X_HEAVY',
        treason: 'SHIELD',
        espionage: 'SHIELD',
        assault: 'SWORD',
        violence: 'SWORD',
        vendetta: 'SWORD',
        theft: 'WARNING',
        robbery: 'WARNING',
        fraud: 'WARNING',
        forgery: 'WARNING',
        smuggling: 'WARNING',
        adultery: 'HEART_OUTLINE'
    };

    var _DEFAULT_TYPE_ICON = 'CIRCLE_DOT';

    // =========================================================================
    // 2. PRIMITIVE FORMATTERS (pure; no dependency on any record shape)
    // =========================================================================

    function formatCrimeType(type) {
        if (!type) return 'Unknown';
        if (Object.prototype.hasOwnProperty.call(_TYPE_LABELS, type)) {
            return _TYPE_LABELS[type];
        }
        // Unknown type: convert snake_case to Title Case so the identifier
        // is still legible without inventing vocabulary.
        return String(type)
            .split('_')
            .map(function(word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    function crimeIconName(type) {
        if (!type) return _DEFAULT_TYPE_ICON;
        return _TYPE_ICON_NAMES[type] || _DEFAULT_TYPE_ICON;
    }

    function formatVendettaStatus(status) {
        var s = C.VENDETTA_STATUS;
        switch (status) {
            case s.ACTIVE:    return 'Active';
            case s.ESCALATED: return 'Escalated';
            case s.RESOLVED:  return 'Resolved';
            default:          return status ? String(status) : 'Unknown';
        }
    }

    function formatSeverity(severity) {
        if (typeof severity !== 'number') return 'Unknown';
        return severity + '/10';
    }

    /**
     * Returns a band label from a numeric severity, or null for unknown.
     * Delegates to CrimeConstants.classifySeverity so the thresholds have
     * exactly one home.
     */
    function formatSeverityBand(severity) {
        var band = C.classifySeverity(severity);
        if (!band) return null;
        switch (band) {
            case C.SEVERITY_BANDS.LOW:      return 'Low';
            case C.SEVERITY_BANDS.MEDIUM:   return 'Medium';
            case C.SEVERITY_BANDS.HIGH:     return 'High';
            case C.SEVERITY_BANDS.CRITICAL: return 'Critical';
            default:                        return band;
        }
    }

    /**
     * Formats a year with BC handling. Mirrors formatYear from core, but
     * self-contained so view models never call a global helper.
     */
    function formatYear(year) {
        if (year == null) return '?';
        if (typeof year !== 'number') return String(year);
        if (year < 0) return Math.abs(year) + ' BC';
        return String(year);
    }

    /**
     * Formats a character name from a record with `name` and optional
     * `surname`. Returns 'Unknown' for missing input.
     */
    function formatPersonName(character) {
        if (!character) return 'Unknown';
        var name = character.name || 'Unknown';
        if (character.surname) name += ' ' + character.surname;
        return name;
    }

    /**
     * Formats a name snapshot field. Snapshot fields on crime and vendetta
     * records store only `name`, not `name + surname`, so this is a trivial
     * helper that just guards against null.
     */
    function formatSnapshotName(name) {
        if (!name) return 'Unknown';
        return String(name);
    }

    // =========================================================================
    // 3. CRIME LIST ITEM
    // =========================================================================
    //
    // The shape every crime list renderer consumes. Does not include the raw
    // record — the caller should not need it after this transform.
    //
    // Input:
    //   crime       — crime record
    //   characters  — optional map { [id]: character } for name fallback when
    //                 the snapshot is missing (rare; preserved for the transition
    //                 from legacy records)
    //   locationName — optional resolved location label
    //
    // Output: { id, type, typeLabel, typeIconName, year, yearLabel,
    //           perpetratorName, victimName, locationName, reason,
    //           solved, statusLabel, severity, severityLabel,
    //           severityBand, severityBandLabel }

    function toCrimeListItem(crime, ctx) {
        if (!crime) return null;
        ctx = ctx || {};

        var perpetratorName = crime.perpetratorName
            || (ctx.characters && ctx.characters[crime.perpetratorId])
                ? formatPersonName(ctx.characters[crime.perpetratorId])
                : formatSnapshotName(crime.perpetratorName);

        var victimName = crime.victimName
            || (ctx.characters && ctx.characters[crime.victimId])
                ? formatPersonName(ctx.characters[crime.victimId])
                : formatSnapshotName(crime.victimName);

        return {
            id: crime.id,
            type: crime.type,
            typeLabel: formatCrimeType(crime.type),
            typeIconName: crimeIconName(crime.type),
            year: crime.year,
            yearLabel: formatYear(crime.year),
            perpetratorId: crime.perpetratorId || null,
            perpetratorName: perpetratorName,
            victimId: crime.victimId || null,
            victimName: crime.victimId ? victimName : null,
            locationId: crime.locationId || null,
            locationName: ctx.locationName || null,
            reason: crime.reason || null,
            solved: !!crime.solved,
            statusLabel: crime.solved ? 'Solved' : 'Unsolved',
            severity: (typeof crime.severity === 'number') ? crime.severity : null,
            severityLabel: formatSeverity(crime.severity),
            severityBand: C.classifySeverity(crime.severity),
            severityBandLabel: formatSeverityBand(crime.severity),
            isSelected: false
        };
    }

    function toCrimeListItems(crimes, ctx) {
        if (!Array.isArray(crimes)) return [];
        var out = new Array(crimes.length);
        for (var i = 0; i < crimes.length; i++) {
            out[i] = toCrimeListItem(crimes[i], ctx);
        }
        return out;
    }

    // =========================================================================
    // 4. CRIME DETAILS
    // =========================================================================
    //
    // Full-detail shape for the details modal. Includes law-derived fields
    // verbatim, formatted for display.
    //
    // Input:
    //   crime        — crime record
    //   perpetrator  — optional character record (for display name)
    //   victim       — optional character record
    //   locationName — optional resolved location label
    //
    // Output: extends crimeListItem with solution, notes, civilViolation,
    //         religiousViolation, violatedLaws, method.

    function toCrimeDetailsViewModel(crime, ctx) {
        if (!crime) return null;
        ctx = ctx || {};

        var base = toCrimeListItem(crime, ctx);

        var violatedLaws = [];
        if (Array.isArray(crime.violatedLaws)) {
            for (var i = 0; i < crime.violatedLaws.length; i++) {
                var v = crime.violatedLaws[i];
                violatedLaws.push({
                    source: v.source || null,
                    lawId: v.lawId || null,
                    lawName: v.lawName || 'Unnamed law',
                    sourceId: v.sourceId || null,
                    sourceName: v.sourceName || null
                });
            }
        }

        return {
            // Base list item shape
            id: base.id,
            type: base.type,
            typeLabel: base.typeLabel,
            typeIconName: base.typeIconName,
            year: base.year,
            yearLabel: base.yearLabel,
            perpetratorId: base.perpetratorId,
            perpetratorName: base.perpetratorName,
            victimId: base.victimId,
            victimName: base.victimName,
            locationId: base.locationId,
            locationName: base.locationName,
            reason: base.reason,
            solved: base.solved,
            statusLabel: base.statusLabel,
            severity: base.severity,
            severityLabel: base.severityLabel,
            severityBand: base.severityBand,
            severityBandLabel: base.severityBandLabel,

            // Detail-only fields
            solution: crime.solution || null,
            method: crime.method || null,
            notes: crime.notes || null,
            civilViolation: _violationDetail(crime.civilViolation),
            religiousViolation: _violationDetail(crime.religiousViolation),
            religionId: crime.religionId || null,
            violatedLaws: violatedLaws
        };
    }

    function _violationDetail(violation) {
        if (!violation) return null;
        return {
            lawId: violation.lawId || null,
            lawName: violation.lawName || 'Unnamed law',
            severity: violation.severity || null,
            punishment: violation.punishment || null,
            sourceId: violation.sourceId || null,
            sourceName: violation.sourceName || null,
            locationId: violation.locationId || null,
            religionId: violation.religionId || null
        };
    }

    // =========================================================================
    // 5. VENDETTA LIST ITEM
    // =========================================================================
    //
    // Input:
    //   vendetta — vendetta record
    //
    // Output: { id, householdAName, householdBName, statusKey, statusLabel,
    //           startedYear, startedYearLabel, cause, deathCount,
    //           isResolved, isEscalated, iconName, isSelected }

    function toVendettaListItem(vendetta) {
        if (!vendetta) return null;

        var deaths = Array.isArray(vendetta.deaths) ? vendetta.deaths : [];
        var isResolved = vendetta.status === C.VENDETTA_STATUS.RESOLVED;
        var isEscalated = vendetta.status === C.VENDETTA_STATUS.ESCALATED;

        return {
            id: vendetta.id,
            householdAId: vendetta.householdAId || null,
            householdAName: formatSnapshotName(vendetta.householdAName),
            householdBId: vendetta.householdBId || null,
            householdBName: formatSnapshotName(vendetta.householdBName),
            statusKey: vendetta.status,
            statusLabel: formatVendettaStatus(vendetta.status),
            startedYear: vendetta.startedYear,
            startedYearLabel: formatYear(vendetta.startedYear),
            cause: vendetta.cause || null,
            deathCount: deaths.length,
            isResolved: isResolved,
            isEscalated: isEscalated,
            iconName: isResolved ? 'CHECK_SIMPLE' : 'FLAG',
            isSelected: false
        };
    }

    function toVendettaListItems(vendettas) {
        if (!Array.isArray(vendettas)) return [];
        var out = new Array(vendettas.length);
        for (var i = 0; i < vendettas.length; i++) {
            out[i] = toVendettaListItem(vendettas[i]);
        }
        return out;
    }

    // =========================================================================
    // 6. VENDETTA DETAILS
    // =========================================================================
    //
    // Output: extends vendettaListItem with deaths (formatted), resolution,
    //         notes.

    function toVendettaDetailsViewModel(vendetta) {
        if (!vendetta) return null;

        var base = toVendettaListItem(vendetta);
        var deaths = Array.isArray(vendetta.deaths) ? vendetta.deaths : [];
        var deathRows = new Array(deaths.length);

        for (var i = 0; i < deaths.length; i++) {
            var d = deaths[i];
            deathRows[i] = {
                victimId: d.victimId || null,
                victimName: formatSnapshotName(d.victimName),
                killerId: d.killerId || null,
                killerName: formatSnapshotName(d.killerName),
                year: d.year,
                yearLabel: formatYear(d.year),
                reason: d.reason || null,
                crimeId: d.crimeId || null
            };
        }

        return {
            // Base list item shape
            id: base.id,
            householdAId: base.householdAId,
            householdAName: base.householdAName,
            householdBId: base.householdBId,
            householdBName: base.householdBName,
            statusKey: base.statusKey,
            statusLabel: base.statusLabel,
            startedYear: base.startedYear,
            startedYearLabel: base.startedYearLabel,
            cause: base.cause,
            deathCount: base.deathCount,
            isResolved: base.isResolved,
            isEscalated: base.isEscalated,
            iconName: base.iconName,

            // Detail-only fields
            characterAId: vendetta.characterAId || null,
            characterAName: vendetta.characterAName || null,
            characterBId: vendetta.characterBId || null,
            characterBName: vendetta.characterBName || null,
            originCrimeId: vendetta.originCrimeId || null,
            escalatedAt: vendetta.escalatedAt || null,
            resolvedAt: vendetta.resolvedAt || null,
            resolution: vendetta.resolution || null,
            notes: vendetta.notes || null,
            deaths: deathRows
        };
    }

    // =========================================================================
    // 7. CRIME STATISTICS
    // =========================================================================
    //
    // Input:
    //   stats        — result of CrimeQueries.getLocationCrimeStats or
    //                  getOverallCrimeStats
    //   locationName — optional display label
    //
    // Output: the statistics result plus display-ready derived values:
    //         typeDistributionRows, severityBreakdownRows, periodLabel,
    //         avgSeverityLabel.

    function toCrimeStatsViewModel(stats, locationName) {
        if (!stats) return null;

        var typeDistributionRows = [];
        if (stats.typeDistribution) {
            var typeKeys = Object.keys(stats.typeDistribution);
            for (var i = 0; i < typeKeys.length; i++) {
                var key = typeKeys[i];
                typeDistributionRows.push({
                    type: key,
                    typeLabel: formatCrimeType(key),
                    typeIconName: crimeIconName(key),
                    count: stats.typeDistribution[key]
                });
            }
            typeDistributionRows.sort(function(a, b) { return b.count - a.count; });
        }

        var severityBreakdownRows = null;
        if (stats.severityBreakdown) {
            severityBreakdownRows = [
                { band: C.SEVERITY_BANDS.LOW,      label: 'Low',      count: stats.severityBreakdown.low      || 0 },
                { band: C.SEVERITY_BANDS.MEDIUM,   label: 'Medium',   count: stats.severityBreakdown.medium   || 0 },
                { band: C.SEVERITY_BANDS.HIGH,     label: 'High',     count: stats.severityBreakdown.high     || 0 },
                { band: C.SEVERITY_BANDS.CRITICAL, label: 'Critical', count: stats.severityBreakdown.critical || 0 }
            ];
        }

        var periodLabel = null;
        if (stats.period) {
            periodLabel = 'Window: ' + stats.period.startYear + '–' +
                stats.period.endYear + ' (' + stats.period.windowYears + 'y)';
        }

        var avgSeverityLabel = null;
        if (typeof stats.averageCrimeSeverity === 'number') {
            avgSeverityLabel = stats.averageCrimeSeverity.toFixed(1) + '/10';
        }

        var mostCommonCrimeLabel = stats.mostCommonCrime
            ? formatCrimeType(stats.mostCommonCrime)
            : null;

        return {
            locationId: stats.locationId || null,
            locationName: locationName || null,

            // Raw numbers (unchanged)
            totalCrimes: stats.totalCrimes || 0,
            recentCrimes: stats.recentCrimes || 0,
            solvedCount: stats.solvedCount || 0,
            unsolvedCrimes: stats.unsolvedCrimes || 0,
            solvedRate: stats.solvedRate || 0,
            crimeBurden: (typeof stats.crimeBurden === 'number') ? stats.crimeBurden : null,
            recentCrimeBurden: (typeof stats.recentCrimeBurden === 'number') ? stats.recentCrimeBurden : null,
            averageCrimeSeverity: (typeof stats.averageCrimeSeverity === 'number') ? stats.averageCrimeSeverity : null,

            // Display-ready derived values
            solvedRateLabel: Math.round(stats.solvedRate || 0) + '%',
            period: stats.period || null,
            periodLabel: periodLabel,
            avgSeverityLabel: avgSeverityLabel,
            mostCommonCrime: stats.mostCommonCrime || null,
            mostCommonCrimeLabel: mostCommonCrimeLabel,
            typeDistributionRows: typeDistributionRows,
            severityBreakdownRows: severityBreakdownRows
        };
    }

    // =========================================================================
    // 8. MURDER MODAL DEFAULTS
    // =========================================================================
    //
    // Input:
    //   options — the modal's caller-supplied options
    //
    // Output: defaults the modal form can bind to directly.

    function toMurderModalViewModel(options) {
        options = options || {};
        return {
            title: options.title || 'Record Murder',
            defaultYear: (typeof options.year === 'number')
                ? options.year
                : _currentYear(),
            victimId: options.victimId || null,
            victimName: null, // modal resolves display name via its selector
            killerId: options.killerId || null,
            killerName: null,
            locationId: options.locationId || null,
            reason: options.reason || '',
            startVendetta: options.startVendetta !== false,
            notes: options.notes || ''
        };
    }

    // =========================================================================
    // 9. EXECUTION MODAL DEFAULTS
    // =========================================================================

    function toExecutionModalViewModel(options) {
        options = options || {};
        return {
            title: options.title || 'Record Execution',
            defaultYear: (typeof options.year === 'number')
                ? options.year
                : _currentYear(),
            condemnedId: options.condemnedId || null,
            condemnedName: null,
            locationId: options.locationId || null,
            reason: options.reason || '',
            method: options.method || '',
            methodOptions: _executionMethodOptions(),
            notes: options.notes || ''
        };
    }

    function _executionMethodOptions() {
        var methods = C.EXECUTION_METHODS || {};
        var out = [];
        for (var key in methods) {
            if (!Object.prototype.hasOwnProperty.call(methods, key)) continue;
            out.push({ id: methods[key].id, name: methods[key].name });
        }
        return out;
    }

    // =========================================================================
    // 10. VENDETTA MODAL DEFAULTS
    // =========================================================================

    function toVendettaModalViewModel(options) {
        options = options || {};
        return {
            title: options.title || 'Create Vendetta',
            defaultYear: (typeof options.year === 'number')
                ? options.year
                : _currentYear(),
            householdAId: options.householdAId || null,
            householdAName: null,
            householdBId: options.householdBId || null,
            householdBName: null,
            cause: options.cause || '',
            notes: options.notes || ''
        };
    }

    // =========================================================================
    // 11. LAW EVALUATION
    // =========================================================================
    //
    // Input:
    //   evaluation — result of CrimeLawIntegration.evaluateAction
    //
    // Output: display-ready summary of the legal evaluation. Used to render
    // the outcome of a crime before the user commits it (or for logging).

    function toLawEvaluationViewModel(evaluation) {
        if (!evaluation) return null;

        var violations = Array.isArray(evaluation.violations) ? evaluation.violations : [];
        var civil = Array.isArray(evaluation.civil) ? evaluation.civil : [];
        var religious = Array.isArray(evaluation.religious) ? evaluation.religious : [];
        var consequences = Array.isArray(evaluation.consequences) ? evaluation.consequences : [];

        var governing = null;
        if (evaluation.governingLaw) {
            var g = evaluation.governingLaw;
            governing = {
                lawId: g.law ? g.law.id : null,
                lawName: g.law ? g.law.name : null,
                source: g.source || null,
                sourceName: g.sourceName || null,
                isEnforced: !!g.isEnforced
            };
        }

        var consequencesVm = new Array(consequences.length);
        for (var i = 0; i < consequences.length; i++) {
            var c = consequences[i];
            consequencesVm[i] = {
                type: c.type || 'other',
                typeLabel: _consequenceTypeLabel(c.type),
                description: c.description || null,
                method: c.method || null,
                authority: c.authority || null,
                source: c.source ? {
                    lawId: c.source.lawId || null,
                    lawName: c.source.lawName || null,
                    source: c.source.source || null,
                    sourceName: c.source.sourceName || null
                } : null
            };
        }

        return {
            lawful: !!evaluation.lawful,
            violationCount: violations.length,
            civilCount: civil.length,
            religiousCount: religious.length,
            governing: governing,
            governingLabel: governing ? governing.lawName || 'Unnamed law' : null,
            consequences: consequencesVm,
            consequenceCount: consequencesVm.length
        };
    }

    function _consequenceTypeLabel(type) {
        switch (type) {
            case C.CONSEQUENCE_TYPES.EXECUTION:       return 'Execution';
            case C.CONSEQUENCE_TYPES.IMPRISONMENT:    return 'Imprisonment';
            case C.CONSEQUENCE_TYPES.EXILE:           return 'Exile';
            case C.CONSEQUENCE_TYPES.FINE:            return 'Fine';
            case C.CONSEQUENCE_TYPES.PENANCE:         return 'Penance';
            case C.CONSEQUENCE_TYPES.EXCOMMUNICATION: return 'Excommunication';
            case C.CONSEQUENCE_TYPES.OTHER:           return 'Unspecified';
            default:                                  return 'Unknown';
        }
    }

    // =========================================================================
    // 12. INTERNAL HELPERS
    // =========================================================================

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.CrimeViewModels = {
        // Primitive formatters
        formatCrimeType: formatCrimeType,
        formatVendettaStatus: formatVendettaStatus,
        formatSeverity: formatSeverity,
        formatSeverityBand: formatSeverityBand,
        formatYear: formatYear,
        formatPersonName: formatPersonName,
        formatSnapshotName: formatSnapshotName,

        // Icons (as names — the UI resolves via _getIcon)
        crimeIconName: crimeIconName,

        // Crime
        toCrimeListItem: toCrimeListItem,
        toCrimeListItems: toCrimeListItems,
        toCrimeDetailsViewModel: toCrimeDetailsViewModel,

        // Vendetta
        toVendettaListItem: toVendettaListItem,
        toVendettaListItems: toVendettaListItems,
        toVendettaDetailsViewModel: toVendettaDetailsViewModel,

        // Statistics
        toCrimeStatsViewModel: toCrimeStatsViewModel,

        // Modal defaults
        toMurderModalViewModel: toMurderModalViewModel,
        toExecutionModalViewModel: toExecutionModalViewModel,
        toVendettaModalViewModel: toVendettaModalViewModel,

        // Law evaluation
        toLawEvaluationViewModel: toLawEvaluationViewModel
    };

    window._crimeViewModels = window.CrimeViewModels;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeViewModels;
    }

})();
