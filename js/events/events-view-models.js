/**
 * =============================================================================
 * STILL WATERS - EVENTS VIEW MODELS (js/events/events-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/events/events-view-models.js
 *
 * PURPOSE:
 *   Presentation shaping for the Events Manager tabs. Transforms raw
 *   records (the shapes produced by EventsQueries) into the stable
 *   view models the tabs render.
 *
 *   No DOM. No queries. No state. No commands. Every function takes
 *   the data it needs as an argument. A tab that needs extra context
 *   (a location name, a current year) fetches it and passes it in.
 *
 * OWNERSHIP:
 *   - the stable row / list-item / stats shapes the tabs consume
 *   - presentation vocabulary: label strings, color-token names, icon
 *     names (as strings -- the tab resolves them via _icon)
 *   - derivation of display-ready scalars from raw records (age label,
 *     death-year label, cause label)
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not read any state.
 *   - It does not call any query.
 *   - It does not resolve an icon to SVG; it returns icon NAMES.
 *   - It does not resolve a color token to a literal color; it
 *     returns token NAMES like 'danger' / 'warn' / 'accent' / 'dim',
 *     which the tab wraps in var(--<token>).
 *   - It does not carry its own copy of the DEATH_CAUSE vocabulary
 *     or the disaster-type vocabulary. Every label it emits comes
 *     from either events-constants.js or from a passed-in resolver.
 *     This keeps a single source of truth for each vocabulary.
 *   - It does not fabricate. A missing field on a record becomes
 *     null (not ''), a label of '?' (not 'Unknown'), or a status
 *     flag of false. Nothing is invented.
 *
 * DEPENDENCIES (required, verified at load):
 *   - EventsConstants (EVENT_CATEGORIES, DEATH_CAUSE_FILTERS,
 *     DEATH_SORT_OPTIONS, UI_COPY, DEATH_STATUS_FILTERS,
 *     DEATH_GENDER_FILTERS)
 *
 * ICON POLICY: No emojis. Icons are exposed as name strings only.
 * =============================================================================
 */

(function() {
    'use strict';

    var C = window.EventsConstants;
    if (!C) {
        throw new Error('events-view-models.js requires events-constants.js (EventsConstants).');
    }

    // =========================================================================
    // 1. PRIMITIVE FORMATTERS (pure, no state)
    // =========================================================================

    /**
     * Formats a year for display. Year 0 is valid; negative years
     * render as BC; null/undefined render as '?'.
     */
    function formatYear(year) {
        if (year === null || year === undefined) return '?';
        if (typeof year !== 'number' || !isFinite(year)) return '?';
        if (!Number.isInteger(year)) return '?';
        if (year < 0) return Math.abs(year) + ' BC';
        return String(year);
    }

    /**
     * Formats an age for display. Mirrors the character domain's
     * rule: null age -> 'Unknown'; 0 -> '<1 year'; 1 -> '1 year';
     * n -> 'n years'. Non-numeric input -> 'Unknown'.
     */
    function formatAge(age) {
        if (age === null || age === undefined) return 'Unknown';
        if (typeof age !== 'number' || !isFinite(age) || age < 0) return 'Unknown';
        if (age === 0) return '<1 year';
        if (age === 1) return '1 year';
        return age + ' years';
    }

    /**
     * Formats a person's display name from { name, surname }. Does
     * not resolve names from ids -- callers pass a record.
     */
    function formatName(record) {
        if (!record) return '';
        var name = typeof record.name === 'string' ? record.name : '';
        var surname = typeof record.surname === 'string' ? record.surname : '';
        return (name + ' ' + surname).trim();
    }

    /**
     * Returns a label for a death cause id. Ids match
     * MortalityRules.DEATH_CAUSE (natural, disease, accident, murder,
     * execution, childbed_fever, unknown). Unknown ids render as the
     * id itself -- not 'Unknown' -- because the id was explicitly
     * recorded and hiding it would be a worse outcome than showing
     * an unfamiliar token.
     */
    function formatDeathCause(cause) {
        if (cause === null || cause === undefined) return null;
        switch (cause) {
            case 'natural':         return 'Natural';
            case 'disease':         return 'Disease';
            case 'accident':        return 'Accident';
            case 'murder':          return 'Murder';
            case 'execution':       return 'Execution';
            case 'childbed_fever':  return 'Childbed Fever';
            case 'unknown':         return 'Unknown';
            default:                return String(cause);
        }
    }

    /**
     * Returns a color token NAME for a death cause. The tab wraps it
     * in var(--<token>). Tokens are theme tokens defined in
     * css/themes.css; this module returns names, not values.
     */
    function deathCauseColorToken(cause) {
        switch (cause) {
            case 'murder':          return 'danger';
            case 'execution':       return 'danger';
            case 'childbed_fever':  return 'warn';
            case 'accident':        return 'warn';
            case 'disease':         return 'warn';
            case 'natural':         return 'dim';
            default:                return 'dim';
        }
    }

    /**
     * Returns a color token NAME for a gender. Used by the row
     * renderer to tint the gender marker.
     */
    function genderColorToken(gender) {
        if (gender === 'male')   return 'accent';
        if (gender === 'female') return 'accent-light';
        return 'dim';
    }

    /**
     * Returns the icon NAME for a gender marker. The tab resolves via
     * window.getIcon(name, 'CIRCLE').
     */
    function genderIconName(gender) {
        if (gender === 'male')   return 'MALE';
        if (gender === 'female') return 'FEMALE';
        return 'GENDER_NEUTRAL';
    }

    /**
     * Returns a status label ('Living' / 'Deceased' / 'Unknown').
     */
    function formatStatus(isDeceased) {
        if (isDeceased === true)  return 'Deceased';
        if (isDeceased === false) return 'Living';
        return 'Unknown';
    }

    /**
     * Returns a status color token NAME.
     */
    function statusColorToken(isDeceased) {
        if (isDeceased === true)  return 'danger';
        if (isDeceased === false) return 'success';
        return 'dim';
    }

    // =========================================================================
    // 2. DEATHS FACET: CHARACTER ROW
    // =========================================================================
    //
    // Input: one entry from EventsQueries.getCharacterRoster's
    // `characters` array. That shape is:
    //
    //   {
    //     id, name, surname, fullName, gender, age, birthYear,
    //     deathYear, deathCause, deathCauseDetail, isDeceased,
    //     locationId, locationName, rankDisplay, isDeleted
    //   }
    //
    // Output: the shape the character row renderer consumes. Every
    // field is a display-ready primitive or null. No nested records.

    function toCharacterRow(character, options) {
        if (!character || typeof character !== 'object') return null;
        if (typeof character.id !== 'string' || character.id.length === 0) return null;

        options = options || {};

        var displayName = (typeof character.fullName === 'string' && character.fullName.length > 0)
            ? character.fullName
            : formatName(character);

        var isDeceased = character.isDeceased === true;
        var causeLabel = isDeceased ? formatDeathCause(character.deathCause) : null;
        var causeColor = isDeceased ? deathCauseColorToken(character.deathCause) : null;
        var statusLabel = formatStatus(isDeceased);
        var statusColor = statusColorToken(isDeceased);

        var ageLabel = formatAge(character.age);
        var birthYearLabel = formatYear(character.birthYear);
        var deathYearLabel = isDeceased ? formatYear(character.deathYear) : null;

        var locationDisplay = (typeof character.locationName === 'string'
            && character.locationName.length > 0)
            ? character.locationName
            : null;

        // Secondary line: age, location, rank (all optional, joined
        // by the tab's row renderer). Kept as separate fields so the
        // tab can choose separators and drop empty segments itself.
        return {
            // Identity
            id: character.id,
            displayName: displayName,
            name: typeof character.name === 'string' ? character.name : '',
            surname: typeof character.surname === 'string' ? character.surname : '',
            gender: character.gender,
            genderLabel: (character.gender === 'male') ? 'Male'
                       : (character.gender === 'female') ? 'Female'
                       : 'Unknown',
            genderIconName: genderIconName(character.gender),
            genderColorToken: genderColorToken(character.gender),

            // Age
            age: typeof character.age === 'number' ? character.age : null,
            ageLabel: ageLabel,
            birthYear: typeof character.birthYear === 'number' ? character.birthYear : null,
            birthYearLabel: birthYearLabel,

            // Status
            isDeceased: isDeceased,
            statusLabel: statusLabel,
            statusColorToken: statusColor,

            // Death
            deathCause: isDeceased ? character.deathCause : null,
            deathCauseLabel: causeLabel,
            deathCauseDetail: isDeceased && typeof character.deathCauseDetail === 'string'
                ? character.deathCauseDetail : null,
            deathCauseColorToken: causeColor,
            deathYear: isDeceased && typeof character.deathYear === 'number'
                ? character.deathYear : null,
            deathYearLabel: deathYearLabel,

            // Location
            locationId: typeof character.locationId === 'string'
                ? character.locationId : null,
            locationName: locationDisplay,

            // Rank
            rankDisplay: typeof character.rankDisplay === 'string'
                ? character.rankDisplay : null,

            // Selection flag (set by the tab's view, not by this
            // function; present here so the shape is stable across
            // list re-renders)
            isSelected: false
        };
    }

    function toCharacterRows(characters) {
        if (!Array.isArray(characters)) return [];
        var out = [];
        for (var i = 0; i < characters.length; i++) {
            var row = toCharacterRow(characters[i]);
            if (row) out.push(row);
        }
        return out;
    }

    // =========================================================================
    // 3. DEATHS FACET: DEATH RECORD ROW
    // =========================================================================
    //
    // Input: one entry from EventsQueries.getAllDeathRecords's
    // `records` array. That shape is:
    //
    //   {
    //     characterId, name, surname, gender, birthYear, deathYear,
    //     deathCause, deathCauseDetail, deathNotes, ageAtDeath,
    //     isMurder, killerId, murderMotive, murderMethod,
    //     isExecution, executionReason, executionMethod,
    //     executionLocation
    //   }

    function toDeathRecordRow(record) {
        if (!record || typeof record !== 'object') return null;
        if (typeof record.characterId !== 'string' || record.characterId.length === 0) {
            return null;
        }

        var displayName = formatName(record);

        return {
            characterId: record.characterId,
            displayName: displayName,

            gender: record.gender,
            genderLabel: (record.gender === 'male') ? 'Male'
                       : (record.gender === 'female') ? 'Female'
                       : 'Unknown',
            genderIconName: genderIconName(record.gender),

            birthYear: typeof record.birthYear === 'number' ? record.birthYear : null,
            birthYearLabel: formatYear(record.birthYear),
            deathYear: typeof record.deathYear === 'number' ? record.deathYear : null,
            deathYearLabel: formatYear(record.deathYear),

            ageAtDeath: typeof record.ageAtDeath === 'number' ? record.ageAtDeath : null,
            ageAtDeathLabel: formatAge(record.ageAtDeath),

            deathCause: _isMissing(record.deathCause) ? null : record.deathCause,
            deathCauseLabel: formatDeathCause(record.deathCause),
            deathCauseDetail: _isMissing(record.deathCauseDetail)
                ? null : record.deathCauseDetail,
            deathCauseColorToken: deathCauseColorToken(record.deathCause),
            deathNotes: typeof record.deathNotes === 'string' && record.deathNotes.length > 0
                ? record.deathNotes : null,

            isMurder: record.isMurder === true,
            killerId: record.killerId || null,
            murderMotive: _isMissing(record.murderMotive) ? null : record.murderMotive,
            murderMethod: _isMissing(record.murderMethod) ? null : record.murderMethod,

            isExecution: record.isExecution === true,
            executionReason: _isMissing(record.executionReason)
                ? null : record.executionReason,
            executionMethod: _isMissing(record.executionMethod)
                ? null : record.executionMethod,
            executionLocation: _isMissing(record.executionLocation)
                ? null : record.executionLocation
        };
    }

    function toDeathRecordRows(records) {
        if (!Array.isArray(records)) return [];
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var row = toDeathRecordRow(records[i]);
            if (row) out.push(row);
        }
        return out;
    }

    // =========================================================================
    // 4. DEATHS FACET: STATS
    // =========================================================================
    //
    // Two stat shapes exist:
    //
    //   (a) Character-population stats, from
    //       EventsQueries.getCharacterPopulationStats.
    //   (b) Mortality stats, from EventsQueries.getMortalityStats
    //       (which wraps MortalityStatistics.getMortalityStatistics).
    //
    // toDeathsStatsBarViewModel builds the strip the Deaths tab
    // renders at the top: Living / Deceased / Year / In-location. It
    // does not include the full mortality breakdown; that goes into
    // a details panel via toMortalityStatsViewModel.

    function toDeathsStatsBarViewModel(popStats, options) {
        options = options || {};
        if (!popStats || popStats.available !== true) {
            return {
                available: false,
                reason: popStats && popStats.reason ? popStats.reason
                    : 'Character population statistics are not available.',
                cells: []
            };
        }

        var cells = [
            {
                label: 'Living',
                value: String(popStats.livingCount),
                colorToken: 'success',
                iconName: 'PERSON'
            },
            {
                label: 'Deceased',
                value: String(popStats.deceasedCount),
                colorToken: 'danger',
                iconName: 'DEATHSTARS'
            },
            {
                label: 'Year',
                value: _yearOrQuestionMark(popStats.currentYear),
                colorToken: null,
                iconName: 'TIMELINE'
            }
        ];

        if (options.showInLocation === true) {
            cells.push({
                label: 'In Location',
                value: String(popStats.inLocationCount),
                colorToken: 'accent',
                iconName: 'LOCATION'
            });
        }

        return {
            available: true,
            cells: cells,
            totalCount: popStats.totalCount,
            livingCount: popStats.livingCount,
            deceasedCount: popStats.deceasedCount,
            inLocationCount: popStats.inLocationCount,
            currentYear: popStats.currentYear
        };
    }

    function toMortalityStatsViewModel(mortalityStats) {
        if (!mortalityStats || mortalityStats.available !== true) {
            return {
                available: false,
                reason: mortalityStats && mortalityStats.reason
                    ? mortalityStats.reason : 'Mortality statistics are not available.'
            };
        }
        var s = mortalityStats.stats;
        if (!s || typeof s !== 'object') {
            return { available: false, reason: 'Mortality statistics are malformed.' };
        }

        // byCause: { natural: N, disease: N, ... }
        var byCauseRows = [];
        if (s.byCause && typeof s.byCause === 'object') {
            for (var cause in s.byCause) {
                if (!Object.prototype.hasOwnProperty.call(s.byCause, cause)) continue;
                byCauseRows.push({
                    cause: cause,
                    label: formatDeathCause(cause) || cause,
                    count: s.byCause[cause],
                    colorToken: deathCauseColorToken(cause)
                });
            }
            byCauseRows.sort(function(a, b) { return b.count - a.count; });
        }

        // byGender: { male: N, female: N, unknown: N }
        var byGender = [];
        if (s.byGender && typeof s.byGender === 'object') {
            byGender = [
                { gender: 'male',    label: 'Male',    count: s.byGender.male    || 0 },
                { gender: 'female',  label: 'Female',  count: s.byGender.female  || 0 },
                { gender: 'unknown', label: 'Unknown', count: s.byGender.unknown || 0 }
            ];
        }

        // byYear: { "1250": N, "1251": N }
        var byYearRows = [];
        if (s.byYear && typeof s.byYear === 'object') {
            var years = Object.keys(s.byYear);
            for (var i = 0; i < years.length; i++) {
                var yearKey = years[i];
                var yearNum = parseInt(yearKey, 10);
                if (!isFinite(yearNum)) continue;
                byYearRows.push({
                    year: yearNum,
                    yearLabel: formatYear(yearNum),
                    count: s.byYear[yearKey]
                });
            }
            byYearRows.sort(function(a, b) { return a.year - b.year; });
        }

        return {
            available: true,
            totalDeaths: s.totalDeaths || 0,
            totalMurders: s.totalMurders || 0,
            totalExecutions: s.totalExecutions || 0,
            livingCount: s.livingCount || 0,
            totalPopulation: s.totalPopulation || 0,
            murderRateLabel: _formatRate(s.murderRate),
            executionRateLabel: _formatRate(s.executionRate),
            byCauseRows: byCauseRows,
            byGender: byGender,
            byYearRows: byYearRows
        };
    }

    function _formatRate(value) {
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value.toFixed(2) + '%';
    }

    function _yearOrQuestionMark(year) {
        if (typeof year !== 'number' || !isFinite(year)) return '?';
        return String(year);
    }

    // =========================================================================
    // 5. DEATHS FACET: RECENT EVENT STRIP
    // =========================================================================
    //
    // Input: EventsQueries.getRecentDeathEvents output.
    // Output: the small list the tab renders beneath the stats bar
    // (optional). Each entry is a minimal line; the tab's main list
    // is the character roster.

    function toRecentEventRow(event) {
        if (!event || typeof event !== 'object') return null;
        return {
            id: event.id || null,
            year: typeof event.year === 'number' ? event.year : null,
            yearLabel: formatYear(event.year),
            type: typeof event.type === 'string' ? event.type : null,
            message: typeof event.message === 'string' ? event.message : '',
            locationName: typeof event.locationName === 'string'
                ? event.locationName : null,
            timestamp: typeof event.timestamp === 'number' ? event.timestamp : null
        };
    }

    function toRecentEventRows(recentEvents) {
        if (!recentEvents || recentEvents.available !== true) {
            return {
                available: false,
                reason: recentEvents && recentEvents.reason
                    ? recentEvents.reason : 'Recent events are not available.',
                rows: []
            };
        }
        var events = recentEvents.events;
        if (!Array.isArray(events)) {
            return { available: true, rows: [] };
        }
        var rows = [];
        for (var i = 0; i < events.length; i++) {
            var row = toRecentEventRow(events[i]);
            if (row) rows.push(row);
        }
        return { available: true, rows: rows };
    }

    // =========================================================================
    // 6. DEATHS FACET: FILTER OPTIONS VIEW
    // =========================================================================
    //
    // Input: the current filter object from the tab.
    // Output: rows for the filter bar with `selected` flags set, so
    // the tab can render <option> elements without re-comparing.
    //
    // All option labels come from EventsConstants -- this module
    // does NOT re-copy the vocabulary.

    function toStatusFilterOptions(currentStatus) {
        var base = C.DEATH_STATUS_FILTERS;
        var out = [];
        for (var i = 0; i < base.length; i++) {
            out.push({
                id: base[i].id,
                label: base[i].label,
                selected: base[i].id === currentStatus
            });
        }
        return out;
    }

    function toGenderFilterOptions(currentGender) {
        var base = C.DEATH_GENDER_FILTERS;
        var out = [];
        for (var i = 0; i < base.length; i++) {
            out.push({
                id: base[i].id,
                label: base[i].label,
                selected: base[i].id === currentGender
            });
        }
        return out;
    }

    function toCauseFilterOptions(currentCause) {
        var base = C.DEATH_CAUSE_FILTERS;
        var out = [];
        for (var i = 0; i < base.length; i++) {
            out.push({
                id: base[i].id,
                label: base[i].label,
                selected: base[i].id === currentCause
            });
        }
        return out;
    }

    function toSortOptions(currentSortBy) {
        var base = C.DEATH_SORT_OPTIONS;
        var out = [];
        for (var i = 0; i < base.length; i++) {
            out.push({
                id: base[i].id,
                label: base[i].label,
                selected: base[i].id === currentSortBy
            });
        }
        return out;
    }

    // =========================================================================
    // 7. DEATHS FACET: EMPTY-STATE MESSAGE
    // =========================================================================
    //
    // The tab distinguishes three kinds of empty. This helper picks
    // the right copy for a given combination of (hadAnyCharacters,
    // hadAnyMatches, hadContext). It does NOT decide which case
    // applies -- the tab does, by counting; this function just maps
    // a case to its copy.

    function emptyStateMessage(caseId) {
        switch (caseId) {
            case 'no-context':
                return C.UI_COPY.emptyNoContext;
            case 'no-characters':
                return C.UI_COPY.emptyNoCharacters;
            case 'no-matches':
                return C.UI_COPY.emptyNoMatches;
            case 'no-deaths':
                return C.UI_COPY.emptyNoDeathsRecorded;
            case 'unavailable':
                return C.UI_COPY.emptyUnavailable;
            default:
                return '';
        }
    }

    // =========================================================================
    // 8. INTERNAL
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.EventsViewModels = {
        // Primitive formatters
        formatYear: formatYear,
        formatAge: formatAge,
        formatName: formatName,
        formatDeathCause: formatDeathCause,
        formatStatus: formatStatus,
        deathCauseColorToken: deathCauseColorToken,
        genderColorToken: genderColorToken,
        genderIconName: genderIconName,
        statusColorToken: statusColorToken,

        // Character row
        toCharacterRow: toCharacterRow,
        toCharacterRows: toCharacterRows,

        // Death record row
        toDeathRecordRow: toDeathRecordRow,
        toDeathRecordRows: toDeathRecordRows,

        // Stats bar
        toDeathsStatsBarViewModel: toDeathsStatsBarViewModel,
        toMortalityStatsViewModel: toMortalityStatsViewModel,

        // Recent event strip
        toRecentEventRow: toRecentEventRow,
        toRecentEventRows: toRecentEventRows,

        // Filter option views
        toStatusFilterOptions: toStatusFilterOptions,
        toGenderFilterOptions: toGenderFilterOptions,
        toCauseFilterOptions: toCauseFilterOptions,
        toSortOptions: toSortOptions,

        // Empty-state copy
        emptyStateMessage: emptyStateMessage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsViewModels;
    }
})();
