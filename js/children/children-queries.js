/**
 * =============================================================================
 * STILL WATERS - CHILDREN QUERIES (js/core/children/children-queries.js)
 * =============================================================================
 * 
 * All read operations for children (birth, adoption, surrogacy).
 * - NO side effects
 * - NO mutations
 * - Pure queries
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - family-logic.js (FamilyLogic)
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

    function _getChildren(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getChildren(characterId);
        }
        if (typeof window.getChildren === 'function') {
            return window.getChildren(characterId);
        }
        return [];
    }

    function _getParents(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getParents(characterId);
        }
        if (typeof window.getParents === 'function') {
            return window.getParents(characterId);
        }
        return { father: null, mother: null };
    }

    function _getSiblings(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getSiblings(characterId);
        }
        if (typeof window.getSiblings === 'function') {
            return window.getSiblings(characterId);
        }
        return [];
    }

    // =========================================================================
    // 3. ADOPTION QUERIES
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
     * @returns {Array} Array of adoptive parent characters
     */
    function getAdoptiveParents(childId) {
        if (_processing) return [];
        _processing = true;

        try {
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
     * @returns {Array} Array of adopted child characters
     */
    function getAdoptedChildren(parentId) {
        if (_processing) return [];
        _processing = true;

        try {
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
    // 4. PREGNANCY QUERIES
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
            var allChars = _getCharacters();
            var children = [];

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                if (child.motherId === motherId) {
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
            var allChars = _getCharacters();
            var children = [];

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                if (child.fatherId === fatherId) {
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
    // 5. SURROGACY QUERIES
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
    // 6. CHILDREN STATISTICS
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
            var biological = _getChildren(parentId);
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
            var biological = _getChildren(parentId);
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
    // 7. EXPORTS
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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenQueries;
    }

})();