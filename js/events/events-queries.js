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
 *     stork       -> RomanceQueries / FamilyQueries /
 *                    ChildrenQueries / ChildrenRules
 *     adoption    -> ChildrenState / ChildrenQueries / CharacterQueries
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
 *   List-returning functions return [] on unavailability (they have
 *   nowhere to put the flag), and the tab is expected to call the
 *   accompanying summary function to distinguish "no results" from
 *   "unavailable".
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
 *   - window.CharacterQueries      (deaths + stork + adoption rosters)
 *   - window.RomanceQueries        (stork couple edges)
 *   - window.FamilyQueries         (stork existing children)
 *   - window.ChildrenQueries       (stork pregnancy count, adoption
 *                                   fallback if ChildrenState absent)
 *   - window.ChildrenState         (adoption records)
 *   - window.ChildrenRules         (stork fertility math)
 *   - window.LocationQueries       (sub-location expansion)
 *   - window.DisasterQueries       (disasters facet)
 *   - window.RelationshipQueries   (social facet)
 *   - window.EducationQueries      (educational facet)
 *   - window.getCurrentYear        (time.js)
 *   - window.getPlaceById          (accessors.js)
 *   - window.getEventLog           (accessors.js)
 *   - window.getRankById           (accessors.js)
 *
 *   NO function in this module throws for a missing optional
 *   dependency. Missing -> { available: false, reason: ... } or [].
 *
 * ICON POLICY: No emojis. No icons. Returns data; the tab renders.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision (Phase 3B):
 *     - Added the adoption facet's query set:
 *         getAdoptionRecords(locationId)
 *       reads every adoption metadata record via
 *       ChildrenState.allAdoptionIds() when available, or by
 *       iterating every character and calling
 *       ChildrenQueries.getAdoptionsForAdopter when it isn't.
 *       Records are enriched with child and adopter character
 *       summaries so the tab does not fetch summaries itself.
 *       Optional location filter restricts to adoptions where the
 *       CHILD's currentLocationId is in the location subtree.
 *     - Added _getAllAdoptionsRaw() private helper. It returns the
 *       raw adoption records (un-enriched), so getAdoptionRecords
 *       can distinguish "no records" from "records exist but
 *       couldn't be enriched".
 *     - getFacetRecords now dispatches 'adoption' to
 *       getAdoptionRecords.
 *     - No behavioural change to any deaths-facet or stork-facet
 *       function.
 *   Previous revision (Phase 3A):
 *     - Added the stork facet's query set: getFertileCouples,
 *       getCoupleChildrenSummaries.
 *   Initial revision:
 *     - Created with the deaths facet's read API and the facet
 *       stubs (getDisasterRecords, getSocialEvents,
 *       getEducationalEvents).
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

    function _fullNameOf(summary) {
        if (!summary) return '';
        var name = typeof summary.name === 'string' ? summary.name : '';
        var surname = typeof summary.surname === 'string' ? summary.surname : '';
        return (name + ' ' + surname).trim();
    }

    function _locationIdSetForFilter(locationId) {
        if (!_hasId(locationId)) return null;

        var set = {};
        set[locationId] = true;

        var lq = _requireModule('LocationQueries', ['getAllSubLocationIds']);
        if (lq.ok) {
            try {
                var subIds = lq.module.getAllSubLocationIds(locationId);
                if (Array.isArray(subIds)) {
                    for (var s = 0; s < subIds.length; s++) {
                        if (_hasId(subIds[s])) set[subIds[s]] = true;
                    }
                }
            } catch (e) { /* exact-id match only */ }
        }
        return set;
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
     * list.
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
        if (!Array.isArray(all)) {
            return _unavailable('CharacterQueries returned a non-array.');
        }

        var locationIdSet = _locationIdSetForFilter(locationId);

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
        if (!Array.isArray(all)) {
            return _unavailable('CharacterQueries returned a non-array.');
        }

        var locationIdSet = _locationIdSetForFilter(locationId);

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
        if (!Array.isArray(records)) {
            return _unavailable('MortalityQueries returned a non-array.');
        }

        if (!_hasId(locationId)) {
            return _available({
                records: records.slice(),
                totalCount: records.length
            });
        }

        var cq = _requireModule('CharacterQueries', ['getAllCharacters']);
        if (!cq.ok) {
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

        var locationIdSet = _locationIdSetForFilter(locationId);

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
     * Supplementary read used by the tab's optional "recent
     * activity" strip. The tab's main list uses getCharacterRoster;
     * this is only for the small side panel.
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
        // Iterate newest-first (the log is append-ordered).
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
    // 4. STORK FACET (bio children)
    // =========================================================================
    //
    // Reads through:
    //   - RomanceQueries.getActiveCommittedPartners(characterId) for
    //     the couple edge
    //   - FamilyQueries.getBiologicalChildIds(parentId) for existing
    //     children (biological, both-parent intersection)
    //   - ChildrenQueries.getPregnanciesForMother(motherId) for the
    //     pregnancy count (includes miscarriages/stillbirths)
    //   - ChildrenRules.calculateExpectedChildren +
    //     getExpectedRemainingChildren for the capacity estimate
    //
    // Returns { available, men, totalCouples, totalMen } where each
    // men entry is:
    //   {
    //     manId, manSummary,
    //     partners: [ { womanId, womanSummary, relationshipId,
    //                   relationshipType, relationshipStatus,
    //                   existingChildIds, existingChildCount,
    //                   existingPregnancyCount, fertileYears,
    //                   fertilityModifier, expectedTotal,
    //                   expectedRemaining, hasCapacity, isFertile } ]
    //   }

    function _getBiologicalChildrenForCouple(motherId, fatherId) {
        var fq = _requireModule('FamilyQueries', ['getBiologicalChildIds']);
        if (!fq.ok) return [];

        var motherKids;
        var fatherKids;
        try { motherKids = fq.module.getBiologicalChildIds(motherId); }
        catch (e) { motherKids = []; }
        try { fatherKids = fq.module.getBiologicalChildIds(fatherId); }
        catch (e) { fatherKids = []; }

        if (!Array.isArray(motherKids) || !Array.isArray(fatherKids)) return [];

        var fatherSet = {};
        for (var i = 0; i < fatherKids.length; i++) {
            if (_hasId(fatherKids[i])) fatherSet[fatherKids[i]] = true;
        }
        var out = [];
        for (var j = 0; j < motherKids.length; j++) {
            if (_hasId(motherKids[j]) && fatherSet[motherKids[j]] === true) {
                out.push(motherKids[j]);
            }
        }
        return out;
    }

    function _countPregnanciesForCouple(motherId, fatherId) {
        var cq = _requireModule('ChildrenQueries', ['getPregnanciesForMother']);
        if (!cq.ok) return null;
        var records;
        try { records = cq.module.getPregnanciesForMother(motherId); }
        catch (e) { return null; }
        if (!Array.isArray(records)) return null;

        var count = 0;
        for (var i = 0; i < records.length; i++) {
            if (records[i] && records[i].fatherId === fatherId) count++;
        }
        return count;
    }

    function _expectedChildrenForCouple(motherAge) {
        var cr = window.ChildrenRules;
        if (!cr
            || typeof cr.calculateExpectedChildren !== 'function'
            || !cr.FERTILITY_CONSTANTS) {
            return null;
        }
        var maxFertileAge = cr.FERTILITY_CONSTANTS.MAX_FERTILE_AGE;
        if (typeof motherAge !== 'number' || typeof maxFertileAge !== 'number') {
            return null;
        }
        var fertileYears = Math.max(0, maxFertileAge - motherAge);
        try {
            var expectedTotal = cr.calculateExpectedChildren({
                fertileYears: fertileYears,
                motherAgeAtStart: motherAge
            });
            return {
                fertileYears: fertileYears,
                expectedTotal: expectedTotal
            };
        } catch (e) {
            return null;
        }
    }

    function _expectedRemaining(expectedTotal, existingChildren) {
        var cr = window.ChildrenRules;
        if (!cr || typeof cr.getExpectedRemainingChildren !== 'function') {
            return null;
        }
        try {
            return cr.getExpectedRemainingChildren({
                expectedChildren: expectedTotal,
                existingChildren: existingChildren
            });
        } catch (e) {
            return null;
        }
    }

    function _sumChildren(manEntry) {
        var total = 0;
        for (var i = 0; i < manEntry.partners.length; i++) {
            total += manEntry.partners[i].existingChildCount;
        }
        return total;
    }

    function _rankPriorityOf(manSummary) {
        if (!manSummary || !_hasId(manSummary.rankId)) return 999;
        if (typeof window.getRankById !== 'function') return 999;
        var rank;
        try { rank = window.getRankById(manSummary.rankId); }
        catch (e) { return 999; }
        return (rank && typeof rank.priority === 'number') ? rank.priority : 999;
    }

    /**
     * Returns the fertile-couple roster, grouped by man. Each couple
     * is a living female in a committed romantic relationship with a
     * living male. Optionally filtered by location (with sub-location
     * expansion) and by the caller's filter flags.
     *
     * @param {string|null} locationId
     * @param {Object} [filters]
     * @param {boolean} [filters.fertileOnly=true]
     * @param {boolean} [filters.hasCapacityOnly=true]
     * @param {boolean} [filters.childlessOnly=false]
     * @param {string}  [filters.search='']
     * @param {string}  [filters.sortBy='rank']  'rank' | 'name' | 'children'
     *
     * @returns {{ available: boolean, reason?: string,
     *             men: Array, totalCouples: number, totalMen: number }}
     */
    function getFertileCouples(locationId, filters) {
        filters = filters || {};

        var rq = _requireModule('RomanceQueries', ['getActiveCommittedPartners']);
        if (!rq.ok) return _unavailable(rq.reason);

        var cq = _requireModule('CharacterQueries', [
            'getAllCharacters',
            'getCharacterSummary'
        ]);
        if (!cq.ok) return _unavailable(cq.reason);

        var all;
        try { all = cq.module.getAllCharacters(); }
        catch (e) { return _unavailable('CharacterQueries.getAllCharacters threw.'); }
        if (!Array.isArray(all)) {
            return _unavailable('CharacterQueries returned a non-array.');
        }

        var locationIdSet = _locationIdSetForFilter(locationId);

        var fertileOnly = filters.fertileOnly !== false;
        var hasCapacityOnly = filters.hasCapacityOnly !== false;
        var childlessOnly = filters.childlessOnly === true;
        var searchLower = (typeof filters.search === 'string')
            ? filters.search.trim().toLowerCase()
            : '';

        var cr = window.ChildrenRules;
        var minAge = (cr && cr.FERTILITY_CONSTANTS
            && typeof cr.FERTILITY_CONSTANTS.MIN_FERTILE_AGE === 'number')
            ? cr.FERTILITY_CONSTANTS.MIN_FERTILE_AGE
            : 14;
        var maxAge = (cr && cr.FERTILITY_CONSTANTS
            && typeof cr.FERTILITY_CONSTANTS.MAX_FERTILE_AGE === 'number')
            ? cr.FERTILITY_CONSTANTS.MAX_FERTILE_AGE
            : 47;
        var getModifier = (cr && typeof cr.getFertilityAgeModifier === 'function')
            ? cr.getFertilityAgeModifier
            : function () { return 1.0; };

        var menById = {};

        for (var i = 0; i < all.length; i++) {
            var femaleProj = all[i];
            if (!femaleProj || !_hasId(femaleProj.id)) continue;
            if (femaleProj.isDeleted === true) continue;
            if (femaleProj.isDeceased === true) continue;
            if (femaleProj.gender !== 'female') continue;

            if (locationIdSet !== null) {
                if (!_hasId(femaleProj.currentLocationId)
                    || locationIdSet[femaleProj.currentLocationId] !== true) {
                    continue;
                }
            }

            var femaleSummary;
            try { femaleSummary = cq.module.getCharacterSummary(femaleProj.id); }
            catch (e) { femaleSummary = null; }
            if (!femaleSummary) continue;
            if (femaleSummary.isDeceased === true) continue;

            var motherAge = (typeof femaleSummary.age === 'number')
                ? femaleSummary.age : null;
            if (typeof motherAge !== 'number') continue;

            var isFertile = motherAge >= minAge && motherAge <= maxAge;
            if (fertileOnly && !isFertile) continue;

            var partners;
            try { partners = rq.module.getActiveCommittedPartners(femaleProj.id); }
            catch (e) { partners = []; }
            if (!Array.isArray(partners)) continue;

            for (var p = 0; p < partners.length; p++) {
                var partner = partners[p];
                if (!partner || !_hasId(partner.partnerId)) continue;

                var maleSummary;
                try {
                    maleSummary = cq.module.getCharacterSummary(partner.partnerId);
                } catch (e) {
                    maleSummary = null;
                }
                if (!maleSummary) continue;
                if (maleSummary.isDeceased === true) continue;
                if (maleSummary.gender !== 'male') continue;

                var childIds = _getBiologicalChildrenForCouple(
                    femaleProj.id, partner.partnerId
                );
                var pregnancyCount = _countPregnanciesForCouple(
                    femaleProj.id, partner.partnerId
                );

                var expected = _expectedChildrenForCouple(motherAge);
                var expectedTotal = expected ? expected.expectedTotal : null;
                var expectedRemaining = expected
                    ? _expectedRemaining(expectedTotal, childIds.length)
                    : null;
                var hasCapacity = (typeof expectedRemaining === 'number')
                    ? expectedRemaining > 0
                    : isFertile; // fall back to fertility flag

                if (hasCapacityOnly && !hasCapacity) continue;
                if (childlessOnly && childIds.length > 0) continue;

                if (searchLower.length > 0) {
                    var manHay = ((maleSummary.name || '') + ' ' +
                                  (maleSummary.surname || '')).toLowerCase();
                    var womanHay = ((femaleSummary.name || '') + ' ' +
                                    (femaleSummary.surname || '')).toLowerCase();
                    if (manHay.indexOf(searchLower) === -1
                        && womanHay.indexOf(searchLower) === -1) {
                        continue;
                    }
                }

                var modifier = getModifier(motherAge);

                if (!menById[partner.partnerId]) {
                    menById[partner.partnerId] = {
                        manId: partner.partnerId,
                        manSummary: maleSummary,
                        partners: []
                    };
                }
                menById[partner.partnerId].partners.push({
                    womanId: femaleProj.id,
                    womanSummary: femaleSummary,
                    relationshipId: partner.relationshipId,
                    relationshipType: partner.type,
                    relationshipStatus: partner.status,
                    existingChildIds: childIds,
                    existingChildCount: childIds.length,
                    existingPregnancyCount: pregnancyCount,
                    fertileYears: expected ? expected.fertileYears : null,
                    fertilityModifier: modifier,
                    expectedTotal: expectedTotal,
                    expectedRemaining: expectedRemaining,
                    hasCapacity: hasCapacity,
                    isFertile: isFertile
                });
            }
        }

        var menArray = [];
        for (var manKey in menById) {
            if (!Object.prototype.hasOwnProperty.call(menById, manKey)) continue;
            menArray.push(menById[manKey]);
        }

        var sortBy = filters.sortBy || 'rank';

        menArray.sort(function(a, b) {
            if (sortBy === 'name') {
                return _fullNameOf(a.manSummary)
                    .localeCompare(_fullNameOf(b.manSummary));
            }
            if (sortBy === 'children') {
                var aTotal = _sumChildren(a);
                var bTotal = _sumChildren(b);
                if (aTotal !== bTotal) return aTotal - bTotal;
                return _fullNameOf(a.manSummary)
                    .localeCompare(_fullNameOf(b.manSummary));
            }
            // rank (default)
            var aRank = _rankPriorityOf(a.manSummary);
            var bRank = _rankPriorityOf(b.manSummary);
            if (aRank !== bRank) return aRank - bRank;
            return _fullNameOf(a.manSummary)
                .localeCompare(_fullNameOf(b.manSummary));
        });

        for (var m = 0; m < menArray.length; m++) {
            menArray[m].partners.sort(function(a, b) {
                if (a.existingChildCount !== b.existingChildCount) {
                    return a.existingChildCount - b.existingChildCount;
                }
                var ageA = (typeof a.womanSummary.age === 'number')
                    ? a.womanSummary.age : 9999;
                var ageB = (typeof b.womanSummary.age === 'number')
                    ? b.womanSummary.age : 9999;
                return ageA - ageB;
            });
        }

        var totalCouples = 0;
        for (var t = 0; t < menArray.length; t++) {
            totalCouples += menArray[t].partners.length;
        }

        return _available({
            men: menArray,
            totalCouples: totalCouples,
            totalMen: menArray.length
        });
    }

    /**
     * Returns the character summaries for every biological child of
     * the given couple, keyed by child id. Used by the stork tab to
     * shape the child circles without re-reading each summary from
     * the view-model layer.
     *
     * The returned object maps childId -> character summary. Missing
     * children (id present in the family graph but no projection) are
     * omitted; the caller renders the ones it has.
     */
    function getCoupleChildrenSummaries(motherId, fatherId) {
        var cq = _requireModule('CharacterQueries', ['getCharacterSummary']);
        if (!cq.ok) return _unavailable(cq.reason);

        var childIds = _getBiologicalChildrenForCouple(motherId, fatherId);
        var summaries = {};
        for (var i = 0; i < childIds.length; i++) {
            var summary;
            try { summary = cq.module.getCharacterSummary(childIds[i]); }
            catch (e) { summary = null; }
            if (summary) summaries[childIds[i]] = summary;
        }

        return _available({
            childIds: childIds,
            summaries: summaries
        });
    }

    // =========================================================================
    // 4b. ADOPTION FACET
    // =========================================================================
    //
    // Reads every adoption metadata record via
    // ChildrenState.allAdoptionIds() when available, or by iterating
    // every character and calling ChildrenQueries.getAdoptionsForAdopter
    // when it isn't. Records are the shape produced by
    // ChildrenState.getAdoptionCopy:
    //
    //   { id, childId, adopterId, type, status, year, endYear,
    //     notes, createdAt, updatedAt }
    //
    // The tab enriches them with child and adopter character summaries
    // (via CharacterQueries.getCharacterSummary) to render names,
    // ages, and location filters. That enrichment happens here so the
    // tab does not need to fetch summaries itself.
    //
    // Optional location filter: when locationId is supplied, restricts
    // to adoptions where the CHILD's currentLocationId is in the
    // location subtree (using the same LocationQueries expansion as
    // the deaths facet).
    //
    // FALLBACK NOTE:
    //   ChildrenState.allAdoptionIds is the preferred path. It is a
    //   flat id list backed by ChildrenState's own index and takes
    //   O(adoptions) rather than O(population). The fallback scans
    //   every character and calls getAdoptionsForAdopter, which is
    //   O(population). The fallback only fires when ChildrenState
    //   is absent or broken -- a legitimate reduced harness, not
    //   the production configuration.

    function _getAllAdoptionsRaw() {
        var ChS = _requireModule('ChildrenState', ['allAdoptionIds', 'getAdoptionCopy']);
        if (ChS.ok) {
            try {
                var ids = ChS.module.allAdoptionIds();
                if (Array.isArray(ids)) {
                    var out = [];
                    for (var i = 0; i < ids.length; i++) {
                        var rec = ChS.module.getAdoptionCopy(ids[i]);
                        if (rec) out.push(rec);
                    }
                    return { ok: true, records: out };
                }
            } catch (e) { /* fall through to population scan */ }
        }

        // Fallback: iterate characters, call getAdoptionsForAdopter.
        var cq = _requireModule('ChildrenQueries', ['getAdoptionsForAdopter']);
        if (!cq.ok) return { ok: false, reason: cq.reason };

        var chq = _requireModule('CharacterQueries', ['getAllCharacters']);
        if (!chq.ok) return { ok: false, reason: chq.reason };

        var all;
        try { all = chq.module.getAllCharacters(); }
        catch (e) {
            return { ok: false, reason: 'CharacterQueries.getAllCharacters threw.' };
        }
        if (!Array.isArray(all)) {
            return { ok: false, reason: 'CharacterQueries returned a non-array.' };
        }

        var seen = {};
        var records = [];
        for (var j = 0; j < all.length; j++) {
            var c = all[j];
            if (!c || !_hasId(c.id)) continue;
            var list;
            try { list = cq.module.getAdoptionsForAdopter(c.id); }
            catch (e) { list = []; }
            if (!Array.isArray(list)) continue;
            for (var k = 0; k < list.length; k++) {
                var r = list[k];
                if (!r || !_hasId(r.id)) continue;
                if (seen[r.id]) continue;
                seen[r.id] = true;
                records.push(r);
            }
        }
        return { ok: true, records: records };
    }

    /**
     * Returns the adoption records for the Adoption tab. Each record
     * is enriched with child and adopter character summaries.
     *
     * @param {string|null} locationId  null -> all locations
     * @returns {{
     *   available: boolean,
     *   reason?: string,
     *   records: Array<{
     *     id, childId, adopterId, type, status, year, endYear, notes,
     *     child: characterSummary|null,
     *     adopter: characterSummary|null
     *   }>,
     *   totalCount: number
     * }}
     */
    function getAdoptionRecords(locationId) {
        var cq = _requireModule('CharacterQueries', ['getCharacterSummary']);
        if (!cq.ok) return _unavailable(cq.reason);

        var raw = _getAllAdoptionsRaw();
        if (!raw.ok) return _unavailable(raw.reason);

        var locationIdSet = _locationIdSetForFilter(locationId);

        var records = [];
        for (var i = 0; i < raw.records.length; i++) {
            var r = raw.records[i];
            if (!r || !_hasId(r.id)) continue;

            var child = null;
            if (_hasId(r.childId)) {
                try { child = cq.module.getCharacterSummary(r.childId); }
                catch (e) { child = null; }
            }

            var adopter = null;
            if (_hasId(r.adopterId)) {
                try { adopter = cq.module.getCharacterSummary(r.adopterId); }
                catch (e) { adopter = null; }
            }

            if (locationIdSet !== null) {
                var childLoc = child && _hasId(child.locationId)
                    ? child.locationId : null;
                if (!childLoc || locationIdSet[childLoc] !== true) continue;
            }

            records.push({
                id: r.id,
                childId: r.childId,
                adopterId: r.adopterId,
                type: r.type,
                status: r.status,
                year: r.year,
                endYear: _isMissing(r.endYear) ? null : r.endYear,
                notes: typeof r.notes === 'string' ? r.notes : '',
                child: child,
                adopter: adopter
            });
        }

        // Sort by year descending (newest first), then by id for
        // stability. The tab re-sorts within type groups per its own
        // sortBy; this default ordering makes the pre-group order
        // deterministic and sensible even if a caller uses the raw
        // list.
        records.sort(function(a, b) {
            var ya = (typeof a.year === 'number') ? a.year : 0;
            var yb = (typeof b.year === 'number') ? b.year : 0;
            if (ya !== yb) return yb - ya;
            return a.id.localeCompare(b.id);
        });

        return _available({
            records: records,
            totalCount: records.length
        });
    }

    // =========================================================================
    // 5. DISASTERS FACET
    // =========================================================================

    function getDisasterRecords(locationId) {
        var dq = _requireModule('DisasterQueries',
            ['getAllDisasters', 'getDisastersByLocation']);
        if (!dq.ok) return _unavailable(dq.reason);

        try {
            var list = _hasId(locationId)
                ? dq.module.getDisastersByLocation(locationId)
                : dq.module.getAllDisasters();
            if (!Array.isArray(list)) {
                return _unavailable('DisasterQueries returned a non-array.');
            }
            return _available({ records: list, totalCount: list.length });
        } catch (e) {
            return _unavailable('DisasterQueries threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
    }

    // =========================================================================
    // 6. SOCIAL FACET
    // =========================================================================

    function getSocialEvents(locationId) {
        var rq = _requireModule('RelationshipQueries', ['getAll']);
        if (!rq.ok) return _unavailable(rq.reason);

        try {
            var list = rq.module.getAll();
            if (!Array.isArray(list)) {
                return _unavailable('RelationshipQueries returned a non-array.');
            }
            return _available({ records: list, totalCount: list.length });
        } catch (e) {
            return _unavailable('RelationshipQueries threw: ' +
                (e && e.message ? e.message : 'unknown error'));
        }
    }

    // =========================================================================
    // 7. EDUCATIONAL FACET
    // =========================================================================

    function getEducationalEvents(locationId) {
        var eq = _requireModule('EducationQueries', []);
        if (!eq.ok) return _unavailable(eq.reason);
        return _unavailable(
            'EducationQueries does not expose an aggregate read in this build.'
        );
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
            case 'stork':       return getFertileCouples(locationId);
            case 'adoption':    return getAdoptionRecords(locationId);
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

        // Stork facet
        getFertileCouples: getFertileCouples,
        getCoupleChildrenSummaries: getCoupleChildrenSummaries,

        // Adoption facet
        getAdoptionRecords: getAdoptionRecords,

        // Disasters facet
        getDisasterRecords: getDisasterRecords,

        // Social facet (stub)
        getSocialEvents: getSocialEvents,

        // Educational facet (stub)
        getEducationalEvents: getEducationalEvents,

        // Generic facet dispatch
        getFacetRecords: getFacetRecords
    };

    window._eventsQueries = window.EventsQueries;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsQueries;
    }
})();
