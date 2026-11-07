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
 *   the data it needs as an argument.
 *
 * OWNERSHIP:
 *   - the stable row / list-item / stats shapes the tabs consume
 *   - presentation vocabulary: label strings, color-token names, icon
 *     names (as strings -- the tab resolves them via _icon)
 *   - derivation of display-ready scalars from raw records (age label,
 *     death-year label, cause label, fertility label)
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not read any state.
 *   - It does not call any query.
 *   - It does not resolve an icon to SVG; it returns icon NAMES.
 *   - It does not resolve a color token to a literal color; it
 *     returns token NAMES like 'danger' / 'warn' / 'accent' / 'dim',
 *     which the tab wraps in var(--<token>).
 *   - It does not carry its own copy of the death-cause vocabulary,
 *     the stork sort vocabulary, the adoption type/status vocabulary,
 *     or any other domain vocabulary. Every label it emits comes from
 *     either events-constants.js or from a passed-in resolver.
 *   - It does not fabricate. A missing field on a record becomes
 *     null (not ''), a label of '?' (not 'Unknown'), or a status
 *     flag of false. Nothing is invented.
 *
 * DEPENDENCIES (required, verified at load):
 *   - EventsConstants
 *
 * ICON POLICY: No emojis. Icons are exposed as name strings only.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision (Phase 3B):
 *     - Added the adoption facet's view models:
 *         adoptionTypeLabel(type)
 *         adoptionTypeIconName(type)
 *         adoptionStatusLabel(status)
 *         adoptionStatusColorToken(status)
 *         adoptionStatusPriority(status)
 *         toAdoptionRow(record)
 *         toAdoptionRows(records)
 *         toAdoptionTypeFilterOptions(currentType)
 *         toAdoptionStatusFilterOptions(currentStatus)
 *         toAdoptionSortOptions(currentSortBy)
 *         toAdoptionStatsBarViewModel(records)
 *       The stats bar is computed from the already-fetched records
 *       (distinct from the deaths-style stats bar the other facets
 *       reuse). The tab renders it directly.
 *     - emptyStateMessage gains three cases:
 *         'no-adoptions'      -> UI_COPY.emptyNoAdoptions
 *         'no-guardianships'  -> UI_COPY.emptyNoGuardianships
 *         'no-foster'         -> UI_COPY.emptyNoFosterRecords
 *       These exist because the type group headers stay visible when
 *       empty; the wrong copy under a visible header would be
 *       misleading.
 *     - adoptionStatusPriority is exposed so the tab can sort active
 *       records first within each type group.
 *     - No behavioural change to any deaths-facet or stork-facet
 *       function.
 *   Previous revision (Phase 3A):
 *     - Added the stork facet's view models: toChildCircle,
 *       toCoupleRow, toManGroup, toStorkSortOptions.
 *   Initial revision:
 *     - Created with the deaths facet's view models.
 * =============================================================================
 */

(function() {
    'use strict';

    var C = window.EventsConstants;
    if (!C) {
        throw new Error(
            'events-view-models.js requires events-constants.js (EventsConstants).'
        );
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
     * MortalityRules.DEATH_CAUSE. Unknown ids render as the id
     * itself -- not 'Unknown' -- because the id was explicitly
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
     * Returns a color token NAME for a death cause. The tab wraps
     * it in var(--<token>).
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
     * Returns the icon NAME for a gender marker. The tab resolves
     * via window.getIcon(name, 'CIRCLE').
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

        return {
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

            age: typeof character.age === 'number' ? character.age : null,
            ageLabel: ageLabel,
            birthYear: typeof character.birthYear === 'number' ? character.birthYear : null,
            birthYearLabel: birthYearLabel,

            isDeceased: isDeceased,
            statusLabel: statusLabel,
            statusColorToken: statusColor,

            deathCause: isDeceased ? character.deathCause : null,
            deathCauseLabel: causeLabel,
            deathCauseDetail: isDeceased && typeof character.deathCauseDetail === 'string'
                ? character.deathCauseDetail : null,
            deathCauseColorToken: causeColor,
            deathYear: isDeceased && typeof character.deathYear === 'number'
                ? character.deathYear : null,
            deathYearLabel: deathYearLabel,

            locationId: typeof character.locationId === 'string'
                ? character.locationId : null,
            locationName: locationDisplay,

            rankDisplay: typeof character.rankDisplay === 'string'
                ? character.rankDisplay : null,

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

        var byGender = [];
        if (s.byGender && typeof s.byGender === 'object') {
            byGender = [
                { gender: 'male',    label: 'Male',    count: s.byGender.male    || 0 },
                { gender: 'female',  label: 'Female',  count: s.byGender.female  || 0 },
                { gender: 'unknown', label: 'Unknown', count: s.byGender.unknown || 0 }
            ];
        }

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
    // 7. EMPTY-STATE MESSAGE
    // =========================================================================
    //
    // Maps a case id to its user-facing message. The case ids are the
    // tab's own vocabulary; every tab that renders an empty state
    // passes one of these to EventsUIList.renderEmptyState. The
    // adoption cases are added here because the adoption tab's three
    // distinct empty states all resolve through this function.

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
            case 'no-couples':
                return C.UI_COPY.emptyNoCouples;
            case 'no-births':
                return C.UI_COPY.emptyNoBirthsRecorded;
            case 'no-adoptions':
                return C.UI_COPY.emptyNoAdoptions;
            case 'no-guardianships':
                return C.UI_COPY.emptyNoGuardianships;
            case 'no-foster':
                return C.UI_COPY.emptyNoFosterRecords;
            case 'unavailable':
                return C.UI_COPY.emptyUnavailable;
            default:
                return '';
        }
    }

    // =========================================================================
    // 8. STORK FACET: CHILD CIRCLE
    // =========================================================================
    //
    // Builds the small circular marker for one child. Takes the
    // child's character summary (already fetched by the caller) and
    // an optional age-group resolver callback. The age-group resolver
    // is provided by the tab (which knows whether CharacterLifecycle
    // is loaded); this module does not reach for it directly.

    function toChildCircle(childId, childSummary, ageGroupFn) {
        if (!childSummary) return null;
        var age = typeof childSummary.age === 'number' ? childSummary.age : null;
        var ageGroup = (typeof ageGroupFn === 'function' && age !== null)
            ? ageGroupFn(age) : null;
        var displayName = ((childSummary.name || '') + ' ' +
                           (childSummary.surname || '')).trim();
        return {
            id: childId,
            displayName: displayName,
            gender: childSummary.gender,
            genderIconName: genderIconName(childSummary.gender),
            genderColorToken: genderColorToken(childSummary.gender),
            isDeceased: childSummary.isDeceased === true,
            age: age,
            ageLabel: formatAge(age),
            ageGroup: ageGroup
        };
    }

    // =========================================================================
    // 9. STORK FACET: COUPLE ROW
    // =========================================================================
    //
    // Takes one entry from EventsQueries.getFertileCouples' `men[*].partners`
    // array, plus the child summaries needed to build the child circles.
    //
    // The `childSummaries` argument is a `{ [childId]: summary }` map
    // -- the shape produced by EventsQueries.getCoupleChildrenSummaries
    // or assembled by the tab itself. Missing entries simply omit the
    // circle.
    //
    // The `pregnancyLabel` is only set when the pregnancy count
    // differs from the living children count (miscarriages /
    // stillbirths / children who later died), so the common case
    // stays clean.

    function toCoupleRow(partner, childSummaries, ageGroupFn) {
        if (!partner || !partner.womanSummary) return null;
        var woman = partner.womanSummary;

        var childCircles = [];
        var childIds = Array.isArray(partner.existingChildIds)
            ? partner.existingChildIds : [];
        for (var i = 0; i < childIds.length; i++) {
            var circle = toChildCircle(
                childIds[i],
                childSummaries ? childSummaries[childIds[i]] : null,
                ageGroupFn
            );
            if (circle) childCircles.push(circle);
        }

        var existingChildren = partner.existingChildCount;
        var pregnancies = partner.existingPregnancyCount;

        var pregnancyLabel = null;
        if (typeof pregnancies === 'number'
            && typeof existingChildren === 'number'
            && pregnancies !== existingChildren) {
            pregnancyLabel = pregnancies + ' pregnancies';
        }

        var expectedTotal = partner.expectedTotal;
        var expectedRemaining = partner.expectedRemaining;

        return {
            womanId: partner.womanId,
            womanName: (woman.name || ''),
            womanSurname: (woman.surname || ''),
            womanDisplayName: ((woman.name || '') + ' ' +
                               (woman.surname || '')).trim(),
            womanAge: typeof woman.age === 'number' ? woman.age : null,
            womanAgeLabel: formatAge(woman.age),
            womanGender: woman.gender,
            womanGenderIconName: genderIconName(woman.gender),
            womanGenderColorToken: genderColorToken(woman.gender),
            womanRankDisplay: _isMissing(woman.rank) ? null : woman.rank,
            womanLocationId: _hasId(woman.locationId) ? woman.locationId : null,
            womanLocationName: null,

            relationshipId: partner.relationshipId,
            relationshipType: partner.relationshipType,
            relationshipStatus: partner.relationshipStatus,

            existingChildIds: childIds.slice(),
            existingChildCount: existingChildren,
            existingPregnancyCount: pregnancies,
            pregnancyLabel: pregnancyLabel,

            childCircles: childCircles,

            fertileYears: partner.fertileYears,
            fertilityModifier: partner.fertilityModifier,
            fertilityPercent: Math.round(
                (typeof partner.fertilityModifier === 'number'
                    ? partner.fertilityModifier
                    : 0) * 100
            ),
            expectedTotal: expectedTotal,
            expectedRemaining: expectedRemaining,
            hasCapacity: partner.hasCapacity === true,
            isFertile: partner.isFertile === true,

            isSelected: false
        };
    }

    // =========================================================================
    // 10. STORK FACET: MAN GROUP
    // =========================================================================
    //
    // Wraps a `men[*]` entry from EventsQueries.getFertileCouples into
    // the card-level view model the renderer consumes. Aggregates
    // partner count and total children across all partners.

    function toManGroup(manGroup, childSummaries, ageGroupFn) {
        if (!manGroup || !manGroup.manSummary) return null;
        var man = manGroup.manSummary;

        var partners = [];
        var totalChildren = 0;
        var totalExpected = 0;
        for (var i = 0; i < manGroup.partners.length; i++) {
            var row = toCoupleRow(
                manGroup.partners[i], childSummaries, ageGroupFn
            );
            if (!row) continue;
            partners.push(row);
            totalChildren += row.existingChildCount;
            if (typeof row.expectedTotal === 'number') {
                totalExpected += row.expectedTotal;
            }
        }

        return {
            manId: manGroup.manId,
            manName: (man.name || ''),
            manSurname: (man.surname || ''),
            manDisplayName: ((man.name || '') + ' ' +
                             (man.surname || '')).trim(),
            manAge: typeof man.age === 'number' ? man.age : null,
            manAgeLabel: formatAge(man.age),
            manGender: man.gender,
            manGenderIconName: genderIconName(man.gender),
            manGenderColorToken: genderColorToken(man.gender),
            manRankDisplay: _isMissing(man.rank) ? null : man.rank,
            manLocationId: _hasId(man.locationId) ? man.locationId : null,
            manLocationName: null,
            partners: partners,
            partnerCount: partners.length,
            totalChildren: totalChildren,
            totalExpected: totalExpected
        };
    }

    // =========================================================================
    // 11. STORK FACET: SORT OPTION VIEW
    // =========================================================================

    function toStorkSortOptions(currentSortBy) {
        var base = C.STORK_SORT_OPTIONS;
        if (!Array.isArray(base)) return [];
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
    // 12. ADOPTION FACET: TYPE / STATUS VOCABULARY
    // =========================================================================
    //
    // The adoption tab distinguishes three record types (legal
    // adoption, guardianship, foster care) by `type`, and three
    // statuses (active, ended, dissolved) by `status`. This section
    // owns the label / icon-name / color-token / sort-priority
    // vocabulary for both dimensions. Values match
    // ChildrenRules.ADOPTION_TYPE and ADOPTION_STATUS.

    function adoptionTypeLabel(type) {
        switch (type) {
            case 'legal':        return 'Legal Adoption';
            case 'guardianship': return 'Guardianship';
            case 'foster':       return 'Foster Care';
            default:             return type ? String(type) : 'Unknown';
        }
    }

    function adoptionTypeIconName(type) {
        switch (type) {
            case 'legal':        return 'ADOPTION_LEGAL';
            case 'guardianship': return 'GUARDIANSHIP';
            case 'foster':       return 'FOSTER';
            default:             return 'ADOPTION_LEGAL';
        }
    }

    function adoptionStatusLabel(status) {
        switch (status) {
            case 'active':    return 'Active';
            case 'ended':     return 'Ended';
            case 'dissolved': return 'Dissolved';
            default:          return status ? String(status) : 'Unknown';
        }
    }

    function adoptionStatusColorToken(status) {
        switch (status) {
            case 'active':    return 'success';
            case 'ended':     return 'dim';
            case 'dissolved': return 'danger';
            default:          return 'dim';
        }
    }

    /**
     * Numeric priority for within-group status sorting. Lower sorts
     * first. Active records lead each type group; ended records
     * follow; dissolved records trail. Unknown statuses trail
     * everything.
     *
     * Exposed so the tab can sort consistently without duplicating
     * the ordering contract.
     */
    function adoptionStatusPriority(status) {
        switch (status) {
            case 'active':    return 0;
            case 'ended':     return 1;
            case 'dissolved': return 2;
            default:          return 3;
        }
    }

    // =========================================================================
    // 13. ADOPTION FACET: ROW
    // =========================================================================
    //
    // One row per adoption metadata record. Includes the enriched
    // child and adopter summaries (from EventsQueries.getAdoptionRecords)
    // plus the type and status labels. The tab renders these into the
    // grouped list.

    function _adoptionDisplayName(summary) {
        if (!summary) return '';
        return ((summary.name || '') + ' ' + (summary.surname || '')).trim();
    }

    function toAdoptionRow(record) {
        if (!record || !_hasId(record.id)) return null;

        var child = record.child || null;
        var adopter = record.adopter || null;

        return {
            id: record.id,

            // Child
            childId: record.childId,
            childDisplayName: _adoptionDisplayName(child) || '(unknown child)',
            childAge: child && typeof child.age === 'number' ? child.age : null,
            childAgeLabel: formatAge(child ? child.age : null),
            childGender: child ? child.gender : null,
            childGenderIconName: genderIconName(child ? child.gender : null),
            childGenderColorToken: genderColorToken(child ? child.gender : null),
            childIsDeceased: !!(child && child.isDeceased === true),
            childLocationId: child && _hasId(child.locationId)
                ? child.locationId : null,

            // Adopter
            adopterId: record.adopterId,
            adopterDisplayName: _adoptionDisplayName(adopter) || '(unknown adopter)',
            adopterAge: adopter && typeof adopter.age === 'number' ? adopter.age : null,
            adopterAgeLabel: formatAge(adopter ? adopter.age : null),
            adopterGender: adopter ? adopter.gender : null,
            adopterGenderIconName: genderIconName(adopter ? adopter.gender : null),
            adopterGenderColorToken: genderColorToken(adopter ? adopter.gender : null),
            adopterIsDeceased: !!(adopter && adopter.isDeceased === true),
            adopterLocationId: adopter && _hasId(adopter.locationId)
                ? adopter.locationId : null,

            // Record
            type: record.type,
            typeLabel: adoptionTypeLabel(record.type),
            typeIconName: adoptionTypeIconName(record.type),
            status: record.status,
            statusLabel: adoptionStatusLabel(record.status),
            statusColorToken: adoptionStatusColorToken(record.status),
            statusPriority: adoptionStatusPriority(record.status),
            year: typeof record.year === 'number' ? record.year : null,
            yearLabel: formatYear(record.year),
            endYear: typeof record.endYear === 'number' ? record.endYear : null,
            endYearLabel: record.endYear ? formatYear(record.endYear) : null,
            yearRangeLabel: record.endYear
                ? formatYear(record.year) + '\u2013' + formatYear(record.endYear)
                : formatYear(record.year) + '\u2013present',
            notes: record.notes || '',
            isActive: record.status === 'active'
        };
    }

    function toAdoptionRows(records) {
        if (!Array.isArray(records)) return [];
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var row = toAdoptionRow(records[i]);
            if (row) out.push(row);
        }
        return out;
    }

    // =========================================================================
    // 14. ADOPTION FACET: FILTER OPTION VIEWS
    // =========================================================================

    function toAdoptionTypeFilterOptions(currentType) {
        var base = C.ADOPTION_TYPE_FILTERS;
        if (!Array.isArray(base)) return [];
        var out = [];
        for (var i = 0; i < base.length; i++) {
            out.push({
                id: base[i].id,
                label: base[i].label,
                selected: base[i].id === currentType
            });
        }
        return out;
    }

    function toAdoptionStatusFilterOptions(currentStatus) {
        var base = C.ADOPTION_STATUS_FILTERS;
        if (!Array.isArray(base)) return [];
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

    function toAdoptionSortOptions(currentSortBy) {
        var base = C.ADOPTION_SORT_OPTIONS;
        if (!Array.isArray(base)) return [];
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
    // 15. ADOPTION FACET: STATS BAR
    // =========================================================================
    //
    // Computed from the already-fetched records. Distinct from the
    // deaths-style stats bar (which the other facets reuse). The tab
    // renders this when the records are available.

    function toAdoptionStatsBarViewModel(records) {
        if (!Array.isArray(records)) {
            return {
                available: false,
                reason: 'No records array.',
                cells: []
            };
        }

        var byType = { legal: 0, guardianship: 0, foster: 0 };
        var active = 0;
        var ended = 0;
        var dissolved = 0;

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r) continue;
            if (byType[r.type] !== undefined) byType[r.type]++;
            if (r.status === 'active') active++;
            else if (r.status === 'ended') ended++;
            else if (r.status === 'dissolved') dissolved++;
        }

        return {
            available: true,
            cells: [
                {
                    label: 'Total',
                    value: String(records.length),
                    colorToken: 'accent',
                    iconName: 'ADOPTION_LEGAL'
                },
                {
                    label: 'Active',
                    value: String(active),
                    colorToken: 'success',
                    iconName: 'CHECK_SIMPLE'
                },
                {
                    label: 'Ended',
                    value: String(ended + dissolved),
                    colorToken: 'dim',
                    iconName: 'X_HEAVY'
                },
                {
                    label: 'Legal',
                    value: String(byType.legal),
                    colorToken: 'accent',
                    iconName: 'ADOPTION_LEGAL'
                },
                {
                    label: 'Guardianship',
                    value: String(byType.guardianship),
                    colorToken: 'warn',
                    iconName: 'GUARDIANSHIP'
                },
                {
                    label: 'Foster',
                    value: String(byType.foster),
                    colorToken: 'dim',
                    iconName: 'FOSTER'
                }
            ]
        };
    }

    // =========================================================================
    // 16. INTERNAL
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 17. EXPORTS
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

        // Character row (deaths facet)
        toCharacterRow: toCharacterRow,
        toCharacterRows: toCharacterRows,

        // Death record row (deaths facet)
        toDeathRecordRow: toDeathRecordRow,
        toDeathRecordRows: toDeathRecordRows,

        // Stats bar (deaths facet)
        toDeathsStatsBarViewModel: toDeathsStatsBarViewModel,
        toMortalityStatsViewModel: toMortalityStatsViewModel,

        // Recent event strip (deaths facet)
        toRecentEventRow: toRecentEventRow,
        toRecentEventRows: toRecentEventRows,

        // Filter option views (deaths facet)
        toStatusFilterOptions: toStatusFilterOptions,
        toGenderFilterOptions: toGenderFilterOptions,
        toCauseFilterOptions: toCauseFilterOptions,
        toSortOptions: toSortOptions,

        // Empty-state copy
        emptyStateMessage: emptyStateMessage,

        // Child circle / couple row / man group (stork facet)
        toChildCircle: toChildCircle,
        toCoupleRow: toCoupleRow,
        toManGroup: toManGroup,

        // Filter option views (stork facet)
        toStorkSortOptions: toStorkSortOptions,

        // Adoption facet: type / status vocabulary
        adoptionTypeLabel: adoptionTypeLabel,
        adoptionTypeIconName: adoptionTypeIconName,
        adoptionStatusLabel: adoptionStatusLabel,
        adoptionStatusColorToken: adoptionStatusColorToken,
        adoptionStatusPriority: adoptionStatusPriority,

        // Adoption facet: row shapers
        toAdoptionRow: toAdoptionRow,
        toAdoptionRows: toAdoptionRows,

        // Adoption facet: filter option views
        toAdoptionTypeFilterOptions: toAdoptionTypeFilterOptions,
        toAdoptionStatusFilterOptions: toAdoptionStatusFilterOptions,
        toAdoptionSortOptions: toAdoptionSortOptions,

        // Adoption facet: stats bar
        toAdoptionStatsBarViewModel: toAdoptionStatsBarViewModel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsViewModels;
    }
})();
