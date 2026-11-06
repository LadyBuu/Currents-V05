/**
 * =============================================================================
 * STILL WATERS - EVENTS BOOTSTRAP (js/events/events-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/events/events-bootstrap.js
 *
 * PURPOSE:
 *   Domain bootstrap for the Events Manager. Verifies that the
 *   Events module set (constants, queries, view models, UI list) is
 *   loaded, warms up the state modules the facet queries read
 *   through, runs a warn-only integrity check, and exposes
 *   window.Events as the aggregate facade.
 *
 *   This is NOT the manager bootstrap. The manager bootstrap
 *   (js/tabs/events-manager-bootstrap.js) owns TabManager.configure,
 *   TabManager.init, the sidebar, the topbar, and the initial tab
 *   render. This file only ensures the Events module is coherent;
 *   the manager bootstrap calls EventsBootstrap.init() before
 *   configuring TabManager.
 *
 * OWNERSHIP:
 *   - verification of the Events module set (constants, queries,
 *     view models, UI list)
 *   - verification of the core surface those modules rely on at
 *     runtime (escapeHtml, getIcon, getCurrentYear)
 *   - warm-up hydration of the per-facet owning states
 *     (CharacterState, ChildrenState, RelationshipState,
 *     DisasterState) so the first tab render does not pay for the
 *     first-read lazy hydrate
 *   - warn-only integrity check across the facet module set
 *   - window.Events aggregate namespace
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does NOT configure TabManager. (events-manager-bootstrap)
 *   - It does NOT render. (events-deaths-tab / future facet tabs)
 *   - It does NOT touch the DOM.
 *   - It does NOT own the events data. (each facet's owning domain)
 *   - It does NOT silence a missing required dependency.
 *
 * VERIFICATION PHILOSOPHY:
 *   The Events Manager is a read-only aggregate over other domains'
 *   public surfaces. The failure modes that matter for it are:
 *
 *     1. The Events module set is incomplete. A missing
 *        EventsConstants / EventsQueries / EventsViewModels /
 *        EventsUIList means a tab will fail to render. This is a
 *        hard failure at init.
 *
 *     2. A core global is missing (escapeHtml, getIcon,
 *        getCurrentYear). These are listed as hard because every
 *        tab uses them; a missing one produces blank or broken
 *        rows in every facet.
 *
 *     3. A facet's owning domain is missing. This is NOT a hard
 *        failure. A missing MortalityQueries means the deaths facet
 *        returns { available: false } and the tab shows the
 *        unavailable empty state. The Events Manager is designed to
 *        keep working with a partial facet set. The bootstrap
 *        reports which facet domains were absent so a developer
 *        sees the gap at init, but does not throw.
 *
 *     4. A state module fails to hydrate. This IS a hard failure.
 *        A tab that reads through a broken state would render
 *        empty rather than unavailable. Fail loudly.
 *
 *   This split is deliberate: the Events Manager is a display
 *   surface, not a domain authority. Its own module set is a hard
 *   requirement; the domains it reads through are not.
 *
 * HYDRATION POLICY:
 *   Facet query functions read through each facet's owning state.
 *   Those states hydrate lazily on first read. Calling hydrate()
 *   here, once, at init, means the first tab render is fast. It
 *   also means a broken state fails at bootstrap rather than at
 *   first tab click -- a visible load-time failure, which is what
 *   the load-order contract wants.
 *
 *   The hydration is defensive: it is skipped (with a warn) if the
 *   state module is absent, because the corresponding facet is
 *   already designed to return { available: false } in that case.
 *   A present-but-throwing hydrate is a hard failure -- the state
 *   module is loaded and broken, which is a bug, not a
 *   configuration.
 *
 * IDEMPOTENCE:
 *   init() is idempotent. Calling it twice returns
 *   { success: true, alreadyInitialized: true } and does nothing.
 *   reinit() forces a fresh pass. The Events Manager topbar's
 *   Refresh button calls reinit() after loadMasterData so a fresh
 *   masterData envelope is reflected.
 *
 * DEPENDENCIES: the modules it verifies. No runtime dependencies
 *   beyond the globals it reads to perform the verification.
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;

    // =========================================================================
    // 1. GENERIC VERIFIERS
    // =========================================================================

    function _require(label, value) {
        if (typeof value === 'undefined' || value === null) {
            throw new Error('events-bootstrap: ' + label + ' is required.');
        }
        return value;
    }

    function _requireFunction(label, fn) {
        if (typeof fn !== 'function') {
            throw new Error('events-bootstrap: ' + label + ' is required.');
        }
    }

    function _requireMethod(label, obj, methodName) {
        if (!obj || typeof obj[methodName] !== 'function') {
            throw new Error(
                'events-bootstrap: ' + label + '.' + methodName + ' is required.'
            );
        }
    }

    var _warned = {};
    function _warnOnce(key, message) {
        if (_warned[key]) return;
        _warned[key] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('events-bootstrap: ' + message);
        }
    }

    // =========================================================================
    // 2. CORE SURFACE VERIFICATION
    // =========================================================================
    //
    // These globals are used by events-ui-list.js at load (escapeHtml,
    // getIcon) or by the facet queries at call (getCurrentYear). A
    // missing one produces visible rendering defects in every facet,
    // not just one. Hard failure.

    function _verifyCoreGlobals() {
        _requireFunction('formatting.js (escapeHtml)', window.escapeHtml);
        _requireFunction('icons.js (getIcon)', window.getIcon);
        _requireFunction('time.js (getCurrentYear)', window.getCurrentYear);
    }

    // =========================================================================
    // 3. EVENTS MODULE VERIFICATION
    // =========================================================================
    //
    // The four Events module files. Each facet tab uses at least
    // EventsConstants + EventsViewModels + EventsUIList; the deaths
    // tab also uses EventsQueries. A missing module file breaks the
    // manager at load time, not at first click.

    function _verifyEventsModules() {
        _require('EventsConstants', window.EventsConstants);
        _require('EventsQueries', window.EventsQueries);
        _require('EventsViewModels', window.EventsViewModels);
        _require('EventsUIList', window.EventsUIList);

        // Spot-check the surfaces the tab layer depends on.
        // EventsConstants:
        _requireMethod('EventsConstants', window.EventsConstants, 'getFacet');
        _requireMethod('EventsConstants', window.EventsConstants, 'getFacetIds');
        _requireMethod('EventsConstants', window.EventsConstants, 'isKnownFacet');
        _requireMethod('EventsConstants', window.EventsConstants, 'panelIdFor');
        _requireMethod('EventsConstants', window.EventsConstants, 'getDefaultFiltersForFacet');

        // EventsQueries: the generic dispatcher + the deaths facet
        // (the only fully-implemented facet today).
        _requireMethod('EventsQueries', window.EventsQueries, 'getFacetRecords');
        _requireMethod('EventsQueries', window.EventsQueries, 'getCharacterRoster');
        _requireMethod('EventsQueries', window.EventsQueries, 'getCharacterPopulationStats');
        _requireMethod('EventsQueries', window.EventsQueries, 'getAllDeathRecords');
        _requireMethod('EventsQueries', window.EventsQueries, 'getMortalityStats');
        _requireMethod('EventsQueries', window.EventsQueries, 'getRecentDeathEvents');

        // EventsViewModels:
        _requireMethod('EventsViewModels', window.EventsViewModels, 'toCharacterRows');
        _requireMethod('EventsViewModels', window.EventsViewModels, 'toDeathsStatsBarViewModel');
        _requireMethod('EventsViewModels', window.EventsViewModels, 'toRecentEventRows');
        _requireMethod('EventsViewModels', window.EventsViewModels, 'emptyStateMessage');

        // EventsUIList:
        _requireMethod('EventsUIList', window.EventsUIList, 'renderTabBody');
        _requireMethod('EventsUIList', window.EventsUIList, 'renderStatsBar');
        _requireMethod('EventsUIList', window.EventsUIList, 'renderCharacterRow');
        _requireMethod('EventsUIList', window.EventsUIList, 'renderEmptyState');
        _requireMethod('EventsUIList', window.EventsUIList, 'renderOptionList');
    }

    // =========================================================================
    // 4. FACET DOMAIN AVAILABILITY (warn-only)
    // =========================================================================
    //
    // Each facet reads through a different domain's public query
    // surface. Absent domains are legitimate -- the Events Manager
    // loads and shows an unavailable state for the corresponding
    // facet. The bootstrap records which facet domains were absent
    // so a developer sees the gap at init.
    //
    // A present-but-incomplete facet domain (module exists but the
    // specific methods are missing) is ALSO a warn -- the queries
    // module already returns { available: false } for a partial
    // facade. This is the same policy as the read API itself.

    function _verifyFacetDomains() {
        var absent = [];

        // Deaths facet
        if (typeof window.MortalityQueries === 'undefined') {
            absent.push('deaths (MortalityQueries)');
            _warnOnce('facet-deaths',
                'MortalityQueries is not loaded -- the deaths facet will ' +
                'render as unavailable.'
            );
        }

        // Stork facet
        if (typeof window.ChildrenQueries === 'undefined') {
            absent.push('stork (ChildrenQueries)');
            _warnOnce('facet-stork',
                'ChildrenQueries is not loaded -- the stork facet will ' +
                'render as unavailable.'
            );
        }

        // Disasters facet
        if (typeof window.DisasterQueries === 'undefined') {
            absent.push('disasters (DisasterQueries)');
            _warnOnce('facet-disasters',
                'DisasterQueries is not loaded -- the disasters facet will ' +
                'render as unavailable.'
            );
        }

        // Social facet
        if (typeof window.RelationshipQueries === 'undefined') {
            absent.push('social (RelationshipQueries)');
            _warnOnce('facet-social',
                'RelationshipQueries is not loaded -- the social facet will ' +
                'render as unavailable.'
            );
        }

        // Educational facet
        if (typeof window.EducationQueries === 'undefined') {
            absent.push('educational (EducationQueries)');
            _warnOnce('facet-educational',
                'EducationQueries is not loaded -- the educational facet ' +
                'will render as unavailable.'
            );
        }

        return absent;
    }

    // =========================================================================
    // 5. HYDRATION
    // =========================================================================
    //
    // Warm up the per-facet states. Each state's hydration is
    // idempotent and defensive. A present-and-throwing hydrate is a
    // hard failure (the state is loaded but broken); an absent state
    // is a warn and skip (the corresponding facet is already
    // unavailable).
    //
    // DisasterState.hydrateFromMasterData takes an optional force
    // argument; without it, the call is idempotent. Every other
    // state's hydrate is likewise idempotent.

    function _hydrateState(label, state, methodName) {
        if (!state) {
            _warnOnce('hydrate-' + label,
                label + ' is not loaded -- the corresponding facet state ' +
                'was not warmed up.');
            return;
        }
        if (typeof state[methodName] !== 'function') {
            _warnOnce('hydrate-' + label,
                label + '.' + methodName + ' is not available -- the ' +
                'corresponding facet state was not warmed up.');
            return;
        }
        try {
            state[methodName]();
        } catch (e) {
            throw new Error(
                'events-bootstrap: ' + label + '.' + methodName +
                ' threw during hydration: ' +
                (e && e.message ? e.message : 'unknown error')
            );
        }
    }

    function _hydrateAll() {
        // CharacterState is loaded very early; hydrate is called
        // implicitly during its initial _rebuildCaches. No explicit
        // call needed. But other state modules hydrate lazily, and
        // warming them here makes the first tab render cheap.
        _hydrateState('CharacterState', window.CharacterState, 'getAllCharacters');
        _hydrateState('ChildrenState', window.ChildrenState, 'snapshotPregnancies');
        _hydrateState('RelationshipState', window.RelationshipState, 'isInitialized');
        _hydrateState('DisasterState', window.DisasterState, 'hydrateFromMasterData');
    }

    // =========================================================================
    // 6. INTEGRITY CHECK (warn-only)
    // =========================================================================
    //
    // Each state's validateIntegrity() is called if present. Errors
    // are logged but not thrown -- integrity warnings describe a
    // data problem that the loading code is already handling.

    function _runIntegrityCheck() {
        var states = [
            { label: 'CharacterState', state: window.CharacterState },
            { label: 'ChildrenState', state: window.ChildrenState },
            { label: 'RelationshipState', state: window.RelationshipState },
            { label: 'DisasterState', state: window.DisasterState }
        ];
        for (var i = 0; i < states.length; i++) {
            var s = states[i];
            if (!s.state || typeof s.state.validateIntegrity !== 'function') {
                continue;
            }
            try {
                s.state.validateIntegrity();
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'events-bootstrap: ' + s.label +
                        '.validateIntegrity() threw:', e
                    );
                }
            }
        }
    }

    // =========================================================================
    // 7. INIT
    // =========================================================================

    /**
     * Initialise the Events module. Idempotent.
     *
     * @returns {{
     *   success: true,
     *   alreadyInitialized?: true,
     *   absentFacetDomains?: string[],
     *   facets?: string[]
     * }}
     */
    function init() {
        if (_initialized) {
            return { success: true, alreadyInitialized: true };
        }

        _verifyCoreGlobals();
        _verifyEventsModules();
        var absent = _verifyFacetDomains();

        _hydrateAll();
        _runIntegrityCheck();

        // Expose the aggregate facade. This is the ONLY place the
        // Events Manager's module set is assembled under a single
        // namespace. Callers that reach for window.Events get the
        // same surface as the four module globals, plus a `facets`
        // helper that reports the declared facet catalog and which
        // of them are currently unavailable.
        window.Events = {
            constants:  window.EventsConstants,
            queries:    window.EventsQueries,
            viewModels: window.EventsViewModels,
            uiList:     window.EventsUIList,

            /**
             * Returns the declared facet catalog (id, label, iconName,
             * description) with an `available` flag indicating
             * whether the facet's owning domain is loaded.
             */
            facets: (function() {
                var list = window.EventsConstants.EVENT_FACETS;
                var out = [];
                for (var i = 0; i < list.length; i++) {
                    var facet = list[i];
                    var available = true;
                    switch (facet.id) {
                        case 'deaths':      available = typeof window.MortalityQueries !== 'undefined'; break;
                        case 'stork':       available = typeof window.ChildrenQueries !== 'undefined'; break;
                        case 'disasters':   available = typeof window.DisasterQueries !== 'undefined'; break;
                        case 'social':      available = typeof window.RelationshipQueries !== 'undefined'; break;
                        case 'educational': available = typeof window.EducationQueries !== 'undefined'; break;
                    }
                    out.push({
                        id: facet.id,
                        label: facet.label,
                        iconName: facet.iconName,
                        description: facet.description,
                        available: available
                    });
                }
                return out;
            })()
        };

        _initialized = true;

        return {
            success: true,
            facets: window.EventsConstants.getFacetIds(),
            absentFacetDomains: absent
        };
    }

    /**
     * Force a fresh pass. Clears the initialization flag and calls
     * init(). Use after loadMasterData replaces the masterData
     * envelope (the Refresh button in the topbar does this).
     */
    function reinit() {
        _initialized = false;
        return init();
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.EventsBootstrap = {
        init: init,
        reinit: reinit
    };

    // Auto-init if masterData is already available. Otherwise the
    // manager bootstrap calls init() explicitly, after loadMasterData.
    //
    // The try/catch is deliberate: a throw during auto-init (e.g. a
    // module that loaded with a broken surface) must surface as a
    // console.error, not an uncaught load-time exception. Explicit
    // init() still throws, so callers that need to gate on Events
    // availability catch the throw.
    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('events-bootstrap: auto-init failed:', e);
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsBootstrap;
    }
})();
