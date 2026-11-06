/**
 * =============================================================================
 * STILL WATERS - EVENTS CONSTANTS (js/events/events-constants.js)
 * =============================================================================
 *
 * LOCATION: js/events/events-constants.js
 *
 * PURPOSE:
 *   Vocabulary, thresholds, and enumerations for the Events domain.
 *
 *   "Events" is the name of the manager shell that hosts the
 *   per-facet event tabs (deaths, stork, disasters, social,
 *   educational). There is NO masterData.data.events collection.
 *   Each tab reads through the owning domain's public query surface:
 *
 *     deaths      -> MortalityQueries / CharacterQueries
 *     stork       -> ChildrenQueries / ChildrenStatistics
 *     disasters   -> DisasterQueries
 *     social      -> RelationshipQueries / RomanceQueries /
 *                    FriendshipQueries / RivalryQueries
 *     educational -> EducationQueries / ApprenticeshipQueries
 *
 *   This module owns:
 *     - the EVENT_FACETS catalog (manager tab ids + labels + icons)
 *     - the EVENT_CATEGORIES catalog (the categories that
 *       window.logEvent writes into masterData.data.eventLog)
 *     - filter vocabularies per facet (status, cause family,
 *       gender, sort)
 *     - the canonical PANEL_ID prefix used by UIState
 *     - default filter shapes per facet
 *
 *   This module does NOT own:
 *     - any policy (defer to the owning domain)
 *     - any state
 *     - any query (defer to the owning domain)
 *     - any presentation strings beyond labels and icon names
 *     - any color values (colors are theme tokens resolved by the
 *       UI layer at render time)
 *
 * ICON NAMES:
 *   Every icon in this module is a NAME, not markup. The UI layer
 *   resolves names via window.getIcon(name, 'CIRCLE'). The names
 *   below are the exact keys exported by js/core/icons.js:
 *
 *     DEATHSTARS, STORK, DISASTERS -> EVENTS (there is no DISASTERS
 *       key; use EVENTS), RELATIONSHIP (no such key; use
 *       FRIENDSHIP for social), BOOK (education).
 *
 *   Any name not present in icons.js falls back to CIRCLE via
 *   window.getIcon's second-argument contract. The defaultFallbackIcon
 *   below names that explicitly.
 *
 * DEPENDENCIES: None.
 *
 * ICON POLICY: No emojis. No inline Unicode glyphs. Icon names only.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. FACETS (the manager's tabs)
    // =========================================================================
    //
    // The Events Manager hosts one tab per event family. The
    // "events" facet (non-death, non-birth, non-disaster,
    // non-educational lifecycle events -- relationships, moves,
    // skills, etc.) is a future tab. It is declared here so the
    // tab strip can render its button, but its renderer is not
    // registered until the corresponding tab file lands.
    //
    // Adding a facet is a single-entry append. Removing one is not
    // supported (facet ids are stable strings; retired facets keep
    // their entry with `enabled: false`).

    var EVENT_FACETS = Object.freeze([
        Object.freeze({
            id: 'deaths',
            label: 'Deaths',
            iconName: 'DEATHSTARS',
            description: 'Character deaths, murders, and executions.'
        }),
        Object.freeze({
            id: 'stork',
            label: 'Births',
            iconName: 'STORK',
            description: 'Pregnancies, births, stillbirths, and adoptions.'
        }),
        Object.freeze({
            id: 'disasters',
            label: 'Disasters',
            iconName: 'EVENTS',
            description: 'Disasters and their structural / population impact.'
        }),
        Object.freeze({
            id: 'social',
            label: 'Social',
            iconName: 'FRIENDSHIP',
            description: 'Romantic, friendship, and rivalry events.'
        }),
        Object.freeze({
            id: 'educational',
            label: 'Educational',
            iconName: 'BOOK',
            description: 'Enrollment, graduation, and apprenticeship events.'
        })
    ]);

    // =========================================================================
    // 2. EVENT LOG CATEGORIES
    // =========================================================================
    //
    // These are the values that window.logEvent writes into the
    // `category` field of each entry in masterData.data.eventLog.
    // They are produced by the owning domain modules (character-*,
    // children-*, disaster-*, crime-*, relationship-*, education-*,
    // apprenticeship-*).
    //
    // This catalog is READ-ONLY for the Events Manager: it is used
    // to filter the raw event log by category when a facet wants a
    // "recent events" strip. The manager does not write events.
    //
    // Every category listed here is confirmed to appear in the
    // supplied codebase's logEvent call sites. A future category
    // added by an owning domain is appended here; existing tabs
    // keep working without changes (unknown categories simply are
    // not matched by the filter).

    var EVENT_CATEGORIES = Object.freeze({
        DEATH:        'death',
        BIRTH:        'birth',
        MARRIAGE:     'marriage',
        ROMANCE:      'romance',
        FRIENDSHIP:   'friendship',
        RIVALRY:      'rivalry',
        AFFAIR:       'affair',
        JEALOUSY:     'jealousy',
        FAMILY:       'family',
        DISASTER:     'disaster',
        CRIME:        'crime',
        MURDER:       'murder',
        EXECUTION:    'execution',
        VENDETTA:     'vendetta',
        EDUCATION:    'education',
        APPRENTICESHIP: 'apprenticeship',
        PROFESSIONAL: 'professional',
        RELIGION:     'religion',
        MOVE:         'move',
        HOUSEHOLD:    'household',
        SETTLEMENT:   'settlement',
        RANK:         'rank',
        ROLE:         'role'
    });

    // Reverse lookup (string -> constant name) for diagnostics.
    var EVENT_CATEGORY_NAMES = (function() {
        var out = {};
        for (var key in EVENT_CATEGORIES) {
            if (!Object.prototype.hasOwnProperty.call(EVENT_CATEGORIES, key)) continue;
            out[EVENT_CATEGORIES[key]] = key;
        }
        return Object.freeze(out);
    })();

    // =========================================================================
    // 3. PANEL IDS
    // =========================================================================
    //
    // UIState is keyed by panel id. Every Events-facet tab uses a
    // panel id of the form "events-<facetId>". This lets a single
    // UIState store host all facets without collision with any other
    // manager (each manager has its own panel-id namespace).

    var PANEL_ID_PREFIX = 'events';

    function panelIdFor(facetId) {
        if (typeof facetId !== 'string' || facetId.length === 0) return PANEL_ID_PREFIX;
        return PANEL_ID_PREFIX + '-' + facetId;
    }

    // =========================================================================
    // 4. TAB MANAGER SCOPE
    // =========================================================================
    //
    // The TabManager scope string used by the Events Manager
    // bootstrap. Kept here so the bootstrap and the tab files agree
    // without duplicating the literal.

    var MANAGER_SCOPE = 'events';

    // =========================================================================
    // 5. DEATHS FACET: FILTER VOCABULARY
    // =========================================================================

    // Character status filter.
    var DEATH_STATUS_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',      label: 'All Characters' }),
        Object.freeze({ id: 'living',   label: 'Living'         }),
        Object.freeze({ id: 'deceased', label: 'Deceased'       })
    ]);

    // Gender filter. Values match the canonical gender ids from
    // CharacterState (male / female / unknown).
    var DEATH_GENDER_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',     label: 'All Genders' }),
        Object.freeze({ id: 'male',    label: 'Male'        }),
        Object.freeze({ id: 'female',  label: 'Female'      }),
        Object.freeze({ id: 'unknown', label: 'Unknown'     })
    ]);

    // Cause-family filter. Values are the stable ids from
    // MortalityRules.DEATH_CAUSE, plus 'all'. The tab matches
    // against character.deathCause (the stable id), NOT against
    // deathCauseDetail (free text).
    var DEATH_CAUSE_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',             label: 'All Causes'     }),
        Object.freeze({ id: 'natural',         label: 'Natural'        }),
        Object.freeze({ id: 'disease',         label: 'Disease'        }),
        Object.freeze({ id: 'accident',        label: 'Accident'       }),
        Object.freeze({ id: 'murder',          label: 'Murder'         }),
        Object.freeze({ id: 'execution',       label: 'Execution'      }),
        Object.freeze({ id: 'childbed_fever',  label: 'Childbed Fever' }),
        Object.freeze({ id: 'unknown',         label: 'Unknown'        })
    ]);

    // Sort options for the character list. The list is always
    // grouped living-before-deceased (that ordering is a UX
    // invariant enforced by the tab, not by the sort).
    var DEATH_SORT_OPTIONS = Object.freeze([
        Object.freeze({ id: 'name',       label: 'Name'          }),
        Object.freeze({ id: 'age',        label: 'Age'           }),
        Object.freeze({ id: 'deathYear',  label: 'Year of Death' }),
        Object.freeze({ id: 'location',   label: 'Location'      })
    ]);

    // =========================================================================
    // 6. DEATHS FACET: DEFAULT FILTERS
    // =========================================================================
    //
    // The shape a tab's filter object has when nothing is set. Every
    // facet declares its own default shape so that
    // UIState.getFilters(panelId) can be merged against a
    // documented baseline rather than an ad-hoc `{}`.

    var DEATHS_DEFAULT_FILTERS = Object.freeze({
        search: '',
        status: 'all',
        cause: 'all',
        gender: 'all',
        sortBy: 'name',
        // Location scope: when `null`, show all locations. When a
        // location id is set, only characters whose current
        // location is that id (or a sub-location) are shown.
        // The sidebar's selection seeds this; the tab's own
        // "Show all locations" toggle clears it.
        locationId: null,
        showAllLocations: true
    });

    // Per-facet default filter shapes. New facets append an entry.
    var DEFAULT_FILTERS_BY_FACET = Object.freeze({
        deaths: DEATHS_DEFAULT_FILTERS
        // stork, disasters, social, educational: added when their
        // tabs land. Absent facets fall back to
        // DEFAULT_FILTERS_FALLBACK below.
    });

    // The fallback shape for a facet whose defaults have not yet
    // been declared. Keeping this explicit (rather than returning
    // `{}`) makes a new tab's filter state start from a documented
    // shape rather than an accidental one.
    var DEFAULT_FILTERS_FALLBACK = Object.freeze({
        search: ''
    });

    // =========================================================================
    // 7. UI COPY
    // =========================================================================
    //
    // Long-form UI strings used by the tabs. Kept here so that a
    // copy pass is a single-file edit. This is presentational text
    // ONLY -- no policy, no thresholds, no fabricated defaults.

    var UI_COPY = Object.freeze({
        emptyNoContext:         'Select a location from the sidebar, or enable "Show all locations".',
        emptyNoCharacters:      'No characters exist yet.',
        emptyNoMatches:         'No characters match your filters.',
        emptyNoDeathsRecorded:  'No deaths have been recorded.',
        emptyUnavailable:       'This information is not available in the current build.',
        loadFailed:             'Could not load data.',
        killUnavailable:        'Kill action is unavailable: the death modal is not loaded.',
        refreshSuccess:         'Refreshed.',
        filtersCleared:         'Filters cleared.'
    });

    // =========================================================================
    // 8. HELPERS (pure)
    // =========================================================================

    function getFacet(facetId) {
        if (typeof facetId !== 'string' || facetId.length === 0) return null;
        for (var i = 0; i < EVENT_FACETS.length; i++) {
            if (EVENT_FACETS[i].id === facetId) return EVENT_FACETS[i];
        }
        return null;
    }

    function getFacetIds() {
        var out = [];
        for (var i = 0; i < EVENT_FACETS.length; i++) out.push(EVENT_FACETS[i].id);
        return out;
    }

    function isKnownFacet(facetId) {
        return getFacet(facetId) !== null;
    }

    function isKnownEventCategory(category) {
        if (typeof category !== 'string' || category.length === 0) return false;
        return Object.prototype.hasOwnProperty.call(EVENT_CATEGORY_NAMES, category);
    }

    /**
     * Returns a shallow copy of the default filter object for a
     * facet. Unknown facets return the fallback shape (a copy --
     * callers may mutate the returned object without affecting the
     * frozen catalog).
     */
    function getDefaultFiltersForFacet(facetId) {
        var base = (typeof facetId === 'string'
            && Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS_BY_FACET, facetId))
            ? DEFAULT_FILTERS_BY_FACET[facetId]
            : DEFAULT_FILTERS_FALLBACK;

        var copy = {};
        for (var key in base) {
            if (Object.prototype.hasOwnProperty.call(base, key)) {
                copy[key] = base[key];
            }
        }
        return copy;
    }

    /**
     * Returns a fresh array copy of a frozen filter-option list. The
     * catalog itself is frozen; the copy is not, so callers can
     * `.map()` / `.filter()` without touching the catalog.
     */
    function copyFilterList(list) {
        if (!Array.isArray(list)) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var copy = {};
            for (var key in item) {
                if (Object.prototype.hasOwnProperty.call(item, key)) {
                    copy[key] = item[key];
                }
            }
            out[i] = copy;
        }
        return out;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    var EventsConstants = {
        // Facets
        EVENT_FACETS: EVENT_FACETS,
        getFacet: getFacet,
        getFacetIds: getFacetIds,
        isKnownFacet: isKnownFacet,

        // Event log categories
        EVENT_CATEGORIES: EVENT_CATEGORIES,
        EVENT_CATEGORY_NAMES: EVENT_CATEGORY_NAMES,
        isKnownEventCategory: isKnownEventCategory,

        // Panel ids
        PANEL_ID_PREFIX: PANEL_ID_PREFIX,
        panelIdFor: panelIdFor,

        // TabManager scope
        MANAGER_SCOPE: MANAGER_SCOPE,

        // Deaths facet vocabulary
        DEATH_STATUS_FILTERS: DEATH_STATUS_FILTERS,
        DEATH_GENDER_FILTERS: DEATH_GENDER_FILTERS,
        DEATH_CAUSE_FILTERS: DEATH_CAUSE_FILTERS,
        DEATH_SORT_OPTIONS: DEATH_SORT_OPTIONS,

        // Default filters
        DEATHS_DEFAULT_FILTERS: DEATHS_DEFAULT_FILTERS,
        DEFAULT_FILTERS_FALLBACK: DEFAULT_FILTERS_FALLBACK,
        getDefaultFiltersForFacet: getDefaultFiltersForFacet,

        // UI copy
        UI_COPY: UI_COPY,

        // Helpers
        copyFilterList: copyFilterList
    };

    window.EventsConstants = EventsConstants;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EventsConstants;
    }
})();
