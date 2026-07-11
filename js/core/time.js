/**
 * =============================================================================
 * STILL WATERS - TIME MANAGEMENT (time.js)
 * =============================================================================
 * 
 * LOCATION: js/core/time.js
 * 
 * This file contains ALL time-related calculations including:
 * - Age calculation (current age, age at death, age at event)
 * - Year difference calculations
 * - Age at event tracking
 * - Time range utilities
 * - Age validation
 * 
 * FUTURE EXTENSIONS (planned):
 * - Pregnancy duration calculation
 * - Succession timing (inherit at age X)
 * - Reign period calculations
 * - Historical event chronology
 * - Inheritance timing (age of majority)
 * - Fertility window calculations
 * - Generation gap analysis
 * 
 * DEPENDENCIES: None (pure time calculations)
 * 
 * NOTE: formatAge() is now in formatting.js. Use window.formatAge() for display.
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Constants:
 *   - TIME_CONSTANTS - Object with DEFAULT_YEAR, MIN_YEAR, MAX_YEAR, DEFAULT_AGE_OF_MAJORITY (18), DEFAULT_MIN_FERTILE_AGE (14), DEFAULT_MAX_FERTILE_AGE (47), DEFAULT_MIN_PARENT_AGE (12), DEFAULT_MAX_PARENT_AGE (70), PREGNANCY_MONTHS (9), MONTHS_PER_YEAR (12)
 * 
 * Safe Current Year Getter (use this to avoid circular dependencies):
 *   - getCurrentYearSafe(getCurrentYearFn) - Gets current world year with fallback (does NOT call window.getCurrentYear)
 * 
 * Core Age Calculations:
 *   - calculateAge(birthYear, isDeceased, deathYear, currentYear, getCurrentYearFn) - Calculates age (handles deceased characters)
 *   - getYearDifference(startYear, endYear) - Absolute year difference
 *   - getAgeAtEvent(char, eventYear, useDeathCap) - Age at specific historical event
 * 
 * Age Validation:
 *   - isMinor(age, ageOfMajority) - Checks if under age of majority (default 18)
 *   - isAdult(age, ageOfMajority) - Checks if age of majority or older
 *   - isFertileAge(age, minFertileAge, maxFertileAge) - Checks childbearing age (female fertility window: 14-47)
 * 
 * Time Range Utilities:
 *   - isYearInRange(year, startYear, endYear) - Checks if year falls within range (inclusive)
 *   - getTimeRangeOverlap(range1, range2) - Returns overlap between two ranges { start, end }
 *   - doTimeRangesOverlap(range1, range2) - Returns true if ranges overlap
 * 
 * Generation & Succession Timing:
 *   - getGenerationGap(parentBirthYear, childBirthYear) - Parent-child age difference
 *   - isPlausibleParentAge(parentAgeAtChildBirth, minParentAge, maxParentAge) - Checks plausible parent age (default 12-70)
 * 
 * Pregnancy & Birth Calculations:
 *   - calculatePregnancyDuration(conceptionYear, conceptionMonth) - Returns { birthYear, gestationMonths, conceptionMonth, birthMonth }
 *   - getConceptionYear(birthYear) - Approximate conception year (birthYear - 1)
 * 
 * Succession & Reign Calculations:
 *   - getAgeAtSuccession(birthYear, predecessorDeathYear) - Age when character inherited
 *   - getReignLength(startYear, endYear, currentYear, getCurrentYearFn) - Length of reign/tenure in years
 * 
 * Lifespan Formatting:
 *   - formatLifespan(char, format) - Formats lifespan ('full', 'short', 'birth-only')
 * 
 * Backward Compatibility (Deprecated):
 *   - _getCurrentYear(getCurrentYearFn) - @deprecated Use getCurrentYearSafe() instead
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const TIME_CONSTANTS = {
    DEFAULT_YEAR: 1250,
    MIN_YEAR: -10000,  // Support for BC years
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

/**
 * Validates a year value
 * @param {*} year - Year to validate
 * @returns {boolean} True if valid
 */
function _isValidYearValue(year) {
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (isNaN(year)) return false;
    if (year < TIME_CONSTANTS.MIN_YEAR || year > TIME_CONSTANTS.MAX_YEAR) return false;
    return true;
}

/**
 * Gets the current world year with fallback (safe version)
 * IMPORTANT: This function does NOT call window.getCurrentYear to avoid circular dependency.
 * Use this function for safe year retrieval with proper fallbacks.
 * 
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number} Current year
 */
function getCurrentYearSafe(getCurrentYearFn = null) {
    if (getCurrentYearFn && typeof getCurrentYearFn === 'function') {
        return getCurrentYearFn();
    }
    // Direct access to masterData - NO circular call to window.getCurrentYear
    if (typeof window !== 'undefined' && window.masterData && window.masterData.data) {
        const year = window.masterData.data.currentYear;
        if (typeof year === 'number' && !isNaN(year)) {
            return year;
        }
    }
    return TIME_CONSTANTS.DEFAULT_YEAR;
}

// =============================================================================
// 3. AGE CALCULATIONS
// =============================================================================

/**
 * Calculates a character's current age based on birth year and current world year
 * Handles deceased characters by using death year instead of current year
 * 
 * @param {number|null} birthYear - Character's birth year
 * @param {boolean} isDeceased - Whether the character is deceased
 * @param {number|null} deathYear - Character's death year (if deceased)
 * @param {number} currentYear - Current world year (defaults to getCurrentYearSafe if not provided)
 * @param {Function} getCurrentYearFn - Optional resolver function for current year
 * @returns {number|null} Age in years (returns null if birth year is invalid)
 */
function calculateAge(birthYear, isDeceased = false, deathYear = null, currentYear = null, getCurrentYearFn = null) {
    // Validate birth year
    if (!_isValidYearValue(birthYear)) {
        return null;
    }
    
    // For deceased characters, must have death year
    if (isDeceased) {
        if (_isValidYearValue(deathYear)) {
            const age = deathYear - birthYear;
            // Negative age means death before birth - data error
            if (age < 0) return null;
            return age;
        }
        // Deceased but no death year - can't calculate
        return null;
    }
    
    // For living characters, use current year
    let year;
    if (_isValidYearValue(currentYear)) {
        year = currentYear;
    } else if (getCurrentYearFn) {
        year = getCurrentYearFn();
    } else {
        year = getCurrentYearSafe();
    }
    
    const age = year - birthYear;
    
    // Birth year in the future - not yet born
    if (age < 0) return 0;
    
    return age;
}

/**
 * Calculates the absolute difference between two years
 * 
 * @param {number|null} startYear - Starting year
 * @param {number|null} endYear - Ending year
 * @returns {number|null} Absolute year difference (returns null if either year is invalid)
 */
function getYearDifference(startYear, endYear) {
    if (!_isValidYearValue(startYear) || !_isValidYearValue(endYear)) {
        return null;
    }
    return Math.abs(endYear - startYear);
}

/**
 * Calculates a character's age at a specific historical event year
 * 
 * @param {Object|null} char - Character object (must have birthYear)
 * @param {number} eventYear - Year the event occurred
 * @param {boolean} useDeathCap - If true, caps age at death year (default true)
 * @returns {number|null} Age at event (returns null if character or birth year missing)
 */
function getAgeAtEvent(char, eventYear, useDeathCap = true) {
    if (!char || !_isValidYearValue(char.birthYear)) {
        return null;
    }
    
    if (!_isValidYearValue(eventYear)) {
        return null;
    }
    
    let age = eventYear - char.birthYear;
    
    // Event before birth
    if (age < 0) return 0;
    
    // Cap at death year if character was deceased
    if (useDeathCap && char.isDeceased && _isValidYearValue(char.deathYear)) {
        const ageAtDeath = char.deathYear - char.birthYear;
        age = Math.min(age, ageAtDeath);
    }
    
    return age;
}

// =============================================================================
// 4. AGE VALIDATION & UTILITIES
// =============================================================================

/**
 * Checks if a character is a minor (under age of majority)
 * @param {number|null} age - Character's age
 * @param {number} ageOfMajority - Age of majority (default 18)
 * @returns {boolean} False if age is null/undefined
 */
function isMinor(age, ageOfMajority = TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY) {
    if (age === null || age === undefined) return false;
    return age < ageOfMajority;
}

/**
 * Checks if a character is an adult (age of majority or older)
 * @param {number|null} age - Character's age
 * @param {number} ageOfMajority - Age of majority (default 18)
 * @returns {boolean} False if age is null/undefined
 */
function isAdult(age, ageOfMajority = TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY) {
    if (age === null || age === undefined) return false;
    return age >= ageOfMajority;
}

/**
 * Checks if a character is of childbearing age (female fertility window)
 * @param {number|null} age - Character's age
 * @param {number} minFertileAge - Minimum fertile age (default 14)
 * @param {number} maxFertileAge - Maximum fertile age (default 47)
 * @returns {boolean} False if age is null/undefined or parameters invalid
 */
function isFertileAge(age, minFertileAge = TIME_CONSTANTS.DEFAULT_MIN_FERTILE_AGE, maxFertileAge = TIME_CONSTANTS.DEFAULT_MAX_FERTILE_AGE) {
    if (age === null || age === undefined) return false;
    
    // Validate parameters
    const min = Math.max(0, minFertileAge);
    const max = Math.max(min, maxFertileAge);
    
    return age >= min && age <= max;
}

// =============================================================================
// 5. TIME RANGE UTILITIES
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
 * @returns {Object|null} Overlap range or null if no overlap or invalid ranges
 */
function getTimeRangeOverlap(range1, range2) {
    if (!range1 || !range2) return null;
    if (!_isValidYearValue(range1.start) || !_isValidYearValue(range1.end)) return null;
    if (!_isValidYearValue(range2.start) || !_isValidYearValue(range2.end)) return null;
    if (range1.start > range1.end || range2.start > range2.end) return null;
    
    const overlapStart = Math.max(range1.start, range2.start);
    const overlapEnd = Math.min(range1.end, range2.end);
    
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
// 6. GENERATION & SUCCESSION TIMING
// =============================================================================

/**
 * Calculates typical generation gap (parent-child age difference)
 * @param {number} parentBirthYear - Parent's birth year
 * @param {number} childBirthYear - Child's birth year
 * @returns {number|null} Generation gap in years, or null if invalid
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
function isPlausibleParentAge(parentAgeAtChildBirth, minParentAge = TIME_CONSTANTS.DEFAULT_MIN_PARENT_AGE, maxParentAge = TIME_CONSTANTS.DEFAULT_MAX_PARENT_AGE) {
    if (parentAgeAtChildBirth === null || parentAgeAtChildBirth === undefined) return false;
    const min = Math.max(0, minParentAge);
    const max = Math.max(min, maxParentAge);
    return parentAgeAtChildBirth >= min && parentAgeAtChildBirth <= max;
}

// =============================================================================
// 7. PREGNANCY & BIRTH CALCULATIONS
// =============================================================================

/**
 * Calculates pregnancy duration and birth year
 * Takes into account that conception after ~March results in birth next year
 * 
 * @param {number} conceptionYear - Year of conception
 * @param {number} conceptionMonth - Month of conception (1-12, default 6 = June)
 * @returns {Object} { birthYear: number, gestationMonths: number, conceptionMonth: number, birthMonth: number }
 */
function calculatePregnancyDuration(conceptionYear, conceptionMonth = 6) {
    // Validate inputs
    if (!_isValidYearValue(conceptionYear)) {
        return { 
            birthYear: null, 
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS, 
            conceptionMonth: conceptionMonth,
            birthMonth: null
        };
    }
    
    const conceptionMonthValid = Math.min(12, Math.max(1, conceptionMonth || 6));
    const birthMonthRaw = conceptionMonthValid + TIME_CONSTANTS.PREGNANCY_MONTHS;
    let birthYear = conceptionYear;
    let birthMonth = birthMonthRaw;
    
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
    // Conception typically in the previous year for early-year births
    return birthYear - 1;
}

// =============================================================================
// 8. SUCCESSION & REIGN CALCULATIONS
// =============================================================================

/**
 * Calculates age of succession (when a character inherits)
 * @param {number} birthYear - Character's birth year
 * @param {number} predecessorDeathYear - Year the predecessor died
 * @returns {number|null} Age at succession (null if invalid)
 */
function getAgeAtSuccession(birthYear, predecessorDeathYear) {
    if (!_isValidYearValue(birthYear) || !_isValidYearValue(predecessorDeathYear)) {
        return null;
    }
    const age = predecessorDeathYear - birthYear;
    return Math.max(0, age);
}

/**
 * Calculates the length of a reign/tenure
 * @param {number} startYear - Start year of reign
 * @param {number|null} endYear - End year of reign (null for current)
 * @param {number} currentYear - Current world year (optional, will fetch if not provided)
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number} Length in years (0 if invalid)
 */
function getReignLength(startYear, endYear = null, currentYear = null, getCurrentYearFn = null) {
    if (!_isValidYearValue(startYear)) return 0;
    
    let actualEndYear;
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
// 9. LIFESPAN FORMATTING
// =============================================================================

/**
 * Formats a character's lifespan for display
 * @param {Object} char - Character object with birthYear, deathYear, isDeceased
 * @param {string} format - 'full', 'short', or 'birth-only' (default 'full')
 * @returns {string} Formatted lifespan
 */
function formatLifespan(char, format = 'full') {
    if (!char || !_isValidYearValue(char.birthYear)) {
        return '?–?';
    }
    
    const birthYear = char.birthYear;
    
    if (format === 'birth-only') {
        return `b. ${birthYear}`;
    }
    
    if (char.isDeceased && _isValidYearValue(char.deathYear)) {
        if (format === 'short') {
            return `${birthYear}–${char.deathYear}`;
        }
        const age = char.deathYear - char.birthYear;
        return `${birthYear}–${char.deathYear} (aged ${age})`;
    }
    
    if (format === 'short') {
        return `b. ${birthYear}`;
    }
    
    return `b. ${birthYear}`;
}

// =============================================================================
// 10. CONVENIENCE WRAPPERS (for backward compatibility)
// =============================================================================

/**
 * @deprecated Use getCurrentYearSafe() instead
 * Kept for backward compatibility with older code
 */
function _getCurrentYear(getCurrentYearFn = null) {
    return getCurrentYearSafe(getCurrentYearFn);
}

// =============================================================================
// 11. EXPORTS (Global Availability)
// =============================================================================

// Constants
window.TIME_CONSTANTS = Object.freeze({ ...TIME_CONSTANTS });

// Safe current year getter (use this!)
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

// Backward compatibility (deprecated - remove in future version)
window._getCurrentYear = _getCurrentYear;
