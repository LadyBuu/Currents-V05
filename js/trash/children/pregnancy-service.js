/**
 * =============================================================================
 * STILL WATERS - PREGNANCY SERVICE (js/core/children/pregnancy-service.js)
 * =============================================================================
 * 
 * This file contains PURE pregnancy logic with NO UI:
 * - Fertility calculations (age-based, modifiers)
 * - Pregnancy simulation
 * - Birth year distribution
 * - Child spacing
 * - Pregnancy complications
 * - Pregnancy history
 * 
 * DEPENDENCIES:
 *   - children-state.js (ChildrenState)
 *   - children-commands.js (ChildrenCommands)
 *   - children-queries.js (ChildrenQueries)
 *   - children-lifecycle.js (ChildrenLifecycle)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - randomness.js (chance, random, randomInt, randomFloat)
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

    var PREGNANCY_CONFIG = {
        GESTATION_MONTHS: 9,
        FERTILITY_BASE_CHANCE: 0.20,
        FERTILITY_MAX_AGE: 47,
        FERTILITY_MIN_AGE: 14,
        MULTIPLE_BIRTH_CHANCE: 0.02,
        TRIPLET_CHANCE: 0.002,
        MISCARRIAGE_BASE_CHANCE: 0.05,
        STILLBORN_BASE_CHANCE: 0.02,
        CHILDBED_FEVER_BASE_CHANCE: 0.03,
        DEFAULT_MIN_CHILD_SPACING: 2,
        DEFAULT_MAX_CHILD_SPACING: 3,
        MAX_PREGNANCY_ATTEMPTS: 200
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

    function _getLifecycle() {
        return typeof window.ChildrenLifecycle !== 'undefined' ? window.ChildrenLifecycle : null;
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

            if (age < PREGNANCY_CONFIG.FERTILITY_MIN_AGE) return 0;
            if (age > PREGNANCY_CONFIG.FERTILITY_MAX_AGE) return 0;

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

            var chance = PREGNANCY_CONFIG.FERTILITY_BASE_CHANCE;
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

            if (age < PREGNANCY_CONFIG.FERTILITY_MIN_AGE) {
                return { canConceive: false, reason: 'Mother too young' };
            }

            if (age > PREGNANCY_CONFIG.FERTILITY_MAX_AGE) {
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

            var fertileStart = Math.max(PREGNANCY_CONFIG.FERTILITY_MIN_AGE, motherAgeAtStart);
            var fertileEnd = Math.min(PREGNANCY_CONFIG.FERTILITY_MAX_AGE, motherCurrentAge);

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

            var fertileStartYear = Math.max(relationshipStartYear, motherBirthYear + PREGNANCY_CONFIG.FERTILITY_MIN_AGE);
            var fertileEndYear = Math.min(currentYear, motherBirthYear + PREGNANCY_CONFIG.FERTILITY_MAX_AGE);

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
    // 7. PREGNANCY COMPLICATIONS
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
            var miscarriageChance = PREGNANCY_CONFIG.MISCARRIAGE_BASE_CHANCE;

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
            var stillbornChance = PREGNANCY_CONFIG.STILLBORN_BASE_CHANCE;

            if (hasComplications) stillbornChance += 0.05;
            if (currentAge > 40) stillbornChance += 0.03;

            return _chance(Math.min(0.25, stillbornChance));
        } finally {
            _processing = false;
        }
    }

    /**
     * Rolls for maternal death (childbed fever)
     * @param {Object} mother - Mother character
     * @param {number} currentAge - Mother's current age
     * @param {boolean} hasComplications - Whether pregnancy has complications
     * @param {boolean} isMultiple - Multiple birth
     * @returns {boolean} True if maternal death
     */
    function rollMaternalDeath(mother, currentAge, hasComplications, isMultiple) {
        if (_processing) return false;
        _processing = true;

        try {
            var deathChance = PREGNANCY_CONFIG.CHILDBED_FEVER_BASE_CHANCE;

            if (hasComplications) deathChance *= 2;
            if (isMultiple) deathChance *= 1.5;
            if (currentAge > 40) deathChance += 0.02;
            if (currentAge > 45) deathChance += 0.05;

            return _chance(Math.min(0.3, deathChance));
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. PREGNANCY SIMULATION
    // =========================================================================

    /**
     * Simulates a pregnancy attempt
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} year - Year of conception attempt
     * @param {Object} options - Options
     * @param {number} options.attemptNumber - Attempt number (for spacing)
     * @param {boolean} options.forceConception - Force conception
     * @returns {Object} Result object
     */
    function simulatePregnancyAttempt(mother, father, year, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            var check = canConceive(mother, father);
            if (!check.canConceive) {
                return { success: false, reason: check.reason };
            }

            var chance = getConceptionChance(mother, father);
            if (options.forceConception) chance = 1.0;

            if (!_chance(chance)) {
                return { success: false, reason: 'Failed to conceive' };
            }

            // Determine multiple birth
            var fetusCount = 1;
            var isMultiple = false;

            if (!options.forceSingle) {
                var multipleRoll = _random();
                if (multipleRoll < PREGNANCY_CONFIG.TRIPLET_CHANCE) {
                    fetusCount = 3;
                    isMultiple = true;
                } else if (multipleRoll < PREGNANCY_CONFIG.MULTIPLE_BIRTH_CHANCE) {
                    fetusCount = 2;
                    isMultiple = true;
                }
            }

            var motherAge = _calculateAge(mother.birthYear, false, null);
            var pregnancyNumber = (options.attemptNumber || 0);

            var hasComplications = rollPregnancyComplications(mother, pregnancyNumber);
            var miscarriage = rollMiscarriage(mother, motherAge);

            if (miscarriage) {
                return {
                    success: true,
                    outcome: 'miscarriage',
                    fetusCount: fetusCount,
                    isMultiple: isMultiple,
                    year: year,
                    mother: mother,
                    father: father
                };
            }

            var stillborn = rollStillbirth(mother, motherAge, hasComplications);

            var maternalDeath = rollMaternalDeath(mother, motherAge, hasComplications, isMultiple);

            var dueYear = year + Math.floor(PREGNANCY_CONFIG.GESTATION_MONTHS / 12);

            return {
                success: true,
                outcome: 'pregnancy',
                fetusCount: fetusCount,
                isMultiple: isMultiple,
                year: year,
                dueYear: dueYear,
                hasComplications: hasComplications,
                stillborn: stillborn,
                maternalDeath: maternalDeath,
                mother: mother,
                father: father
            };

        } finally {
            _processing = false;
        }
    }

    /**
     * Simulates a full pregnancy and birth
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} year - Year of conception
     * @param {Object} options - Options
     * @param {number} options.attemptNumber - Attempt number
     * @param {boolean} options.forceConception - Force conception
     * @param {boolean} options.forceSingle - Force single birth
     * @param {string} options.gender - Gender preference
     * @param {boolean} options.autoAssignHousehold - Auto-assign household
     * @returns {Object} Result object with children
     */
    function simulatePregnancyAndBirth(mother, father, year, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};

            var attempt = simulatePregnancyAttempt(mother, father, year, {
                attemptNumber: options.attemptNumber,
                forceConception: options.forceConception,
                forceSingle: options.forceSingle
            });

            if (!attempt || !attempt.success) {
                return attempt || { success: false, reason: 'Failed to conceive' };
            }

            if (attempt.outcome === 'miscarriage') {
                _logEvent('pregnancy', 'Miscarriage',
                    mother.name + ' suffered a miscarriage in ' + year,
                    [mother, father]);
                return {
                    success: true,
                    outcome: 'miscarriage',
                    mother: mother,
                    father: father,
                    year: year
                };
            }

            var commands = _getCommands();
            if (!commands) {
                return { success: false, reason: 'Children commands not available' };
            }

            var birthYear = attempt.dueYear || year + 1;
            var children = [];

            for (var i = 0; i < attempt.fetusCount; i++) {
                var gender = options.gender || (Math.random() < 0.5 ? 'male' : 'female');
                var isStillborn = attempt.stillborn && i === 0;

                var result = commands.recordBirth(mother, father, birthYear, {
                    gender: gender,
                    isStillborn: isStillborn,
                    notes: options.notes || '',
                    autoAssignHousehold: options.autoAssignHousehold !== false
                });

                if (result && result.success) {
                    children.push(result.child);
                }
            }

            // Record pregnancy in history
            var state = _getState();
            if (state) {
                state._addPregnancyRecord({
                    motherId: mother.id,
                    fatherId: father?.id || null,
                    childIds: children.map(function(c) { return c.id; }),
                    birthYear: birthYear,
                    gender: options.gender || 'mixed',
                    isMultiple: attempt.isMultiple,
                    fetusCount: attempt.fetusCount,
                    hasComplications: attempt.hasComplications,
                    maternalDeath: attempt.maternalDeath,
                    notes: options.notes || ''
                });
            }

            // Handle maternal death
            if (attempt.maternalDeath) {
                _logEvent('maternal_death', 'Maternal Death',
                    mother.name + ' died of childbed fever after giving birth',
                    [mother]);

                // Kill mother using mortality system if available
                if (typeof window.MortalityCommands !== 'undefined') {
                    window.MortalityCommands.killCharacter(mother, birthYear, 'Childbed fever', {
                        notes: 'Died giving birth to ' + children.length + ' child' + (children.length !== 1 ? 'ren' : '')
                    });
                }
            }

            _logEvent('birth', 'Birth',
                mother.name + ' gave birth to ' + children.length + ' child' + (children.length !== 1 ? 'ren' : '') + ' in ' + birthYear,
                [mother, father]);

            _saveMasterData();
            _invalidateCaches();

            return {
                success: true,
                outcome: 'birth',
                children: children,
                birthYear: birthYear,
                mother: mother,
                father: father,
                isMultiple: attempt.isMultiple,
                fetusCount: attempt.fetusCount,
                hasComplications: attempt.hasComplications,
                maternalDeath: attempt.maternalDeath,
                stillborn: attempt.stillborn
            };

        } finally {
            _processing = false;
        }
    }

    /**
     * Simulates multiple pregnancies over a period
     * @param {Object} mother - Mother character
     * @param {Object} father - Father character (optional)
     * @param {number} startYear - Starting year
     * @param {number} endYear - Ending year
     * @param {Object} options - Options
     * @param {number} options.maxChildren - Maximum children
     * @param {number} options.minSpacing - Minimum child spacing
     * @param {number} options.maxSpacing - Maximum child spacing
     * @returns {Array} Array of pregnancy results
     */
    function simulateMultiplePregnancies(mother, father, startYear, endYear, options) {
        if (_processing) return [];
        _processing = true;

        try {
            options = options || {};
            var results = [];
            var currentYear = startYear;
            var attemptNumber = 0;
            var childrenBorn = 0;
            var maxChildren = options.maxChildren || 8;
            var minSpacing = options.minSpacing || PREGNANCY_CONFIG.DEFAULT_MIN_CHILD_SPACING;
            var maxSpacing = options.maxSpacing || PREGNANCY_CONFIG.DEFAULT_MAX_CHILD_SPACING;

            var check = canConceive(mother, father);
            if (!check.canConceive) {
                return results;
            }

            while (currentYear <= endYear && childrenBorn < maxChildren) {
                attemptNumber++;

                var result = simulatePregnancyAndBirth(mother, father, currentYear, {
                    attemptNumber: attemptNumber,
                    forceConception: options.forceConception,
                    forceSingle: options.forceSingle,
                    gender: options.gender,
                    autoAssignHousehold: options.autoAssignHousehold
                });

                if (result.success && result.outcome === 'birth') {
                    childrenBorn += result.children.length;
                    results.push(result);

                    // Space next pregnancy
                    var spacing = _randomInt(minSpacing, maxSpacing);
                    currentYear = result.birthYear + spacing;
                } else if (result.success && result.outcome === 'miscarriage') {
                    results.push(result);
                    currentYear += 1;
                } else {
                    currentYear += 1;
                }

                // Prevent infinite loop
                if (attemptNumber > PREGNANCY_CONFIG.MAX_PREGNANCY_ATTEMPTS) break;
            }

            return results;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. PREGNANCY HISTORY QUERIES
    // =========================================================================

    /**
     * Gets pregnancy history for a mother
     * @param {string} motherId - Mother character ID
     * @returns {Array} Array of pregnancy records
     */
    function getPregnancyHistory(motherId) {
        if (_processing) return [];
        _processing = true;

        try {
            var queries = _getQueries();
            if (queries) {
                return queries.getPregnancyRecords(motherId);
            }

            var state = _getState();
            if (state) {
                return state.getPregnancyRecords(motherId);
            }

            return [];
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets pregnancy count for a mother
     * @param {string} motherId - Mother character ID
     * @returns {number} Number of pregnancies
     */
    function getPregnancyCount(motherId) {
        if (_processing) return 0;
        _processing = true;

        try {
            var history = getPregnancyHistory(motherId);
            return history.length;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets childbirth count for a mother
     * @param {string} motherId - Mother character ID
     * @returns {number} Number of childbirths
     */
    function getChildbirthCount(motherId) {
        if (_processing) return 0;
        _processing = true;

        try {
            var allChars = _getCharacters();
            var count = 0;

            for (var i = 0; i < allChars.length; i++) {
                if (allChars[i].motherId === motherId) {
                    count++;
                }
            }

            return count;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets pregnancy statistics for a mother
     * @param {string} motherId - Mother character ID
     * @returns {Object} Statistics object
     */
    function getPregnancyStatistics(motherId) {
        if (_processing) return null;
        _processing = true;

        try {
            var history = getPregnancyHistory(motherId);
            var children = getChildbirthCount(motherId);

            var pregnancies = history.length;
            var miscarriages = 0;
            var births = 0;
            var stillbirths = 0;
            var multipleBirths = 0;
            var maternalDeaths = 0;

            for (var i = 0; i < history.length; i++) {
                var p = history[i];
                if (p.isMiscarriage) miscarriages++;
                if (p.isMultiple) multipleBirths++;
                if (p.maternalDeath) maternalDeaths++;
                if (p.stillborn) stillbirths++;
                if (p.outcome === 'birth' || p.childIds?.length > 0) births++;
            }

            return {
                pregnancies: pregnancies,
                miscarriages: miscarriages,
                births: births,
                children: children,
                stillbirths: stillbirths,
                multipleBirths: multipleBirths,
                maternalDeaths: maternalDeaths,
                successRate: pregnancies > 0 ? Math.round((births / pregnancies) * 100) : 0
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.PregnancyService = {
        // Constants
        PREGNANCY_CONFIG: PREGNANCY_CONFIG,

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

        // Complications
        rollPregnancyComplications: rollPregnancyComplications,
        rollMiscarriage: rollMiscarriage,
        rollStillbirth: rollStillbirth,
        rollMaternalDeath: rollMaternalDeath,

        // Simulation
        simulatePregnancyAttempt: simulatePregnancyAttempt,
        simulatePregnancyAndBirth: simulatePregnancyAndBirth,
        simulateMultiplePregnancies: simulateMultiplePregnancies,

        // History
        getPregnancyHistory: getPregnancyHistory,
        getPregnancyCount: getPregnancyCount,
        getChildbirthCount: getChildbirthCount,
        getPregnancyStatistics: getPregnancyStatistics
    };

    // Legacy aliases
    window.getFertilityAgeModifier = getFertilityAgeModifier;
    window.getConceptionChance = getConceptionChance;
    window.canConceive = canConceive;
    window.calculateExpectedChildren = calculateExpectedChildren;
    window.getExpectedRemainingChildren = getExpectedRemainingChildren;
    window.calculateBirthYears = calculateBirthYears;
    window.rollPregnancyComplications = rollPregnancyComplications;
    window.rollMiscarriage = rollMiscarriage;
    window.rollStillbirth = rollStillbirth;
    window.rollMaternalDeath = rollMaternalDeath;
    window.getChildbirthCount = getChildbirthCount;
    window.getPregnancyHistory = getPregnancyHistory;
    window.getPregnancyCount = getPregnancyCount;
    window.getPregnancyStatistics = getPregnancyStatistics;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.PregnancyService;
    }

})();