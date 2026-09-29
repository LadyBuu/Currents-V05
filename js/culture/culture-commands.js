/**
 * =============================================================================
 * STILL WATERS - CULTURE COMMANDS
 * js/culture/culture-commands.js
 * =============================================================================
 *
 * All write operations for culture data.
 *
 * This module owns the mutation transaction. Every command follows the
 * same shape:
 *
 *     validate → clone → mutate canonical → rebuild indexes → save → notify
 *
 * It does NOT:
 *   - read through CultureState (State is for indexes, not for domain reads)
 *   - rebuild indexes incrementally (State.rebuildIndexes is authoritative)
 *   - invent defaults that should live in CultureConstants
 *   - emit presentation events (toasts, DOM events)
 *   - own the application save mechanism
 *   - know about places, religions, or characters directly
 *
 * Cross-domain side effects (e.g. clearing a deleted culture from Place
 * records) belong to a cascade layer, not to this file. When those
 * relationships exist, add CultureCascade rather than growing this module.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REQUIREMENT
    // =========================================================================
    //
    // Commands fail loudly when a required capability is missing. No
    // fallback ID generator, no localStorage escape hatch, no silent
    // empty-array substitutes.
    //

    function _requireMasterData() {
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error('CultureCommands requires window.masterData.');
        }
        if (!window.masterData.data) {
            throw new Error('CultureCommands requires masterData.data.');
        }
        return window.masterData;
    }

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
                'CultureCommands does not own persistence.'
            );
        }
        return window.saveMasterData;
    }

    function _requireCultureState() {
        if (!window.CultureState) {
            throw new Error('CultureCommands requires CultureState for index rebuilds.');
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
    // 2. CANONICAL ACCESS
    // =========================================================================

    function _getCulturesArray() {
        var master = _requireMasterData();
        if (!Array.isArray(master.data.cultures)) {
            master.data.cultures = [];
        }
        return master.data.cultures;
    }

    function _findCultureIndex(cultures, id) {
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === id) return i;
        }
        return -1;
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
     * Presentation-neutral post-transaction sequence.
     *
     * Commands rebuild indexes, save once, and notify once. They do not
     * decide UI behaviour or emit DOM events; that belongs at the boundary.
     */
    function _commit(cultures, eventType, payload) {
        var state = _requireCultureState();
        var save = _requireSaveMasterData();

        state.rebuildIndexes(cultures);
        save(true);

        state.notify({
            type: eventType,
            culture: payload || null
        });
    }

    // =========================================================================
    // 4. CREATE
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
        var cultures = _getCulturesArray();

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

        cultures.push(candidate);
        _commit(cultures, 'cultureCreated', candidate);

        return { success: true, data: candidate };
    }

    // =========================================================================
    // 5. UPDATE
    // =========================================================================

    /**
     * Updates an existing culture.
     *
     * The candidate is cloned, patched, and validated before any canonical
     * mutation happens. The canonical array is only replaced on success.
     *
     * @param {string} id
     * @param {Object} updates
     * @returns {{ success: boolean, data?: Object, reason?: string, errors?: Array }}
     */
    function updateCulture(id, updates) {
        if (!id) return { success: false, reason: 'Culture id is required' };
        updates = updates || {};

        var validation = _requireCultureValidation();
        var cultures = _getCulturesArray();

        var index = _findCultureIndex(cultures, id);
        if (index === -1) {
            return { success: false, reason: 'Culture not found' };
        }

        var existing = cultures[index];
        var candidate = _clone(existing);

        // Explicit update semantics: only the fields listed here are
        // mutable through this command. Each field is replaced whole,
        // except where explicitly noted.
        var mutableFields = [
            'name',
            'displayName',
            'description',
            'icon',
            'appearance',
            'mythology',
            'locations',
            'religions',
            'notes'
        ];

        for (var i = 0; i < mutableFields.length; i++) {
            var key = mutableFields[i];
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

            var value = updates[key];
            if (value === undefined) continue;

            if (key === 'locations' || key === 'religions') {
                candidate[key] = Array.isArray(value) ? value.slice() : [];
            } else if (key === 'appearance' || key === 'mythology') {
                // Replacement semantics, not merge semantics. Nested patch
                // operations belong in a dedicated command if they are
                // ever needed.
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

        candidate.updatedAt = Date.now();
        cultures[index] = candidate;

        _commit(cultures, 'cultureUpdated', candidate);

        return { success: true, data: candidate };
    }

    // =========================================================================
    // 6. DELETE
    // =========================================================================

    /**
     * Deletes a culture.
     *
     * Does NOT touch other domains' records. If a cascade is required
     * (clearing character.cultureId, place.cultureId, etc.), the caller
     * is responsible for invoking CultureCascade around this command.
     *
     * @param {string} id
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function deleteCulture(id) {
        if (!id) return { success: false, reason: 'Culture id is required' };

        var cultures = _getCulturesArray();
        var index = _findCultureIndex(cultures, id);
        if (index === -1) {
            return { success: false, reason: 'Culture not found' };
        }

        var removed = cultures[index];
        cultures.splice(index, 1);

        _commit(cultures, 'cultureDeleted', removed);

        return { success: true, data: removed };
    }

    // =========================================================================
    // 7. ASSOCIATION MANAGEMENT
    // =========================================================================
    //
    // These are thin wrappers over updateCulture that express intent and
    // keep the public API of Commands honest. They do not implement their
    // own mutation transaction — they delegate.
    //

    function addLocationToCulture(cultureId, locationId) {
        if (!locationId) return { success: false, reason: 'locationId is required' };

        var culture = _readCulture(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var current = Array.isArray(culture.locations) ? culture.locations.slice() : [];
        if (current.indexOf(locationId) === -1) current.push(locationId);

        return updateCulture(cultureId, { locations: current });
    }

    function removeLocationFromCulture(cultureId, locationId) {
        if (!locationId) return { success: false, reason: 'locationId is required' };

        var culture = _readCulture(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var current = Array.isArray(culture.locations) ? culture.locations.slice() : [];
        var idx = current.indexOf(locationId);
        if (idx !== -1) current.splice(idx, 1);

        return updateCulture(cultureId, { locations: current });
    }

    function addReligionToCulture(cultureId, religionId) {
        if (!religionId) return { success: false, reason: 'religionId is required' };

        var culture = _readCulture(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var current = Array.isArray(culture.religions) ? culture.religions.slice() : [];
        if (current.indexOf(religionId) === -1) current.push(religionId);

        return updateCulture(cultureId, { religions: current });
    }

    function removeReligionFromCulture(cultureId, religionId) {
        if (!religionId) return { success: false, reason: 'religionId is required' };

        var culture = _readCulture(cultureId);
        if (!culture) return { success: false, reason: 'Culture not found' };

        var current = Array.isArray(culture.religions) ? culture.religions.slice() : [];
        var idx = current.indexOf(religionId);
        if (idx !== -1) current.splice(idx, 1);

        return updateCulture(cultureId, { religions: current });
    }

    /**
     * Internal read for command-side decisions.
     *
     * Commands read canonical data directly; they do not use CultureState
     * for domain reads (that would re-couple the two layers).
     */
    function _readCulture(id) {
        if (!id) return null;
        var cultures = _getCulturesArray();
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === id) return cultures[i];
        }
        return null;
    }

    // =========================================================================
    // 8. APPEARANCE OPTIONS
    // =========================================================================
    //
    // These manipulate the appearance sub-structure. They follow the same
    // transaction shape as updateCulture and never mutate canonical data
    // in place.
    //

    function _withAppearance(cultureId, mutate) {
        var culture = _readCulture(cultureId);
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
    // 9. MYTHOLOGY
    // =========================================================================

    function updateMythology(cultureId, mythology) {
        if (!mythology || typeof mythology !== 'object') {
            return { success: false, reason: 'mythology must be an object' };
        }
        // Replacement semantics: callers submit the full mythology object.
        return updateCulture(cultureId, { mythology: mythology });
    }

    // =========================================================================
    // 10. PUBLIC API
    // =========================================================================

    window.CultureCommands = {
        // CRUD
        createCulture: createCulture,
        updateCulture: updateCulture,
        deleteCulture: deleteCulture,

        // Associations
        addLocationToCulture: addLocationToCulture,
        removeLocationFromCulture: removeLocationFromCulture,
        addReligionToCulture: addReligionToCulture,
        removeReligionFromCulture: removeReligionFromCulture,

        // Appearance
        addAppearanceOption: addAppearanceOption,
        removeAppearanceOption: removeAppearanceOption,
        updateAppearanceWeight: updateAppearanceWeight,

        // Mythology
        updateMythology: updateMythology
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureCommands;
    }

})();
