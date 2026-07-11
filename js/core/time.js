/**
 * =============================================================================
 * STILL WATERS - TIME MANAGEMENT (time.js)
 * =============================================================================
 * 
 * LOCATION: js/core/time.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL time-related calculations.
 * 
 * EXPORTED FUNCTIONS:
 *   - getCurrentYearSafe() - Gets current year with fallback (NO circular deps)
 *   - calculateAge() - Calculates character age
 *   - getYearDifference() - Absolute year difference
 *   - getAgeAtEvent() - Age at specific historical event
 *   - isMinor() - Checks if under age of majority
 *   - isAdult() - Checks if age of majority or older
 *   - isFertileAge() - Checks childbearing age
 *   - isYearInRange() - Checks if year falls within range
 *   - getTimeRangeOverlap() - Returns overlap between two ranges
 *   - doTimeRangesOverlap() - Returns true if ranges overlap
 *   - getGenerationGap() - Parent-child age difference
 *   - isPlausibleParentAge() - Checks plausible parent age
 *   - calculatePregnancyDuration() - Pregnancy and birth year
 *   - getConceptionYear() - Approximate conception year
 *   - getAgeAtSuccession() - Age when character inherited
 *   - getReignLength() - Length of reign/tenure in years
 *   - formatLifespan() - Formats lifespan for display
 * 
 * DEPENDENCIES: None (pure time calculations)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

var TIME_CONSTANTS = {
    DEFAULT_YEAR: 1250,
    MIN_YEAR: -10000,
    MAX_YEAR: 9999,
    DEFAULT_AGE_OF_MAJORITY: 18,
    DEFAULT_MIN_FERTILE_AGE: 14,
    DEFAULT_MAX_FERTILE_AGE: 47,
    DEFAULT_MIN_PARENT_AGE: 12,
    DEFAULT_MAX_PARENT_AGE: 70,
    PREGNANCY_MONTHS: 9,
    MONTHS_PER_YEAR: 12
};

// =============================================================================
// 2. HELPER FUNCTIONS
// =============================================================================

function _isValidYearValue(year) {
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (isNaN(year)) return false;
    if (year < TIME_CONSTANTS.MIN_YEAR || year > TIME_CONSTANTS.MAX_YEAR) return false;
    return true;
}

// =============================================================================
// 3. SAFE CURRENT YEAR GETTER - PRIMARY DEFINITION
// =============================================================================

/**
 * Gets the current world year with fallback (safe version)
 * IMPORTANT: Does NOT call window.getCurrentYear to avoid circular dependency.
 * 
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number} Current year
 */
function getCurrentYearSafe(getCurrentYearFn) {
    getCurrentYearFn = getCurrentYearFn || null;
    if (getCurrentYearFn && typeof getCurrentYearFn === 'function') {
        return getCurrentYearFn();
    }
    if (typeof window !== 'undefined' && window.masterData && window.masterData.data) {
        var year = window.masterData.data.currentYear;
        if (typeof year === 'number' && !isNaN(year)) {
            return year;
        }
    }
    return TIME_CONSTANTS.DEFAULT_YEAR;
}

// =============================================================================
// 4. AGE CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates a character's current age
 * @param {number|null} birthYear - Character's birth year
 * @param {boolean} isDeceased - Whether character is deceased
 * @param {number|null} deathYear - Character's death year (if deceased)
 * @param {number} currentYear - Current world year
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number|null} Age in years or null if invalid
 */
function calculateAge(birthYear, isDeceased, deathYear, currentYear, getCurrentYearFn) {
    isDeceased = isDeceased || false;
    deathYear = deathYear || null;
    currentYear = currentYear || null;
    getCurrentYearFn = getCurrentYearFn || null;
    
    if (!_isValidYearValue(birthYear)) {
        return null;
    }
    
    if (isDeceased) {
        if (_isValidYearValue(deathYear)) {
            var age = deathYear - birthYear;
            if (age < 0) return null;
            return age;
        }
        return null;
    }
    
    var year;
    if (_isValidYearValue(currentYear)) {
        year = currentYear;
    } else if (getCurrentYearFn) {
        year = getCurrentYearFn();
    } else {
        year = getCurrentYearSafe();
    }
    
    var age = year - birthYear;
    if (age < 0) return 0;
    return age;
}

/**
 * Calculates the absolute difference between two years
 * @param {number|null} startYear - Starting year
 * @param {number|null} endYear - Ending year
 * @returns {number|null} Absolute year difference
 */
function getYearDifference(startYear, endYear) {
    if (!_isValidYearValue(startYear) || !_isValidYearValue(endYear)) {
        return null;
    }
    return Math.abs(endYear - startYear);
}

/**
 * Calculates a character's age at a specific historical event year
 * @param {Object|null} char - Character object (must have birthYear)
 * @param {number} eventYear - Year the event occurred
 * @param {boolean} useDeathCap - If true, caps age at death year
 * @returns {number|null} Age at event
 */
function getAgeAtEvent(char, eventYear, useDeathCap) {
    useDeathCap = useDeathCap !== false;
    if (!char || !_isValidYearValue(char.birthYear)) {
        return null;
    }
    if (!_isValidYearValue(eventYear)) {
        return null;
    }
    
    var age = eventYear - char.birthYear;
    if (age < 0) return 0;
    
    if (useDeathCap && char.isDeceased && _isValidYearValue(char.deathYear)) {
        var ageAtDeath = char.deathYear - char.birthYear;
        age = Math.min(age, ageAtDeath);
    }
    
    return age;
}

// =============================================================================
// 5. AGE VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Checks if a character is a minor (under age of majority)
 * @param {number|null} age - Character's age
 * @param {number} ageOfMajority - Age of majority (default 18)
 * @returns {boolean}
 */
function isMinor(age, ageOfMajority) {
    ageOfMajority = ageOfMajority || TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY;
    if (age === null || age === undefined) return false;
    return age < ageOfMajority;
}

/**
 * Checks if a character is an adult (age of majority or older)
 * @param {number|null} age - Character's age
 * @param {number} ageOfMajority - Age of majority (default 18)
 * @returns {boolean}
 */
function isAdult(age, ageOfMajority) {
    ageOfMajority = ageOfMajority || TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY;
    if (age === null || age === undefined) return false;
    return age >= ageOfMajority;
}

/**
 * Checks if a character is of childbearing age
 * @param {number|null} age - Character's age
 * @param {number} minFertileAge - Minimum fertile age (default 14)
 * @param {number} maxFertileAge - Maximum fertile age (default 47)
 * @returns {boolean}
 */
function isFertileAge(age, minFertileAge, maxFertileAge) {
    minFertileAge = minFertileAge || TIME_CONSTANTS.DEFAULT_MIN_FERTILE_AGE;
    maxFertileAge = maxFertileAge || TIME_CONSTANTS.DEFAULT_MAX_FERTILE_AGE;
    if (age === null || age === undefined) return false;
    var min = Math.max(0, minFertileAge);
    var max = Math.max(min, maxFertileAge);
    return age >= min && age <= max;
}

// =============================================================================
// 6. TIME RANGE UTILITIES - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Determines if a year falls within a given range (inclusive)
 * @param {number} year - Year to check
 * @param {number} startYear - Range start (inclusive)
 * @param {number} endYear - Range end (inclusive)
 * @returns {boolean}
 */
function isYearInRange(year, startYear, endYear) {
    if (!_isValidYearValue(year)) return false;
    if (!_isValidYearValue(startYear)) return false;
    if (!_isValidYearValue(endYear)) return false;
    return year >= startYear && year <= endYear;
}

/**
 * Gets the overlap between two time ranges
 * @param {Object} range1 - { start: number, end: number }
 * @param {Object} range2 - { start: number, end: number }
 * @returns {Object|null} Overlap range or null
 */
function getTimeRangeOverlap(range1, range2) {
    if (!range1 || !range2) return null;
    if (!_isValidYearValue(range1.start) || !_isValidYearValue(range1.end)) return null;
    if (!_isValidYearValue(range2.start) || !_isValidYearValue(range2.end)) return null;
    if (range1.start > range1.end || range2.start > range2.end) return null;
    
    var overlapStart = Math.max(range1.start, range2.start);
    var overlapEnd = Math.min(range1.end, range2.end);
    
    if (overlapStart > overlapEnd) return null;
    return { start: overlapStart, end: overlapEnd };
}

/**
 * Checks if two time ranges overlap
 * @param {Object} range1 - { start: number, end: number }
 * @param {Object} range2 - { start: number, end: number }
 * @returns {boolean}
 */
function doTimeRangesOverlap(range1, range2) {
    return getTimeRangeOverlap(range1, range2) !== null;
}

// =============================================================================
// 7. GENERATION & SUCCESSION TIMING - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates typical generation gap (parent-child age difference)
 * @param {number} parentBirthYear - Parent's birth year
 * @param {number} childBirthYear - Child's birth year
 * @returns {number|null} Generation gap in years
 */
function getGenerationGap(parentBirthYear, childBirthYear) {
    if (!_isValidYearValue(parentBirthYear) || !_isValidYearValue(childBirthYear)) {
        return null;
    }
    return Math.abs(childBirthYear - parentBirthYear);
}

/**
 * Checks if a parent could plausibly have a child at that age
 * @param {number} parentAgeAtChildBirth - Parent's age when child was born
 * @param {number} minParentAge - Minimum plausible parent age (default 12)
 * @param {number} maxParentAge - Maximum plausible parent age (default 70)
 * @returns {boolean}
 */
function isPlausibleParentAge(parentAgeAtChildBirth, minParentAge, maxParentAge) {
    minParentAge = minParentAge || TIME_CONSTANTS.DEFAULT_MIN_PARENT_AGE;
    maxParentAge = maxParentAge || TIME_CONSTANTS.DEFAULT_MAX_PARENT_AGE;
    if (parentAgeAtChildBirth === null || parentAgeAtChildBirth === undefined) return false;
    var min = Math.max(0, minParentAge);
    var max = Math.max(min, maxParentAge);
    return parentAgeAtChildBirth >= min && parentAgeAtChildBirth <= max;
}

// =============================================================================
// 8. PREGNANCY & BIRTH CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates pregnancy duration and birth year
 * @param {number} conceptionYear - Year of conception
 * @param {number} conceptionMonth - Month of conception (1-12, default 6)
 * @returns {Object} { birthYear, gestationMonths, conceptionMonth, birthMonth }
 */
function calculatePregnancyDuration(conceptionYear, conceptionMonth) {
    conceptionMonth = conceptionMonth || 6;
    if (!_isValidYearValue(conceptionYear)) {
        return { 
            birthYear: null, 
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS, 
            conceptionMonth: conceptionMonth,
            birthMonth: null
        };
    }
    
    var conceptionMonthValid = Math.min(12, Math.max(1, conceptionMonth || 6));
    var birthMonthRaw = conceptionMonthValid + TIME_CONSTANTS.PREGNANCY_MONTHS;
    var birthYear = conceptionYear;
    var birthMonth = birthMonthRaw;
    
    if (birthMonthRaw > TIME_CONSTANTS.MONTHS_PER_YEAR) {
        birthYear = conceptionYear + 1;
        birthMonth = birthMonthRaw - TIME_CONSTANTS.MONTHS_PER_YEAR;
    }
    
    return {
        birthYear: birthYear,
        gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
        conceptionMonth: conceptionMonthValid,
        birthMonth: birthMonth
    };
}

/**
 * Calculates approximate conception year from birth year
 * @param {number} birthYear - Birth year
 * @returns {number|null} Approximate conception year
 */
function getConceptionYear(birthYear) {
    if (!_isValidYearValue(birthYear)) return null;
    return birthYear - 1;
}

// =============================================================================
// 9. SUCCESSION & REIGN CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates age of succession (when a character inherits)
 * @param {number} birthYear - Character's birth year
 * @param {number} predecessorDeathYear - Year the predecessor died
 * @returns {number|null} Age at succession
 */
function getAgeAtSuccession(birthYear, predecessorDeathYear) {
    if (!_isValidYearValue(birthYear) || !_isValidYearValue(predecessorDeathYear)) {
        return null;
    }
    var age = predecessorDeathYear - birthYear;
    return Math.max(0, age);
}

/**
 * Calculates the length of a reign/tenure
 * @param {number} startYear - Start year of reign
 * @param {number|null} endYear - End year of reign (null for current)
 * @param {number} currentYear - Current world year
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number} Length in years
 */
function getReignLength(startYear, endYear, currentYear, getCurrentYearFn) {
    endYear = endYear || null;
    currentYear = currentYear || null;
    getCurrentYearFn = getCurrentYearFn || null;
    
    if (!_isValidYearValue(startYear)) return 0;
    
    var actualEndYear;
    if (_isValidYearValue(endYear)) {
        actualEndYear = endYear;
    } else if (_isValidYearValue(currentYear)) {
        actualEndYear = currentYear;
    } else if (getCurrentYearFn) {
        actualEndYear = getCurrentYearFn();
    } else {
        actualEndYear = getCurrentYearSafe();
    }
    
    if (actualEndYear < startYear) return 0;
    return actualEndYear - startYear;
}

// =============================================================================
// 10. LIFESPAN FORMATTING - PRIMARY DEFINITION
// =============================================================================

/**
 * Formats a character's lifespan for display
 * @param {Object} char - Character object with birthYear, deathYear, isDeceased
 * @param {string} format - 'full', 'short', or 'birth-only' (default 'full')
 * @returns {string} Formatted lifespan
 */
function formatLifespan(char, format) {
    format = format || 'full';
    if (!char || !_isValidYearValue(char.birthYear)) {
        return '?–?';
    }
    
    var birthYear = char.birthYear;
    
    if (format === 'birth-only') {
        return 'b. ' + birthYear;
    }
    
    if (char.isDeceased && _isValidYearValue(char.deathYear)) {
        if (format === 'short') {
            return birthYear + '–' + char.deathYear;
        }
        var age = char.deathYear - char.birthYear;
        return birthYear + '–' + char.deathYear + ' (aged ' + age + ')';
    }
    
    if (format === 'short') {
        return 'b. ' + birthYear;
    }
    
    return 'b. ' + birthYear;
}

// =============================================================================
// 11. CONVENIENCE WRAPPER (deprecated - kept for backward compatibility)
// =============================================================================

function _getCurrentYear(getCurrentYearFn) {
    return getCurrentYearSafe(getCurrentYearFn);
}

// =============================================================================
// 12. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Constants
window.TIME_CONSTANTS = TIME_CONSTANTS;

// Safe current year getter
window.getCurrentYearSafe = getCurrentYearSafe;

// Core age calculations
window.calculateAge = calculateAge;
window.getYearDifference = getYearDifference;
window.getAgeAtEvent = getAgeAtEvent;

// Age validation
window.isMinor = isMinor;
window.isAdult = isAdult;
window.isFertileAge = isFertileAge;

// Time range utilities
window.isYearInRange = isYearInRange;
window.getTimeRangeOverlap = getTimeRangeOverlap;
window.doTimeRangesOverlap = doTimeRangesOverlap;

// Generation & succession
window.getGenerationGap = getGenerationGap;
window.isPlausibleParentAge = isPlausibleParentAge;

// Pregnancy & birth
window.calculatePregnancyDuration = calculatePregnancyDuration;
window.getConceptionYear = getConceptionYear;

// Succession & reign
window.getAgeAtSuccession = getAgeAtSuccession;
window.getReignLength = getReignLength;

// Lifespan formatting
window.formatLifespan = formatLifespan;

// Backward compatibility (deprecated)
window._getCurrentYear = _getCurrentYear;