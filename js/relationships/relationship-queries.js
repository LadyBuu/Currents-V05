/**
 * relationship-queries.js
 *
 * Semantic reads over RelationshipState.
 *
 * Every function returns defensive projections. Never a live record.
 * No mutation. No persistence. No domain policy. No interpretation of
 * status or attribute values beyond filtering by them.
 *
 * It contains:
 *   - direct record lookups (by id, by pair, by type, by participant)
 *   - active-record filters (status === 'ongoing')
 *   - existence checks
 *   - counts
 *
 * It does NOT contain:
 *   - any archetype-specific interpretation
 *   - any attribute interpretation (that lives in the owning domain)
 *   - any graph traversal (that lives in relationship-finder-queries.js)
 *   - any cultural logic
 *
 * Callers that need domain semantics (is this a marriage? is this an
 * affair? are these two friends?) call the owning domain's -queries.js.
 * This file only knows the raw schema.
 *
 * Load order: after relationship-state.js and relationship-types.js,
 * before relationship-commands.js.
 */

(function() {
    'use strict';

    var State = window.RelationshipState;
    var STATUS = window.RELATIONSHIP_STATUS;
    var TYPES = window.RELATIONSHIP_TYPES;

    if (!State || !STATUS || !TYPES) {
        throw new Error('relationship-queries.js: relationship-state.js, relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // FILTER
    //
    // Applies the standard options object to an array of projections.
    // Recognised options:
    //   type        string   archetype id
    //   status      string   status id
    //   activeOnly  boolean  status === 'ongoing'
    //   startYearMin number  inclusive
    //   startYearMax number  inclusive
    //   endYearMin   number  inclusive
    //   endYearMax   number  inclusive
    //   hasAttribute string  attribute id
    //
    // Unknown options are ignored. No coercion. `0` is preserved.
    // -------------------------------------------------------------------------

    function _applyFilters(records, options) {
        options = options || {};
        var out = [];

        var hasType        = options.type !== undefined;
        var hasStatus      = options.status !== undefined;
        var activeOnly     = options.activeOnly === true;
        var hasStartMin    = options.startYearMin !== undefined;
        var hasStartMax    = options.startYearMax !== undefined;
        var hasEndMin      = options.endYearMin !== undefined;
        var hasEndMax      = options.endYearMax !== undefined;
        var hasAttribute   = options.hasAttribute !== undefined;

        for (var i = 0; i < records.length; i++) {
            var r = records[i];

            if (hasType && r.type !== options.type) continue;
            if (hasStatus && r.status !== options.status) continue;
            if (activeOnly && r.status !== STATUS.ONGOING) continue;

            if (hasStartMin) {
                if (r.startYear === null) continue;
                if (r.startYear < options.startYearMin) continue;
            }
            if (hasStartMax) {
                if (r.startYear === null) continue;
                if (r.startYear > options.startYearMax) continue;
            }
            if (hasEndMin) {
                if (r.endYear === null) continue;
                if (r.endYear < options.endYearMin) continue;
            }
            if (hasEndMax) {
                if (r.endYear === null) continue;
                if (r.endYear > options.endYearMax) continue;
            }
            if (hasAttribute) {
                if (r.attributes.indexOf(options.hasAttribute) === -1) continue;
            }

            out.push(r);
        }
        return out;
    }

    function _fetchByIds(ids) {
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var rec = State.getRecordCopy(ids[i]);
            if (rec) out.push(rec);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // DIRECT LOOKUPS
    // -------------------------------------------------------------------------

    function getById(id) {
        if (typeof id !== 'string' || id.length === 0) return null;
        return State.getRecordCopy(id);
    }

    function exists(id) {
        if (typeof id !== 'string' || id.length === 0) return false;
        return State.hasId(id);
    }

    // -------------------------------------------------------------------------
    // BETWEEN TWO CHARACTERS
    // -------------------------------------------------------------------------

    function getBetween(a, b, options) {
        if (typeof a !== 'string' || typeof b !== 'string') return [];
        if (a === b) return [];
        var ids = State.idsForPair(a, b);
        return _applyFilters(_fetchByIds(ids), options);
    }

    function getBetweenOfType(a, b, type, options) {
        if (typeof type !== 'string') return [];
        var opts = Object.assign({}, options || {}, { type: type });
        return getBetween(a, b, opts);
    }

    function getActiveBetween(a, b) {
        return getBetween(a, b, { activeOnly: true });
    }

    function getActiveBetweenOfType(a, b, type) {
        return getBetweenOfType(a, b, type, { activeOnly: true });
    }

    function hasAnyBetween(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        if (a === b) return false;
        return State.idsForPair(a, b).length > 0;
    }

    function hasActiveBetween(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        if (a === b) return false;
        var ids = State.idsForPair(a, b);
        for (var i = 0; i < ids.length; i++) {
            var rec = State.getRecordCopy(ids[i]);
            if (rec && rec.status === STATUS.ONGOING) return true;
        }
        return false;
    }

    function hasActiveBetweenOfType(a, b, type) {
        if (typeof type !== 'string') return false;
        var ids = State.idsForPair(a, b);
        for (var i = 0; i < ids.length; i++) {
            var rec = State.getRecordCopy(ids[i]);
            if (rec && rec.type === type && rec.status === STATUS.ONGOING) return true;
        }
        return false;
    }

    function countBetween(a, b, options) {
        return getBetween(a, b, options).length;
    }

    // -------------------------------------------------------------------------
    // BY CHARACTER
    // -------------------------------------------------------------------------

    function getForCharacter(characterId, options) {
        if (typeof characterId !== 'string' || characterId.length === 0) return [];
        var ids = State.idsForCharacter(characterId);
        return _applyFilters(_fetchByIds(ids), options);
    }

    function getActiveForCharacter(characterId) {
        return getForCharacter(characterId, { activeOnly: true });
    }

    function countForCharacter(characterId, options) {
        return getForCharacter(characterId, options).length;
    }

    function countActiveForCharacter(characterId) {
        return getActiveForCharacter(characterId).length;
    }

    function countByTypeForCharacter(characterId, type) {
        if (typeof type !== 'string') return 0;
        return getForCharacter(characterId, { type: type }).length;
    }

    // -------------------------------------------------------------------------
    // BY TYPE
    // -------------------------------------------------------------------------

    function getByType(type, options) {
        if (typeof type !== 'string' || type.length === 0) return [];
        var opts = Object.assign({}, options || {}, { type: type });
        var ids = State.idsForType(type);
        return _applyFilters(_fetchByIds(ids), opts);
    }

    function getActiveByType(type) {
        return getByType(type, { activeOnly: true });
    }

    function countByType(type, options) {
        return getByType(type, options).length;
    }

    // -------------------------------------------------------------------------
    // ALL
    // -------------------------------------------------------------------------

    function getAll(options) {
        return _applyFilters(State.all(), options);
    }

    function getActive() {
        return getAll({ activeOnly: true });
    }

    function count(options) {
        return getAll(options).length;
    }

    // -------------------------------------------------------------------------
    // INDEX READ ACCESS
    //
    // Raw index reads without projection. Used by the finder and by
    // domain queries that need to iterate efficiently. Returned ids are
    // safe to hold; the projections are fetched per id.
    // -------------------------------------------------------------------------

    function idsForCharacter(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return [];
        return State.idsForCharacter(characterId);
    }

    function idsForType(type) {
        if (typeof type !== 'string' || type.length === 0) return [];
        return State.idsForType(type);
    }

    function idsForPair(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return [];
        if (a === b) return [];
        return State.idsForPair(a, b);
    }

    function allIds() {
        return State.allIds();
    }

    // -------------------------------------------------------------------------
    // CONVENIENCE: NEIGHBOR IDS
    //
    // Returns the distinct set of character ids directly connected to
    // characterId through any active or historical relationship record.
    // Used by the finder's BFS. No filtering by type or status here; the
    // caller applies options.
    // -------------------------------------------------------------------------

    function getNeighborIds(characterId, options) {
        var records = getForCharacter(characterId, options);
        var seen = {};
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var other = r.participantA === characterId ? r.participantB : r.participantA;
            if (!seen[other]) {
                seen[other] = true;
                out.push(other);
            }
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipQueries = {
        // Direct
        getById: getById,
        exists: exists,

        // Between
        getBetween: getBetween,
        getBetweenOfType: getBetweenOfType,
        getActiveBetween: getActiveBetween,
        getActiveBetweenOfType: getActiveBetweenOfType,
        hasAnyBetween: hasAnyBetween,
        hasActiveBetween: hasActiveBetween,
        hasActiveBetweenOfType: hasActiveBetweenOfType,
        countBetween: countBetween,

        // By character
        getForCharacter: getForCharacter,
        getActiveForCharacter: getActiveForCharacter,
        countForCharacter: countForCharacter,
        countActiveForCharacter: countActiveForCharacter,
        countByTypeForCharacter: countByTypeForCharacter,

        // By type
        getByType: getByType,
        getActiveByType: getActiveByType,
        countByType: countByType,

        // All
        getAll: getAll,
        getActive: getActive,
        count: count,

        // Raw index reads
        idsForCharacter: idsForCharacter,
        idsForType: idsForType,
        idsForPair: idsForPair,
        allIds: allIds,

        // Graph helper
        getNeighborIds: getNeighborIds
    };

})();
