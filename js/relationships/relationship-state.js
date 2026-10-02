/**
 * relationship-state.js
 *
 * Canonical storage and indexing for relationship entities.
 *
 * CONTRACT:
 *   - relationshipId is entity identity
 *   - (A,B) is index only; may map to multiple entities
 *   - No business logic, no validation beyond structural integrity
 *   - No persistence here; owner of mutation is relationship-commands.js
 *   - No mutation methods exposed; use relationship-commands.js
 *
 * LOAD ORDER: after relationship-types.js, before relationship-queries.js
 */

(function() {
    'use strict';

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!ARCHETYPES || !STATUS) {
        throw new Error('relationship-state.js: relationship-types.js must load first');
    }

    // Canonical entity store
    var _entities = new Map();           // id → entity
    var _byCharacter = new Map();         // charId → Set<id>
    var _byType = new Map();              // type → Set<id>
    var _byPair = new Map();              // pairKey → Set<id>

    function _pairKey(a, b) {
        return a < b ? a + '|' + b : b + '|' + a;
    }

    function _addToIndex(map, key, id) {
        var set = map.get(key);
        if (!set) {
            set = new Set();
            map.set(key, set);
        }
        set.add(id);
    }

    function _removeFromIndex(map, key, id) {
        var set = map.get(key);
        if (!set) return;
        set.delete(id);
        if (set.size === 0) map.delete(key);
    }

    /**
     * Returns null if structurally invalid.
     * Does NOT perform domain validation.
     * Caller must supply all required fields.
     */
    function register(entity) {
        if (!entity || !entity.id) return null;
        if (_entities.has(entity.id)) return null;
        if (!entity.participantA || !entity.participantB) return null;
        if (entity.participantA === entity.participantB) return null;
        if (!entity.type) return null;

        _entities.set(entity.id, entity);

        _addToIndex(_byCharacter, entity.participantA, entity.id);
        _addToIndex(_byCharacter, entity.participantB, entity.id);
        _addToIndex(_byType, entity.type, entity.id);
        _addToIndex(_byPair, _pairKey(entity.participantA, entity.participantB), entity.id);

        return entity;
    }

    function unregister(id) {
        var entity = _entities.get(id);
        if (!entity) return false;

        _entities.delete(id);
        _removeFromIndex(_byCharacter, entity.participantA, id);
        _removeFromIndex(_byCharacter, entity.participantB, id);
        _removeFromIndex(_byType, entity.type, id);
        _removeFromIndex(_byPair, _pairKey(entity.participantA, entity.participantB), id);

        return true;
    }

    function get(id) {
        return _entities.get(id) || null;
    }

    function idsForCharacter(characterId) {
        var set = _byCharacter.get(characterId);
        return set ? Array.from(set) : [];
    }

    function idsForType(type) {
        var set = _byType.get(type);
        return set ? Array.from(set) : [];
    }

    function idsForPair(a, b) {
        var set = _byPair.get(_pairKey(a, b));
        return set ? Array.from(set) : [];
    }

    function allIds() {
        return Array.from(_entities.keys());
    }

    function all() {
        return Array.from(_entities.values());
    }

    /**
     * Replaces the entire state. Used by loading/migration.
     * Does not validate.
     */
    function replaceAll(entities) {
        _entities.clear();
        _byCharacter.clear();
        _byType.clear();
        _byPair.clear();
        var list = entities || [];
        for (var i = 0; i < list.length; i++) {
            register(list[i]);
        }
    }

    function clear() {
        _entities.clear();
        _byCharacter.clear();
        _byType.clear();
        _byPair.clear();
    }

    function size() {
        return _entities.size;
    }

    window.RelationshipState = {
        register: register,
        unregister: unregister,
        get: get,
        idsForCharacter: idsForCharacter,
        idsForType: idsForType,
        idsForPair: idsForPair,
        allIds: allIds,
        all: all,
        replaceAll: replaceAll,
        clear: clear,
        size: size,
        pairKey: _pairKey
    };

})();
