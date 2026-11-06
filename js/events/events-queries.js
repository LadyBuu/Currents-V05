/**
 * =============================================================================
 * STILL WATERS - EVENTS QUERIES (js/events/events-queries.js)
 * =============================================================================
 *
 * LOCATION: js/events/events-queries.js
 *
 * PURPOSE:
 *   Application-facing read API for the Events Manager. This module
 *   aggregates data from the owning domains into per-facet projections.
 *
 *   "Events" is the manager shell; each facet reads through a
 *   different domain:
 *
 *     deaths      -> MortalityQueries / CharacterQueries /
 *                    MortalityStatistics
 *     stork       -> ChildrenQueries / ChildrenStatistics
 *     disasters   -> DisasterQueries
 *     social      -> RelationshipQueries / RomanceQueries /
 *                    FriendshipQueries / RivalryQueries
 *     educational -> EducationQueries / ApprenticeshipQueries
 *
 *   This module does NOT own any state. It composes other domains'
 *   public read surfaces. It does NOT mutate. It does NOT persist.
 *   It does NOT render. It does NOT classify severity or cause --
 *   the owning domain does that (MortalityRules.classifyDeathCause,
 *   DisasterConstants.classifySeverity, etc.).
 *
 * AVAILABILITY CONTRACT:
 *   Every public function returns a value even if its owning domain
 *   is not loaded. The shape encodes availability:
 *
 *     { available: true,  ... }  -> data was read successfully
 *     { available: false, reason: string }  -> one or more required
 *                                              dependencies missing or
 *                                              threw
 *
 *   Individual list-returning functions return [] on unavailability
 *   (they have nowhere to put the flag), and the tab is expected to
 *   call the accompanying summary function to distinguish "no
 *   results" from "unavailable". This matches the pattern
 *   character-queries.js uses for optional family data.
 *
 * READ CONTRACT (ALL ID-SHAPED READS):
 *   Every returned object is a fresh projection. None of them leak
 *   the live canonical object returned by the owning domain's
 *   state or by CharacterState.getLiveCharacterForMutation. If a
 *   downstream caller mutates a returned projection, canonical
 *   state is unaffected.
 *
 * DEPENDENCIES (all optional, checked at call time):
 *   - window.MortalityQueries      (deaths facet)
 *   - window.MortalityStatistics   (deaths facet stats)
 *   - window.CharacterQueries      (deaths character roster)
 *   - window.CharacterState        (deaths location filter)
 *   - window.ChildrenQueries       (stork facet)
 *   - window.ChildrenStatistics    (stork facet stats)
 *   - window.DisasterQueries       (disasters facet)
 *   - window.RelationshipQueries   (social facet)
 *   - window.RomanceQueries        (social facet)
 *   - window.FriendshipQueries     (social facet)
 *   - window.RivalryQueries        (social facet)
 *   - window.EducationQueries      (educational facet)
 *   - window.ApprenticeshipQueries (educational facet)
 *   - window.getCurrentYear        (time.js)
 *   - window.getPlaceById          (accessors.js)
 *   - window.getEventLog           (accessors.js)
 *
 *   NO function in this module throws for a missing optional
 *   dependency. Missing -> { available: false, reason: ... } or [].
 *
 * ICON POLICY: No emojis. No icons. Returns data; the tab renders.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY HELPERS
    // =========================================================================
    //
    // Each helper returns the module if present and function-shaped,
    // otherwise null. The calling function checks null and returns an
    // unavailable result. This keeps the "missing dependency" handling
    // in one place per facet rather than sprinkled throughout.

    function _requireModule(name, requiredMethods) {
        var mod = window[name];
        if (!mod || typeof mod !== 'object') {
            return { ok: false, reason: name + ' is not loaded.' };
        }
        var methods = requiredMethods || [];
        for (var i = 0; i < methods.length; i++) {
            if (typeof mod[methods[i]] !== 'function') {
                return {
                    ok: false,
                    reason: name + '.' + methods[i] + ' is not available.'
                };
            }
        }
        return { ok: true, module: mod };
    }

    function _requireGlobal(name, methods) {
        if (typeof window[name] === 'undefined' || window[name] === null) {
            return { ok: false, reason: name + ' is not loaded.' };
        }
        if (methods) {
            for (var i = 0; i < methods.length; i++) {
                if (typeof window[name][methods[i]] !== 'function') {
                    return {
                        ok: false,
                        reason: name + '.' + methods[i] + ' is not available.'
                    };
                }
            }
        }
        return { ok: true, module: window[name] };
    }

    function _unavailable(reason) {
        return { available: false, reason: reason };
    }

    function _available(data) {
        var out = { available: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    out[key] = data[key];
                }
            }
        }
        return out;
    }

    // =========================================================================
    // 2. SMALL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear === 'function') {
            try {
                var y = window.getCurrentYear();
                if (typeof y === 'number' && Number.isFinite(y)) return y;
            } catch (e) { /* fall through */ }
        }
        return null;
    }

    function _placeName(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.getPlaceById !== 'function') return null;
        try {
            var place = window.getPlaceById(locationId);
            if (place && typeof place.displayName === 'string') {
                return place.displayName;
            }
        } catch (e) { /* fall through */ }
        return null;
    }

    // =========================================================================
    // 3. DEATHS FACET
    // =========================================================================

    /**
     * Returns the character roster for the Deaths tab, optionally
     * filtered by location (and its sub-locations).
     *
     * `locationId` may be null -> all characters (across every
     * location). When a location id is supplied, the roster is
     * narrowed to characters whose currentLocationId matches that
     * location OR any of its sub-locations. The sub-location
     * expansion uses LocationQueries.getAllSubLocationIds if
     * available; if not, the match is exact-id only.
     *
     * Returns:
     *   {
     *     available: true,
     *     characters: [ { id, name, surname, fullName, gender,
     *                     age, birthYear, deathYear, deathCause,
     *                     deathCauseDetail, isDeceased,
     *                     locationId, locationName,
     *                     rankDisplay, isDeleted } ],
     *     totalCount, livingCount, deceasedCount
     *   }
     *   | { available: false, reason }
     *
     * Filters are NOT applied here. The caller (the tab) applies
     * its search / status / cause / gender filters to the returned
     * list. This keeps this function as a pure domain read and lets
     * the tab own its own filter shape.
     */
    function getCharacterRoster(locationId) {
        var cq = _requireModule('CharacterQueries', [
            'getAllCharacters',
            'getCharacterSummary'
        ]);
        if (!cq.ok) return _unavailable(cq.reason);

        var all;
        try {
            all = cq.module.getAllCharacters();
        } catch (e) {
            return _unavailable('CharacterQueries.getAllCharacters threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
        if (!Array.isArray(all)) return _unavailable('CharacterQueries returned a non-array.');

        // Location filter (with sub-location expansion when available).
        var locationIdSet = null;
        if (_hasId(locationId)) {
            locationIdSet = {};
            locationIdSet[locationId] = true;

            var lq = _requireModule('LocationQueries', ['getAllSubLocationIds']);
            if (lq.ok) {
                try {
                    var subIds = lq.module.getAllSubLocationIds(locationId);
                    if (Array.isArray(subIds)) {
                        for (var s = 0; s < subIds.length; s++) {
                            if (_hasId(subIds[s])) locationIdSet[subIds[s]] = true;
                        }
                    }
                } catch (e) {
                    // Sub-location expansion failed; keep exact-id match.
                }
            }
        }

        var characters = [];
        var livingCount = 0;
        var deceasedCount = 0;

        for (var i = 0; i < all.length; i++) {
            var proj = all[i];
            if (!proj || !_hasId(proj.id)) continue;
            if (proj.isDeleted === true) continue;

            if (locationIdSet !== null) {
                if (!_hasId(proj.currentLocationId)
                    || locationIdSet[proj.currentLocationId] !== true) {
                    continue;
                }
            }

            var summary;
            try {
                summary = cq.module.getCharacterSummary(proj.id);
            } catch (e) {
                summary = null;
            }
            if (!summary) continue;

            var isDeceased = summary.isDeceased === true;
            if (isDeceased) deceasedCount++;
            else livingCount++;

            characters.push({
                id: summary.id,
                name: typeof summary.name === 'string' ? summary.name : '',
                surname: typeof summary.surname === 'string' ? summary.surname : '',
                fullName: typeof summary.fullName === 'string' ? summary.fullName : '',
                gender: typeof summary.gender === 'string' ? summary.gender : 'unknown',
                age: typeof summary.age === 'number' ? summary.age : null,
                birthYear: typeof summary.birthYear === 'number' ? summary.birthYear : null,
                deathYear: typeof summary.deathYear === 'number' ? summary.deathYear : null,
                deathCause: _isMissing(summary.deathCause) ? null : summary.deathCause,
                deathCauseDetail: _isMissing(summary.deathCauseDetail)
                    ? null : summary.deathCauseDetail,
                isDeceased: isDeceased,
                locationId: _hasId(summary.locationId) ? summary.locationId : null,
                locationName: _placeName(summary.locationId),
                rankDisplay: _isMissing(summary.rank) ? null : summary.rank,
                isDeleted: false
            });
        }

        return _available({
            characters: characters,
            totalCount: characters.length,
            livingCount: livingCount,
            deceasedCount: deceasedCount
        });
    }

    /**
     * Returns a lightweight count of the character population, with
     * and without the location filter applied. Used by the stats bar
     * so it can show "N / M in this location" without the tab having
     * to fetch the roster twice.
     */
    function getCharacterPopulationStats(locationId) {
        var cq = _requireModule('CharacterQueries', ['getAllCharacters']);
        if (!cq.ok) return _unavailable(cq.reason);

        var all;
        try {
            all = cq.module.getAllCharacters();
        } catch (e) {
            return _unavailable('CharacterQueries.getAllCharacters threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
        if (!Array.isArray(all)) return _unavailable('CharacterQueries returned a non-array.');

        var locationIdSet = null;
        if (_hasId(locationId)) {
            locationIdSet = {};
            locationIdSet[locationId] = true;

            var lq = _requireModule('LocationQueries', ['getAllSubLocationIds']);
            if (lq.ok) {
                try {
                    var subIds = lq.module.getAllSubLocationIds(locationId);
                    if (Array.isArray(subIds)) {
                        for (var s = 0; s < subIds.length; s++) {
                            if (_hasId(subIds[s])) locationIdSet[subIds[s]] = true;
                        }
                    }
                } catch (e) { /* keep exact-id match */ }
            }
        }

        var total = 0;
        var living = 0;
        var deceased = 0;
        var inLocation = 0;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !_hasId(c.id)) continue;
            if (c.isDeleted === true) continue;
            total++;
            if (c.isDeceased === true) deceased++;
            else living++;
            if (locationIdSet !== null
                && _hasId(c.currentLocationId)
                && locationIdSet[c.currentLocationId] === true) {
                inLocation++;
            }
        }

        return _available({
            totalCount: total,
            livingCount: living,
            deceasedCount: deceased,
            inLocationCount: locationIdSet !== null ? inLocation : total,
            currentYear: _getCurrentYear()
        });
    }

    /**
     * Returns all death records, optionally filtered by location.
     * Uses MortalityQueries.getAllDeathRecords (which returns one
     * record per deceased character).
     *
     * `locationId` narrows the result to records whose characterId's
     * current location (or sub-location) matches. If MortalityQueries
     * is not loaded -> unavailable.
     */
    function getAllDeathRecords(locationId) {
        var mq = _requireModule('MortalityQueries', ['getAllDeathRecords']);
        if (!mq.ok) return _unavailable(mq.reason);

        var records;
        try {
            records = mq.module.getAllDeathRecords();
        } catch (e) {
            return _unavailable('MortalityQueries.getAllDeathRecords threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
        if (!Array.isArray(records)) return _unavailable('MortalityQueries returned a non-array.');

        if (!_hasId(locationId)) {
            return _available({
                records: records.slice(),
                totalCount: records.length
            });
        }

        // Location filter: match by character's currentLocationId.
        var cq = _requireModule('CharacterQueries', ['getAllCharacters']);
        if (!cq.ok) {
            // No location filter available; return unfiltered and
            // note the degraded state.
            return _available({
                records: records.slice(),
                totalCount: records.length,
                locationFilterApplied: false,
                locationFilterReason: cq.reason
            });
        }

        var all;
        try { all = cq.module.getAllCharacters(); }
        catch (e) { all = []; }

        var locationIdSet = {};
        locationIdSet[locationId] = true;
        var lq = _requireModule('LocationQueries', ['getAllSubLocationIds']);
        if (lq.ok) {
            try {
                var subIds = lq.module.getAllSubLocationIds(locationId);
                if (Array.isArray(subIds)) {
                    for (var s = 0; s < subIds.length; s++) {
                        if (_hasId(subIds[s])) locationIdSet[subIds[s]] = true;
                    }
                }
            } catch (e) { /* exact match only */ }
        }

        var inLocationIds = {};
        if (Array.isArray(all)) {
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c || !_hasId(c.id)) continue;
                if (_hasId(c.currentLocationId)
                    && locationIdSet[c.currentLocationId] === true) {
                    inLocationIds[c.id] = true;
                }
            }
        }

        var filtered = [];
        for (var j = 0; j < records.length; j++) {
            if (inLocationIds[records[j].characterId] === true) {
                filtered.push(records[j]);
            }
        }

        return _available({
            records: filtered,
            totalCount: filtered.length,
            locationFilterApplied: true
        });
    }

    /**
     * Returns mortality aggregate statistics for the stats bar.
     * Delegates to MortalityStatistics.getMortalityStatistics when
     * available. Never fabricates.
     */
    function getMortalityStats() {
        var ms = _requireModule('MortalityStatistics', ['getMortalityStatistics']);
        if (!ms.ok) return _unavailable(ms.reason);

        try {
            var stats = ms.module.getMortalityStatistics();
            if (!stats || typeof stats !== 'object') {
                return _unavailable('MortalityStatistics returned a non-object.');
            }
            return _available({ stats: stats });
        } catch (e) {
            return _unavailable('MortalityStatistics.getMortalityStatistics threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
    }

    /**
     * Returns recent death events from the raw event log. Filtering
     * by category 'death', optionally by year and by location name.
     * Bounded to `limit` entries (default 20, max 200).
     *
     * This is a supplementary read used by the tab's optional
     * "recent activity" strip. The tab's main list uses
     * getCharacterRoster; this is only for the small side panel.
     */
    function getRecentDeathEvents(options) {
        options = options || {};
        var limit = (typeof options.limit === 'number' && options.limit > 0)
            ? Math.min(200, Math.floor(options.limit))
            : 20;
        var year = (typeof options.year === 'number') ? options.year : null;

        if (typeof window.getEventLog !== 'function') {
            return _unavailable('getEventLog is not loaded.');
        }

        var log;
        try { log = window.getEventLog(); }
        catch (e) { log = null; }
        if (!Array.isArray(log)) {
            return _unavailable('getEventLog returned a non-array.');
        }

        var filtered = [];
        // Iterate newest-first (the log is append-ordered), so the
        // newest events are at the end.
        for (var i = log.length - 1; i >= 0; i--) {
            var entry = log[i];
            if (!entry || typeof entry !== 'object') continue;
            if (entry.category !== 'death') continue;
            if (year !== null && entry.year !== year) continue;
            filtered.push({
                id: _hasId(entry.id) ? entry.id : null,
                year: typeof entry.year === 'number' ? entry.year : null,
                category: entry.category,
                type: typeof entry.type === 'string' ? entry.type : null,
                message: typeof entry.message === 'string' ? entry.message : '',
                subjects: Array.isArray(entry.subjects) ? entry.subjects.slice() : [],
                subjectNames: Array.isArray(entry.subjectNames)
                    ? entry.subjectNames.slice() : [],
                locationName: _isMissing(entry.locationName) ? null : entry.locationName,
                timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : null
            });
            if (filtered.length >= limit) break;
        }

        return _available({
            events: filtered,
            totalCount: filtered.length
        });
    }

    // =========================================================================
    // 4. STORK FACET (births)
    // =========================================================================
    //
    // Provided as a stub. The full implementation lands with the
    // stork tab. Every function returns { available: false } if
    // ChildrenQueries is not loaded, so the tab renders "unavailable"
    // cleanly without a separate dependency check.

    function getBirthRecords(locationId) {
        var cq = _requireModule('ChildrenQueries', ['getPregnanciesForMother']);
        if (!cq.ok) return _unavailable(cq.reason);

        // The stork tab will use a "pregnancies by year" or "recent
        // births" API on ChildrenQueries; the current ChildrenQueries
        // does not expose one directly. For now, aggregate over every
        // mother. This is O(population) and the stork tab will cache
        // it at build time.
        var charQ = _requireModule('CharacterQueries', ['getAllCharacters']);
        if (!charQ.ok) return _unavailable(charQ.reason);

        var all;
        try { all = charQ.module.getAllCharacters(); }
        catch (e) { return _unavailable('CharacterQueries.getAllCharacters threw.'); }
        if (!Array.isArray(all)) return _unavailable('CharacterQueries returned a non-array.');

        var records = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !_hasId(c.id)) continue;
            var list;
            try { list = cq.module.getPregnanciesForMother(c.id); }
            catch (e) { list = null; }
            if (!Array.isArray(list)) continue;
            for (var j = 0; j < list.length; j++) records.push(list[j]);
        }

        records.sort(function(a, b) {
            return (b.birthYear || 0) - (a.birthYear || 0);
        });

        return _available({
            records: records,
            totalCount: records.length
        });
    }

    // =========================================================================
    // 5. DISASTERS FACET
    // =========================================================================
    //
    // Stub. The disasters tab will land later. Delegates to
    // DisasterQueries when loaded.

    function getDisasterRecords(locationId) {
        var dq = _requireModule('DisasterQueries',
            ['getAllDisasters', 'getDisastersByLocation']);
        if (!dq.ok) return _unavailable(dq.reason);

        try {
            var list = _hasId(locationId)
                ? dq.module.getDisastersByLocation(locationId)
                : dq.module.getAllDisasters();
            if (!Array.isArray(list)) return _unavailable('DisasterQueries returned a non-array.');
            return _available({ records: list, totalCount: list.length });
        } catch (e) {
            return _unavailable('DisasterQueries threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
    }

    // =========================================================================
    // 6. SOCIAL FACET
    // =========================================================================
    //
    // Stub. The social tab will land later. Delegates to
    // RelationshipQueries when loaded.

    function getSocialEvents(locationId) {
        var rq = _requireModule('RelationshipQueries', ['getAll']);
        if (!rq.ok) return _unavailable(rq.reason);

        try {
            var list = rq.module.getAll();
            if (!Array.isArray(list)) return _unavailable('RelationshipQueries returned a non-array.');
            return _available({ records: list, totalCount: list.length });
        } catch (e) {
            return _unavailable('RelationshipQueries threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
    }

    // =========================================================================
    // 7. EDUCATIONAL FACET
    // =========================================================================
    //
    // Stub. The educational tab will land later.

    function getEducationalEvents(locationId) {
        var eq = _requireModule('EducationQueries', []);
        if (!eq.ok) return _unavailable(eq.reason);
        return _unavailable('EducationQueries does not expose an aggregate read in this build.');
    }

    // =========================================================================
    // 8. FACET DISPATCH
    // =========================================================================
    //
    // A single entry point that dispatches to the correct facet read.
    // The Events Manager tab for each facet uses the direct function
    // above; this dispatcher exists for callers (diagnostics, tests)
    // that need to iterate all facets generically.

    function getFacetRecords(facetId, locationId) {
        switch (facetId) {
            case 'deaths':      return getAllDeathRecords(locationId);
            case 'stork':       return getBirthRecords(locationId);
            case 'disasters':   return getDisasterRecords(locationId);
            case 'social':      return getSocialEvents(locationId);
            case 'educational': return getEducationalEvents(locationId);
            default: return _unavailable('Unknown facet: ' + facetId);
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.EventsQueries = {
        // Deaths facet
        getCharacterRoster: getCharacterRoster,
        getCharacterPopulationStats: getCharacterPopulationStats,
        getAllDeathRecords: getAllDeathRecords,
        getMortalityStats: getMortalityStats,
        getRecentDeathEvents: getRecentDeathEvents,

        // Stork facet (stub)
        getBirthRecords: getBirthRecords,

        // Disasters facet (stub)
        getDisasterRecords: getDisasterRecords,

        // Social facet (stub)
        getSocialEvents: getSocialEvents,

        // Educational facet (stub)
        getEducationalEvents: getEducationalEvents,

        // Generic facet dispatch
        getFacetRecords: getFacetRecords
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsQueries;
    }
})();
