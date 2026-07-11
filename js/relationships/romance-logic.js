/**
 * =============================================================================
 * STILL WATERS - ROMANCE LOGIC
 * =============================================================================
 * 
 * Romance-specific business logic built on top of the relationship registry.
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS, RELATIONSHIP_ATTRIBUTES)
 *   - accessors.js (getCharacterById, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    function _addRelationshipAttribute(rel, attribute) {
        var currentAttrs = rel.metadata?.attributes || [];
        if (currentAttrs.indexOf(attribute) !== -1) return false;

        return _updateRelationship(rel.id, {
            metadata: {
                ...rel.metadata,
                attributes: [...currentAttrs, attribute]
            }
        });
    }

    function _removeRelationshipAttribute(rel, attribute) {
        var currentAttrs = rel.metadata?.attributes || [];
        if (currentAttrs.indexOf(attribute) === -1) return false;

        var newAttrs = currentAttrs.filter(function(a) { return a !== attribute; });
        return _updateRelationship(rel.id, {
            metadata: {
                ...rel.metadata,
                attributes: newAttrs
            }
        });
    }

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };
    var ATTRIBUTES = window.RELATIONSHIP_ATTRIBUTES || {};

    // =========================================================================
    // 4. RELATIONSHIP CREATION
    // =========================================================================

    function startCasualDating(charAId, charBId, options) {
        options = options || {};
        return _createRelationship(charAId, charBId, {
            type: ARCHETYPES.CASUAL_DATING,
            status: STATUS.ONGOING,
            startYear: options.startYear || _getCurrentYear(),
            metadata: {
                notes: options.notes || ''
            }
        });
    }

    function startOneNightStand(charAId, charBId, options) {
        options = options || {};
        return _createRelationship(charAId, charBId, {
            type: ARCHETYPES.ONE_NIGHT_STAND,
            status: STATUS.ONGOING,
            startYear: options.startYear || _getCurrentYear(),
            metadata: {
                isEphemeral: true,
                notes: options.notes || ''
            }
        });
    }

    function startCommittedRelationship(charAId, charBId, options) {
        options = options || {};
        var attributes = options.attributes || [];

        return _createRelationship(charAId, charBId, {
            type: ARCHETYPES.COMMITTED,
            status: STATUS.ONGOING,
            startYear: options.startYear || _getCurrentYear(),
            metadata: {
                attributes: attributes,
                notes: options.notes || ''
            }
        });
    }

    // =========================================================================
    // 5. MARRIAGE
    // =========================================================================

    function marryCharacters(charAId, charBId, options) {
        options = options || {};
        var marriageYear = options.marriageYear || _getCurrentYear();

        var relationship = _getRelationshipBetween(charAId, charBId);

        if (relationship) {
            if (relationship.type === ARCHETYPES.COMMITTED) {
                var success = _addRelationshipAttribute(relationship, ATTRIBUTES.MARRIED);
                if (success) {
                    _logEvent('romance', 'Marriage',
                        (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                        (_getCharacterById(charBId)?.name || 'Character') + ' were married in ' + marriageYear,
                        [_getCharacterById(charAId), _getCharacterById(charBId)]);
                }
                return _getRelationshipBetween(charAId, charBId);
            }
            return null;
        }

        var attributes = [ATTRIBUTES.MARRIED];
        if (options.attributes) {
            attributes = attributes.concat(options.attributes);
        }

        relationship = startCommittedRelationship(charAId, charBId, {
            startYear: marriageYear,
            attributes: attributes,
            notes: options.notes || 'Married'
        });

        if (relationship) {
            _logEvent('romance', 'Marriage',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + ' were married in ' + marriageYear,
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return relationship;
    }

    function isMarried(charAId, charBId) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.COMMITTED) return false;

        var attributes = relationship.metadata?.attributes || [];
        return attributes.indexOf(ATTRIBUTES.MARRIED) !== -1;
    }

    function divorce(charAId, charBId, options) {
        options = options || {};
        var relationship = _getRelationshipBetween(charAId, charBId);

        if (!relationship || !isMarried(charAId, charBId)) {
            return false;
        }

        var success = _removeRelationshipAttribute(relationship, ATTRIBUTES.MARRIED);

        if (success) {
            var divorceYear = options.divorceYear || _getCurrentYear();
            var reason = options.reason || 'Divorce';

            _logEvent('romance', 'Divorce',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + ' divorced in ' + divorceYear,
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return success;
    }

    // =========================================================================
    // 6. AFFAIRS
    // =========================================================================

    function createAffair(charAId, charBId, options) {
        options = options || {};
        var attributes = [ATTRIBUTES.SECRET];

        if (options.isScandalous) {
            attributes.push(ATTRIBUTES.SCANDALOUS);
        }
        if (options.attributes) {
            attributes = attributes.concat(options.attributes);
        }

        var relationship = startCommittedRelationship(charAId, charBId, {
            startYear: options.startYear || _getCurrentYear(),
            attributes: attributes,
            notes: options.notes || 'Secret affair'
        });

        if (relationship) {
            _logEvent('romance', 'Affair Created',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + ' began a secret affair',
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return relationship;
    }

    function isAffair(charAId, charBId) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.COMMITTED) return false;

        var attributes = relationship.metadata?.attributes || [];
        return attributes.indexOf(ATTRIBUTES.SECRET) !== -1;
    }

    function exposeAffair(charAId, charBId, options) {
        options = options || {};
        var relationship = _getRelationshipBetween(charAId, charBId);

        if (!relationship || !isAffair(charAId, charBId)) {
            return false;
        }

        var success = _removeRelationshipAttribute(relationship, ATTRIBUTES.SECRET);

        if (success && options.becameScandalous) {
            _addRelationshipAttribute(relationship, ATTRIBUTES.SCANDALOUS);
        }

        if (success) {
            _logEvent('romance', 'Affair Exposed',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + '\'s affair was exposed',
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return success;
    }

    // =========================================================================
    // 7. POLYAMORY
    // =========================================================================

    function canHaveMultiplePartners(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        var relationships = _getRelationshipsForCharacter(characterId, { activeOnly: true });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (rel.type === ARCHETYPES.COMMITTED) {
                var attrs = rel.metadata?.attributes || [];
                if (attrs.indexOf(ATTRIBUTES.POLYAMOROUS) !== -1) {
                    return true;
                }
            }
        }

        return false;
    }

    function makePolyamorous(charAId, charBId) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.COMMITTED) return false;

        return _addRelationshipAttribute(relationship, ATTRIBUTES.POLYAMOROUS) !== null;
    }

    // =========================================================================
    // 8. QUERIES
    // =========================================================================

    function getActiveRomanticRelationships(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, { activeOnly: true });

        return relationships.filter(function(r) {
            return r.type === ARCHETYPES.CASUAL_DATING ||
                   r.type === ARCHETYPES.ONE_NIGHT_STAND ||
                   r.type === ARCHETYPES.COMMITTED;
        });
    }

    function getAffairs(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, { activeOnly: true });

        return relationships.filter(function(r) {
            if (r.type !== ARCHETYPES.COMMITTED) return false;
            var attrs = r.metadata?.attributes || [];
            return attrs.indexOf(ATTRIBUTES.SECRET) !== -1;
        });
    }

    function getPrimaryPartner(characterId) {
        var relationships = getActiveRomanticRelationships(characterId);

        for (var i = 0; i < relationships.length; i++) {
            if (relationships[i].type === ARCHETYPES.COMMITTED) {
                var partnerId = relationships[i].participantA === characterId ?
                    relationships[i].participantB : relationships[i].participantA;
                return _getCharacterById(partnerId);
            }
        }

        return null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.RomanceLogic = {
        startCasualDating: startCasualDating,
        startOneNightStand: startOneNightStand,
        startCommittedRelationship: startCommittedRelationship,
        marryCharacters: marryCharacters,
        isMarried: isMarried,
        divorce: divorce,
        createAffair: createAffair,
        isAffair: isAffair,
        exposeAffair: exposeAffair,
        canHaveMultiplePartners: canHaveMultiplePartners,
        makePolyamorous: makePolyamorous,
        getActiveRomanticRelationships: getActiveRomanticRelationships,
        getAffairs: getAffairs,
        getPrimaryPartner: getPrimaryPartner
    };

    // Legacy aliases
    window.startCasualDating = startCasualDating;
    window.startOneNightStand = startOneNightStand;
    window.startCommittedRelationship = startCommittedRelationship;
    window.marryCharacters = marryCharacters;
    window.isMarried = isMarried;
    window.divorce = divorce;
    window.createAffair = createAffair;
    window.isAffair = isAffair;
    window.exposeAffair = exposeAffair;
    window.canHaveMultiplePartners = canHaveMultiplePartners;
    window.makePolyamorous = makePolyamorous;
    window.getActiveRomanticRelationships = getActiveRomanticRelationships;
    window.getAffairs = getAffairs;
    window.getPrimaryPartner = getPrimaryPartner;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RomanceLogic;
    }

})();