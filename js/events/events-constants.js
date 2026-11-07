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
 *   per-facet event tabs. There is NO masterData.data.events
 *   collection. Each tab reads through the owning domain's public
 *   query surface:
 *
 *     deaths      -> MortalityQueries / CharacterQueries /
 *                    MortalityStatistics
 *     stork       -> RomanceQueries / FamilyQueries /
 *                    ChildrenQueries / ChildrenRules
 *     adoption    -> ChildrenQueries (adoption metadata) /
 *                    FamilyQueries
 *     surrogacy   -> ChildrenQueries (surrogacy arrangements) /
 *                    RomanceQueries
 *     disasters   -> DisasterQueries / DisasterConstants
 *     social      -> RelationshipQueries / RomanceQueries /
 *                    FriendshipQueries / RivalryQueries
 *     educational -> EducationQueries / ApprenticeshipQueries
 *
 *   This module owns:
 *     - the EVENT_FACETS catalog (manager tab ids + labels + icons)
 *     - the EVENT_CATEGORIES catalog (the categories that
 *       window.logEvent writes into masterData.data.eventLog)
 *     - filter vocabularies per facet (status, cause family,
 *       gender, sort, type)
 *     - the canonical PANEL_ID prefix used by UIState
 *     - default filter shapes per facet
 *     - UI copy strings
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
 *     deaths      -> DEATHSTARS
 *     stork       -> STORK
 *     adoption    -> ADOPTION_LEGAL
 *     surrogacy   -> GUARDIANSHIP
 *     disasters   -> EVENTS
 *     social      -> FRIENDSHIP
 *     educational -> BOOK
 *
 *   Any name not present in icons.js falls back to CIRCLE via
 *   window.getIcon's second-argument contract.
 *
 * DEPENDENCIES: None.
 *
 * ICON POLICY: No emojis. No inline Unicode glyphs. Icon names only.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision (Phase 3B):
 *     - Added the adoption facet's filter vocabulary:
 *         ADOPTION_STATUS_FILTERS  (all | active | ended | dissolved)
 *         ADOPTION_TYPE_FILTERS    (all | legal | guardianship | foster)
 *         ADOPTION_SORT_OPTIONS    (year | childName | adopterName)
 *         ADOPTION_DEFAULT_FILTERS (the adoption tab's starting filter
 *                                   state; grouped-by-type, sorted by
 *                                   year descending, show all
 *                                   locations true, collapsed false)
 *     - DEFAULT_FILTERS_BY_FACET gains an `adoption` entry.
 *     - UI_COPY gains emptyNoAdoptions, emptyNoGuardianships,
 *       emptyNoFosterRecords. The adoption tab's empty state
 *       distinguishes these three cases because the type group
 *       headers remain visible: a "Legal Adoption (0)" header with
 *       the wrong copy under it would be misleading.
 *     - Exports for all four new adoption constants added.
 *     - No behavioural change to any other facet's vocabulary.
 *   Previous revision (Phase 3A):
 *     - Added the stork facet's filter vocabulary
 *       (STORK_SORT_OPTIONS, STORK_DEFAULT_FILTERS).
 *     - DEFAULT_FILTERS_BY_FACET gains a `stork` entry.
 *   Initial revision:
 *     - Created with the deaths facet's vocabulary and the
 *       facet catalog.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. FACETS (the manager's tabs)
    // =========================================================================
    //
    // The Events Manager hosts one tab per event family. The
    // "adoption" and "surrogacy" entries are declared here so the
    // tab strip can render their buttons; their renderers land in
    // Phase 3B / 3C. Until then, TabManager renders the "not loaded
    // in this build" empty state from _buildEmptyState's
    // 'no-renderer' branch.

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
            description: 'Fertile couples and their children.'
        }),
        Object.freeze({
            id: 'adoption',
            label: 'Adoption',
            iconName: 'ADOPTION_LEGAL',
            description: 'Adoption metadata records.'
        }),
        Object.freeze({
            id: 'surrogacy',
            label: 'Surrogacy',
            iconName: 'GUARDIANSHIP',
            description: 'Surrogacy arrangements.'
        }),
        Object.freeze({
            id: 'disasters',
            label: 'Disasters',
            iconName: 'EVENTS',
            description: 'Disasters and their structural and population impact.'
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
    // They are produced by the owning domain modules. This catalog
    // is read-only for the Events Manager: it is used to filter the
    // raw event log by category when a facet wants a "recent events"
    // strip.

    var EVENT_CATEGORIES = Object.freeze({
        DEATH:          'death',
        BIRTH:          'birth',
        MARRIAGE:       'marriage',
        ROMANCE:        'romance',
        FRIENDSHIP:     'friendship',
        RIVALRY:        'rivalry',
        AFFAIR:         'affair',
        JEALOUSY:       'jealousy',
        FAMILY:         'family',
        DISASTER:       'disaster',
        CRIME:          'crime',
        MURDER:         'murder',
        EXECUTION:      'execution',
        VENDETTA:       'vendetta',
        EDUCATION:      'education',
        APPRENTICESHIP: 'apprenticeship',
        PROFESSIONAL:   'professional',
        RELIGION:       'religion',
        MOVE:           'move',
        HOUSEHOLD:      'household',
        SETTLEMENT:     'settlement',
        RANK:           'rank',
        ROLE:           'role'
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
    // panel id of the form "events-<facetId>:<locationId|all>". This
    // lets a single UIState store host all facets, and lets each
    // facet remember its own filter state per location.

    var PANEL_ID_PREFIX = 'events';

    function panelIdFor(facetId) {
        if (typeof facetId !== 'string' || facetId.length === 0) {
            return PANEL_ID_PREFIX;
        }
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

    var DEATH_STATUS_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',      label: 'All Characters' }),
        Object.freeze({ id: 'living',   label: 'Living'         }),
        Object.freeze({ id: 'deceased', label: 'Deceased'       })
    ]);

    var DEATH_GENDER_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',     label: 'All Genders' }),
        Object.freeze({ id: 'male',    label: 'Male'        }),
        Object.freeze({ id: 'female',  label: 'Female'      }),
        Object.freeze({ id: 'unknown', label: 'Unknown'     })
    ]);

    // Values match MortalityRules.DEATH_CAUSE (natural, disease,
    // accident, murder, execution, childbed_fever, unknown) plus
    // 'all'. The tab matches against character.deathCause (the
    // stable id), NOT against deathCauseDetail (free text).
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

    var DEATH_SORT_OPTIONS = Object.freeze([
        Object.freeze({ id: 'name',       label: 'Name'          }),
        Object.freeze({ id: 'age',        label: 'Age'           }),
        Object.freeze({ id: 'deathYear',  label: 'Year of Death' }),
        Object.freeze({ id: 'location',   label: 'Location'      })
    ]);

    var DEATHS_DEFAULT_FILTERS = Object.freeze({
        search: '',
        status: 'all',
        cause: 'all',
        gender: 'all',
        sortBy: 'name',
        locationId: null,
        showAllLocations: true,
        collapsed: false
    });

    // =========================================================================
    // 6. STORK FACET: FILTER VOCABULARY
    // =========================================================================
    //
    // The stork tab groups couples by man. Its filters narrow which
    // couples are shown within each man card:
    //   - search           matches man name, woman name, or either surname
    //   - fertileOnly      woman is inside the fertility window
    //                      (ChildrenRules.FERTILITY_CONSTANTS)
    //   - hasCapacityOnly  estimated remaining children > 0
    //   - childlessOnly    couple has zero existing biological children
    //
    // Sorting reorders the man cards themselves:
    //   - rank             ascending by active rank priority (lower is
    //                      higher rank), then by man name
    //   - name             ascending by man name
    //   - children         ascending by total children across all
    //                      partners, then by man name

    var STORK_SORT_OPTIONS = Object.freeze([
        Object.freeze({ id: 'rank',     label: 'Rank'     }),
        Object.freeze({ id: 'name',     label: 'Name'     }),
        Object.freeze({ id: 'children', label: 'Children' })
    ]);

    var STORK_DEFAULT_FILTERS = Object.freeze({
        search: '',
        fertileOnly: true,
        hasCapacityOnly: true,
        childlessOnly: false,
        sortBy: 'rank',
        locationId: null,
        showAllLocations: true,
        collapsed: false
    });

    // =========================================================================
    // 7. ADOPTION FACET: FILTER VOCABULARY
    // =========================================================================
    //
    // The adoption tab distinguishes three record types (legal
    // adoption, guardianship, foster care) by `type`, and three
    // statuses (active, ended, dissolved) by `status`. The tab groups
    // rows by type, then by status within each type group. Filters
    // narrow the list without changing the grouping.
    //
    // Values match ChildrenRules.ADOPTION_TYPE and ADOPTION_STATUS,
    // plus 'all'. The tab matches against record.type and
    // record.status (the stable ids), never against the label
    // strings.

    var ADOPTION_STATUS_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',       label: 'All Statuses' }),
        Object.freeze({ id: 'active',    label: 'Active'       }),
        Object.freeze({ id: 'ended',     label: 'Ended'        }),
        Object.freeze({ id: 'dissolved', label: 'Dissolved'    })
    ]);

    var ADOPTION_TYPE_FILTERS = Object.freeze([
        Object.freeze({ id: 'all',           label: 'All Types'       }),
        Object.freeze({ id: 'legal',         label: 'Legal Adoption'  }),
        Object.freeze({ id: 'guardianship',  label: 'Guardianship'    }),
        Object.freeze({ id: 'foster',        label: 'Foster Care'     })
    ]);

    // Sorting reorders rows within each type group:
    //   - year         descending (newest first)
    //   - childName    ascending (localeCompare)
    //   - adopterName  ascending (localeCompare)
    var ADOPTION_SORT_OPTIONS = Object.freeze([
        Object.freeze({ id: 'year',        label: 'Year'         }),
        Object.freeze({ id: 'childName',   label: 'Child Name'   }),
        Object.freeze({ id: 'adopterName', label: 'Adopter Name' })
    ]);

    var ADOPTION_DEFAULT_FILTERS = Object.freeze({
        search: '',
        type: 'all',
        status: 'all',
        sortBy: 'year',
        locationId: null,
        showAllLocations: true,
        collapsed: false
    });

    // =========================================================================
    // 8. DEFAULT FILTERS PER FACET
    // =========================================================================

    var DEFAULT_FILTERS_BY_FACET = Object.freeze({
        deaths:   DEATHS_DEFAULT_FILTERS,
        stork:    STORK_DEFAULT_FILTERS,
        adoption: ADOPTION_DEFAULT_FILTERS
        // surrogacy, social, educational: added when their tabs land.
    });

    // The fallback shape for a facet whose defaults have not yet
    // been declared. Keeping this explicit (rather than returning
    // `{}`) makes a new tab's filter state start from a documented
    // shape rather than an accidental one.
    var DEFAULT_FILTERS_FALLBACK = Object.freeze({
        search: ''
    });

    // =========================================================================
    // 9. UI COPY
    // =========================================================================
    //
    // Long-form UI strings used by the tabs. Kept here so that a
    // copy pass is a single-file edit. Presentational text ONLY --
    // no policy, no thresholds, no fabricated defaults.

    var UI_COPY = Object.freeze({
        emptyNoContext:         'Select a location from the sidebar, or enable "Show all locations".',
        emptyNoCharacters:      'No characters exist yet.',
        emptyNoMatches:         'No characters match your filters.',
        emptyNoDeathsRecorded:  'No deaths have been recorded.',
        emptyNoCouples:         'No fertile couples found. Women must be between 14 and 47 and in an active committed relationship with a living man.',
        emptyNoBirthsRecorded:  'No births have been recorded.',
        emptyNoAdoptions:       'No adoption records found. Use the + New Adoption action to create one.',
        emptyNoGuardianships:   'No guardianship records found.',
        emptyNoFosterRecords:   'No foster placements found.',
        emptyUnavailable:       'This information is not available in the current build.',
        loadFailed:             'Could not load data.',
        killUnavailable:        'Kill action is unavailable: the death modal is not loaded.',
        birthUnavailable:       'Birth modal is unavailable.',
        characterDetailsUnavailable: 'Character details are unavailable.',
        refreshSuccess:         'Refreshed.',
        filtersCleared:         'Filters cleared.'
    });

    // =========================================================================
    // 10. HELPERS (pure)
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
        for (var i = 0; i < EVENT_FACETS.length; i++) {
            out.push(EVENT_FACETS[i].id);
        }
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
     * .map() / .filter() without touching the catalog.
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
    // 11. EXPORTS
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
        DEATHS_DEFAULT_FILTERS: DEATHS_DEFAULT_FILTERS,

        // Stork facet vocabulary
        STORK_SORT_OPTIONS: STORK_SORT_OPTIONS,
        STORK_DEFAULT_FILTERS: STORK_DEFAULT_FILTERS,

        // Adoption facet vocabulary
        ADOPTION_STATUS_FILTERS: ADOPTION_STATUS_FILTERS,
        ADOPTION_TYPE_FILTERS: ADOPTION_TYPE_FILTERS,
        ADOPTION_SORT_OPTIONS: ADOPTION_SORT_OPTIONS,
        ADOPTION_DEFAULT_FILTERS: ADOPTION_DEFAULT_FILTERS,

        // Default filters
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
