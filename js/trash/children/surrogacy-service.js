/**
 * =============================================================================
 * STILL WATERS - SURROGACY SERVICE (js/core/children/surrogacy-service.js)
 * =============================================================================
 * 
 * This file contains PURE surrogacy logic with NO UI:
 * - Surrogacy arrangement creation
 * - Surrogacy child generation
 * - Swap arrangements between couples
 * - Surrogacy queries
 * - Surrogacy validation
 * - Genetic parent tracking
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - children-commands.js (ChildrenCommands)
 *   - children-queries.js (ChildrenQueries)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - randomness.js (random, chance)
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

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _random() {
        if (typeof window.random === 'function') {
            return window.random();
        }
        return Math.random();
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
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
    // 3. CONSTANTS
    // =========================================================================

    var SURROGACY_TYPES = {
        TRADITIONAL: 'traditional',   // Surrogate is also egg donor
        GESTATIONAL: 'gestational'    // Surrogate carries, egg donor separate
    };

    var SURROGACY_STATUS = {
        ACTIVE: 'active',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };

    // =========================================================================
    // 4. SURROGACY VALIDATION
    // =========================================================================

    /**
     * Validates a surrogacy arrangement
     * @param {Object} intendedParent - Intended parent(s)
     * @param {Object} surrogate - Surrogate character
     * @param {Object} options - Options
     * @param {Object} options.spermDonor - Sperm donor (optional)
     * @param {Object} options.eggDonor - Egg donor (optional)
     * @returns {Object} { valid: boolean, errors: Array<string> }
     */
    function validateSurrogacy(intendedParent, surrogate, options) {
        if (_processing) {
            return { valid: false, errors: ['Already processing'] };
        }
        _processing = true;

        try {
            options = options || {};
            var errors = [];

            if (!intendedParent || !surrogate) {
                errors.push('Intended parent and surrogate are required');
                return { valid: false, errors: errors };
            }

            if (surrogate.isDeceased) {
                errors.push('Surrogate is deceased');
            }

            if (surrogate.gender !== 'female') {
                errors.push('Surrogate must be female');
            }

            var surrogateAge = _calculateAge(surrogate.birthYear, false, null);
            if (surrogateAge < 18) {
                errors.push('Surrogate is under 18 years old');
            }
            if (surrogateAge > 50) {
                errors.push('Surrogate is over 50 years old');
            }

            // Check if intended parent exists
            var intendedId = intendedParent.id || intendedParent.person?.id;
            if (!intendedId) {
                errors.push('Intended parent ID not found');
            } else {
                var intended = _getCharacterById(intendedId);
                if (!intended) {
                    errors.push('Intended parent not found');
                }
            }

            // Check egg donor
            if (options.eggDonor) {
                var eggDonor = _getCharacterById(options.eggDonor.id);
                if (!eggDonor) {
                    errors.push('Egg donor not found');
                }
                if (eggDonor && eggDonor.gender !== 'female') {
                    errors.push('Egg donor must be female');
                }
            }

            // Check sperm donor
            if (options.spermDonor) {
                var spermDonor = _getCharacterById(options.spermDonor.id);
                if (!spermDonor) {
                    errors.push('Sperm donor not found');
                }
                if (spermDonor && spermDonor.gender !== 'male') {
                    errors.push('Sperm donor must be male');
                }
            }

            return { valid: errors.length === 0, errors: errors };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. SURROGACY CREATION
    // =========================================================================

    /**
     * Creates a surrogacy arrangement
     * @param {Object} intendedParent - { type: 'couple' or 'single', person1, person2? }
     * @param {Object} surrogate - Surrogate character (birth mother)
     * @param {Object} options - Options
     * @param {number} options.childCount - Number of children (1-3, default 1)
     * @param {number} options.birthYear - Year of birth (default current)
     * @param {Object} options.spermDonor - Sperm donor (optional)
     * @param {Object} options.eggDonor - Egg donor (optional)
     * @param {string} options.notes - Notes
     * @param {string} options.type - 'traditional' or 'gestational'
     * @param {boolean} options.autoAssignHousehold - Auto-assign household
     * @param {Function} options.onSuccess - Callback with created children
     * @returns {Object} Result with success flag and data
     */
    function createSurrogacyArrangement(intendedParent, surrogate, options) {
        if (_processing) {
            return { success: false, error: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!surrogate || surrogate.gender !== 'female') {
                _showToast('Surrogate must be female', 'error');
                return { success: false, error: 'Invalid surrogate' };
            }

            // Validate
            var validation = validateSurrogacy(intendedParent, surrogate, options);
            if (!validation.valid) {
                return { success: false, error: validation.errors.join(', ') };
            }

            var currentYear = _getCurrentYear();
            var childCount = options.childCount || 1;
            var birthYear = options.birthYear || currentYear;
            var notes = options.notes || '';
            var spermDonor = options.spermDonor || null;
            var eggDonor = options.eggDonor || null;
            var type = options.type || SURROGACY_TYPES.TRADITIONAL;

            // Determine intended parent IDs
            var intendedParentId = null;
            var intendedPartnerId = null;

            if (intendedParent.type === 'couple') {
                intendedParentId = intendedParent.person1?.id;
                intendedPartnerId = intendedParent.person2?.id;
            } else {
                intendedParentId = intendedParent.person?.id || intendedParent.id;
            }

            if (!intendedParentId) {
                return { success: false, error: 'Invalid intended parent' };
            }

            var commands = _getCommands();
            if (!commands) {
                return { success: false, error: 'Children commands not available' };
            }

            // Generate children
            var children = [];
            var stillbornCount = 0;
            var livingChildren = [];

            for (var i = 0; i < childCount; i++) {
                var isStillborn = _chance(0.05);
                if (isStillborn) stillbornCount++;

                // Determine genetic parents
                var geneticMother = eggDonor || surrogate;
                var geneticFather = spermDonor || null;

                // If intended parent is providing genetic material
                if (intendedParent.type === 'couple') {
                    if (intendedParent.person1?.gender === 'female' && !eggDonor) {
                        geneticMother = intendedParent.person1;
                    }
                    if (intendedParent.person2?.gender === 'female' && !eggDonor) {
                        geneticMother = intendedParent.person2;
                    }
                    if (intendedParent.person1?.gender === 'male' && !spermDonor) {
                        geneticFather = intendedParent.person1;
                    }
                    if (intendedParent.person2?.gender === 'male' && !spermDonor) {
                        geneticFather = intendedParent.person2;
                    }
                } else if (intendedParent.person?.gender === 'female' && !eggDonor) {
                    geneticMother = intendedParent.person;
                } else if (intendedParent.person?.gender === 'male' && !spermDonor) {
                    geneticFather = intendedParent.person;
                }

                var gender = Math.random() < 0.5 ? 'male' : 'female';

                // Create child
                var childResult = commands.recordBirth(
                    surrogate,
                    geneticFather,
                    birthYear,
                    {
                        gender: gender,
                        isStillborn: isStillborn,
                        notes: 'Surrogacy arrangement. Intended parent: ' + (intendedParent.name || intendedParentId) + (notes ? ' ' + notes : ''),
                        autoAssignHousehold: false
                    }
                );

                if (childResult && childResult.success) {
                    var child = childResult.child;

                    // Add genetic parent info
                    if (geneticMother && geneticMother.id !== surrogate.id) {
                        child.geneticMotherId = geneticMother.id;
                    }
                    if (geneticFather) {
                        child.geneticFatherId = geneticFather.id;
                    }
                    child.surrogacyInfo = {
                        surrogateId: surrogate.id,
                        intendedParentId: intendedParentId,
                        intendedPartnerId: intendedPartnerId,
                        arrangementYear: currentYear,
                        birthYear: birthYear,
                        type: type
                    };

                    children.push(child);
                    if (!isStillborn) livingChildren.push(child);

                    // Create adoption for intended parents
                    if (!isStillborn) {
                        var intendedParentChar = _getCharacterById(intendedParentId);
                        if (intendedParentChar) {
                            commands.recordAdoption(intendedParentChar, child, {
                                year: birthYear,
                                type: 'legal',
                                notes: 'Surrogacy arrangement' + (notes ? ': ' + notes : ''),
                                parentType: intendedParentChar.gender === 'male' ? 'father' : 'mother',
                                suppressToast: true
                            });
                        }

                        if (intendedPartnerId) {
                            var intendedPartnerChar = _getCharacterById(intendedPartnerId);
                            if (intendedPartnerChar) {
                                commands.recordAdoption(intendedPartnerChar, child, {
                                    year: birthYear,
                                    type: 'legal',
                                    notes: 'Surrogacy arrangement (co-parent)' + (notes ? ': ' + notes : ''),
                                    parentType: intendedPartnerChar.gender === 'male' ? 'father' : 'mother',
                                    suppressToast: true
                                });
                            }
                        }
                    }
                }
            }

            // Record the surrogacy arrangement
            var surrogacyRecord = {
                id: 'surr_' + Date.now() + '_' + _randomInt(1000, 9999),
                intendedParentId: intendedParentId,
                intendedPartnerId: intendedPartnerId || null,
                surrogateId: surrogate.id,
                spermDonorId: spermDonor?.id || null,
                eggDonorId: eggDonor?.id || null,
                arrangementYear: currentYear,
                expectedBirthYear: birthYear,
                actualBirthYear: children.length > 0 ? birthYear : null,
                childIds: children.map(function(c) { return c.id; }),
                status: children.length > 0 ? SURROGACY_STATUS.COMPLETED : SURROGACY_STATUS.ACTIVE,
                type: type,
                notes: notes
            };

            var state = _getState();
            if (state) {
                state._addSurrogacyRecord(surrogacyRecord);
            }

            _saveMasterData();
            _invalidateCaches();

            var message = livingChildren.length + ' child' + (livingChildren.length !== 1 ? 'ren' : '') + ' born via surrogacy';
            if (stillbornCount > 0) message += ' (' + stillbornCount + ' stillborn)';
            _showToast(message, 'success');

            _logEvent('surrogacy', 'Surrogacy Arrangement',
                livingChildren.length + ' child' + (livingChildren.length !== 1 ? 'ren' : '') + ' born via surrogacy to ' + (intendedParent.name || intendedParentId),
                [surrogate]);

            if (options.onSuccess && typeof options.onSuccess === 'function') {
                options.onSuccess(children);
            }

            return {
                success: true,
                children: children,
                livingChildren: livingChildren,
                surrogacyRecord: surrogacyRecord,
                stillbornCount: stillbornCount
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. SWAP ARRANGEMENTS
    // =========================================================================

    /**
     * Creates a swap arrangement between two couples
     * 
     * SWAP LOGIC:
     * - Woman A carries child fathered by Man A → child goes to Female Couple
     * - Woman B carries child fathered by Man B → child goes to Male Couple
     * 
     * @param {Object} femaleCouple - { person1, person2, name? }
     * @param {Object} maleCouple - { person1, person2, name? }
     * @param {Object} options - Options
     * @param {number} options.birthYear - Year of birth
     * @param {Object} options.surrogateA - Woman A (optional, defaults to femaleCouple.person1)
     * @param {Object} options.surrogateB - Woman B (optional, defaults to femaleCouple.person2)
     * @param {Object} options.donorA - Man A (optional, defaults to maleCouple.person1)
     * @param {Object} options.donorB - Man B (optional, defaults to maleCouple.person2)
     * @param {string} options.notes - Notes
     * @param {Function} options.onSuccess - Callback
     * @returns {Object} Result with success flag
     */
    function createSwapArrangements(femaleCouple, maleCouple, options) {
        if (_processing) {
            return { success: false, error: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            if (!femaleCouple || !maleCouple) {
                return { success: false, error: 'Both couples are required for swap' };
            }

            var birthYear = options.birthYear || _getCurrentYear();
            var notes = options.notes || '';

            // Determine participants
            var surrogateA = options.surrogateA || femaleCouple.person1;
            var surrogateB = options.surrogateB || femaleCouple.person2;
            var donorA = options.donorA || maleCouple.person1;
            var donorB = options.donorB || maleCouple.person2;

            // Validate participants
            if (!surrogateA || !surrogateB || !donorA || !donorB) {
                return { success: false, error: 'Missing participants for swap' };
            }

            // Arrangement 1: Female Couple's child (carried by Woman A, fathered by Man A)
            var femaleIntended = {
                type: 'couple',
                person1: femaleCouple.person1,
                person2: femaleCouple.person2,
                name: femaleCouple.name || (femaleCouple.person1.name + ' & ' + femaleCouple.person2.name)
            };

            // Arrangement 2: Male Couple's child (carried by Woman B, fathered by Man B)
            var maleIntended = {
                type: 'couple',
                person1: maleCouple.person1,
                person2: maleCouple.person2,
                name: maleCouple.name || (maleCouple.person1.name + ' & ' + maleCouple.person2.name)
            };

            var results = {
                success: true,
                arrangement1: null,
                arrangement2: null,
                child1: null,
                child2: null
            };

            // Create first arrangement (Female Couple's child)
            var result1 = createSurrogacyArrangement(femaleIntended, surrogateA, {
                childCount: 1,
                birthYear: birthYear,
                spermDonor: donorA,
                eggDonor: surrogateA,
                notes: 'Swap arrangement: Child from ' + donorA.name + ' carried by ' + surrogateA.name + ' for female couple. ' + notes,
                onSuccess: null
            });

            if (result1.success) {
                results.arrangement1 = result1.surrogacyRecord;
                results.child1 = result1.livingChildren?.[0] || null;
            }

            // Create second arrangement (Male Couple's child)
            var result2 = createSurrogacyArrangement(maleIntended, surrogateB, {
                childCount: 1,
                birthYear: birthYear,
                spermDonor: donorB,
                eggDonor: surrogateB,
                notes: 'Swap arrangement: Child from ' + donorB.name + ' carried by ' + surrogateB.name + ' for male couple. ' + notes,
                onSuccess: null
            });

            if (result2.success) {
                results.arrangement2 = result2.surrogacyRecord;
                results.child2 = result2.livingChildren?.[0] || null;
            }

            if (results.child1 || results.child2) {
                var message = 'Swap completed! ';
                if (results.child1) message += 'Female couple got ' + results.child1.name + '. ';
                if (results.child2) message += 'Male couple got ' + results.child2.name + '.';
                _showToast(message, 'success');

                _logEvent('surrogacy', 'Swap Arrangement',
                    'Swap arrangement completed between female couple and male couple',
                    [femaleCouple.person1, femaleCouple.person2, maleCouple.person1, maleCouple.person2]);

                if (options.onSuccess && typeof options.onSuccess === 'function') {
                    options.onSuccess(results);
                }

                return results;
            }

            return { success: false, error: 'Swap failed to create children' };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. SURROGACY QUERIES
    // =========================================================================

    /**
     * Gets all surrogacy arrangements
     * @returns {Array} Array of surrogacy arrangements
     */
    function getSurrogacyArrangements() {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getSurrogacyRecords();
            }
            var state = _getState();
            if (state) {
                return state.getSurrogacyRecords();
            }
            return [];
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets surrogacy arrangements for a character (as intended parent or surrogate)
     * @param {string} characterId - Character ID
     * @returns {Array} Array of surrogacy arrangements
     */
    function getSurrogacyArrangementsForCharacter(characterId) {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getSurrogacyRecordsForParent(characterId);
            }

            var records = getSurrogacyArrangements();
            var result = [];

            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.intendedParentId === characterId ||
                    r.intendedPartnerId === characterId ||
                    r.surrogateId === characterId) {
                    result.push(r);
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets surrogacy arrangements for a surrogate
     * @param {string} surrogateId - Surrogate character ID
     * @returns {Array} Array of surrogacy arrangements
     */
    function getSurrogacyArrangementsBySurrogate(surrogateId) {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getSurrogacyRecordsForSurrogate(surrogateId);
            }

            var records = getSurrogacyArrangements();
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
     * Gets surrogacy arrangements where character is intended parent
     * @param {string} characterId - Character ID
     * @returns {Array} Array of surrogacy arrangements
     */
    function getSurrogacyArrangementsAsIntendedParent(characterId) {
        if (_processing) return [];
        _processing = true;

        try {
            var records = getSurrogacyArrangements();
            var result = [];

            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.intendedParentId === characterId || r.intendedPartnerId === characterId) {
                    result.push(r);
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
            var queries = _getQueries();
            if (queries) {
                return queries.getSurrogacyChildrenForParent(parentId);
            }

            var records = getSurrogacyArrangementsAsIntendedParent(parentId);
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
            var queries = _getQueries();
            if (queries) {
                return queries.isSurrogacyChild(childId);
            }

            var child = _getCharacterById(childId);
            if (!child) return false;
            return !!(child.surrogacyInfo);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the genetic parents of a child born via surrogacy
     * @param {string} childId - Child character ID
     * @returns {Object} { geneticMother, geneticFather, birthMother }
     */
    function getSurrogacyGeneticParents(childId) {
        if (_processing) return null;
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getSurrogacyGeneticParents(childId);
            }

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
    // 8. SURROGACY UPDATES
    // =========================================================================

    /**
     * Updates a surrogacy arrangement
     * @param {string} arrangementId - Arrangement ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.status - New status
     * @param {number} updates.actualBirthYear - Actual birth year
     * @param {Array} updates.childIds - Child IDs
     * @param {string} updates.notes - Notes
     * @returns {Object|null} Updated arrangement or null
     */
    function updateSurrogacyArrangement(arrangementId, updates) {
        if (_processing) return null;
        _processing = true;

        try {
            var records = getSurrogacyArrangements();
            var index = -1;

            for (var i = 0; i < records.length; i++) {
                if (records[i].id === arrangementId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) return null;

            var state = _getState();
            if (state) {
                return state._updateSurrogacyRecord(index, updates);
            }

            // Fallback: update in place
            records[index] = { ...records[index], ...updates };
            _saveMasterData();
            return records[index];
        } finally {
            _processing = false;
        }
    }

    /**
     * Completes a surrogacy arrangement (records birth)
     * @param {string} arrangementId - Arrangement ID
     * @param {number} birthYear - Year of birth
     * @param {Array} childIds - IDs of children born
     * @returns {Object|null} Updated arrangement
     */
    function completeSurrogacyArrangement(arrangementId, birthYear, childIds) {
        return updateSurrogacyArrangement(arrangementId, {
            actualBirthYear: birthYear,
            childIds: childIds,
            status: SURROGACY_STATUS.COMPLETED
        });
    }

    /**
     * Cancels a surrogacy arrangement
     * @param {string} arrangementId - Arrangement ID
     * @param {string} reason - Reason for cancellation
     * @returns {Object|null} Updated arrangement
     */
    function cancelSurrogacyArrangement(arrangementId, reason) {
        return updateSurrogacyArrangement(arrangementId, {
            status: SURROGACY_STATUS.CANCELLED,
            notes: (getSurrogacyArrangements().find(function(r) { return r.id === arrangementId; })?.notes || '') + ' Cancelled: ' + reason
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.SurrogacyService = {
        // Constants
        SURROGACY_TYPES: SURROGACY_TYPES,
        SURROGACY_STATUS: SURROGACY_STATUS,

        // Validation
        validateSurrogacy: validateSurrogacy,

        // Creation
        createSurrogacyArrangement: createSurrogacyArrangement,
        createSwapArrangements: createSwapArrangements,

        // Queries
        getSurrogacyArrangements: getSurrogacyArrangements,
        getSurrogacyArrangementsForCharacter: getSurrogacyArrangementsForCharacter,
        getSurrogacyArrangementsBySurrogate: getSurrogacyArrangementsBySurrogate,
        getSurrogacyArrangementsAsIntendedParent: getSurrogacyArrangementsAsIntendedParent,
        getSurrogacyChildrenForParent: getSurrogacyChildrenForParent,
        isSurrogacyChild: isSurrogacyChild,
        getSurrogacyGeneticParents: getSurrogacyGeneticParents,

        // Updates
        updateSurrogacyArrangement: updateSurrogacyArrangement,
        completeSurrogacyArrangement: completeSurrogacyArrangement,
        cancelSurrogacyArrangement: cancelSurrogacyArrangement
    };

    // Legacy aliases
    window.createSurrogacyArrangement = createSurrogacyArrangement;
    window.createSwapArrangements = createSwapArrangements;
    window.getSurrogacyArrangements = getSurrogacyArrangements;
    window.getSurrogacyArrangementsForCharacter = getSurrogacyArrangementsForCharacter;
    window.getSurrogacyArrangementsBySurrogate = getSurrogacyArrangementsBySurrogate;
    window.getSurrogacyArrangementsAsIntendedParent = getSurrogacyArrangementsAsIntendedParent;
    window.isSurrogacyChild = isSurrogacyChild;
    window.getSurrogacyGeneticParents = getSurrogacyGeneticParents;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SurrogacyService;
    }

})();