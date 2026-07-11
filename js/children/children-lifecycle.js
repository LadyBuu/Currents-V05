/**
 * =============================================================================
 * STILL WATERS - CHILDREN LIFECYCLE (js/core/children/children-lifecycle.js)
 * =============================================================================
 * 
 * Business logic for children lifecycle (fertility, pregnancy, inheritance).
 * 
 * FEATURES:
 *   - Fertility calculations (age-based, modifiers)
 *   - Pregnancy simulation
 *   - Birth year distribution
 *   - Child spacing
 *   - Inheritance rules
 *   - Recursion guard
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - children-commands.js (ChildrenCommands)
 *   - children-queries.js (ChildrenQueries)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - randomness.js (chance, random, randomInt, randomFloat)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var FERTILITY_CONFIG = {
        MIN_AGE: 14,
        MAX_AGE: 47,
        BASE_CHANCE: 0.20,
        MULTIPLE_BIRTH_CHANCE: 0.02,
        TRIPLET_CHANCE: 0.002,
        MISCARRIAGE_BASE_CHANCE: 0.05,
        STILLBORN_BASE_CHANCE: 0.02,
        CHILDBED_FEVER_BASE_CHANCE: 0.03,
        DEFAULT_MIN_CHILD_SPACING: 2,
        DEFAULT_MAX_CHILD_SPACING: 3
    };

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

    function _randomFloat(min, max) {
        if (typeof window.randomFloat === 'function') {
            return window.randomFloat(min, max);
        }
        return min + Math.random() * (max - min);
    }

    function _randomFertilityModifier() {
        if (typeof window.randomFertilityModifier === 'function') {
            return window.randomFertilityModifier();
        }
        return 0.7 + _random() * 0.6;
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
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
    // 3. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 4. FERTILITY CALCULATIONS
    // =========================================================================

    /**
     * Gets fertility age modifier for a character
     * @param {Object} character - Character object
     * @returns {number} Fertility modifier (0-1)
     */
    function getFertilityAgeModifier(character) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!character || character.gender !== 'female') return 0;

            var age = _calculateAge(character.birthYear, false, null);

            if (age < FERTILITY_CONFIG.MIN_AGE) return 0;
            if (age > FERTILITY_CONFIG.MAX_AGE) return 0;

            if (age <= 25) return 1.0;
            if (age <= 30) return 0.9;
            if (age <= 35) return 0.7;
            if (age <= 40) return 0.4;
            if (age <= 45) return 0.2;
            return 0.1;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets conception chance for a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @returns {number} Conception chance (0-1)
     */
    function getConceptionChance(mother, father) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!mother || mother.gender !== 'female') return 0;

            var chance = FERTILITY_CONFIG.BASE_CHANCE;
            chance *= getFertilityAgeModifier(mother);

            if (father && father.gender === 'male') {
                var fatherAge = _calculateAge(father.birthYear, false, null);
                if (fatherAge > 50) chance *= 0.7;
                if (fatherAge > 60) chance *= 0.5;
                if (fatherAge > 70) chance *= 0.3;
            }

            chance *= _randomFertilityModifier();

            return Math.min(0.45, Math.max(0.01, chance));
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a character can conceive
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @returns {Object} { canConceive: boolean, reason: string }
     */
    function canConceive(mother, father) {
        if (_processing) {
            return { canConceive: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            if (!mother || mother.gender !== 'female') {
                return { canConceive: false, reason: 'Not female' };
            }

            if (mother.isDeceased) {
                return { canConceive: false, reason: 'Mother is deceased' };
            }

            var age = _calculateAge(mother.birthYear, false, null);

            if (age < FERTILITY_CONFIG.MIN_AGE) {
                return { canConceive: false, reason: 'Mother too young' };
            }

            if (age > FERTILITY_CONFIG.MAX_AGE) {
                return { canConceive: false, reason: 'Mother too old' };
            }

            return { canConceive: true, reason: 'Can conceive' };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. EXPECTED CHILDREN CALCULATION
    // =========================================================================

    /**
     * Calculates expected number of children for a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @returns {number} Expected number of children
     */
    function calculateExpectedChildren(mother, father) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!mother || !mother.birthYear) return 0;

            var currentYear = _getCurrentYear();
            var motherBirthYear = mother.birthYear;

            // Find relationship start year
            var relationshipStartYear = null;
            if (father && mother.relationships) {
                for (var i = 0; i < mother.relationships.length; i++) {
                    var rel = mother.relationships[i];
                    var partnerId = rel.participantB || rel.partnerId;
                    if (partnerId === father.id && (rel.status === 'ongoing' || rel.status === 'active')) {
                        relationshipStartYear = rel.startYear || rel.details?.startYear || null;
                        break;
                    }
                }
            }

            if (!relationshipStartYear) {
                relationshipStartYear = motherBirthYear + 18;
            }

            var motherAgeAtStart = relationshipStartYear - motherBirthYear;
            var motherCurrentAge = currentYear - motherBirthYear;

            var fertileStart = Math.max(FERTILITY_CONFIG.MIN_AGE, motherAgeAtStart);
            var fertileEnd = Math.min(FERTILITY_CONFIG.MAX_AGE, motherCurrentAge);

            if (fertileStart >= fertileEnd) return 0;

            var fertileYears = Math.floor(fertileEnd - fertileStart);

            var expectedChildren = 0;
            if (fertileYears >= 20) expectedChildren = 5 + _randomInt(0, 3);
            else if (fertileYears >= 15) expectedChildren = 4 + _randomInt(0, 2);
            else if (fertileYears >= 10) expectedChildren = 3 + _randomInt(0, 2);
            else if (fertileYears >= 5) expectedChildren = 2 + _randomInt(0, 1);
            else expectedChildren = 1 + _randomInt(0, 1);

            return Math.min(8, expectedChildren);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets existing children count for a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @returns {number} Existing children count
     */
    function getExistingChildrenCount(mother, father) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!mother) return 0;

            var allChars = _getCharacters();
            var count = 0;

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                if (child.motherId === mother.id && (father ? child.fatherId === father.id : true)) {
                    count++;
                }
            }

            return count;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets expected remaining children for a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @returns {number} Expected remaining children
     */
    function getExpectedRemainingChildren(mother, father) {
        if (_processing) return 0;
        _processing = true;

        try {
            var expected = calculateExpectedChildren(mother, father);
            var existing = getExistingChildrenCount(mother, father);
            return Math.max(0, expected - existing);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. BIRTH YEAR DISTRIBUTION
    // =========================================================================

    /**
     * Calculates birth years for children of a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} childCount - Number of children
     * @returns {Array} Array of birth years
     */
    function calculateBirthYears(mother, father, childCount) {
        if (_processing) return [];
        _processing = true;

        try {
            if (!mother || !mother.birthYear || childCount <= 0) return [];

            var currentYear = _getCurrentYear();
            var motherBirthYear = mother.birthYear;

            // Find relationship start year
            var relationshipStartYear = null;
            if (father && mother.relationships) {
                for (var i = 0; i < mother.relationships.length; i++) {
                    var rel = mother.relationships[i];
                    var partnerId = rel.participantB || rel.partnerId;
                    if (partnerId === father.id && (rel.status === 'ongoing' || rel.status === 'active')) {
                        relationshipStartYear = rel.startYear || rel.details?.startYear || null;
                        break;
                    }
                }
            }

            if (!relationshipStartYear) {
                relationshipStartYear = motherBirthYear + 18;
            }

            var fertileStartYear = Math.max(relationshipStartYear, motherBirthYear + FERTILITY_CONFIG.MIN_AGE);
            var fertileEndYear = Math.min(currentYear, motherBirthYear + FERTILITY_CONFIG.MAX_AGE);

            if (fertileStartYear >= fertileEndYear || childCount <= 0) return [];

            var fertileYears = fertileEndYear - fertileStartYear;

            var birthYears = [];

            if (childCount === 1) {
                var birthYear = fertileStartYear + Math.floor(fertileYears * (0.3 + _random() * 0.4));
                birthYear = Math.min(birthYear, fertileEndYear);
                birthYear = Math.max(birthYear, fertileStartYear);
                birthYears.push(birthYear);
            } else {
                var spacing = fertileYears / (childCount + 1);
                var cumulativeOffset = 0;

                for (var i = 0; i < childCount; i++) {
                    var randomFactor = 0.7 + (_random() * 0.6);
                    var offset = spacing * (i + 1) * randomFactor;

                    if (i > 0 && offset - cumulativeOffset < 1) {
                        offset = cumulativeOffset + 1 + (_random() * 0.5);
                    }

                    cumulativeOffset = offset;
                    var birthYear = fertileStartYear + Math.floor(offset);
                    birthYear = Math.min(birthYear, fertileEndYear);
                    birthYear = Math.max(birthYear, fertileStartYear);
                    birthYears.push(birthYear);
                }
            }

            // Remove duplicates and ensure valid years
            var uniqueYears = [];
            var usedYears = {};
            var sortedYears = birthYears.slice().sort(function(a, b) { return a - b; });

            for (var i = 0; i < sortedYears.length; i++) {
                var year = sortedYears[i];
                var adjustedYear = year;
                var attempts = 0;
                while (usedYears[adjustedYear] && attempts < 10) {
                    adjustedYear = year + attempts + 1;
                    attempts++;
                }
                if (adjustedYear <= fertileEndYear) {
                    usedYears[adjustedYear] = true;
                    uniqueYears.push(adjustedYear);
                } else {
                    var fallbackYear = fertileEndYear;
                    while (usedYears[fallbackYear] && fallbackYear > fertileStartYear) {
                        fallbackYear--;
                    }
                    if (fallbackYear > fertileStartYear && !usedYears[fallbackYear]) {
                        usedYears[fallbackYear] = true;
                        uniqueYears.push(fallbackYear);
                    }
                }
            }

            while (uniqueYears.length < childCount) {
                var lastYear = uniqueYears.length > 0 ? uniqueYears[uniqueYears.length - 1] : fertileStartYear;
                var candidateYear = lastYear + 1 + Math.floor(_random() * 2);
                if (candidateYear <= fertileEndYear && !usedYears[candidateYear]) {
                    usedYears[candidateYear] = true;
                    uniqueYears.push(candidateYear);
                } else {
                    for (var y = fertileStartYear; y <= fertileEndYear; y++) {
                        if (!usedYears[y]) {
                            usedYears[y] = true;
                            uniqueYears.push(y);
                            break;
                        }
                    }
                    if (uniqueYears.length < childCount) break;
                }
            }

            uniqueYears.sort(function(a, b) { return a - b; });
            return uniqueYears.slice(0, childCount);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. PREGNANCY OUTCOME SIMULATION
    // =========================================================================

    /**
     * Rolls for pregnancy complications
     * @param {Object} mother - Mother character
     * @param {number} pregnancyNumber - Number of previous pregnancies
     * @returns {boolean} True if complications
     */
    function rollPregnancyComplications(mother, pregnancyNumber) {
        if (_processing) return false;
        _processing = true;

        try {
            pregnancyNumber = pregnancyNumber || 0;
            var complicationChance = 0.10;

            var motherAge = _calculateAge(mother.birthYear, false, null);

            if (motherAge > 40) complicationChance += 0.15;
            if (motherAge > 45) complicationChance += 0.25;
            if (pregnancyNumber > 5) complicationChance += 0.10;

            return _chance(Math.min(0.6, complicationChance));
        } finally {
            _processing = false;
        }
    }

    /**
     * Rolls for miscarriage
     * @param {Object} mother - Mother character
     * @param {number} currentAge - Mother's current age
     * @returns {boolean} True if miscarriage
     */
    function rollMiscarriage(mother, currentAge) {
        if (_processing) return false;
        _processing = true;

        try {
            var miscarriageChance = FERTILITY_CONFIG.MISCARRIAGE_BASE_CHANCE;

            if (currentAge > 35) miscarriageChance += 0.05;
            if (currentAge > 40) miscarriageChance += 0.10;
            if (currentAge > 45) miscarriageChance += 0.20;

            return _chance(Math.min(0.5, miscarriageChance));
        } finally {
            _processing = false;
        }
    }

    /**
     * Rolls for stillbirth
     * @param {Object} mother - Mother character
     * @param {number} currentAge - Mother's current age
     * @param {boolean} hasComplications - Whether pregnancy has complications
     * @returns {boolean} True if stillbirth
     */
    function rollStillbirth(mother, currentAge, hasComplications) {
        if (_processing) return false;
        _processing = true;

        try {
            hasComplications = hasComplications || false;
            var stillbornChance = FERTILITY_CONFIG.STILLBORN_BASE_CHANCE;

            if (hasComplications) stillbornChance += 0.05;
            if (currentAge > 40) stillbornChance += 0.03;

            return _chance(Math.min(0.25, stillbornChance));
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. CHILD SPACING
    // =========================================================================

    /**
     * Calculates recommended spacing between children
     * @param {Array} existingBirthYears - Existing child birth years
     * @param {number} minSpacing - Minimum spacing in years
     * @param {number} maxSpacing - Maximum spacing in years
     * @returns {number} Recommended spacing
     */
    function calculateChildSpacing(existingBirthYears, minSpacing, maxSpacing) {
        if (_processing) return 2;
        _processing = true;

        try {
            minSpacing = minSpacing || FERTILITY_CONFIG.DEFAULT_MIN_CHILD_SPACING;
            maxSpacing = maxSpacing || FERTILITY_CONFIG.DEFAULT_MAX_CHILD_SPACING;

            if (!existingBirthYears || existingBirthYears.length === 0) {
                return _randomInt(minSpacing, maxSpacing);
            }

            var sortedYears = existingBirthYears.slice().sort(function(a, b) { return a - b; });
            var lastYear = sortedYears[sortedYears.length - 1];
            var currentYear = _getCurrentYear();

            // If last child was recent, space further apart
            var yearsSinceLast = currentYear - lastYear;
            if (yearsSinceLast < 2) {
                return _randomInt(minSpacing + 1, maxSpacing + 1);
            }

            return _randomInt(minSpacing, maxSpacing);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. BATCH CHILD GENERATION
    // =========================================================================

    /**
     * Generates multiple children for a couple
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} count - Number of children to generate
     * @param {number} baseYear - Base year for birth
     * @param {Object} options - Options
     * @param {string} options.gender - 'male', 'female', or null for random
     * @param {string} options.notes - Notes
     * @param {boolean} options.autoAssignHousehold - Auto-assign household
     * @returns {Array} Array of child characters
     */
    function generateChildrenForCouple(mother, father, count, baseYear, options) {
        if (_processing) {
            _showToast('Already processing children generation', 'warning');
            return [];
        }
        _processing = true;

        try {
            if (!mother) {
                _showToast('Mother required', 'error');
                return [];
            }

            if (count <= 0) return [];

            options = options || {};
            var commands = _getCommands();
            if (!commands) {
                _showToast('Children commands not available', 'error');
                return [];
            }

            var currentYear = _getCurrentYear();
            var birthYears = [];

            if (count === 1) {
                birthYears = [baseYear || currentYear];
            } else {
                birthYears = calculateBirthYears(mother, father, count);
            }

            if (birthYears.length === 0) {
                _showToast('Could not calculate birth years', 'error');
                return [];
            }

            var children = [];
            var stillbornCount = 0;
            var failedCount = 0;

            for (var i = 0; i < birthYears.length; i++) {
                var birthYear = birthYears[i];
                var gender = options.gender || (Math.random() < 0.5 ? 'male' : 'female');
                var isStillborn = _chance(0.05);

                if (isStillborn) stillbornCount++;

                var result = commands.recordBirth(mother, father, birthYear, {
                    gender: gender,
                    isStillborn: isStillborn,
                    notes: options.notes || 'Generated child ' + (i + 1) + ' of ' + count,
                    autoAssignHousehold: options.autoAssignHousehold !== false
                });

                if (result && result.success) {
                    children.push(result.child);
                } else {
                    failedCount++;
                }
            }

            if (children.length > 0) {
                var message = children.length + ' child' + (children.length !== 1 ? 'ren' : '') + ' added';
                if (stillbornCount > 0) message += ' (' + stillbornCount + ' stillborn)';
                if (failedCount > 0) message += ' (' + failedCount + ' failed)';
                _showToast(message, 'success');
            } else {
                _showToast('Failed to generate children', 'error');
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. INHERITANCE RULES
    // =========================================================================

    /**
     * Gets the inheritance order for a parent's children
     * @param {string} parentId - Parent character ID
     * @param {Object} options - Options
     * @param {boolean} options.includeAdopted - Include adopted children
     * @param {boolean} options.includeSurrogacy - Include surrogacy children
     * @param {boolean} options.includeDeceased - Include deceased children
     * @param {boolean} options.onlyLegitimate - Only legitimate children
     * @param {string} options.genderPreference - 'male', 'female', or null
     * @returns {Array} Array of children in inheritance order
     */
    function getInheritanceOrder(parentId, options) {
        if (_processing) return [];
        _processing = true;

        try {
            options = options || {};
            var queries = _getQueries();
            if (!queries) return [];

            var allChildren = queries.getAllChildrenOfParent(parentId, options.includeDeceased || false);

            // Filter options
            if (options.onlyLegitimate) {
                allChildren = allChildren.filter(function(c) { return c.isLegitimate === true; });
            }

            if (options.genderPreference === 'male') {
                allChildren = allChildren.filter(function(c) { return c.gender === 'male'; });
            } else if (options.genderPreference === 'female') {
                allChildren = allChildren.filter(function(c) { return c.gender === 'female'; });
            }

            if (!options.includeAdopted) {
                allChildren = allChildren.filter(function(c) { 
                    return !queries.isAdopted(c.id);
                });
            }

            if (!options.includeSurrogacy) {
                allChildren = allChildren.filter(function(c) { 
                    return !queries.isSurrogacyChild(c.id);
                });
            }

            // Sort by birth year (eldest first)
            allChildren.sort(function(a, b) {
                return (a.birthYear || 0) - (b.birthYear || 0);
            });

            return allChildren;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the primary heir for a parent
     * @param {string} parentId - Parent character ID
     * @param {Object} options - Options
     * @returns {Object|null} Heir character or null
     */
    function getPrimaryHeir(parentId, options) {
        if (_processing) return null;
        _processing = true;

        try {
            var heirs = getInheritanceOrder(parentId, options);
            if (heirs.length === 0) return null;

            // First living child
            for (var i = 0; i < heirs.length; i++) {
                if (!heirs[i].isDeceased) {
                    return heirs[i];
                }
            }

            // If all deceased, return eldest deceased
            return heirs[0] || null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Checks if a child can inherit from a parent
     * @param {string} childId - Child character ID
     * @param {string} parentId - Parent character ID
     * @returns {boolean} True if can inherit
     */
    function canInherit(childId, parentId) {
        if (_processing) return false;
        _processing = true;

        try {
            var child = _getCharacterById(childId);
            var parent = _getCharacterById(parentId);

            if (!child || !parent) return false;
            if (child.isDeceased) return false;

            // Check if child is legitimate
            if (child.isLegitimate === false) return false;

            // Check if child is biological or adopted
            var queries = _getQueries();
            var isBiological = child.motherId === parentId || child.fatherId === parentId;
            var isAdopted = queries ? queries.isAdoptiveParent(parentId, childId) : false;

            return isBiological || isAdopted;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ChildrenLifecycle = {
        // Fertility
        getFertilityAgeModifier: getFertilityAgeModifier,
        getConceptionChance: getConceptionChance,
        canConceive: canConceive,

        // Expected children
        calculateExpectedChildren: calculateExpectedChildren,
        getExistingChildrenCount: getExistingChildrenCount,
        getExpectedRemainingChildren: getExpectedRemainingChildren,

        // Birth years
        calculateBirthYears: calculateBirthYears,

        // Pregnancy outcomes
        rollPregnancyComplications: rollPregnancyComplications,
        rollMiscarriage: rollMiscarriage,
        rollStillbirth: rollStillbirth,

        // Child spacing
        calculateChildSpacing: calculateChildSpacing,

        // Batch generation
        generateChildrenForCouple: generateChildrenForCouple,

        // Inheritance
        getInheritanceOrder: getInheritanceOrder,
        getPrimaryHeir: getPrimaryHeir,
        canInherit: canInherit
    };

    // Legacy aliases
    window.getFertilityAgeModifier = getFertilityAgeModifier;
    window.getConceptionChance = getConceptionChance;
    window.canConceive = canConceive;
    window.calculateExpectedChildren = calculateExpectedChildren;
    window.generateChildrenForCouple = generateChildrenForCouple;
    window.rollPregnancyComplications = rollPregnancyComplications;
    window.rollMiscarriage = rollMiscarriage;
    window.rollStillbirth = rollStillbirth;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenLifecycle;
    }

})();