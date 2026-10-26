/**
 * =============================================================================
 * STILL WATERS - DISASTER VIEW MODELS (disaster-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-view-models.js
 *
 * PURPOSE:
 *   Presentation-shaping for the Disaster UI. Pure transforms from
 *   already-fetched records (disasters, damage reports, statistics) into
 *   the stable shapes the renderers consume.
 *
 *   No DOM. No queries. No state. No commands. Every function takes the
 *   data it needs as an argument. If a view model needs extra data (a
 *   place for a location label), the caller fetches and passes it in.
 *
 * OWNERSHIP:
 *   - the shape every disaster renderer consumes
 *   - presentation vocabulary: severity band labels, damage category
 *     labels, icon names for disaster types
 *   - defaults for the create-disaster modal
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not render HTML.
 *   - It does not resolve icons. It returns icon names.
 *   - It does not read DisasterState, DisasterQueries, or DisasterCommands.
 *   - It does not re-derive severity thresholds. Those live in
 *     DisasterConstants.classifySeverity.
 *   - It does not call getCurrentYearSafe. The caller passes currentYear
 *     explicitly where a default is needed.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants
 *
 * ICON POLICY: No emojis. Icons are exposed as name strings only.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.DisasterConstants;
    if (!C) {
        throw new Error('disaster-view-models.js requires DisasterConstants');
    }

    // =========================================================================
    // 1. PRIMITIVE FORMATTERS (pure)
    // =========================================================================

    /**
     * Formats a year with BC handling. Self-contained; no globals.
     */
    function formatYear(year) {
        if (year == null) return '?';
        if (typeof year !== 'number') return String(year);
        if (year < 0) return Math.abs(year) + ' BC';
        return String(year);
    }

    /**
     * Formats a number with locale separators, or an em dash for
     * non-numeric input.
     */
    function formatNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return '—';
        return value.toLocaleString();
    }

    /**
     * Classifies a numeric severity into its band. Delegates to
     * DisasterConstants.classifySeverity.
     */
    function formatSeverityBand(severity) {
        var band = C.classifySeverity(severity);
        if (!band) return null;
        switch (band) {
            case C.SEVERITY_BANDS.LOW:      return 'Minor';
            case C.SEVERITY_BANDS.MEDIUM:   return 'Moderate';
            case C.SEVERITY_BANDS.HIGH:     return 'Severe';
            case C.SEVERITY_BANDS.CRITICAL: return 'Catastrophic';
            default:                        return band;
        }
    }

    /**
     * Returns the CSS color token for a severity band. The token is a
     * named CSS variable, not a literal color; the UI resolves it.
     */
    function severityBandColorToken(severity) {
        var band = C.classifySeverity(severity);
        switch (band) {
            case C.SEVERITY_BANDS.LOW:      return 'success';
            case C.SEVERITY_BANDS.MEDIUM:   return 'accent';
            case C.SEVERITY_BANDS.HIGH:     return 'warn';
            case C.SEVERITY_BANDS.CRITICAL: return 'danger';
            default:                        return 'dim';
        }
    }

    /**
     * Formats a severity as "N/100 (Band)".
     */
    function formatSeverity(severity) {
        if (typeof severity !== 'number' || isNaN(severity)) return 'Unknown';
        var band = formatSeverityBand(severity);
        return band ? (severity + '/100 (' + band + ')') : (severity + '/100');
    }

    /**
     * Returns the icon NAME for a disaster type. The UI resolves the name
     * via _getIcon. Unknown types fall back to CIRCLE_DOT.
     */
    function disasterIconName(disasterId) {
        if (!disasterId) return 'CIRCLE_DOT';
        return 'CIRCLE_DOT';
    }

    /**
     * Human-readable damage category label.
     */
    function damageCategoryLabel(category) {
        switch (category) {
            case 'features':    return 'Settlement Features';
            case 'schools':     return 'Schools';
            case 'enterprises': return 'Enterprises';
            case 'residences':  return 'Residences';
            case 'households':  return 'Households';
            default:            return category || 'Unknown';
        }
    }

    /**
     * Returns the CSS color token for a damage category.
     */
    function damageCategoryColorToken(category) {
        switch (category) {
            case 'features':    return 'accent';
            case 'schools':     return 'accent-dim';
            case 'enterprises': return 'warn';
            case 'residences':  return 'danger';
            case 'households':  return 'dim';
            default:            return 'dim';
        }
    }

    // =========================================================================
    // 2. DISASTER LIST ITEM
    // =========================================================================
    //
    // Input:
    //   disaster     — disaster record
    //   locationName — optional resolved location label
    //
    // Output: stable shape for list rendering.

    function toDisasterListItem(disaster, locationName) {
        if (!disaster) return null;

        var typeLabel = disaster.disasterType || 'Unknown';
        var iconName = disasterIconName(disaster.disasterId);
        var bandLabel = formatSeverityBand(disaster.severity);
        var colorToken = severityBandColorToken(disaster.severity);

        var damage = disaster.structuralDamage || {};
        var totalDestructions =
            (damage.featuresDestroyed || 0) +
            (damage.schoolsDestroyed || 0) +
            (damage.enterprisesDestroyed || 0) +
            (damage.residencesDemolished || 0) +
            (damage.householdsDestroyed || 0);

        return {
            id: disaster.id,
            type: disaster.disasterType || 'Unknown',
            disasterId: disaster.disasterId || 'unknown',
            iconName: iconName,
            year: disaster.year,
            yearLabel: formatYear(disaster.year),
            locationId: disaster.locationId || null,
            locationName: locationName || disaster.locationName || 'Unknown',
            severity: (typeof disaster.severity === 'number') ? disaster.severity : 0,
            severityLabel: formatSeverity(disaster.severity),
            severityBandLabel: bandLabel,
            severityColorToken: colorToken,
            deaths: (typeof disaster.deaths === 'number') ? disaster.deaths : 0,
            prosperityLoss: (typeof disaster.prosperityLoss === 'number') ? disaster.prosperityLoss : 0,
            crimeIncrease: (typeof disaster.crimeIncrease === 'number') ? disaster.crimeIncrease : 0,
            totalLoss: (typeof disaster.totalLoss === 'number') ? disaster.totalLoss : 0,
            totalDestructions: totalDestructions,
            hasDestruction: totalDestructions > 0,
            description: disaster.description || '',
            descriptionPreview: (disaster.description || '').length > 80
                ? disaster.description.substring(0, 80) + '...'
                : (disaster.description || ''),
            isSelected: false
        };
    }

    function toDisasterListItems(disasters, ctx) {
        if (!Array.isArray(disasters)) return [];
        ctx = ctx || {};
        var out = new Array(disasters.length);
        for (var i = 0; i < disasters.length; i++) {
            var locationName = ctx.locationNameFor
                ? ctx.locationNameFor(disasters[i].locationId)
                : ctx.locationName || null;
            out[i] = toDisasterListItem(disasters[i], locationName);
        }
        return out;
    }

    // =========================================================================
    // 3. DISASTER DETAILS
    // =========================================================================
    //
    // Input:
    //   disaster     — disaster record
    //   locationName — optional resolved location label
    //
    // Output: extends list item with detail-only fields.

    function toDisasterDetailsViewModel(disaster, locationName) {
        if (!disaster) return null;

        var base = toDisasterListItem(disaster, locationName);

        var metadata = disaster.metadata || {};
        var structuralDamage = disaster.structuralDamage || null;

        return {
            // Base list shape
            id: base.id,
            type: base.type,
            disasterId: base.disasterId,
            iconName: base.iconName,
            year: base.year,
            yearLabel: base.yearLabel,
            locationId: base.locationId,
            locationName: base.locationName,
            severity: base.severity,
            severityLabel: base.severityLabel,
            severityBandLabel: base.severityBandLabel,
            severityColorToken: base.severityColorToken,
            deaths: base.deaths,
            prosperityLoss: base.prosperityLoss,
            crimeIncrease: base.crimeIncrease,
            totalLoss: base.totalLoss,
            totalDestructions: base.totalDestructions,
            hasDestruction: base.hasDestruction,
            description: base.description,

            // Detail-only fields
            population: (typeof disaster.population === 'number') ? disaster.population : null,
            actualDeaths: (typeof disaster.actualDeaths === 'number') ? disaster.actualDeaths : null,
            schoolsDestroyed: (typeof disaster.schoolsDestroyed === 'number') ? disaster.schoolsDestroyed : 0,
            metadata: {
                severityText: metadata.severityText || null,
                locationModifier: (typeof metadata.locationModifier === 'number') ? metadata.locationModifier : null,
                forced: !!metadata.forced
            },
            structuralDamage: structuralDamage
                ? toStructuralDamageViewModel(structuralDamage)
                : null
        };
    }

    function toStructuralDamageViewModel(damage) {
        if (!damage) return null;
        return {
            featuresDestroyed: (damage.featuresDestroyed || 0),
            schoolsDestroyed: (damage.schoolsDestroyed || 0),
            enterprisesDestroyed: (damage.enterprisesDestroyed || 0),
            residencesDemolished: (damage.residencesDemolished || 0),
            householdsDestroyed: (damage.householdsDestroyed || 0),
            totalLoss: (damage.totalLoss || 0),
            totalCount:
                (damage.featuresDestroyed || 0) +
                (damage.schoolsDestroyed || 0) +
                (damage.enterprisesDestroyed || 0) +
                (damage.residencesDemolished || 0) +
                (damage.householdsDestroyed || 0),
            destructionList: {
                features: copyList(damage.destructionList && damage.destructionList.features),
                schools: copyList(damage.destructionList && damage.destructionList.schools),
                enterprises: copyList(damage.destructionList && damage.destructionList.enterprises),
                residences: copyList(damage.destructionList && damage.destructionList.residences),
                households: copyList(damage.destructionList && damage.destructionList.households)
            }
        };
    }

    function copyList(list) {
        if (!Array.isArray(list)) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = list[i];
        return out;
    }

    // =========================================================================
    // 4. DESTRUCTION ROW
    // =========================================================================
    //
    // Input:
    //   item — a single entry from a disaster's destructionList, plus
    //          category, disasterId, disasterType, disasterYear if the
    //          caller pulled it from getLocationDestroyedItems.
    //
    // Output: shape used by the destroyed-items list renderer.

    function toDestructionRow(item) {
        if (!item) return null;
        return {
            id: item.id || null,
            name: item.name || item.id || 'Unknown',
            category: item.category || item.type || 'unknown',
            categoryLabel: damageCategoryLabel(item.category || item.type),
            colorToken: damageCategoryColorToken(item.category || item.type),
            year: (typeof item.year === 'number') ? item.year : null,
            yearLabel: formatYear(item.year),
            disasterId: item.disasterId || null,
            disasterType: item.disasterType || null,
            disasterYear: (typeof item.disasterYear === 'number') ? item.disasterYear : null,
            disasterYearLabel: formatYear(item.disasterYear)
        };
    }

    function toDestructionRows(items) {
        if (!Array.isArray(items)) return [];
        var out = [];
        for (var i = 0; i < items.length; i++) {
            var row = toDestructionRow(items[i]);
            if (row) out.push(row);
        }
        return out;
    }

    // =========================================================================
    // 5. CRIME STATS VIEW MODEL
    // =========================================================================
    //
    // Input:
    //   stats        — result of DisasterQueries.getDisasterStats
    //   locationName — optional display label
    //
    // Output: the statistics result plus display-ready derived values.

    function toDisasterStatsViewModel(stats, locationName) {
        if (!stats) return null;

        var byTypeRows = [];
        if (stats.byType) {
            var typeKeys = Object.keys(stats.byType);
            for (var i = 0; i < typeKeys.length; i++) {
                var key = typeKeys[i];
                byTypeRows.push({
                    type: key,
                    typeLabel: key,
                    iconName: disasterIconName(key),
                    count: stats.byType[key]
                });
            }
            byTypeRows.sort(function(a, b) { return b.count - a.count; });
        }

        var byYearRows = [];
        if (stats.byYear) {
            var yearKeys = Object.keys(stats.byYear).sort();
            for (var j = 0; j < yearKeys.length; j++) {
                byYearRows.push({
                    year: yearKeys[j],
                    count: stats.byYear[yearKeys[j]]
                });
            }
        }

        return {
            locationName: locationName || 'Global',

            // Raw numbers
            total: stats.total || 0,
            totalDeaths: stats.totalDeaths || 0,
            totalProsperityLoss: stats.totalProsperityLoss || 0,
            totalSchoolsDestroyed: stats.totalSchoolsDestroyed || 0,
            averageSeverity: (typeof stats.averageSeverity === 'number') ? stats.averageSeverity : 0,

            // Display-ready derived values
            averageSeverityLabel: (typeof stats.averageSeverity === 'number')
                ? Math.round(stats.averageSeverity) + '/100'
                : '0/100',
            byTypeRows: byTypeRows,
            byYearRows: byYearRows,
            deadliest: stats.deadliest
                ? toDisasterListItem(stats.deadliest, null)
                : null,
            mostRecent: stats.mostRecent
                ? toDisasterListItem(stats.mostRecent, null)
                : null
        };
    }

    // =========================================================================
    // 6. SEVERITY STATS VIEW MODEL
    // =========================================================================

    function toSeverityStatsViewModel(stats) {
        if (!stats) return null;
        var dist = stats.distribution || {};
        var low = dist.low || 0;
        var medium = dist.medium || 0;
        var high = dist.high || 0;
        var critical = dist.critical || 0;
        var total = low + medium + high + critical;

        function pct(n) { return total > 0 ? Math.round((n / total) * 100) : 0; }

        return {
            total: total,
            distribution: [
                { band: 'low',      label: 'Low',      count: low,      percent: pct(low),      colorToken: 'success' },
                { band: 'medium',   label: 'Medium',   count: medium,   percent: pct(medium),   colorToken: 'accent'  },
                { band: 'high',     label: 'High',     count: high,     percent: pct(high),     colorToken: 'warn'    },
                { band: 'critical', label: 'Critical', count: critical, percent: pct(critical), colorToken: 'danger'  }
            ],
            average: (typeof stats.average === 'number') ? stats.average : 0,
            min: (typeof stats.min === 'number' && isFinite(stats.min)) ? stats.min : 0,
            max: (typeof stats.max === 'number') ? stats.max : 0
        };
    }

    // =========================================================================
    // 7. RISK VIEW MODEL
    // =========================================================================

    function toRiskViewModel(risk, locationName) {
        if (!risk) return null;

        var colorByLevel = {
            low:      'success',
            moderate: 'accent',
            high:     'warn',
            critical: 'danger'
        };
        var labelByLevel = {
            low:      'Low',
            moderate: 'Moderate',
            high:     'High',
            critical: 'Critical'
        };

        return {
            locationName: locationName || 'Unknown',
            score: (typeof risk.score === 'number') ? risk.score : 0,
            scoreLabel: Math.round(risk.score || 0) + '/100',
            level: risk.level || 'low',
            levelLabel: labelByLevel[risk.level] || 'Unknown',
            colorToken: colorByLevel[risk.level] || 'dim',
            history: (typeof risk.history === 'number') ? risk.history : 0,
            totalDeaths: (typeof risk.totalDeaths === 'number') ? risk.totalDeaths : 0,
            mostCommon: risk.mostCommon || null,
            deadliest: risk.deadliest
                ? toDisasterListItem(risk.deadliest, null)
                : null
        };
    }

    // =========================================================================
    // 8. DESTRUCTION STATS VIEW MODEL
    // =========================================================================

    function toDestructionStatsViewModel(stats, locationName) {
        if (!stats) return null;

        var totals = stats.totalDestructions || {};
        var totalItems =
            (totals.features || 0) +
            (totals.schools || 0) +
            (totals.enterprises || 0) +
            (totals.residences || 0) +
            (totals.households || 0);

        var breakdownRows = [
            { category: 'features',    label: 'Features',    count: totals.features    || 0, colorToken: 'accent'      },
            { category: 'schools',     label: 'Schools',     count: totals.schools     || 0, colorToken: 'accent-dim'  },
            { category: 'enterprises', label: 'Enterprises', count: totals.enterprises || 0, colorToken: 'warn'        },
            { category: 'residences',  label: 'Residences',  count: totals.residences  || 0, colorToken: 'danger'      },
            { category: 'households',  label: 'Households',  count: totals.households  || 0, colorToken: 'dim'         }
        ];

        var byTypeRows = [];
        if (stats.byDisasterType) {
            var typeKeys = Object.keys(stats.byDisasterType);
            for (var i = 0; i < typeKeys.length; i++) {
                var t = stats.byDisasterType[typeKeys[i]];
                byTypeRows.push({
                    type: typeKeys[i],
                    iconName: disasterIconName(typeKeys[i]),
                    count: t.count || 0,
                    totalLoss: t.totalLoss || 0,
                    destructions: t.destructions || {}
                });
            }
            byTypeRows.sort(function(a, b) { return b.totalLoss - a.totalLoss; });
        }

        var recentRows = toDestructionRows(stats.recentDestructions);

        return {
            locationName: locationName || 'Global',
            totalDisasters: stats.totalDisasters || 0,
            totalItems: totalItems,
            totalLoss: stats.totalLoss || 0,
            breakdownRows: breakdownRows,
            byTypeRows: byTypeRows,
            recentRows: recentRows,
            worstDisaster: stats.worstDisaster
                ? {
                    id: stats.worstDisaster.id,
                    type: stats.worstDisaster.type,
                    year: stats.worstDisaster.year,
                    yearLabel: formatYear(stats.worstDisaster.year),
                    totalLoss: stats.worstDisaster.totalLoss || 0,
                    featuresDestroyed: stats.worstDisaster.featuresDestroyed || 0,
                    schoolsDestroyed: stats.worstDisaster.schoolsDestroyed || 0,
                    enterprisesDestroyed: stats.worstDisaster.enterprisesDestroyed || 0,
                    residencesDemolished: stats.worstDisaster.residencesDemolished || 0,
                    householdsDestroyed: stats.worstDisaster.householdsDestroyed || 0
                }
                : null
        };
    }

    // =========================================================================
    // 9. CREATE-DISASTER MODAL DEFAULTS
    // =========================================================================

    function toCreateDisasterModalViewModel(options, currentYear) {
        options = options || {};
        return {
            title: options.title || 'Create Disaster',
            defaultLocationId: options.locationId || null,
            defaultDisasterType: options.disasterType || '',
            defaultYear: (typeof options.year === 'number')
                ? options.year
                : (typeof currentYear === 'number' ? currentYear : null),
            applyEffectsDefault: options.applyEffects !== false
        };
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.DisasterViewModels = {
        // Primitive formatters
        formatYear: formatYear,
        formatNumber: formatNumber,
        formatSeverity: formatSeverity,
        formatSeverityBand: formatSeverityBand,
        severityBandColorToken: severityBandColorToken,
        damageCategoryLabel: damageCategoryLabel,
        damageCategoryColorToken: damageCategoryColorToken,

        // Icons (as names — the UI resolves via _getIcon)
        disasterIconName: disasterIconName,

        // Disaster
        toDisasterListItem: toDisasterListItem,
        toDisasterListItems: toDisasterListItems,
        toDisasterDetailsViewModel: toDisasterDetailsViewModel,
        toStructuralDamageViewModel: toStructuralDamageViewModel,

        // Destruction rows
        toDestructionRow: toDestructionRow,
        toDestructionRows: toDestructionRows,

        // Statistics
        toDisasterStatsViewModel: toDisasterStatsViewModel,
        toSeverityStatsViewModel: toSeverityStatsViewModel,
        toRiskViewModel: toRiskViewModel,
        toDestructionStatsViewModel: toDestructionStatsViewModel,

        // Modal defaults
        toCreateDisasterModalViewModel: toCreateDisasterModalViewModel
    };

    window._disasterViewModels = window.DisasterViewModels;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterViewModels;
    }

})();
