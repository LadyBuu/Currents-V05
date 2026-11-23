/**
 * =============================================================================
 * STILL WATERS - RELIGION STATE (religion-state.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-state.js
 *
 * Derived indexes, subscriptions, and mutation primitives for religion data.
 *
 * This module is deliberately boring.
 *
 * It owns:
 *   - derived lookup indexes (byId, byTrait, byLocation, byLeader, followers,
 *     gods, laws, places of worship)
 *   - mutation primitives that write canonical data and re-hydrate indexes
 *   - a subscription mechanism
 *
 * It does NOT own:
 *   - religion records                  (masterData.data.religions)
 *   - worship-place records             (masterData.data.placesOfWorship)
 *   - persistence                      (ReligionCommands.persist is the
 *                                        single save site)
 *   - mutation policy                  (ReligionCommands; the primitives here
 *                                        are the mechanism, not the decision)
 *   - queries                          (ReligionQueries)
 *   - domain rules                     (ReligionRules)
 *   - validation                       (ReligionValidation)
 *   - UI state                         (ReligionUIState)
 *   - presentation                     (ReligionViewModels / ReligionRender)
 *
 * CANONICAL ARRAY OWNERSHIP
 * -------------------------
 *   masterData.data.religions and masterData.data.placesOfWorship are
 *   canonical stores. Religion and worship-place mutation primitives
 *   reassign their respective arrays rather than mutating the arrays
 *   held by callers. Derived indexes are rebuilt after every write.
 *
 *   religion.placesOfWorship remains an ID list linking each religion
 *   to its canonical place records; it is not the place-record store.
 *
 *   Prior revisions called religions.push(religion) / religions.splice()
 *   on the live array. A caller holding `masterData.data.religions` and
 *   iterating it during a mutation saw the array change mid-iteration
 *   (skipped records, out-of-bounds reads). Same bug class the
 *   settlement-queries.js SETTLEMENT DATA ACCESS CONTRACT flagged and
 *   role-state.js fixed.
 *
 * READ/WRITE CONTRACT
 * -------------------
 *     getById(id)                   → clone (public, safe)
 *     getByTrait(trait)             → clones
 *     getByLocation(locationId)     → clones
 *     getByLeader(characterId)      → clone
 *     getFollowersByReligion(id)    → slice() of live records the
 *                                     follower index holds (character
 *                                     domain owns them; cloned reads
 *                                     happen at religion-queries.js)
 *     getGodById(id)                → clone
 *     getLawById(id)                → clone
 *     getPlaceOfWorshipById(id)     → clone
 *     _getReligionCanonical(id)     → live record (commands only)
 *     _getGodCanonical(id)          → live record (commands only)
 *     _getLawCanonical(id)          → live record (commands only)
 *
 *     _addReligion(religion)        → commands only
 *     _updateReligion(id, record)   → commands only
 *     _removeReligion(id)           → commands only
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _addReligion / _updateReligion / _removeReligion no longer
 *       mutate masterData.data.religions in place. Every primitive
 *       builds a working copy, mutates the copy, then assigns
 *       masterData.data.religions = workingCopy. Stale references held
 *       by callers (including the enumerator used by
 *       religion-queries.js::_enumerateCanonicalReligions) are now
 *       snapshots, not aliases. Same guarantee role-state.js provides.
 *     - _getReligionCanonical / _getGodCanonical / _getLawCanonical
 *       continue to return the LIVE record the caller can mutate, but
 *       that record lives inside the working copy that gets reassigned
 *       — so mutating it via a canonical read is only safe if the
 *       caller immediately calls _updateReligion with the (re-built)
 *       copy. This was already the contract; the reassignment makes it
 *       observable in the by-reference case (a caller holding the old
 *       reference sees the OLD record, not the current one).
 *     - Header CANONICAL ARRAY OWNERSHIP section added.
 *     - _notifySubscriberError now routes through window.reportError
 *       when available (SettlementState's pattern) before falling back
 *       to console.error. Same diagnostic surface across domains.
 *     - No behavioral change to hydrateFromMasterData, the mutation
 *       policy, the subscriptions, or the diagnostics.
 *   Previous revisions:
 *     - Phase 3: removed _state.religions; renamed cache → indexes.
 *     - Phase 7: hydrateFromMasterData; public reads return clones;
 *       _getXCanonical accessors added; mutation primitives added;
 *       duplicate-id detection on hydrate; validateIntegrity;
 *       publish(eventName, data).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE STRUCTURE
    // =========================================================================

    // No canonical religion records held here. Only subscribers.
    var _subscribers = [];

    // Derived indexes. Rebuildable from masterData.data.religions,
    // masterData.data.placesOfWorship, and character records. Never
    // persisted as canonical data.
    var _indexes = {
        byId: new Map(),
        byTrait: new Map(),
        byLocation: new Map(),
        byLeader: new Map(),
        followersByReligion: new Map(),
        godsById: new Map(),
        lawsById: new Map(),
        placesOfWorshipById: new Map()
    };

    var _initialized = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'ReligionState requires accessors.getCharacters. ' +
                'Check script order or dependency wiring.'
            );
        }
        return window.getCharacters();
    }

    function _getCanonicalReligionsArray() {
        // Reads from the canonical store. Returns whatever the current
        // array reference is. After any mutation primitive runs, this
        // is a NEW array; callers holding a prior reference have a
        // snapshot. See CANONICAL ARRAY OWNERSHIP in the header.
        if (!window.masterData || !window.masterData.data) {
            return null;
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            // "Not ready" (null) is distinct from "empty" ([]).
            return null;
        }
        return window.masterData.data.religions;
    }

    function _setCanonicalReligionsArray(newArray) {
        // Reassign rather than mutate-in-place. Every mutation primitive
        // calls this with a working copy. See CANONICAL ARRAY OWNERSHIP.
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionState: masterData.data is not available. ' +
                'Cannot write canonical religions.'
            );
        }
        window.masterData.data.religions = newArray;
    }

    function _getCanonicalPlacesOfWorshipArray() {
        if (!window.masterData || !window.masterData.data) return null;
        return Array.isArray(window.masterData.data.placesOfWorship)
            ? window.masterData.data.placesOfWorship
            : null;
    }

    function _setCanonicalPlacesOfWorshipArray(newArray) {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionState: masterData.data is not available. ' +
                'Cannot write canonical places of worship.'
            );
        }
        window.masterData.data.placesOfWorship = newArray;
    }

    /**
     * One-time compatibility migration for legacy religion.placesOfWorship
     * ID arrays. The old implementation never persisted the full objects,
     * so only an explicitly incomplete placeholder can be created.
     */
    function _migrateLegacyWorshipPlaces(religions) {
        var places = _getCanonicalPlacesOfWorshipArray();
        if (places === null) {
            if (!window.masterData || !window.masterData.data) {
                throw new Error('ReligionState: masterData.data is unavailable during worship-place migration.');
            }
            places = [];
            _setCanonicalPlacesOfWorshipArray(places);
            _markDirty();
        } else {
            places = places.slice();
        }

        var byId = Object.create(null);
        for (var i = 0; i < places.length; i++) {
            var existing = places[i];
            if (existing && existing.id) byId[existing.id] = existing;
        }

        var migrated = 0;
        for (var r = 0; r < religions.length; r++) {
            var religion = religions[r];
            if (!religion || !Array.isArray(religion.placesOfWorship)) continue;
            for (var p = 0; p < religion.placesOfWorship.length; p++) {
                var placeId = religion.placesOfWorship[p];
                if (typeof placeId !== 'string' || !placeId) continue;
                if (byId[placeId]) {
                    if (byId[placeId].religionId &&
                        byId[placeId].religionId !== religion.id) {
                        throw new Error(
                            'ReligionState: worship place "' + placeId +
                            '" is associated with more than one religion.'
                        );
                    }
                    if (!byId[placeId].religionId) {
                        var repaired = _clone(byId[placeId]);
                        repaired.religionId = religion.id;
                        repaired.religionName = religion.name || '';
                        var repairedIndex = places.indexOf(byId[placeId]);
                        if (repairedIndex !== -1) places[repairedIndex] = repaired;
                        byId[placeId] = repaired;
                        migrated++;
                    }
                    continue;
                }

                var placeholder = {
                    id: placeId,
                    religionId: religion.id,
                    religionName: religion.name || '',
                    name: 'Unrecorded place of worship',
                    locationId: null,
                    locationName: '',
                    ownerType: null,
                    ownerId: null,
                    ownerName: '',
                    type: null,
                    isActive: false,
                    foundedYear: null,
                    headClergyId: null,
                    clergy: [],
                    producesIncome: false,
                    baseTithe: 0,
                    currentFollowers: 0,
                    annualIncome: 0,
                    wealth: 0,
                    collectedThisYear: 0,
                    features: [],
                    history: [],
                    notes: 'Legacy ID retained. Original place details were never stored and must be reconstructed.',
                    legacyUnresolved: true,
                    createdAt: null,
                    updatedAt: Date.now()
                };
                places.push(placeholder);
                byId[placeId] = placeholder;
                migrated++;
            }
        }

        if (migrated > 0) {
            _setCanonicalPlacesOfWorshipArray(places);
            _markDirty();
        }
        return migrated;
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); return; } catch (e) { /* fall through */ }
        }
        // Non-fatal. markDataDirty is a persistence hint, not the save.
    }

    // =========================================================================
    // 3. CLONE
    // =========================================================================

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    function _cloneArray(list) {
        if (!list) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 4. HYDRATION
    // =========================================================================

    /**
     * Rebuilds all derived indexes from canonical data.
     *
     * Called by:
     *   - ReligionCommands at the end of every mutation (via the State
     *     mutation primitive, which is called by the command)
     *   - ReligionBootstrap.init() at page load
     *   - Application-level reload / import
     *
     * NOT called by:
     *   - queries (they read; they don't mutate)
     *   - UI
     *
     * Returns true on success, false if canonical data is not yet ready.
     * Throws on duplicate ids (corrupted canonical data).
     */
    function hydrateFromMasterData() {
        var religions = _getCanonicalReligionsArray();

        if (religions === null) {
            // Canonical store not ready. Leave previous indexes intact
            // and let the caller decide when to retry.
            return false;
        }

        _migrateLegacyWorshipPlaces(religions);
        var canonicalWorshipPlaces = _getCanonicalPlacesOfWorshipArray();

        _indexes.byId = new Map();
        _indexes.byTrait = new Map();
        _indexes.byLocation = new Map();
        _indexes.byLeader = new Map();
        _indexes.godsById = new Map();
        _indexes.lawsById = new Map();
        _indexes.placesOfWorshipById = new Map();
        _indexes.followersByReligion = new Map();

        var seenIds = Object.create(null);

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (!religion || !religion.id) continue;

            if (seenIds[religion.id]) {
                throw new Error(
                    'ReligionState.hydrateFromMasterData: duplicate religion id "' +
                    religion.id + '". Canonical data is corrupted.'
                );
            }
            seenIds[religion.id] = true;

            _indexes.byId.set(religion.id, religion);

            if (religion.trait) {
                if (!_indexes.byTrait.has(religion.trait)) {
                    _indexes.byTrait.set(religion.trait, []);
                }
                _indexes.byTrait.get(religion.trait).push(religion);
            }

            if (Array.isArray(religion.locations)) {
                for (var j = 0; j < religion.locations.length; j++) {
                    var locationId = religion.locations[j];
                    if (!locationId) continue;
                    if (!_indexes.byLocation.has(locationId)) {
                        _indexes.byLocation.set(locationId, []);
                    }
                    _indexes.byLocation.get(locationId).push(religion);
                }
            }

            if (religion.leader && religion.leader.characterId) {
                _indexes.byLeader.set(religion.leader.characterId, religion);
            }

            if (Array.isArray(religion.gods)) {
                for (var k = 0; k < religion.gods.length; k++) {
                    var god = religion.gods[k];
                    if (god && god.id) {
                        _indexes.godsById.set(god.id, god);
                    }
                }
            }

            if (Array.isArray(religion.laws)) {
                for (var l = 0; l < religion.laws.length; l++) {
                    var law = religion.laws[l];
                    if (law && law.id) {
                        _indexes.lawsById.set(law.id, law);
                    }
                }
            }

        }

        // Worship-place records are canonical in their own collection.
        // Religion's ID array remains a compatibility/ownership index.
        var seenWorshipPlaceIds = Object.create(null);
        for (var w = 0; w < canonicalWorshipPlaces.length; w++) {
            var worshipPlace = canonicalWorshipPlaces[w];
            if (!worshipPlace || !worshipPlace.id) continue;
            if (seenWorshipPlaceIds[worshipPlace.id]) {
                throw new Error(
                    'ReligionState.hydrateFromMasterData: duplicate worship-place id "' +
                    worshipPlace.id + '". Canonical data is corrupted.'
                );
            }
            seenWorshipPlaceIds[worshipPlace.id] = true;
            _indexes.placesOfWorshipById.set(worshipPlace.id, worshipPlace);
        }

        _buildFollowersIndex();

        return true;
    }

    function rebuildIndexes() {
        return hydrateFromMasterData();
    }

    function refreshFromMasterData() {
        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            publish('refresh', null);
        }
        return ok;
    }

    function _buildFollowersIndex() {
        // Cross-domain: reads character records. Character records are
        // owned by the character domain. This index is derived state
        // that declares a dependency on that domain.
        _indexes.followersByReligion = new Map();

        var characters = _getCharacters();

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char && char.religionId) {
                if (!_indexes.followersByReligion.has(char.religionId)) {
                    _indexes.followersByReligion.set(char.religionId, []);
                }
                _indexes.followersByReligion.get(char.religionId).push(char);
            }
        }
    }

    function _invalidateFollowerIndex() {
        _buildFollowersIndex();
    }

    // =========================================================================
    // 5. PUBLIC READS (clones)
    // =========================================================================

    function getById(id) {
        if (!id) return null;
        var rec = _indexes.byId.get(id);
        return rec ? _clone(rec) : null;
    }

    function getByTrait(trait) {
        if (!trait) return [];
        return _cloneArray(_indexes.byTrait.get(trait) || []);
    }

    function getByLocation(locationId) {
        if (!locationId) return [];
        return _cloneArray(_indexes.byLocation.get(locationId) || []);
    }

    function getByLeader(characterId) {
        if (!characterId) return null;
        var rec = _indexes.byLeader.get(characterId);
        return rec ? _clone(rec) : null;
    }

    /**
     * Followers of a religion. Returns a slice of the follower index
     * entries (character records). The elements are LIVE character
     * records, not projections — this is documented behavior. Religion
     * queries that need projections call
     * window.getCharacterById(id) on each element (see
     * religion-queries.js::_projectFollowers).
     */
    function getFollowersByReligion(religionId) {
        if (!religionId) return [];
        var list = _indexes.followersByReligion.get(religionId) || [];
        return list.slice();
    }

    function getGodById(id) {
        if (!id) return null;
        var rec = _indexes.godsById.get(id);
        return rec ? _clone(rec) : null;
    }

    function getLawById(id) {
        if (!id) return null;
        var rec = _indexes.lawsById.get(id);
        return rec ? _clone(rec) : null;
    }

    function _projectWorshipPlace(place) {
        if (!place) return null;
        var projected = _clone(place);
        var religion = place.religionId ? _indexes.byId.get(place.religionId) : null;
        if (religion) projected.religionName = religion.name;
        return projected;
    }

    function getPlaceOfWorshipById(placeId) {
        if (!placeId) return null;
        var rec = _indexes.placesOfWorshipById.get(placeId);
        return rec ? _projectWorshipPlace(rec) : null;
    }

    function getPlacesOfWorshipByReligion(religionId) {
        if (!religionId || !_indexes.byId.has(religionId)) return [];
        var result = [];
        _indexes.placesOfWorshipById.forEach(function (place) {
            if (place && place.religionId === religionId) {
                result.push(_projectWorshipPlace(place));
            }
        });
        return result;
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (!locationId) return [];
        var result = [];
        _indexes.placesOfWorshipById.forEach(function (place) {
            if (place && place.locationId === locationId) result.push(_projectWorshipPlace(place));
        });
        return result;
    }

    function _getPlaceOfWorshipCanonical(placeId) {
        if (!placeId) return null;
        return _indexes.placesOfWorshipById.get(placeId) || null;
    }

    function _addPlaceOfWorship(religionId, place) {
        if (!religionId || !place || !place.id) {
            throw new Error('ReligionState._addPlaceOfWorship requires religionId and a place with id.');
        }
        if (_indexes.placesOfWorshipById.has(place.id)) {
            throw new Error('ReligionState._addPlaceOfWorship: place id already exists: ' + place.id);
        }
        var religion = _indexes.byId.get(religionId);
        if (!religion) throw new Error('ReligionState._addPlaceOfWorship: religion not found: ' + religionId);
        if (place.religionId !== religionId) {
            throw new Error('ReligionState._addPlaceOfWorship: place religionId mismatch.');
        }

        var religions = _buildWorkingCopy();
        var religionIndex = -1;
        for (var i = 0; i < religions.length; i++) {
            if (religions[i] && religions[i].id === religionId) { religionIndex = i; break; }
        }
        if (religionIndex === -1) throw new Error('ReligionState._addPlaceOfWorship: religion not found.');

        var religionCopy = _clone(religions[religionIndex]);
        var ids = Array.isArray(religionCopy.placesOfWorship)
            ? religionCopy.placesOfWorship.slice()
            : [];
        ids.push(place.id);
        religionCopy.placesOfWorship = ids;
        religionCopy.updatedAt = Date.now();
        religions[religionIndex] = religionCopy;

        var places = _getCanonicalPlacesOfWorshipArray().slice();
        places.push(_clone(place));
        _setCanonicalReligionsArray(religions);
        _setCanonicalPlacesOfWorshipArray(places);
        hydrateFromMasterData();
        _markDirty();
        return place;
    }

    function _updatePlaceOfWorship(placeId, place) {
        if (!placeId || !place || place.id !== placeId) {
            throw new Error('ReligionState._updatePlaceOfWorship requires a matching place id.');
        }
        var current = _indexes.placesOfWorshipById.get(placeId);
        if (!current) throw new Error('ReligionState._updatePlaceOfWorship: place not found: ' + placeId);
        if (place.religionId !== current.religionId) {
            throw new Error('ReligionState._updatePlaceOfWorship: religion ownership cannot be changed.');
        }
        var places = _getCanonicalPlacesOfWorshipArray().slice();
        var index = -1;
        for (var i = 0; i < places.length; i++) {
            if (places[i] && places[i].id === placeId) { index = i; break; }
        }
        if (index === -1) throw new Error('ReligionState._updatePlaceOfWorship: canonical record missing.');
        places[index] = _clone(place);
        _setCanonicalPlacesOfWorshipArray(places);
        hydrateFromMasterData();
        _markDirty();
        return place;
    }

    function _clearDeletedWorshipPlaceLocations(locationIds) {
        var removed = Object.create(null);
        if (Array.isArray(locationIds)) {
            for (var i = 0; i < locationIds.length; i++) {
                if (locationIds[i]) removed[locationIds[i]] = true;
            }
        }
        var current = _getCanonicalPlacesOfWorshipArray();
        if (!current) throw new Error('Canonical worship-place store is unavailable.');
        var places = current.slice();
        var changed = 0;
        var now = Date.now();

        for (var p = 0; p < places.length; p++) {
            var place = places[p];
            if (!place || !removed[place.locationId]) continue;
            var candidate = _clone(place);
            candidate.history = Array.isArray(candidate.history) ? candidate.history.slice() : [];
            candidate.history.push({
                type: 'locationRemoved',
                locationId: candidate.locationId,
                locationName: candidate.locationName || '',
                date: now
            });
            candidate.locationId = null;
            candidate.locationName = '';
            candidate.updatedAt = now;
            places[p] = candidate;
            changed++;
        }

        if (changed > 0) {
            _setCanonicalPlacesOfWorshipArray(places);
            hydrateFromMasterData();
            _markDirty();
        }
        return changed;
    }

    function _removePlaceOfWorship(placeId) {
        if (!placeId) throw new Error('ReligionState._removePlaceOfWorship requires an id.');
        var current = _indexes.placesOfWorshipById.get(placeId);
        if (!current) throw new Error('ReligionState._removePlaceOfWorship: place not found: ' + placeId);

        var religions = _buildWorkingCopy();
        var religionIndex = -1;
        for (var i = 0; i < religions.length; i++) {
            if (religions[i] && religions[i].id === current.religionId) { religionIndex = i; break; }
        }
        if (religionIndex === -1) throw new Error('ReligionState._removePlaceOfWorship: owning religion not found.');
        var religionCopy = _clone(religions[religionIndex]);
        religionCopy.placesOfWorship = (Array.isArray(religionCopy.placesOfWorship)
            ? religionCopy.placesOfWorship : []).filter(function (id) { return id !== placeId; });
        religionCopy.updatedAt = Date.now();
        religions[religionIndex] = religionCopy;

        var places = _getCanonicalPlacesOfWorshipArray().filter(function (place) {
            return !place || place.id !== placeId;
        });
        _setCanonicalReligionsArray(religions);
        _setCanonicalPlacesOfWorshipArray(places);
        hydrateFromMasterData();
        _markDirty();
        return _clone(current);
    }

    function getIndexes() {
        return _indexes;
    }

    // =========================================================================
    // 6. CANONICAL READS (live records — commands only)
    // =========================================================================

    function _getReligionCanonical(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function _getGodCanonical(id) {
        if (!id) return null;
        return _indexes.godsById.get(id) || null;
    }

    function _getLawCanonical(id) {
        if (!id) return null;
        return _indexes.lawsById.get(id) || null;
    }

    // =========================================================================
    // 7. MUTATION PRIMITIVES (commands only)
    // =========================================================================
    //
    // These are the mechanism, not the decision. ReligionCommands decides
    // what to write and when; State executes and re-hydrates.
    //
    // CANONICAL ARRAY OWNERSHIP: every primitive builds a working copy,
    // mutates the copy, then reassigns masterData.data.religions. The
    // old array (held by any caller) becomes a stale snapshot. See the
    // header section.
    //

    function _buildWorkingCopy() {
        // Returns a slice of the canonical array (new array, same element
        // references). Caller is expected to replace elements or push /
        // splice, then call _setCanonicalReligionsArray(workingCopy).
        var religions = _getCanonicalReligionsArray();
        if (religions === null) {
            throw new Error(
                'ReligionState: canonical store not initialized. ' +
                'Cannot mutate religions.'
            );
        }
        return religions.slice();
    }

    function _addReligion(religion) {
        if (!religion || !religion.id) {
            throw new Error('ReligionState._addReligion requires a religion with an id.');
        }

        if (_indexes.byId.has(religion.id)) {
            throw new Error(
                'ReligionState._addReligion: religion id already exists: ' + religion.id
            );
        }

        var working = _buildWorkingCopy();
        working.push(religion);
        _setCanonicalReligionsArray(working);

        hydrateFromMasterData();
        _markDirty();
        return religion;
    }

    function _updateReligion(id, religion) {
        if (!id) {
            throw new Error('ReligionState._updateReligion requires an id.');
        }
        if (!religion || !religion.id) {
            throw new Error('ReligionState._updateReligion requires a religion with an id.');
        }
        if (religion.id !== id) {
            throw new Error(
                'ReligionState._updateReligion: id mismatch (' + id + ' vs ' + religion.id + ').'
            );
        }

        var working = _buildWorkingCopy();

        var index = -1;
        for (var i = 0; i < working.length; i++) {
            if (working[i] && working[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._updateReligion: religion not found: ' + id);
        }

        working[index] = religion;
        _setCanonicalReligionsArray(working);

        hydrateFromMasterData();
        _markDirty();
        return religion;
    }

    function _removeReligion(id) {
        if (!id) {
            throw new Error('ReligionState._removeReligion requires an id.');
        }

        var working = _buildWorkingCopy();

        var index = -1;
        for (var i = 0; i < working.length; i++) {
            if (working[i] && working[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._removeReligion: religion not found: ' + id);
        }

        var removed = working[index];
        working.splice(index, 1);
        _setCanonicalReligionsArray(working);

        hydrateFromMasterData();
        _markDirty();
        return removed;
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;

        _subscribers.push(callback);

        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    function publish(eventName, data) {
        var event = {
            type: eventName,
            data: data,
            timestamp: Date.now()
        };
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                _reportSubscriberError(e);
            }
        }
    }

    function notify(event) {
        if (!event || typeof event.type !== 'string') {
            publish('unknown', event);
            return;
        }
        publish(event.type, event.data !== undefined ? event.data : null);
    }

    function _reportSubscriberError(err) {
        // Prefer the DOM global error reporter (SettlementState's
        // pattern). Fall back to console.error. Never swallow.
        if (typeof window.reportError === 'function') {
            try { window.reportError(err); return; } catch (e) { /* fall through */ }
        }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[ReligionState] subscriber error', err);
        }
    }

    // =========================================================================
    // 9. INTEGRITY / DIAGNOSTICS
    // =========================================================================

    function validateIntegrity() {
        var findings = [];

        var religions;
        try {
            religions = _getCanonicalReligionsArray();
        } catch (e) {
            findings.push({ level: 'error', message: e.message });
            return findings;
        }

        if (religions === null) {
            findings.push({
                level: 'info',
                message: 'Canonical religion store not initialized yet.'
            });
            return findings;
        }

        if (religions.length === 0) {
            findings.push({
                level: 'info',
                message: 'No religions defined. This is a valid initial state.'
            });
        }

        var seenIds = Object.create(null);
        var knownReligionIds = Object.create(null);
        var worshipPlaceOwners = Object.create(null);

        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (!r) {
                findings.push({ level: 'warn', message: 'Null religion at index ' + i });
                continue;
            }
            if (!r.id) {
                findings.push({ level: 'error', message: 'Religion at index ' + i + ' has no id' });
                continue;
            }
            if (seenIds[r.id]) {
                findings.push({ level: 'error', message: 'Duplicate religion id: ' + r.id });
            }
            seenIds[r.id] = true;
            knownReligionIds[r.id] = true;

            if (typeof r.name !== 'string' || r.name.length === 0) {
                findings.push({ level: 'warn', message: 'Religion ' + r.id + ' has no name' });
            }

            var seenLocations = Object.create(null);
            if (Array.isArray(r.locations)) {
                for (var j = 0; j < r.locations.length; j++) {
                    var locationId = r.locations[j];
                    if (!locationId) {
                        findings.push({
                            level: 'warn',
                            message: 'Religion ' + r.id + ' has an empty location association.'
                        });
                        continue;
                    }
                    if (seenLocations[locationId]) {
                        findings.push({
                            level: 'warn',
                            message: 'Religion ' + r.id + ' has duplicate location association ' + locationId + '.'
                        });
                    }
                    seenLocations[locationId] = true;
                    if (typeof window.getPlaceById === 'function' &&
                        !window.getPlaceById(locationId)) {
                        findings.push({
                            level: 'error',
                            message: 'Religion ' + r.id + ' references missing location ' + locationId + '.'
                        });
                    }
                }
            }

            if (r.leader && r.leader.characterId &&
                r.leader.isActive !== false &&
                typeof window.getCharacterById === 'function' &&
                !window.getCharacterById(r.leader.characterId)) {
                findings.push({
                    level: 'error',
                    message: 'Religion ' + r.id + ' has an active leader referencing missing character ' +
                        r.leader.characterId + '.'
                });
            }

            var seenWorshipIds = Object.create(null);
            if (Array.isArray(r.placesOfWorship)) {
                for (var w = 0; w < r.placesOfWorship.length; w++) {
                    var worshipId = r.placesOfWorship[w];
                    if (!worshipId) continue;
                    if (seenWorshipIds[worshipId]) {
                        findings.push({
                            level: 'warn',
                            message: 'Religion ' + r.id + ' has duplicate place-of-worship id ' + worshipId + '.'
                        });
                    }
                    seenWorshipIds[worshipId] = true;
                    if (worshipPlaceOwners[worshipId] &&
                        worshipPlaceOwners[worshipId] !== r.id) {
                        findings.push({
                            level: 'error',
                            message: 'Worship place ' + worshipId +
                                ' is associated with multiple religions.'
                        });
                    }
                    worshipPlaceOwners[worshipId] = r.id;
                }
            }
        }

        var worshipPlaces = _getCanonicalPlacesOfWorshipArray() || [];
        var seenPlaceIds = Object.create(null);
        for (var wp = 0; wp < worshipPlaces.length; wp++) {
            var worshipPlace = worshipPlaces[wp];
            if (!worshipPlace || !worshipPlace.id) {
                findings.push({ level: 'error', message: 'Worship-place record at index ' + wp + ' has no id.' });
                continue;
            }
            if (seenPlaceIds[worshipPlace.id]) {
                findings.push({ level: 'error', message: 'Duplicate worship-place id: ' + worshipPlace.id + '.' });
            }
            seenPlaceIds[worshipPlace.id] = true;
            if (!knownReligionIds[worshipPlace.religionId]) {
                findings.push({
                    level: 'error',
                    message: 'Worship place ' + worshipPlace.id + ' references missing religion ' +
                        worshipPlace.religionId + '.'
                });
            }
            // Owner-domain lifecycle is deliberately restricted until
            // corresponding domains expose stable lookup/deletion hooks.
            // Legacy ID-only placeholders are incomplete by definition and
            // remain repairable through the explicit reconstruction flow.
            if (worshipPlace.legacyUnresolved !== true) {
                if (worshipPlace.ownerType !== 'state') {
                    findings.push({
                        level: 'error',
                        message: 'Worship place ' + worshipPlace.id +
                            ' has unsupported owner type ' + String(worshipPlace.ownerType) +
                            '; only state ownership is currently supported.'
                    });
                } else if (worshipPlace.ownerId !== undefined &&
                    worshipPlace.ownerId !== null && worshipPlace.ownerId !== '') {
                    findings.push({
                        level: 'error',
                        message: 'State-owned worship place ' + worshipPlace.id +
                            ' must not reference owner ID ' + worshipPlace.ownerId + '.'
                    });
                }
            }
            if (worshipPlace.locationId &&
                typeof window.getPlaceById === 'function' &&
                !window.getPlaceById(worshipPlace.locationId)) {
                findings.push({
                    level: 'error',
                    message: 'Worship place ' + worshipPlace.id + ' references missing location ' +
                        worshipPlace.locationId + '.'
                });
            }
            if (worshipPlaceOwners[worshipPlace.id] &&
                worshipPlaceOwners[worshipPlace.id] !== worshipPlace.religionId) {
                findings.push({
                    level: 'error',
                    message: 'Worship place ' + worshipPlace.id +
                        ' has a religion ownership mismatch.'
                });
            }
            if (!worshipPlaceOwners[worshipPlace.id]) {
                findings.push({
                    level: 'warn',
                    message: 'Worship place ' + worshipPlace.id +
                        ' is not referenced by its owning religion.'
                });
            }
            if (worshipPlace.headClergyId &&
                typeof window.getCharacterById === 'function' &&
                !window.getCharacterById(worshipPlace.headClergyId)) {
                findings.push({
                    level: 'error',
                    message: 'Worship place ' + worshipPlace.id + ' references missing head clergy ' +
                        worshipPlace.headClergyId + '.'
                });
            }
            if (Array.isArray(worshipPlace.clergy) &&
                typeof window.getCharacterById === 'function') {
                for (var clergyIndex = 0; clergyIndex < worshipPlace.clergy.length; clergyIndex++) {
                    var clergyEntry = worshipPlace.clergy[clergyIndex];
                    var clergyId = typeof clergyEntry === 'string'
                        ? clergyEntry
                        : (clergyEntry && (clergyEntry.characterId || clergyEntry.id));
                    if (clergyId && !window.getCharacterById(clergyId)) {
                        findings.push({
                            level: 'error',
                            message: 'Worship place ' + worshipPlace.id +
                                ' references missing clergy character ' + clergyId + '.'
                        });
                    }
                }
            }
        }

        for (var religionIndex = 0; religionIndex < religions.length; religionIndex++) {
            var ownerReligion = religions[religionIndex];
            if (!ownerReligion || !Array.isArray(ownerReligion.placesOfWorship)) continue;
            for (var linkedIndex = 0; linkedIndex < ownerReligion.placesOfWorship.length; linkedIndex++) {
                var linkedId = ownerReligion.placesOfWorship[linkedIndex];
                if (!seenPlaceIds[linkedId]) {
                    findings.push({
                        level: 'error',
                        message: 'Religion ' + ownerReligion.id +
                            ' references missing canonical worship place ' + linkedId + '.'
                    });
                }
            }
        }

        // Character records own religionId. Diagnose dangling references
        // without attempting to repair or rewrite character data here.
        var characters;
        try {
            characters = _getCharacters();
        } catch (characterError) {
            findings.push({
                level: 'warn',
                message: 'Could not inspect character religion references: ' +
                    (characterError && characterError.message
                        ? characterError.message
                        : String(characterError))
            });
            characters = [];
        }

        for (var c = 0; c < characters.length; c++) {
            var character = characters[c];
            if (!character || !character.religionId) continue;
            if (!knownReligionIds[character.religionId]) {
                findings.push({
                    level: 'error',
                    message: 'Character ' + (character.id || c) +
                        ' references missing religion ' + character.religionId + '.'
                });
            }
        }

        return findings;
    }

    function getIndexStats() {
        return {
            byId:                 _indexes.byId.size,
            byTrait:              _indexes.byTrait.size,
            byLocation:           _indexes.byLocation.size,
            byLeader:             _indexes.byLeader.size,
            followersByReligion:  _indexes.followersByReligion.size,
            godsById:             _indexes.godsById.size,
            lawsById:             _indexes.lawsById.size,
            placesOfWorshipById:  _indexes.placesOfWorshipById.size,
            subscriberCount:      _subscribers.length
        };
    }

    // =========================================================================
    // 10. INITIAL BUILD
    // =========================================================================

    function _init() {
        if (_initialized) return;

        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            return;
        }

        if (typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _init);
            } else {
                setTimeout(_init, 0);
            }
        }
    }

    _init();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('load', function() {
            if (!_initialized) _init();
        });
    }

    // =========================================================================
    // 11. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'religion-state.js loaded but window.getCharacters is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 12. PUBLIC API
    // =========================================================================

    window.ReligionState = {
        // ---- Lifecycle ----
        hydrateFromMasterData: hydrateFromMasterData,
        rebuildIndexes: rebuildIndexes,              // deprecated alias
        refreshFromMasterData: refreshFromMasterData, // deprecated alias

        // ---- Public reads (clones) ----
        getById: getById,
        getByTrait: getByTrait,
        getByLocation: getByLocation,
        getByLeader: getByLeader,
        getFollowersByReligion: getFollowersByReligion,
        getGodById: getGodById,
        getLawById: getLawById,
        getPlaceOfWorshipById: getPlaceOfWorshipById,
        getPlacesOfWorshipByReligion: getPlacesOfWorshipByReligion,
        getPlacesOfWorshipByLocation: getPlacesOfWorshipByLocation,

        // ---- Deprecated: raw index access ----
        getIndexes: getIndexes,

        // ---- Canonical reads (commands only) ----
        _getReligionCanonical: _getReligionCanonical,
        _getGodCanonical: _getGodCanonical,
        _getLawCanonical: _getLawCanonical,
        _getPlaceOfWorshipCanonical: _getPlaceOfWorshipCanonical,

        // ---- Mutation primitives (commands only) ----
        _addReligion: _addReligion,
        _updateReligion: _updateReligion,
        _removeReligion: _removeReligion,
        _addPlaceOfWorship: _addPlaceOfWorship,
        _updatePlaceOfWorship: _updatePlaceOfWorship,
        _removePlaceOfWorship: _removePlaceOfWorship,
        _clearDeletedWorshipPlaceLocations: _clearDeletedWorshipPlaceLocations,

        // ---- Subscriptions ----
        subscribe: subscribe,
        publish: publish,
        notify: notify,

        // ---- Cross-domain refresh ----
        invalidateFollowerIndex: _invalidateFollowerIndex,

        // ---- Diagnostics ----
        validateIntegrity: validateIntegrity,
        getIndexStats: getIndexStats
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionState: window.ReligionState };
    }

})();
