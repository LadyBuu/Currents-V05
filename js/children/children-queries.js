/**
 * =============================================================================
 * STILL WATERS - CHILDREN QUERIES (js/core/children/children-queries.js)
 * =============================================================================
 * 
 * All read operations for children (birth, adoption, surrogacy).
 * - NO side effects
 * - NO mutations
 * - Pure queries
 * - FAMILY ACCESSORS - Uses FamilyAccessors for family relationship queries
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - family-accessors.js (FamilyAccessors) - NEW
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.ChildrenState !== 'undefined' ? window.ChildrenState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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

    // =========================================================================
    // 3. FAMILY ACCESSORS WRAPPER (NEW)
    // =========================================================================

    function _getFamilyAccessors() {
        return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
    }

    function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getAllChildren === 'function') {
            var result = fa.getAllChildren(parentId, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getParentsViaFamilyAccessors(childId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getParents === 'function') {
            return fa.getParents(childId);
        }
        return null;
    }

    function _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSiblings === 'function') {
            var result = fa.getSiblings(childId, includeHalfSiblings !== false, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getGrandparentsViaFamilyAccessors(childId, generation) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandparents === 'function') {
            return fa.getGrandparents(childId, generation || 1);
        }
        return null;
    }

    function _getGrandchildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandchildren === 'function') {
            return fa.getGrandchildren(parentId, includeDeceased || false);
        }
        return null;
    }

    function _getSpousesViaFamilyAccessors(characterId, activeOnly) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSpouses === 'function') {
            var result = fa.getSpouses(characterId, activeOnly !== false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getRelationshipDescriptionViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getRelationshipDescription === 'function') {
            return fa.getRelationshipDescription(id1, id2);
        }
        return null;
    }

    function _getConsanguinityDegreeViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getConsanguinityDegree === 'function') {
            return fa.getConsanguinityDegree(id1, id2);
        }
        return null;
    }

    function _getFamilyStatisticsViaFamilyAccessors(characterId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getFamilyStatistics === 'function') {
            return fa.getFamilyStatistics(characterId);
        }
        return null;
    }

    // =========================================================================
    // 4. LEGACY FAMILY LOGIC WRAPPERS (Fallback)
    // =========================================================================

    function _getChildrenLegacy(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getChildren(characterId);
        }
        return null;
    }

    function _getParentsLegacy(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getParents(characterId);
        }
        return null;
    }

    function _getSiblingsLegacy(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getSiblings(characterId);
        }
        return null;
    }

    // =========================================================================
    // 5. UNIFIED FAMILY QUERIES (NEW - Using FamilyAccessors with fallback)
    // =========================================================================

    /**
     * Gets all children of a character (unified with fallbacks)
     * @param {string} parentId - Parent character ID
     * @param {boolean} includeDeceased - Include deceased children
     * @param {boolean} includeAdopted - Include adopted children
     * @returns {Array} Array of child characters
     */
    function _getChildrenUnified(parentId, includeDeceased, includeAdopted) {
        includeDeceased = includeDeceased || false;
        includeAdopted = includeAdopted !== false;

        // Prefer FamilyAccessors (core)
        var result = _getChildrenViaFamilyAccessors(parentId, includeDeceased);
        if (result !== null) {
            if (!includeAdopted) {
                var character = _getCharacterById(parentId);
                if (character) {
                    var biologicalIds = {};
                    if (character.children) {
                        for (var i = 0; i < character.children.length; i++) {
                            biologicalIds[character.children[i]] = true;
                        }
                    }
                    // Also check direct parent references
                    var allChars = _getCharacters();
                    for (var i = 0; i < allChars.length; i++) {
                        if (allChars[i].motherId === parentId || allChars[i].fatherId === parentId) {
                            biologicalIds[allChars[i].id] = true;
                        }
                    }
                    return result.filter(function(child) {
                        return biologicalIds[child.id];
                    });
                }
            }
            return result;
        }

        // Fallback to FamilyLogic (social system)
        result = _getChildrenLegacy(parentId);
        if (result !== null && result.length > 0) {
            return result;
        }

        // Ultimate fallback: direct data access
        var allChars = _getCharacters();
        var children = [];
        var seenIds = {};

        for (var i = 0; i < allChars.length; i++) {
            var child = allChars[i];
            if (child.id === parentId) continue;
            if (!includeDeceased && child.isDeceased) continue;

            // Check biological relationship
            var isBiological = child.motherId === parentId || child.fatherId === parentId;
            
            // Check adopted relationship
            var isAdopted = false;
            if (includeAdopted && child.adoptedParents) {
                for (var j = 0; j < child.adoptedParents.length; j++) {
                    if (child.adoptedParents[j].parentId === parentId && 
                        child.adoptedParents[j].status !== 'ended') {
                        isAdopted = true;
                        break;
                    }
                }
            }

            if (isBiological || (includeAdopted && isAdopted)) {
                if (!seenIds[child.id]) {
                    seenIds[child.id] = true;
                    children.push(child);
                }
            }
        }

        // Also check children array for backward compatibility
        var character = _getCharacterById(parentId);
        if (character && character.children) {
            for (var i = 0; i < character.children.length; i++) {
                var child = _getCharacterById(character.children[i]);
                if (child && (!includeDeceased || !child.isDeceased)) {
                    if (!seenIds[child.id]) {
                        seenIds[child.id] = true;
                        children.push(child);
                    }
                }
            }
        }

        return children;
    }

    /**
     * Gets parents of a character (unified with fallbacks)
     * @param {string} childId - Child character ID
     * @param {boolean} includeAdoptive - Include adoptive parents
     * @returns {Object} { father, mother, adoptiveParents: [] }
     */
    function _getParentsUnified(childId, includeAdoptive) {
        includeAdoptive = includeAdoptive || false;

        // Prefer FamilyAccessors (core)
        var result = _getParentsViaFamilyAccessors(childId);
        if (result !== null) {
            var response = {
                father: result.father || null,
                mother: result.mother || null,
                adoptiveParents: []
            };

            if (includeAdoptive) {
                var fa = _getFamilyAccessors();
                if (fa && typeof fa.getAllParents === 'function') {
                    var allParents = fa.getAllParents(childId, true);
                    if (allParents) {
                        response.adoptiveParents = allParents
                            .filter(function(p) { return !p.biological; })
                            .map(function(p) { return p.character; });
                    }
                }
            }

            return response;
        }

        // Fallback to FamilyLogic (social system)
        result = _getParentsLegacy(childId);
        if (result !== null) {
            var response = {
                father: result.father || null,
                mother: result.mother || null,
                adoptiveParents: []
            };

            if (includeAdoptive) {
                var child = _getCharacterById(childId);
                if (child && child.adoptedParents) {
                    for (var i = 0; i < child.adoptedParents.length; i++) {
                        if (child.adoptedParents[i].status !== 'ended') {
                            var parent = _getCharacterById(child.adoptedParents[i].parentId);
                            if (parent) {
                                response.adoptiveParents.push(parent);
                            }
                        }
                    }
                }
            }

            return response;
        }

        // Ultimate fallback: direct data access
        var child = _getCharacterById(childId);
        if (!child) return { father: null, mother: null, adoptiveParents: [] };

        var response = {
            father: child.fatherId ? _getCharacterById(child.fatherId) : null,
            mother: child.motherId ? _getCharacterById(child.motherId) : null,
            adoptiveParents: []
        };

        if (includeAdoptive && child.adoptedParents) {
            for (var i = 0; i < child.adoptedParents.length; i++) {
                if (child.adoptedParents[i].status !== 'ended') {
                    var parent = _getCharacterById(child.adoptedParents[i].parentId);
                    if (parent) {
                        response.adoptiveParents.push(parent);
                    }
                }
            }
        }

        return response;
    }

    /**
     * Gets siblings of a character (unified with fallbacks)
     * @param {string} childId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings
     * @param {boolean} includeDeceased - Include deceased siblings
     * @param {boolean} includeAdopted - Include adopted siblings
     * @returns {Array} Array of sibling characters
     */
    function _getSiblingsUnified(childId, includeHalfSiblings, includeDeceased, includeAdopted) {
        includeHalfSiblings = includeHalfSiblings !== false;
        includeDeceased = includeDeceased || false;
        includeAdopted = includeAdopted !== false;

        // Prefer FamilyAccessors (core)
        var result = _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased);
        if (result !== null) {
            if (!includeAdopted) {
                var character = _getCharacterById(childId);
                if (character) {
                    return result.filter(function(sibling) {
                        var sharesFather = character.fatherId && sibling.fatherId && 
                                          character.fatherId === sibling.fatherId;
                        var sharesMother = character.motherId && sibling.motherId && 
                                          character.motherId === sibling.motherId;
                        return sharesFather || sharesMother;
                    });
                }
            }
            return result;
        }

        // Fallback to FamilyLogic (social system)
        result = _getSiblingsLegacy(childId);
        if (result !== null && result.length > 0) {
            return result;
        }

        // Ultimate fallback: direct data access
        var character = _getCharacterById(childId);
        if (!character) return [];

        var allChars = _getCharacters();
        var siblings = [];
        var seenIds = {};

        for (var i = 0; i < allChars.length; i++) {
            var sibling = allChars[i];
            if (sibling.id === childId) continue;
            if (seenIds[sibling.id]) continue;
            if (!includeDeceased && sibling.isDeceased) continue;

            var sameFather = character.fatherId && sibling.fatherId && 
                             character.fatherId === sibling.fatherId;
            var sameMother = character.motherId && sibling.motherId && 
                             character.motherId === sibling.motherId;

            // Check adopted siblings
            var isAdoptedSibling = false;
            if (includeAdopted && sibling.adoptedParents) {
                for (var j = 0; j < sibling.adoptedParents.length; j++) {
                    if (sibling.adoptedParents[j].parentId === character.fatherId || 
                        sibling.adoptedParents[j].parentId === character.motherId) {
                        isAdoptedSibling = true;
                        break;
                    }
                }
            }

            if (sameFather && sameMother) {
                seenIds[sibling.id] = true;
                siblings.push(sibling);
            } else if (includeHalfSiblings && (sameFather || sameMother)) {
                seenIds[sibling.id] = true;
                siblings.push(sibling);
            } else if (includeAdopted && isAdoptedSibling) {
                seenIds[sibling.id] = true;
                siblings.push(sibling);
            }
        }

        return siblings;
    }

    // =========================================================================
    // 6. ADOPTION QUERIES (UPDATED)
    // =========================================================================

    /**
     * Gets all adoption records for a child
     * @param {string} childId - Child character ID
     * @returns {Array} Array of adoption records
     */
    function getAdoptionRecords(childId) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];
            return state.getAdoptionRecords(childId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all adoptive parents of a child
     * @param {string} childId - Child character ID
     * @returns {Array} Array of adoptive parent characters with metadata
     */
    function getAdoptiveParents(childId) {
        if (_processing) return [];
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllParents === 'function') {
                var allParents = fa.getAllParents(childId, true);
                if (allParents) {
                    return allParents
                        .filter(function(p) { return !p.biological; })
                        .map(function(p) {
                            return {
                                character: p.character,
                                type: p.adoptionType || 'legal',
                                year: p.adoptionYear || null,
                                parentType: p.type
                            };
                        });
                }
            }

            // Fallback: use state
            var state = _getState();
            if (!state) return [];

            var records = state.getAdoptiveParents(childId);
            var parents = [];

            for (var i = 0; i < records.length; i++) {
                var parent = _getCharacterById(records[i].parentId);
                if (parent) {
                    parents.push({
                        character: parent,
                        record: records[i]
                    });
                }
            }

            return parents;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all adopted children of a parent
     * @param {string} parentId - Parent character ID
     * @returns {Array} Array of adopted child characters with metadata
     */
    function getAdoptedChildren(parentId) {
        if (_processing) return [];
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllChildren === 'function') {
                var allChildren = fa.getAllChildren(parentId, false);
                if (allChildren) {
                    return allChildren
                        .filter(function(item) { return item.type === 'adopted'; })
                        .map(function(item) {
                            return {
                                character: item.character,
                                adoptionType: item.adoptionType || 'legal',
                                adoptionYear: item.adoptionYear || null
                            };
                        });
                }
            }

            // Fallback: use state
            var state = _getState();
            if (!state) return [];

            var childIds = state.getAdoptedChildren(parentId);
            var children = [];

            for (var i = 0; i < childIds.length; i++) {
                var child = _getCharacterById(childIds[i]);
                if (child) {
                    children.push(child);
                }
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a child is adopted
     * @param {string} childId - Child character ID
     * @returns {boolean} True if adopted
     */
    function isAdopted(childId) {
        if (_processing) return false;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllParents === 'function') {
                var allParents = fa.getAllParents(childId, true);
                if (allParents) {
                    for (var i = 0; i < allParents.length; i++) {
                        if (!allParents[i].biological) {
                            return true;
                        }
                    }
                    return false;
                }
            }

            // Fallback: use state
            var state = _getState();
            if (!state) return false;
            return state.isAdopted(childId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if someone is an adoptive parent
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {boolean} True if adoptive parent
     */
    function isAdoptiveParent(parentId, childId) {
        if (_processing) return false;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllParents === 'function') {
                var allParents = fa.getAllParents(childId, true);
                if (allParents) {
                    for (var i = 0; i < allParents.length; i++) {
                        if (!allParents[i].biological && allParents[i].character.id === parentId) {
                            return true;
                        }
                    }
                    return false;
                }
            }

            // Fallback: use state
            var records = getAdoptionRecords(childId);
            for (var i = 0; i < records.length; i++) {
                if (records[i].parentId === parentId && records[i].status !== 'ended') {
                    return true;
                }
            }
            return false;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the adoption type between a parent and child
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {string|null} Adoption type or null
     */
    function getAdoptionType(parentId, childId) {
        if (_processing) return null;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllParents === 'function') {
                var allParents = fa.getAllParents(childId, true);
                if (allParents) {
                    for (var i = 0; i < allParents.length; i++) {
                        if (!allParents[i].biological && allParents[i].character.id === parentId) {
                            return allParents[i].adoptionType || 'legal';
                        }
                    }
                    return null;
                }
            }

            // Fallback: use records
            var records = getAdoptionRecords(childId);
            for (var i = 0; i < records.length; i++) {
                if (records[i].parentId === parentId && records[i].status !== 'ended') {
                    return records[i].type;
                }
            }
            return null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the adoption year between a parent and child
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {number|null} Adoption year or null
     */
    function getAdoptionYear(parentId, childId) {
        if (_processing) return null;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getAllParents === 'function') {
                var allParents = fa.getAllParents(childId, true);
                if (allParents) {
                    for (var i = 0; i < allParents.length; i++) {
                        if (!allParents[i].biological && allParents[i].character.id === parentId) {
                            return allParents[i].adoptionYear || null;
                        }
                    }
                    return null;
                }
            }

            // Fallback: use records
            var records = getAdoptionRecords(childId);
            for (var i = 0; i < records.length; i++) {
                if (records[i].parentId === parentId && records[i].status !== 'ended') {
                    return records[i].year;
                }
            }
            return null;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. PREGNANCY QUERIES
    // =========================================================================

    /**
     * Gets all pregnancy records for a mother
     * @param {string} motherId - Mother character ID
     * @returns {Array} Array of pregnancy records
     */
    function getPregnancyRecords(motherId) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];
            return state.getPregnancyRecords(motherId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all children born to a mother
     * @param {string} motherId - Mother character ID
     * @param {boolean} includeStillborn - Include stillborn children
     * @returns {Array} Array of child characters
     */
    function getChildrenByMother(motherId, includeStillborn) {
        if (_processing) return [];
        _processing = true;

        try {
            includeStillborn = includeStillborn !== false;
            
            // Use unified children query
            var children = _getChildrenUnified(motherId, true, true);
            
            if (!includeStillborn) {
                children = children.filter(function(child) {
                    return !(child.isDeceased && child.deathCause === 'Stillborn');
                });
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all children born to a father
     * @param {string} fatherId - Father character ID
     * @param {boolean} includeStillborn - Include stillborn children
     * @returns {Array} Array of child characters
     */
    function getChildrenByFather(fatherId, includeStillborn) {
        if (_processing) return [];
        _processing = true;

        try {
            includeStillborn = includeStillborn !== false;
            
            // Use unified children query
            var children = _getChildrenUnified(fatherId, true, true);
            
            if (!includeStillborn) {
                children = children.filter(function(child) {
                    return !(child.isDeceased && child.deathCause === 'Stillborn');
                });
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all children born to a couple
     * @param {string} parentId1 - First parent ID
     * @param {string} parentId2 - Second parent ID
     * @param {boolean} includeStillborn - Include stillborn children
     * @returns {Array} Array of child characters
     */
    function getChildrenByCouple(parentId1, parentId2, includeStillborn) {
        if (_processing) return [];
        _processing = true;

        try {
            includeStillborn = includeStillborn !== false;
            var allChars = _getCharacters();
            var children = [];

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                var matches = false;

                if (child.motherId === parentId1 && child.fatherId === parentId2) {
                    matches = true;
                } else if (child.motherId === parentId2 && child.fatherId === parentId1) {
                    matches = true;
                }

                if (matches) {
                    if (!includeStillborn && child.isDeceased && child.deathCause === 'Stillborn') {
                        continue;
                    }
                    children.push(child);
                }
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. SURROGACY QUERIES
    // =========================================================================

    /**
     * Gets all surrogacy records
     * @returns {Array} Array of surrogacy records
     */
    function getSurrogacyRecords() {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];
            return state.getSurrogacyRecords();
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets surrogacy records for a parent
     * @param {string} parentId - Parent character ID
     * @returns {Array} Array of surrogacy records
     */
    function getSurrogacyRecordsForParent(parentId) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];
            return state.getSurrogacyRecordsForParent(parentId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets surrogacy records for a surrogate
     * @param {string} surrogateId - Surrogate character ID
     * @returns {Array} Array of surrogacy records
     */
    function getSurrogacyRecordsForSurrogate(surrogateId) {
        if (_processing) return [];
        _processing = true;

        try {
            var records = getSurrogacyRecords();
            var result = [];

            for (var i = 0; i < records.length; i++) {
                if (records[i].surrogateId === surrogateId) {
                    result.push(records[i]);
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets children born via surrogacy for a parent
     * @param {string} parentId - Parent character ID
     * @returns {Array} Array of child characters
     */
    function getSurrogacyChildrenForParent(parentId) {
        if (_processing) return [];
        _processing = true;

        try {
            var records = getSurrogacyRecordsForParent(parentId);
            var children = [];

            for (var i = 0; i < records.length; i++) {
                var record = records[i];
                for (var j = 0; j < record.childIds.length; j++) {
                    var child = _getCharacterById(record.childIds[j]);
                    if (child) {
                        children.push(child);
                    }
                }
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a child was born via surrogacy
     * @param {string} childId - Child character ID
     * @returns {boolean} True if surrogacy child
     */
    function isSurrogacyChild(childId) {
        if (_processing) return false;
        _processing = true;

        try {
            var child = _getCharacterById(childId);
            if (!child) return false;
            return !!(child.surrogacyInfo);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the genetic parents of a surrogacy child
     * @param {string} childId - Child character ID
     * @returns {Object} { geneticMother, geneticFather, birthMother }
     */
    function getSurrogacyGeneticParents(childId) {
        if (_processing) return null;
        _processing = true;

        try {
            var child = _getCharacterById(childId);
            if (!child || !child.surrogacyInfo) return null;

            var geneticMotherId = child.geneticMotherId;
            var geneticFatherId = child.geneticFatherId;
            var birthMotherId = child.surrogacyInfo.surrogateId || child.motherId;

            return {
                geneticMother: geneticMotherId ? _getCharacterById(geneticMotherId) : null,
                geneticFather: geneticFatherId ? _getCharacterById(geneticFatherId) : null,
                birthMother: birthMotherId ? _getCharacterById(birthMotherId) : null
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. FAMILY QUERIES (NEW - Using FamilyAccessors)
    // =========================================================================

    /**
     * Gets all children of a character (unified)
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased children
     * @param {boolean} includeAdopted - Include adopted children
     * @returns {Array} Array of child characters
     */
    function getAllChildren(characterId, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;

        try {
            return _getChildrenUnified(characterId, includeDeceased, includeAdopted);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets parents of a character (unified)
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdoptive - Include adoptive parents
     * @returns {Object} { father, mother, adoptiveParents: [] }
     */
    function getAllParents(characterId, includeAdoptive) {
        if (_processing) return { father: null, mother: null, adoptiveParents: [] };
        _processing = true;

        try {
            return _getParentsUnified(characterId, includeAdoptive);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets siblings of a character (unified)
     * @param {string} characterId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings
     * @param {boolean} includeDeceased - Include deceased siblings
     * @param {boolean} includeAdopted - Include adopted siblings
     * @returns {Array} Array of sibling characters
     */
    function getAllSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;

        try {
            return _getSiblingsUnified(characterId, includeHalfSiblings, includeDeceased, includeAdopted);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets grandparents of a character
     * @param {string} characterId - Character ID
     * @param {number} generation - 1 = grandparents, 2 = great-grandparents, etc.
     * @returns {Array} Array of grandparent characters
     */
    function getGrandparents(characterId, generation) {
        if (_processing) return [];
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getGrandparentsViaFamilyAccessors(characterId, generation);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            generation = generation || 1;
            var result = [];
            
            if (generation === 1) {
                var parents = getAllParents(characterId, false);
                if (parents.father) {
                    var fatherParents = getAllParents(parents.father.id, false);
                    if (fatherParents.father) result.push(fatherParents.father);
                    if (fatherParents.mother) result.push(fatherParents.mother);
                }
                if (parents.mother) {
                    var motherParents = getAllParents(parents.mother.id, false);
                    if (motherParents.father) result.push(motherParents.father);
                    if (motherParents.mother) result.push(motherParents.mother);
                }
            } else if (generation > 1) {
                var grandparents = getGrandparents(characterId, 1);
                for (var i = 0; i < grandparents.length; i++) {
                    var greatGrandparents = getGrandparents(grandparents[i].id, 1);
                    for (var j = 0; j < greatGrandparents.length; j++) {
                        result.push(greatGrandparents[j]);
                    }
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueResult = [];
            for (var i = 0; i < result.length; i++) {
                if (result[i] && !seenIds[result[i].id]) {
                    seenIds[result[i].id] = true;
                    uniqueResult.push(result[i]);
                }
            }

            return uniqueResult;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets grandchildren of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased grandchildren
     * @returns {Array} Array of grandchild characters
     */
    function getGrandchildren(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getGrandchildrenViaFamilyAccessors(characterId, includeDeceased);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            includeDeceased = includeDeceased || false;
            var children = getAllChildren(characterId, includeDeceased);
            var grandchildren = [];

            for (var i = 0; i < children.length; i++) {
                var childChildren = getAllChildren(children[i].id, includeDeceased);
                for (var j = 0; j < childChildren.length; j++) {
                    grandchildren.push(childChildren[j]);
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueResult = [];
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i] && !seenIds[grandchildren[i].id]) {
                    seenIds[grandchildren[i].id] = true;
                    uniqueResult.push(grandchildren[i]);
                }
            }

            return uniqueResult;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets spouse(s) of a character
     * @param {string} characterId - Character ID
     * @param {boolean} activeOnly - Only active relationships
     * @returns {Array} Array of spouse characters
     */
    function getSpouses(characterId, activeOnly) {
        if (_processing) return [];
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getSpousesViaFamilyAccessors(characterId, activeOnly);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            activeOnly = activeOnly !== false;
            var character = _getCharacterById(characterId);
            if (!character) return [];

            var spouses = [];

            if (character.relationships) {
                for (var i = 0; i < character.relationships.length; i++) {
                    var rel = character.relationships[i];
                    if (activeOnly && rel.status !== 'ongoing' && rel.status !== 'active') continue;

                    var isMarriage = rel.type === 'marriage' || rel.type === 'committed' || rel.type === 'romance';
                    if (!isMarriage) continue;

                    var spouseId = rel.participantB || rel.partnerId;
                    if (spouseId === characterId) {
                        spouseId = rel.participantA;
                    }
                    var spouse = _getCharacterById(spouseId);
                    if (spouse) {
                        spouses.push(spouse);
                    }
                }
            }

            return spouses;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the current spouse of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Spouse character or null
     */
    function getCurrentSpouse(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            var spouses = getSpouses(characterId, true);
            return spouses.length > 0 ? spouses[0] : null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the relationship description between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {string} Relationship description
     */
    function getRelationshipDescription(charId1, charId2) {
        if (_processing) return 'Unknown';
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getRelationshipDescriptionViaFamilyAccessors(charId1, charId2);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            if (charId1 === charId2) return 'Self';

            var char1 = _getCharacterById(charId1);
            var char2 = _getCharacterById(charId2);
            if (!char1 || !char2) return 'Unknown';

            // Check parent-child
            if (char1.fatherId === charId2 || char1.motherId === charId2) {
                return char2.gender === 'male' ? 'Father' : 'Mother';
            }
            if (char2.fatherId === charId1 || char2.motherId === charId1) {
                return char1.gender === 'male' ? 'Son' : 'Daughter';
            }

            // Check siblings
            var siblings = getAllSiblings(charId1, true, true);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].id === charId2) {
                    return char2.gender === 'male' ? 'Brother' : 'Sister';
                }
            }

            // Check spouses
            var spouses = getSpouses(charId1, true);
            for (var i = 0; i < spouses.length; i++) {
                if (spouses[i].id === charId2) {
                    return char2.gender === 'male' ? 'Husband' : 'Wife';
                }
            }

            // Check grandparents
            var grandparents = getGrandparents(charId1, 1);
            for (var i = 0; i < grandparents.length; i++) {
                if (grandparents[i].id === charId2) {
                    return char2.gender === 'male' ? 'Grandfather' : 'Grandmother';
                }
            }

            // Check grandchildren
            var grandchildren = getGrandchildren(charId1);
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i].id === charId2) {
                    return char1.gender === 'male' ? 'Grandson' : 'Granddaughter';
                }
            }

            return 'Unrelated';
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the consanguinity degree between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {number} Closeness degree
     */
    function getConsanguinityDegree(charId1, charId2) {
        if (_processing) return 99;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getConsanguinityDegreeViaFamilyAccessors(charId1, charId2);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            if (charId1 === charId2) return 0;

            var char1 = _getCharacterById(charId1);
            var char2 = _getCharacterById(charId2);
            if (!char1 || !char2) return 99;

            // Parent/Child: 1
            if (char1.fatherId === charId2 || char1.motherId === charId2) return 1;
            if (char2.fatherId === charId1 || char2.motherId === charId1) return 1;

            // Spouse: 1
            var spouses = getSpouses(charId1, true);
            for (var i = 0; i < spouses.length; i++) {
                if (spouses[i].id === charId2) return 1;
            }

            // Sibling: 2
            var siblings = getAllSiblings(charId1, true, true);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].id === charId2) return 2;
            }

            // Grandparent/Grandchild: 2
            var grandparents = getGrandparents(charId1, 1);
            for (var i = 0; i < grandparents.length; i++) {
                if (grandparents[i].id === charId2) return 2;
            }
            var grandchildren = getGrandchildren(charId1);
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i].id === charId2) return 2;
            }

            // Aunt/Uncle, Niece/Nephew: 3
            // Cousin: 4

            return 99;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets comprehensive family statistics for a character
     * @param {string} characterId - Character ID
     * @returns {Object} Family statistics
     */
    function getFamilyStatistics(characterId) {
        if (_processing) return null;
        _processing = true;

        try {
            // Prefer FamilyAccessors
            var faResult = _getFamilyStatisticsViaFamilyAccessors(characterId);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            var character = _getCharacterById(characterId);
            if (!character) return null;

            var children = getAllChildren(characterId, true);
            var livingChildren = children.filter(function(c) { return !c.isDeceased; });
            var siblings = getAllSiblings(characterId, true, true);
            var livingSiblings = siblings.filter(function(s) { return !s.isDeceased; });
            var grandchildren = getGrandchildren(characterId, true);
            var livingGrandchildren = grandchildren.filter(function(g) { return !g.isDeceased; });
            var spouses = getSpouses(characterId, true);
            var currentSpouse = spouses.length > 0 ? spouses[0] : null;
            var parents = getAllParents(characterId, false);

            var biologicalChildren = children.filter(function(c) {
                return c.fatherId === characterId || c.motherId === characterId;
            });

            var adoptedChildren = children.filter(function(c) {
                if (!c.adoptedParents) return false;
                for (var i = 0; i < c.adoptedParents.length; i++) {
                    if (c.adoptedParents[i].parentId === characterId && 
                        c.adoptedParents[i].status !== 'ended') {
                        return true;
                    }
                }
                return false;
            });

            var fullSiblings = siblings.filter(function(s) {
                var sharesFather = character.fatherId && s.fatherId && character.fatherId === s.fatherId;
                var sharesMother = character.motherId && s.motherId && character.motherId === s.motherId;
                return sharesFather && sharesMother;
            });

            var halfSiblings = siblings.filter(function(s) {
                var sharesFather = character.fatherId && s.fatherId && character.fatherId === s.fatherId;
                var sharesMother = character.motherId && s.motherId && character.motherId === s.motherId;
                return (sharesFather || sharesMother) && !(sharesFather && sharesMother);
            });

            return {
                character: character,
                parents: {
                    father: parents.father || null,
                    mother: parents.mother || null,
                    hasParents: parents.father !== null || parents.mother !== null
                },
                children: {
                    total: children.length,
                    living: livingChildren.length,
                    biological: biologicalChildren.length,
                    adopted: adoptedChildren.length,
                    eldest: children.length > 0 ? children[0] : null,
                    youngest: children.length > 0 ? children[children.length - 1] : null
                },
                siblings: {
                    total: siblings.length,
                    living: livingSiblings.length,
                    full: fullSiblings.length,
                    half: halfSiblings.length,
                    adopted: siblings.length - fullSiblings.length - halfSiblings.length,
                    eldest: siblings.length > 0 ? siblings[0] : null,
                    youngest: siblings.length > 0 ? siblings[siblings.length - 1] : null
                },
                grandchildren: {
                    total: grandchildren.length,
                    living: livingGrandchildren.length
                },
                spouse: currentSpouse ? {
                    character: currentSpouse
                } : null,
                isOrphan: !parents.father && !parents.mother,
                hasChildren: children.length > 0,
                totalFamilyMembers: 1 + children.length + siblings.length + grandchildren.length
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. CHILDREN STATISTICS (UPDATED)
    // =========================================================================

    /**
     * Gets statistics about a parent's children
     * @param {string} parentId - Parent character ID
     * @returns {Object} Statistics object
     */
    function getParentChildrenStatistics(parentId) {
        if (_processing) return null;
        _processing = true;

        try {
            var biological = getAllChildren(parentId, true, false);
            var adopted = getAdoptedChildren(parentId);
            var surrogacy = getSurrogacyChildrenForParent(parentId);

            var living = 0;
            var deceased = 0;
            var male = 0;
            var female = 0;
            var stillborn = 0;

            var allChildren = [];

            // Combine all children (avoid duplicates)
            var seenIds = {};
            var addChild = function(child) {
                if (!child || seenIds[child.id]) return;
                seenIds[child.id] = true;
                allChildren.push(child);
            };

            for (var i = 0; i < biological.length; i++) {
                addChild(biological[i]);
            }
            for (var i = 0; i < adopted.length; i++) {
                addChild(adopted[i]);
            }
            for (var i = 0; i < surrogacy.length; i++) {
                addChild(surrogacy[i]);
            }

            for (var i = 0; i < allChildren.length; i++) {
                var child = allChildren[i];
                if (child.isDeceased) {
                    deceased++;
                    if (child.deathCause === 'Stillborn') stillborn++;
                } else {
                    living++;
                }
                if (child.gender === 'male') male++;
                else if (child.gender === 'female') female++;
            }

            return {
                total: allChildren.length,
                living: living,
                deceased: deceased,
                stillborn: stillborn,
                male: male,
                female: female,
                biological: biological.length,
                adopted: adopted.length,
                surrogacy: surrogacy.length
            };
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all children of a parent (biological + adopted + surrogacy)
     * @param {string} parentId - Parent character ID
     * @param {boolean} includeStillborn - Include stillborn children
     * @returns {Array} Array of child characters
     */
    function getAllChildrenOfParent(parentId, includeStillborn) {
        if (_processing) return [];
        _processing = true;

        try {
            includeStillborn = includeStillborn !== false;
            var biological = getAllChildren(parentId, true, false);
            var adopted = getAdoptedChildren(parentId);
            var surrogacy = getSurrogacyChildrenForParent(parentId);

            var all = [];
            var seenIds = {};

            var addChild = function(child) {
                if (!child || seenIds[child.id]) return;
                if (!includeStillborn && child.isDeceased && child.deathCause === 'Stillborn') {
                    return;
                }
                seenIds[child.id] = true;
                all.push(child);
            };

            for (var i = 0; i < biological.length; i++) {
                addChild(biological[i]);
            }
            for (var i = 0; i < adopted.length; i++) {
                addChild(adopted[i]);
            }
            for (var i = 0; i < surrogacy.length; i++) {
                addChild(surrogacy[i]);
            }

            return all;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ChildrenQueries = {
        // Adoption
        getAdoptionRecords: getAdoptionRecords,
        getAdoptiveParents: getAdoptiveParents,
        getAdoptedChildren: getAdoptedChildren,
        isAdopted: isAdopted,
        isAdoptiveParent: isAdoptiveParent,
        getAdoptionType: getAdoptionType,
        getAdoptionYear: getAdoptionYear,

        // Pregnancy
        getPregnancyRecords: getPregnancyRecords,
        getChildrenByMother: getChildrenByMother,
        getChildrenByFather: getChildrenByFather,
        getChildrenByCouple: getChildrenByCouple,

        // Surrogacy
        getSurrogacyRecords: getSurrogacyRecords,
        getSurrogacyRecordsForParent: getSurrogacyRecordsForParent,
        getSurrogacyRecordsForSurrogate: getSurrogacyRecordsForSurrogate,
        getSurrogacyChildrenForParent: getSurrogacyChildrenForParent,
        isSurrogacyChild: isSurrogacyChild,
        getSurrogacyGeneticParents: getSurrogacyGeneticParents,

        // Family Queries (NEW - Unified)
        getAllChildren: getAllChildren,
        getAllParents: getAllParents,
        getAllSiblings: getAllSiblings,
        getGrandparents: getGrandparents,
        getGrandchildren: getGrandchildren,
        getSpouses: getSpouses,
        getCurrentSpouse: getCurrentSpouse,
        getRelationshipDescription: getRelationshipDescription,
        getConsanguinityDegree: getConsanguinityDegree,
        getFamilyStatistics: getFamilyStatistics,

        // Statistics
        getParentChildrenStatistics: getParentChildrenStatistics,
        getAllChildrenOfParent: getAllChildrenOfParent
    };

    // Legacy aliases
    window.getAdoptiveParents = getAdoptiveParents;
    window.getAdoptedChildren = getAdoptedChildren;
    window.isAdoptiveParent = isAdoptiveParent;
    window.getAdoptionType = getAdoptionType;
    window.getAdoptionYear = getAdoptionYear;
    window.getSurrogacyRecords = getSurrogacyRecords;
    window.isSurrogacyChild = isSurrogacyChild;
    window.getSurrogacyGeneticParents = getSurrogacyGeneticParents;

    // Legacy family aliases
    window.getChildren = getAllChildren;
    window.getParents = getAllParents;
    window.getSiblings = getAllSiblings;
    window.getGrandparents = getGrandparents;
    window.getGrandchildren = getGrandchildren;
    window.getSpouses = getSpouses;
    window.getCurrentSpouse = getCurrentSpouse;
    window.getRelationshipDescription = getRelationshipDescription;
    window.getConsanguinityDegree = getConsanguinityDegree;
    window.getFamilyStatistics = getFamilyStatistics;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenQueries;
    }

})();