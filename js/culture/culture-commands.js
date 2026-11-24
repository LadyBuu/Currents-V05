/**
 * =============================================================================
 * STILL WATERS - CULTURE COMMANDS
 * js/culture/culture-commands.js
 * =============================================================================
 *
 * All write operations for culture data.
 *
 * Every command follows the same shape:
 *
 *     validate → clone → mutate via State primitives
 *              → hydrate → markDirty → publish → dispatchEvent
 *
 * Persistence is NOT part of that shape. Commands do not call saveMasterData
 * directly. The UI (or the caller) calls CultureCommands.persist() once per
 * batch. persist() is the single save call site in this module.
 *
 * It does NOT:
 *   - read through CultureState for domain reads (use _getCultureCanonical
 *     for live records during a transaction, nothing else)
 *   - rebuild indexes incrementally (State.hydrateFromMasterData is authoritative)
 *   - invent defaults that belong in CultureConstants
 *   - emit presentation events (toasts, DOM events for UI chrome)
 *   - own the application save mechanism (persist() delegates to window.saveMasterData)
 *   - mutate foreign-owned Character or Location records
 *
 * Culture owns its `locations` and `religions` association arrays. Their
 * referenced records are verified through read-only query APIs, and deleted
 * Location associations are reconciled here through
 * reconcileDeletedLocations(). Foreign-owned references such as
 * character.cultureId and place.cultureId are never mutated here; Culture
 * deletion refuses while those references remain.
 *
 * Cross-domain notification is via CustomEvent. CultureCommands dispatches
 * cultureCreated / cultureUpdated / cultureDeleted on window. Other domains
 * listen if they care. They do not get called directly from here.
 *
 * Cross-domain notification is via CustomEvent. CultureCommands dispatches
 * cultureCreated / cultureUpdated / cultureDeleted on window. Other domains
 * listen if they care. They do not get called directly from here.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. FIELD ALLOWLIST
    // =========================================================================
    //
    // updateCulture only accepts these top-level fields. Anything else is
    // rejected with a specific message so the caller knows immediately that
    // they're using the wrong door.
    //
    // Note: individual appearance categories and individual mythology fields
    // are NOT top-level culture fields. Appearance and mythology are whole-
    // object replacements. Sub-field mutation goes through the dedicated
    // helpers (addAppearanceOption, updateMythology, etc.), which enforce
    // their own structural rules.
    //
    // Culture has no cross-domain-owned fields in its canonical record. The
    // `locations` and `religions` arrays are the culture's own association
    // lists, not fields belonging to Location or Religion. Cross-domain
    // relationships (a place pointing at a culture via place.cultureId) live
    // on the other domain's record and must be mutated via that domain's
    // commands. There is no _DOMAIN_OWNED_FIELDS map because there is
    // nothing for it to hold.
    //

    var _ALLOWED_UPDATE_FIELDS = {
        name: true,
        displayName: true,
        description: true,
        icon: true,
        appearance: true,
        mythology: true,
        locations: true,
        religions: true,
        notes: true
    };

    // =========================================================================
    // 2. DEPENDENCY REQUIREMENT
    // =========================================================================

    function _requireGenerateId() {
        if (typeof window.generateId !== 'function') {
            throw new Error('CultureCommands requires window.generateId.');
        }
        return window.generateId;
    }

    function _requireSaveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error(
                'CultureCommands requires window.saveMasterData. ' +
                'persist() is the only call site.'
            );
        }
        return window.saveMasterData;
    }

    function _requireCultureState() {
        if (!window.CultureState) {
            throw new Error('CultureCommands requires CultureState.');
        }
        return window.CultureState;
    }

    function _requireCultureConstants() {
        if (!window.CULTURE_DEFAULT_APPEARANCE) {
            throw new Error(
                'CultureCommands requires CULTURE_DEFAULT_APPEARANCE from culture-constants.js.'
            );
        }
        return {
            defaultAppearance: window.CULTURE_DEFAULT_APPEARANCE,
            defaultMythology: window.CULTURE_DEFAULT_MYTHOLOGY || _emptyMythology()
        };
    }

    function _requireCultureValidation() {
        if (!window.CultureValidation) {
            throw new Error(
                'CultureCommands requires CultureValidation. ' +
                'Commands orchestrate validation; they do not implement it.'
            );
        }
        return window.CultureValidation;
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _emptyMythology() {
        return {
            creation: '',
            afterlife: '',
            keyDeities: [],
            keyEvents: [],
            cosmology: '',
            symbols: [],
            themes: []
        };
    }

    /**
     * Structural clone of plain JSON-compatible data.
     *
     * Commands must own the canonical objects they insert. Retaining
     * caller-owned references would let external code mutate canonical
     * state by accident.
     */
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

    /**
     * Post-transaction sequence.
     *
     * Commands re-hydrate indexes, mark data dirty, publish in-process,
     * and dispatch a cross-domain CustomEvent. They do not save.
     */
    function _commit(eventName, payload) {
        var state = _requireCultureState();

        state.hydrateFromMasterData();

        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* non-fatal */ }
        }

        state.publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, payload) {
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: { culture: payload }
            }));
        } catch (e) {
            // CustomEvent unavailable or dispatch failed. Non-fatal: the
            // in-process publish already fired, and other domains that
            // require the event will fail loudly on their own.
        }
    }

    // =========================================================================
    // 4. PERSIST
    // =========================================================================

    /**
     * Persists the current canonical state.
     *
     * The ONLY place in this module that calls saveMasterData. All command
     * calls leave the canonical data dirty; the caller decides when to save.
     *
     * Returns a result object rather than throwing, because a failed save
     * is a UI concern (toast) not a programming error.
     *
     * @returns {{ success: boolean, reason?: string }}
     */
    function persist() {
        var save;
        try {
            save = _requireSaveMasterData();
        } catch (e) {
            return { success: false, reason: e.message };
        }

        try {
            var result = save();
            return result === true
                ? { success: true }
                : { success: false, reason: 'saveMasterData returned false' };
        } catch (e) {
            return { success: false, reason: e.message || 'saveMasterData threw' };
        }
    }

    // =========================================================================
    // 5. CROSS-DOMAIN ASSOCIATION VALIDATION
    // =========================================================================

    function _validateAssociations(candidate) {
        var errors = [];
        var locations = candidate.locations || [];
        var religions = candidate.religions || [];

        if (locations.length > 0) {
            var lq = window.LocationQueries;
            if (!lq || typeof lq.getPlace !== 'function') {
                return {
                    valid: false,
                    errors: [{ field: 'locations', message: 'LocationQueries.getPlace is required to validate culture location associations.' }]
                };
            }
            for (var i = 0; i < locations.length; i++) {
                var place;
                try { place = lq.getPlace(locations[i]); }
                catch (e) {
                    return {
                        valid: false,
                        errors: [{ field: 'locations', message: 'Could not verify location "' + locations[i] + '": ' + (e.message || String(e)) }]
                    };
                }
                if (!place) errors.push({
                    field: 'locations',
                    message: 'Location does not exist: ' + locations[i]
                });
            }
        }

        if (religions.length > 0) {
            var rq = window.ReligionQueries;
            if (!rq || typeof rq.getReligion !== 'function') {
                return {
                    valid: false,
                    errors: [{ field: 'religions', message: 'ReligionQueries.getReligion is required to validate culture religion associations.' }]
                };
            }
            for (var j = 0; j < religions.length; j++) {
                var religion;
                try { religion = rq.getReligion(religions[j]); }
                catch (e) {
                    return {
                        valid: false,
                        errors: [{ field: 'religions', message: 'Could not verify religion "' + religions[j] + '": ' + (e.message || String(e)) }]
                    };
                }
                if (!religion) errors.push({
                    field: 'religions',
                    message: 'Religion does not exist: ' + religions[j]
                });
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 5. CREATE
    // =========================================================================

    /**
     * Creates a culture.
     *
     * @param {Object} data
     * @returns {{ success: boolean, data?: Object, reason?: string, errors?: Array }}
     */
    function createCulture(data) {
        data = data || {};

        var generateId = _requireGenerateId();
        var constants = _requireCultureConstants();
        var validation = _requireCultureValidation();
        var state = _requireCultureState();

        // Read the current canonical list for uniqueness validation. The
        // state primitive will re-read it on insert; reading here is only
        // for validating the candidate before any mutation.
        var cultures = _readCanonicalCultures();

        var now = Date.now();

        var candidate = {
            id: data.id || generateId('culture'),
            name: data.name,
            displayName: data.displayName,
            description: data.description !== undefined ? data.description : '',
            icon: data.icon,
            appearance: data.appearance !== undefined
                ? _clone(data.appearance)
                : _clone(constants.defaultAppearance),
            mythology: data.mythology !== undefined
                ? _clone(data.mythology)
                : _clone(constants.defaultMythology),
            locations: Array.isArray(data.locations) ? data.locations.slice() : [],
            religions: Array.isArray(data.religions) ? data.religions.slice() : [],
            notes: data.notes !== undefined ? data.notes : '',
            createdAt: now,
            updatedAt: now
        };

        var result = validation.validateCreate(candidate, { cultures: cultures });
        if (!result.valid) {
            return { success: false, reason: 'Validation failed', errors: result.errors };
        }

        var associationResult = _validateAssociations(candidate);
        if (!associationResult.valid) {
            return { success: false, reason: 'Cross-domain association validation failed', errors: associationResult.errors };
        }

        try {
            state._addCulture(candidate);
        } catch (e) {
            return { success: false, reason: e.message };
        }

        _commit('cultureCreated', candidate);

        return { success: true, data: candidate };
    }

    // =========================================================================
    // 6. UPDATE
    // =========================================================================

    /**
     * Updates an existing culture.
     *
     * The candidate is cloned, patched, and validated before any canonical
     * mutation happens. The canonical array is only replaced on success.
     *
     * Unknown top-level fields are rejected. Sub-field mutation of
     * appearance and mythology goes through the dedicated helpers.
     *
     * @param {string} id
     * @param {Object} updates
     * @returns {{ success: boolean, data?: Object, reason?: string, errors?: Array }}
     */
    function updateCulture(id, updates) {
        if (!id) return { success: false, reason: 'Culture id is required' };
        updates = updates || {};

        var validation = _requireCultureValidation();
        var state = _requireCultureState();

        // Reject unknown fields up front.
        for (var field in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
            if (!_ALLOWED_UPDATE_FIELDS[field]) {
                return {
                    success: false,
                    reason: 'Field "' + field + '" is not updatable via updateCulture.'
                };
            }
        }

        var existing = state._getCultureCanonical(id);
        if (!existing) {
            return { success: false, reason: 'Culture not found' };
        }

        var cultures = _readCanonicalCultures();
        var index = _findIndex(cultures, id);
        if (index === -1) {
            // State and canonical are out of sync. This is a bug in State,
            // not a normal failure mode. Be loud about it.
            return { success: false, reason: 'Culture index inconsistency for id: ' + id };
        }

        var candidate = _clone(existing);

        // Explicit update semantics: each allowlisted field is replaced whole,
        // except where explicitly noted. Nested patch operations belong in a
        // dedicated command if they are ever needed.
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

            var value = updates[key];
            if (value === undefined) continue;

            if (key === 'locations' || key === 'religions') {
                candidate[key] = Array.isArray(value) ? value.slice() : [];
            } else if (key === 'appearance' || key === 'mythology') {
                candidate[key] = value === null ? null : _clone(value);
            } else {
                candidate[key] = value;
            }
        }

        var result = validation.validateUpdate(candidate, {
            cultures: cultures,
            index: index
        });
        if (!result.valid) {
            return { success: false, reason: 'Validation failed', errors: result.errors };
        }

        var associationResult = _validateAssociations(candidate);
        if (!associationResult.valid) {
            return { success: false, reason: 'Cross-domain association validation failed', errors: associationResult.errors };
        }

        candidate.updatedAt = Date.now();

        try {
            state._updateCulture(id, candidate);
        } catch (e) {
            return { success: false, reason: e.message };
        }

        _commit('cultureUpdated', candidate);

        return { success: true, data: candidate };
    }

    // =========================================================================
    // 7. DELETE
    // =========================================================================

    /**
     * Deletes a culture.
     *
     * Does NOT touch other domains' records. Deletion is refused while
     * Characters or Locations still reference this Culture. Its owned Name
     * list is removed through NameCommands.reconcileDeletedCultures().
     *
     * @param {string} id
     * @returns {{ success: boolean, data?: Object, reason?: string, errors?: Array }}
     */
    function deleteCulture(id) {
        if (!id) return { success: false, reason: 'Culture id is required' };

        var validation = _requireCultureValidation();
        var state = _requireCultureState();
        var cultures = _readCanonicalCultures();
        var result = validation.validateDelete(id, { cultures: cultures });
        if (!result.valid) {
            return { success: false, reason: 'Validation failed', errors: result.errors };
        }

        var removed = state._getCultureCanonical(id);
        if (!removed) {
            return { success: false, reason: 'Culture index inconsistency for id: ' + id };
        }
        var snapshot = _clone(removed);

        // Refuse deletion while foreign-owned records still point at this
        // culture. Those records must be reassigned through their own domain.
        var characterQueries = window.CharacterQueries;
        if (!characterQueries || typeof characterQueries.getAllCharacters !== 'function') {
            return { success: false, reason: 'Cannot verify Character references: CharacterQueries.getAllCharacters is required.' };
        }
        var locationQueries = window.LocationQueries;
        if (!locationQueries || typeof locationQueries.getAllPlaces !== 'function') {
            return { success: false, reason: 'Cannot verify Location references: LocationQueries.getAllPlaces is required.' };
        }

        var characters;
        var places;
        try {
            characters = characterQueries.getAllCharacters();
            places = locationQueries.getAllPlaces();
        } catch (e) {
            return { success: false, reason: 'Could not verify dependent records: ' + (e.message || String(e)) };
        }
        if (!Array.isArray(characters) || !Array.isArray(places)) {
            return { success: false, reason: 'Could not verify dependent records: query results must be arrays.' };
        }

        var characterRefs = [];
        var locationRefs = [];
        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            if (!character || typeof character !== 'object') {
                return { success: false, reason: 'Could not verify Character references: malformed character record at index ' + i + '.' };
            }
            if (character.cultureId === id) characterRefs.push(character.id || null);
        }
        for (var j = 0; j < places.length; j++) {
            var place = places[j];
            if (!place || typeof place !== 'object') {
                return { success: false, reason: 'Could not verify Location references: malformed location record at index ' + j + '.' };
            }
            if (place.cultureId === id) locationRefs.push(place.id || null);
        }

        if (characterRefs.length || locationRefs.length) {
            return {
                success: false,
                reason: 'Culture is still referenced by other domains. Reassign or clear these references before deletion.',
                references: {
                    characters: characterRefs,
                    characterCount: characterRefs.length,
                    locations: locationRefs,
                    locationCount: locationRefs.length
                }
            };
        }

        var data = window.masterData && window.masterData.data;
        var nameLists = data && data.nameLists;
        var hasNameList = !!(nameLists && Object.prototype.hasOwnProperty.call(nameLists, id));
        if (nameLists !== undefined && nameLists !== null &&
            (typeof nameLists !== 'object' || Array.isArray(nameLists))) {
            return { success: false, reason: 'Cannot safely reconcile Name data: masterData.data.nameLists is malformed.' };
        }
        if (hasNameList && (!window.NameCommands ||
            typeof window.NameCommands.reconcileDeletedCultures !== 'function')) {
            return { success: false, reason: 'Cannot safely delete Culture: NameCommands.reconcileDeletedCultures is required to remove its name data.' };
        }

        try {
            state._removeCulture(id);
        } catch (e) {
            return { success: false, reason: e.message };
        }

        if (hasNameList) {
            var nameResult;
            try {
                nameResult = window.NameCommands.reconcileDeletedCultures([id]);
            } catch (e) {
                nameResult = { success: false, reason: e.message || String(e) };
            }
            if (!nameResult || nameResult.success !== true) {
                // Restore the Culture if its owned Name data could not be
                // reconciled. Do not leave a half-deleted domain record.
                try { state._addCulture(snapshot); }
                catch (restoreError) {
                    return {
                        success: false,
                        reason: 'Name reconciliation failed and Culture rollback also failed: ' +
                            (restoreError.message || String(restoreError)),
                        reconciliationError: nameResult && nameResult.reason
                    };
                }
                return {
                    success: false,
                    reason: 'Name reconciliation failed; Culture deletion was rolled back.',
                    reconciliationError: nameResult && nameResult.reason
                };
            }
        }

        _commit('cultureDeleted', snapshot);
        return { success: true, data: snapshot };
    }

    // =========================================================================
    // 8. ASSOCIATION MANAGEMENT
    // =========================================================================
    //
    // These are thin wrappers over updateCulture that express intent and
    // keep the public API of Commands honest. They do not implement their
    // own mutation transaction — they delegate.
    //

    function addLocationToCulture(cultureId, locationId) {
        if (!locationId) return { success: false, reason: 'locationId is required' };
        return _withAssociation(cultureId, 'locations', function(list) {
            if (list.indexOf(locationId) === -1) list.push(locationId);
            return list;
        });
    }

    function removeLocationFromCulture(cultureId, locationId) {
        if (!locationId) return { success: false, reason: 'locationId is required' };
        return _withAssociation(cultureId, 'locations', function(list) {
            var idx = list.indexOf(locationId);
            if (idx !== -1) list.splice(idx, 1);
            return list;
        });
    }

    function addReligionToCulture(cultureId, religionId) {
        if (!religionId) return { success: false, reason: 'religionId is required' };
        return _withAssociation(cultureId, 'religions', function(list) {
            if (list.indexOf(religionId) === -1) list.push(religionId);
            return list;
        });
    }

    function removeReligionFromCulture(cultureId, religionId) {
        if (!religionId) return { success: false, reason: 'religionId is required' };
        return _withAssociation(cultureId, 'religions', function(list) {
            var idx = list.indexOf(religionId);
            if (idx !== -1) list.splice(idx, 1);
            return list;
        });
    }

    /**
     * Internal helper for association list mutation.
     *
     * Reads the canonical record for its current list, applies the mutator
     * to a slice, and passes the result through updateCulture. updateCulture
     * owns validation and the commit tail.
     */
    function _withAssociation(cultureId, field, mutate) {
        var state = _requireCultureState();
        var culture = state._getCultureCanonical(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var list = Array.isArray(culture[field]) ? culture[field].slice() : [];
        list = mutate(list);

        var updates = {};
        updates[field] = list;
        return updateCulture(cultureId, updates);
    }

    /**
     * Removes deleted Location IDs from Culture-owned location associations.
     * The complete batch is validated before any Culture record is changed.
     */
    function reconcileDeletedLocations(locationIds, options) {
        options = options || {};
        if (!Array.isArray(locationIds) || locationIds.length === 0) {
            return { success: false, reason: 'locationIds must be a non-empty array.' };
        }
        var removeSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            if (typeof locationIds[i] !== 'string' || !locationIds[i].trim()) {
                return { success: false, reason: 'Every Location ID must be a non-empty string.' };
            }
            if (removeSet[locationIds[i]]) {
                return { success: false, reason: 'Duplicate Location ID: ' + locationIds[i] };
            }
            removeSet[locationIds[i]] = true;
        }

        var validation = _requireCultureValidation();
        var state = _requireCultureState();
        var cultures = _readCanonicalCultures();
        var staged = [];
        var removedAssociations = 0;

        for (var j = 0; j < cultures.length; j++) {
            var original = cultures[j];
            if (!original || typeof original !== 'object' || !original.id) {
                return { success: false, reason: 'Cannot safely reconcile Location associations: malformed Culture record at index ' + j + '.' };
            }
            if (original.locations !== undefined && original.locations !== null &&
                !Array.isArray(original.locations)) {
                return { success: false, reason: 'Cannot safely reconcile Location associations: Culture "' + original.id + '" has a malformed locations field.' };
            }

            var current = Array.isArray(original.locations) ? original.locations : [];
            var next = current.filter(function(locationId) {
                return !Object.prototype.hasOwnProperty.call(removeSet, locationId);
            });
            if (next.length === current.length) continue;

            var candidate = _clone(original);
            candidate.locations = next;
            var result = validation.validateUpdate(candidate, {
                cultures: cultures,
                index: j
            });
            if (!result.valid) {
                return {
                    success: false,
                    reason: 'Culture validation failed while reconciling "' + original.id + '".',
                    errors: result.errors
                };
            }
            var associations = _validateAssociations(candidate);
            if (!associations.valid) {
                return {
                    success: false,
                    reason: 'Remaining associations could not be verified for Culture "' + original.id + '".',
                    errors: associations.errors
                };
            }
            staged.push({ id: original.id, before: _clone(original), after: candidate });
            removedAssociations += current.length - next.length;
        }

        if (staged.length === 0) {
            return { success: true, data: { updatedCultureIds: [], removedAssociations: 0 } };
        }
        if (options.dryRun === true) {
            return {
                success: true,
                data: {
                    updatedCultureIds: staged.map(function(item) { return item.id; }),
                    removedAssociations: removedAssociations,
                    dryRun: true
                }
            };
        }

        var applied = [];
        try {
            for (var k = 0; k < staged.length; k++) {
                state._updateCulture(staged[k].id, staged[k].after);
                applied.push(staged[k]);
            }
        } catch (e) {
            var rollbackErrors = [];
            for (var r = applied.length - 1; r >= 0; r--) {
                try { state._updateCulture(applied[r].id, applied[r].before); }
                catch (rollbackError) {
                    rollbackErrors.push(applied[r].id + ': ' +
                        (rollbackError.message || String(rollbackError)));
                }
            }
            return {
                success: false,
                reason: 'Culture association reconciliation failed: ' + (e.message || String(e)),
                rollbackErrors: rollbackErrors
            };
        }

        var updatedIds = staged.map(function(item) { return item.id; });
        _commit('cultureLocationsReconciled', {
            locationIds: locationIds.slice(),
            updatedCultureIds: updatedIds,
            removedAssociations: removedAssociations
        });
        return {
            success: true,
            data: {
                updatedCultureIds: updatedIds,
                removedAssociations: removedAssociations
            }
        };
    }

    // =========================================================================
    // 9. APPEARANCE OPTIONS
    // =========================================================================
    //
    // These manipulate the appearance sub-structure. They follow the same
    // transaction shape as updateCulture and never mutate canonical data
    // in place.
    //

    function _withAppearance(cultureId, mutate) {
        var state = _requireCultureState();
        var culture = state._getCultureCanonical(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var appearance = culture.appearance ? _clone(culture.appearance) : {};
        mutate(appearance);
        return updateCulture(cultureId, { appearance: appearance });
    }

    function addAppearanceOption(cultureId, category, option) {
        if (!category) return { success: false, reason: 'category is required' };
        if (!option || typeof option.value === 'undefined') {
            return { success: false, reason: 'option must include a value' };
        }

        return _withAppearance(cultureId, function(appearance) {
            if (!Array.isArray(appearance[category])) appearance[category] = [];
            appearance[category].push({
                value: option.value,
                weight: typeof option.weight === 'number' ? option.weight : 1
            });
        });
    }

    function removeAppearanceOption(cultureId, category, value) {
        if (!category) return { success: false, reason: 'category is required' };

        return _withAppearance(cultureId, function(appearance) {
            if (!Array.isArray(appearance[category])) return;
            var list = appearance[category];
            for (var i = list.length - 1; i >= 0; i--) {
                if (list[i] && list[i].value === value) list.splice(i, 1);
            }
        });
    }

    function updateAppearanceWeight(cultureId, category, value, weight) {
        if (!category) return { success: false, reason: 'category is required' };
        if (typeof weight !== 'number' || weight < 0) {
            return { success: false, reason: 'weight must be a non-negative number' };
        }

        return _withAppearance(cultureId, function(appearance) {
            if (!Array.isArray(appearance[category])) return;
            var list = appearance[category];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].value === value) {
                    list[i].weight = weight;
                    return;
                }
            }
        });
    }

    // =========================================================================
    // 10. MYTHOLOGY
    // =========================================================================

    function updateMythology(cultureId, mythology) {
        if (!mythology || typeof mythology !== 'object') {
            return { success: false, reason: 'mythology must be an object' };
        }
        // Replacement semantics: callers submit the full mythology object.
        return updateCulture(cultureId, { mythology: mythology });
    }

    // =========================================================================
    // 11. INTERNAL READ
    // =========================================================================

    function _readCanonicalCultures() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('CultureCommands requires masterData.data.');
        }
        var cultures = window.masterData.data.cultures;
        if (!Array.isArray(cultures)) {
            window.masterData.data.cultures = [];
            return window.masterData.data.cultures;
        }
        return cultures;
    }

    function _findIndex(cultures, id) {
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === id) return i;
        }
        return -1;
    }

    // =========================================================================
    // 12. LOAD-TIME VERIFICATION
    // =========================================================================
    //
    // The plan says: "missing modules throw at load, not at call time."
    // Commands require every module in its dependency graph. Verifying here
    // means a broken script tag fails at page load, not on the first user
    // click.
    //

    (function _verifyLoadTimeDependencies() {
        if (typeof window.generateId !== 'function') {
            throw new Error(
                'culture-commands.js loaded but window.generateId is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.CultureState) {
            throw new Error(
                'culture-commands.js loaded but window.CultureState is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.CultureValidation) {
            throw new Error(
                'culture-commands.js loaded but window.CultureValidation is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.CULTURE_DEFAULT_APPEARANCE) {
            throw new Error(
                'culture-commands.js loaded but CULTURE_DEFAULT_APPEARANCE is missing. ' +
                'Check script tag order (culture-constants.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 13. PUBLIC API
    // =========================================================================

    window.CultureCommands = {
        // CRUD
        createCulture: createCulture,
        updateCulture: updateCulture,
        deleteCulture: deleteCulture,

        // Associations
        addLocationToCulture: addLocationToCulture,
        removeLocationFromCulture: removeLocationFromCulture,
        reconcileDeletedLocations: reconcileDeletedLocations,
        addReligionToCulture: addReligionToCulture,
        removeReligionFromCulture: removeReligionFromCulture,

        // Appearance
        addAppearanceOption: addAppearanceOption,
        removeAppearanceOption: removeAppearanceOption,
        updateAppearanceWeight: updateAppearanceWeight,

        // Mythology
        updateMythology: updateMythology,

        // Persistence
        persist: persist
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureCommands;
    }

})();
