/**
 * =============================================================================
 * STILL WATERS - ADOPTION SERVICE (js/core/children/adoption-service.js)
 * =============================================================================
 * 
 * This file contains PURE adoption logic with NO UI:
 * - Adoption creation
 * - Adoption validation
 * - Adoptive parent management
 * - Adoption queries (getAdoptiveParents, getAdoptedChildren)
 * - Adoption removal
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - children-commands.js (ChildrenCommands)
 *   - children-queries.js (ChildrenQueries)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - storage.js (saveMasterData)
 *   - family.js (clearFamilyCache)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - eventLogger.js (logEvent)
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
    // 2. CONSTANTS
    // =========================================================================

    var ADOPTION_TYPES = {
        LEGAL: 'legal',
        GUARDIANSHIP: 'guardianship',
        FOSTER: 'foster'
    };

    var ADOPTION_TYPE_NAMES = {
        legal: 'Legal Adoption',
        guardianship: 'Guardianship',
        foster: 'Foster Placement'
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.ChildrenState !== 'undefined' ? window.ChildrenState : null;
    }

    function _getCommands() {
        return typeof window.ChildrenCommands !== 'undefined' ? window.ChildrenCommands : null;
    }

    function _getQueries() {
        return typeof window.ChildrenQueries !== 'undefined' ? window.ChildrenQueries : null;
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _invalidateCaches() {
        if (typeof window.clearFamilyCache === 'function') {
            window.clearFamilyCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    // =========================================================================
    // 4. ADOPTION QUERIES
    // =========================================================================

    /**
     * Gets all adoptive parents of a child
     * @param {string} childId - Child character ID
     * @returns {Array} Array of adoptive parent objects with metadata
     */
    function getAdoptiveParents(childId) {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getAdoptiveParents(childId);
            }

            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return [];

            return child.adoptedParents.map(function(ap) {
                return {
                    parentId: ap.parentId,
                    parent: _getCharacterById(ap.parentId),
                    type: ap.type,
                    year: ap.year,
                    notes: ap.notes,
                    status: ap.status || 'active'
                };
            }).filter(function(p) { return p.parent; });
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all adopted children of a parent
     * @param {string} parentId - Parent character ID
     * @returns {Array} Array of adopted child objects with metadata
     */
    function getAdoptedChildren(parentId) {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getAdoptedChildren(parentId);
            }

            var parent = _getCharacterById(parentId);
            if (!parent || !parent.adoptedChildren) return [];

            return parent.adoptedChildren.map(function(ac) {
                return {
                    childId: ac.childId,
                    child: _getCharacterById(ac.childId),
                    type: ac.type,
                    year: ac.year,
                    notes: ac.notes,
                    status: ac.status || 'active'
                };
            }).filter(function(c) { return c.child; });
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a child has any adoptive parents
     * @param {string} childId - Child character ID
     * @returns {boolean}
     */
    function hasAdoptiveParents(childId) {
        if (_processing) return false;
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.isAdopted(childId);
            }

            var child = _getCharacterById(childId);
            return child && child.adoptedParents && child.adoptedParents.length > 0;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a parent has any adopted children
     * @param {string} parentId - Parent character ID
     * @returns {boolean}
     */
    function hasAdoptedChildren(parentId) {
        if (_processing) return false;
        _processing = true;

        try {
            var parent = _getCharacterById(parentId);
            return parent && parent.adoptedChildren && parent.adoptedChildren.length > 0;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a specific adoption relationship exists
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {boolean}
     */
    function isAdoptiveParent(parentId, childId) {
        if (_processing) return false;
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.isAdoptiveParent(parentId, childId);
            }

            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return false;
            return child.adoptedParents.some(function(ap) { return ap.parentId === parentId && ap.status !== 'ended'; });
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the adoption type between parent and child
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {string|null} Adoption type or null
     */
    function getAdoptionType(parentId, childId) {
        if (_processing) return null;
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getAdoptionType(parentId, childId);
            }

            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return null;

            var adoption = child.adoptedParents.find(function(ap) { return ap.parentId === parentId && ap.status !== 'ended'; });
            return adoption ? adoption.type : null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the adoption year between parent and child
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {number|null} Adoption year or null
     */
    function getAdoptionYear(parentId, childId) {
        if (_processing) return null;
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getAdoptionYear(parentId, childId);
            }

            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return null;

            var adoption = child.adoptedParents.find(function(ap) { return ap.parentId === parentId && ap.status !== 'ended'; });
            return adoption ? adoption.year : null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the adoption record between parent and child
     * @param {string} parentId - Parent character ID
     * @param {string} childId - Child character ID
     * @returns {Object|null} Adoption record or null
     */
    function getAdoptionRecord(parentId, childId) {
        if (_processing) return null;
        _processing = true;

        try {
            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return null;

            for (var i = 0; i < child.adoptedParents.length; i++) {
                if (child.adoptedParents[i].parentId === parentId) {
                    return child.adoptedParents[i];
                }
            }
            return null;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. ADOPTION VALIDATION
    // =========================================================================

    /**
     * Validates if an adoption can be created
     * @param {Object} parent - Parent character
     * @param {Object} child - Child character
     * @param {Object} options - Validation options
     * @param {number} options.minAgeGap - Minimum age gap (default 14)
     * @param {boolean} options.allowSameAge - Allow same age (default false)
     * @returns {Object} { isValid: boolean, reasons: Array<string> }
     */
    function validateAdoption(parent, child, options) {
        if (_processing) {
            return { isValid: false, reasons: ['Already processing'] };
        }
        _processing = true;

        try {
            options = options || {};
            var reasons = [];

            if (!parent || !child) {
                reasons.push('One or both characters not found');
                return { isValid: false, reasons: reasons };
            }

            // Parent must be an adult (18+)
            var parentAge = _calculateAge(parent.birthYear, false, null);
            if (parentAge < 18) {
                reasons.push(parent.name + ' is under 18 and cannot be a guardian');
            }

            // Cannot adopt self
            if (parent.id === child.id) {
                reasons.push('Cannot adopt oneself');
            }

            // Check if already adopted by this parent
            if (isAdoptiveParent(parent.id, child.id)) {
                reasons.push(parent.name + ' is already an adoptive parent of ' + child.name);
            }

            // Age gap check (optional)
            var minAgeGap = options.minAgeGap || 14;
            if (!options.allowSameAge) {
                var ageGap = Math.abs(parent.birthYear - child.birthYear);
                if (ageGap < minAgeGap) {
                    reasons.push('Age gap (' + ageGap + ' years) is too small for adoption (minimum ' + minAgeGap + ')');
                }
            }

            return {
                isValid: reasons.length === 0,
                reasons: reasons
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. ADOPTION CREATION
    // =========================================================================

    /**
     * Creates an adoption relationship
     * @param {string} parentId - Adoptive parent character ID
     * @param {string} childId - Child character ID
     * @param {Object} options - Adoption options
     * @param {number} options.year - Year of adoption (default current year)
     * @param {string} options.type - Adoption type (default 'legal')
     * @param {string} options.notes - Notes about the adoption
     * @param {string} options.parentType - 'father', 'mother', or 'guardian'
     * @param {string} options.partnerId - Co-parent ID (optional)
     * @param {boolean} options.suppressLog - Whether to suppress event logging
     * @param {boolean} options.suppressToast - Whether to suppress toast
     * @returns {Object} Result object
     */
    function createAdoption(parentId, childId, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};
            var parent = _getCharacterById(parentId);
            var child = _getCharacterById(childId);

            if (!parent || !child) {
                return { success: false, reason: 'Character not found' };
            }

            // Validate
            var validation = validateAdoption(parent, child, options);
            if (!validation.isValid) {
                return {
                    success: false,
                    reason: 'Validation failed',
                    details: validation.reasons
                };
            }

            var commands = _getCommands();
            if (!commands) {
                return { success: false, reason: 'Children commands not available' };
            }

            var partner = options.partnerId ? _getCharacterById(options.partnerId) : null;

            var result = commands.recordAdoption(parent, child, {
                year: options.year || _getCurrentYear(),
                type: options.type || ADOPTION_TYPES.LEGAL,
                notes: options.notes || '',
                parentType: options.parentType || (parent.gender === 'male' ? 'father' : 'mother'),
                partner: partner
            });

            if (result && result.success) {
                if (!options.suppressLog) {
                    _logEvent('adoption', 'Adoption Created',
                        parent.name + ' adopted ' + child.name + ' (' + (ADOPTION_TYPE_NAMES[options.type] || options.type) + ')',
                        [parent, child]);
                }

                if (!options.suppressToast) {
                    _showToast(child.name + ' adopted by ' + parent.name, 'success');
                }

                return result;
            }

            return { success: false, reason: 'Failed to create adoption' };

        } finally {
            _processing = false;
        }
    }

    /**
     * Creates a guardianship (alias for createAdoption with guardianship type)
     * @param {string} guardianId - Guardian character ID
     * @param {string} childId - Child character ID
     * @param {number} year - Year of guardianship
     * @param {Object} options - Additional options
     * @returns {Object}
     */
    function createGuardianship(guardianId, childId, year, options) {
        return createAdoption(guardianId, childId, {
            ...options,
            year: year,
            type: ADOPTION_TYPES.GUARDIANSHIP
        });
    }

    /**
     * Creates a foster placement
     * @param {string} fosterId - Foster parent character ID
     * @param {string} childId - Child character ID
     * @param {number} year - Year of placement
     * @param {Object} options - Additional options
     * @returns {Object}
     */
    function createFosterPlacement(fosterId, childId, year, options) {
        return createAdoption(fosterId, childId, {
            ...options,
            year: year,
            type: ADOPTION_TYPES.FOSTER
        });
    }

    // =========================================================================
    // 7. ADOPTION REMOVAL
    // =========================================================================

    /**
     * Removes an adoption relationship
     * @param {string} parentId - Adoptive parent character ID
     * @param {string} childId - Child character ID
     * @param {Object} options - Removal options
     * @param {number} options.endYear - Year adoption ended
     * @param {string} options.reason - Reason for removal
     * @param {boolean} options.keepHistory - Keep historical record
     * @param {boolean} options.suppressLog - Whether to suppress event logging
     * @param {boolean} options.suppressToast - Whether to suppress toast
     * @returns {Object} Result
     */
    function removeAdoption(parentId, childId, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};
            var parent = _getCharacterById(parentId);
            var child = _getCharacterById(childId);

            if (!parent || !child) {
                return { success: false, reason: 'Character not found' };
            }

            if (!isAdoptiveParent(parentId, childId)) {
                return { success: false, reason: 'No adoption relationship found' };
            }

            var commands = _getCommands();
            if (!commands) {
                return { success: false, reason: 'Children commands not available' };
            }

            var result = commands.removeAdoption(parent, child, {
                endYear: options.endYear || _getCurrentYear(),
                reason: options.reason || 'Adoption dissolved',
                keepHistory: options.keepHistory !== false
            });

            if (result && result.success) {
                if (!options.suppressLog) {
                    _logEvent('adoption', 'Adoption Dissolved',
                        parent.name + ' is no longer adoptive parent of ' + child.name + '. Reason: ' + (options.reason || 'Not specified'),
                        [parent, child]);
                }

                if (!options.suppressToast) {
                    _showToast('Adoption removed between ' + parent.name + ' and ' + child.name, 'info');
                }

                return result;
            }

            return { success: false, reason: 'Failed to remove adoption' };

        } finally {
            _processing = false;
        }
    }

    /**
     * Removes all adoptive parents from a child (orphans the child)
     * @param {string} childId - Child character ID
     * @param {Object} options - Removal options
     * @param {boolean} options.keepHistory - Keep historical record
     * @returns {number} Number of adoptions removed
     */
    function removeAllAdoptiveParents(childId, options) {
        if (_processing) return 0;
        _processing = true;

        try {
            options = options || {};
            var child = _getCharacterById(childId);
            if (!child || !child.adoptedParents) return 0;

            var removedCount = child.adoptedParents.length;
            var removedParents = child.adoptedParents.slice();

            for (var i = 0; i < removedParents.length; i++) {
                var parentId = removedParents[i].parentId;
                removeAdoption(parentId, childId, {
                    keepHistory: options.keepHistory !== false,
                    reason: options.reason || 'All adoptions removed',
                    suppressToast: true,
                    suppressLog: true
                });
            }

            if (!options.suppressLog) {
                _logEvent('adoption', 'All Adoptions Removed',
                    'Removed all ' + removedCount + ' adoptive parent(s) from ' + child.name,
                    [child]);
            }

            if (!options.suppressToast) {
                _showToast('Removed all ' + removedCount + ' adoptive parents from ' + child.name, 'info');
            }

            return removedCount;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. ADOPTION STATISTICS
    // =========================================================================

    /**
     * Gets adoption statistics for a character (as parent or child)
     * @param {string} characterId - Character ID
     * @returns {Object} Statistics object
     */
    function getAdoptionStats(characterId) {
        if (_processing) {
            return { asParent: 0, asChild: 0, legalAdoptions: 0, guardianships: 0, fosterPlacements: 0 };
        }
        _processing = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                return { asParent: 0, asChild: 0, legalAdoptions: 0, guardianships: 0, fosterPlacements: 0 };
            }

            var asChild = character.adoptedParents ? character.adoptedParents.length : 0;
            var asParent = character.adoptedChildren ? character.adoptedChildren.length : 0;

            var legalAdoptions = 0;
            var guardianships = 0;
            var fosterPlacements = 0;

            if (character.adoptedParents) {
                for (var i = 0; i < character.adoptedParents.length; i++) {
                    var ap = character.adoptedParents[i];
                    if (ap.type === ADOPTION_TYPES.LEGAL) legalAdoptions++;
                    else if (ap.type === ADOPTION_TYPES.GUARDIANSHIP) guardianships++;
                    else if (ap.type === ADOPTION_TYPES.FOSTER) fosterPlacements++;
                }
            }

            return {
                asParent: asParent,
                asChild: asChild,
                legalAdoptions: legalAdoptions,
                guardianships: guardianships,
                fosterPlacements: fosterPlacements
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    // Constants
    window.ADOPTION_TYPES = ADOPTION_TYPES;
    window.ADOPTION_TYPE_NAMES = ADOPTION_TYPE_NAMES;

    // Queries
    window.getAdoptiveParents = getAdoptiveParents;
    window.getAdoptedChildren = getAdoptedChildren;
    window.hasAdoptiveParents = hasAdoptiveParents;
    window.hasAdoptedChildren = hasAdoptedChildren;
    window.isAdoptiveParent = isAdoptiveParent;
    window.getAdoptionType = getAdoptionType;
    window.getAdoptionYear = getAdoptionYear;
    window.getAdoptionRecord = getAdoptionRecord;

    // Validation
    window.validateAdoption = validateAdoption;

    // Creation
    window.createAdoption = createAdoption;
    window.createGuardianship = createGuardianship;
    window.createFosterPlacement = createFosterPlacement;

    // Removal
    window.removeAdoption = removeAdoption;
    window.removeAllAdoptiveParents = removeAllAdoptiveParents;

    // Statistics
    window.getAdoptionStats = getAdoptionStats;

    // Legacy aliases
    window._getAdoptiveParents = getAdoptiveParents;
    window._getAdoptedChildren = getAdoptedChildren;
    window._isAdoptiveParent = isAdoptiveParent;
    window._getAdoptionType = getAdoptionType;
    window._getAdoptionYear = getAdoptionYear;
    window._getAdoptionRecord = getAdoptionRecord;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ADOPTION_TYPES: ADOPTION_TYPES,
            ADOPTION_TYPE_NAMES: ADOPTION_TYPE_NAMES,
            getAdoptiveParents: getAdoptiveParents,
            getAdoptedChildren: getAdoptedChildren,
            hasAdoptiveParents: hasAdoptiveParents,
            hasAdoptedChildren: hasAdoptedChildren,
            isAdoptiveParent: isAdoptiveParent,
            getAdoptionType: getAdoptionType,
            getAdoptionYear: getAdoptionYear,
            getAdoptionRecord: getAdoptionRecord,
            validateAdoption: validateAdoption,
            createAdoption: createAdoption,
            createGuardianship: createGuardianship,
            createFosterPlacement: createFosterPlacement,
            removeAdoption: removeAdoption,
            removeAllAdoptiveParents: removeAllAdoptiveParents,
            getAdoptionStats: getAdoptionStats
        };
    }

})();