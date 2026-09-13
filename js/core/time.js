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
 * DEPENDENCIES: 
 *   - Reads window.masterData.data.currentYear as the ONLY impure operation.
 *     All other calculations are pure.
 * 
 * SEMANTIC RULES:
 *   - Years are integers. Fractional years are invalid.
 *   - Year 0 is valid.
 *   - `0` = valid zero result (newborn, zero-duration, etc.)
 *   - `null` = impossible chronology or invalid input
 *   - A pre-birth age is null, NOT 0.
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
// 2. INTERNAL HELPERS
// =============================================================================

/**
 * Validates that a value is a legitimate world year.
 * Requires: finite, integer, within MIN_YEAR..MAX_YEAR.
 * Year 0 is valid. Negative years are valid.
 * @private
 */
function _isValidYearValue(year) {
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (!Number.isFinite(year)) return false;
    if (!Number.isInteger(year)) return false;
    if (year < TIME_CONSTANTS.MIN_YEAR || year > TIME_CONSTANTS.MAX_YEAR) return false;
    return true;
}

/**
 * Normalizes an optional integer parameter against a default.
 * Uses explicit undefined/null check so that 0 is preserved.
 * @private
 */
function _defaultIfMissing(value, defaultValue) {
    return (value === undefined || value === null) ? defaultValue : value;
}

// =============================================================================
// 3. SAFE CURRENT YEAR GETTER - PRIMARY DEFINITION
// =============================================================================

/**
 * Gets the current world year with fallback (safe version).
 * 
 * IMPORTANT: Does NOT call window.getCurrentYear to avoid circular dependency.
 * Reads masterData.data.currentYear directly. Validates it before use.
 * 
 * @param {Function} getCurrentYearFn - Optional resolver function (bypasses masterData read)
 * @returns {number} Current year (integer, always valid)
 */
function getCurrentYearSafe(getCurrentYearFn) {
    if (typeof getCurrentYearFn === 'function') {
        var resolved = getCurrentYearFn();
        if (_isValidYearValue(resolved)) return resolved;
    }
    if (typeof window !== 'undefined' && window.masterData && window.masterData.data) {
        var year = window.masterData.data.currentYear;
        if (_isValidYearValue(year)) return year;
    }
    return TIME_CONSTANTS.DEFAULT_YEAR;
}

// =============================================================================
// 4. AGE CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates a character's current age.
 * 
 * Returns null for impossible chronology (birth year after the reference year).
 * Returns 0 for newborns (birth year equals reference year).
 * 
 * @param {number|null} birthYear - Character's birth year
 * @param {boolean} isDeceased - Whether character is deceased
 * @param {number|null} deathYear - Character's death year (if deceased)
 * @param {number} currentYear - Current world year (optional)
 * @param {Function} getCurrentYearFn - Optional resolver function
 * @returns {number|null} Age in years, or null if invalid/impossible
 */
function calculateAge(birthYear, isDeceased, deathYear, currentYear, getCurrentYearFn) {
    isDeceased = isDeceased === true;
    deathYear = (deathYear === undefined) ? null : deathYear;
    currentYear = (currentYear === undefined) ? null : currentYear;
    getCurrentYearFn = getCurrentYearFn || null;
    
    if (!_isValidYearValue(birthYear)) {
        return null;
    }
    
    if (isDeceased) {
        if (_isValidYearValue(deathYear)) {
            var deathAge = deathYear - birthYear;
            if (deathAge < 0) return null;
            return deathAge;
        }
        // Deceased but no valid death year — cannot determine age
        return null;
    }
    
    var referenceYear;
    if (_isValidYearValue(currentYear)) {
        referenceYear = currentYear;
    } else if (typeof getCurrentYearFn === 'function') {
        referenceYear = getCurrentYearSafe(getCurrentYearFn);
    } else {
        referenceYear = getCurrentYearSafe();
    }
    
    var age = referenceYear - birthYear;
    if (age < 0) return null;
    return age;
}

/**
 * Calculates the absolute difference between two years.
 * @param {number|null} startYear
 * @param {number|null} endYear
 * @returns {number|null} Absolute year difference, or null if either is invalid
 */
function getYearDifference(startYear, endYear) {
    if (!_isValidYearValue(startYear) || !_isValidYearValue(endYear)) {
        return null;
    }
    return Math.abs(endYear - startYear);
}

/**
 * Calculates a character's age at a specific historical event year.
 * Returns null if the event occurred before the character's birth.
 * 
 * @param {Object|null} char - Character object (must have birthYear)
 * @param {number} eventYear - Year the event occurred
 * @param {boolean} useDeathCap - If true, caps age at death year
 * @returns {number|null} Age at event, or null if impossible
 */
function getAgeAtEvent(char, eventYear, useDeathCap) {
    useDeathCap = useDeathCap !== false;
    if (!char || !_isValidYearValue(char.birthYear)) return null;
    if (!_isValidYearValue(eventYear)) return null;
    
    var age = eventYear - char.birthYear;
    if (age < 0) return null;
    
    if (useDeathCap && char.isDeceased && _isValidYearValue(char.deathYear)) {
        var ageAtDeath = char.deathYear - char.birthYear;
        if (ageAtDeath < 0) return null;
        age = Math.min(age, ageAtDeath);
    }
    
    return age;
}

// =============================================================================
// 5. AGE VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Checks if a character is a minor (under age of majority).
 * @param {number|null} age
 * @param {number} ageOfMajority
 * @returns {boolean}
 */
function isMinor(age, ageOfMajority) {
    ageOfMajority = _defaultIfMissing(ageOfMajority, TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY);
    if (age === null || age === undefined) return false;
    if (typeof age !== 'number' || isNaN(age)) return false;
    return age < ageOfMajority;
}

/**
 * Checks if a character is an adult (age of majority or older).
 * @param {number|null} age
 * @param {number} ageOfMajority
 * @returns {boolean}
 */
function isAdult(age, ageOfMajority) {
    ageOfMajority = _defaultIfMissing(ageOfMajority, TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY);
    if (age === null || age === undefined) return false;
    if (typeof age !== 'number' || isNaN(age)) return false;
    return age >= ageOfMajority;
}

/**
 * Checks if a character is of childbearing age.
 * @param {number|null} age
 * @param {number} minFertileAge
 * @param {number} maxFertileAge
 * @returns {boolean}
 */
function isFertileAge(age, minFertileAge, maxFertileAge) {
    minFertileAge = _defaultIfMissing(minFertileAge, TIME_CONSTANTS.DEFAULT_MIN_FERTILE_AGE);
    maxFertileAge = _defaultIfMissing(maxFertileAge, TIME_CONSTANTS.DEFAULT_MAX_FERTILE_AGE);
    if (age === null || age === undefined) return false;
    if (typeof age !== 'number' || isNaN(age)) return false;
    var min = Math.max(0, minFertileAge);
    var max = Math.max(min, maxFertileAge);
    return age >= min && age <= max;
}

// =============================================================================
// 6. TIME RANGE UTILITIES - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Determines if a year falls within a given range (inclusive).
 * @param {number} year
 * @param {number} startYear
 * @param {number} endYear
 * @returns {boolean}
 */
function isYearInRange(year, startYear, endYear) {
    if (!_isValidYearValue(year)) return false;
    if (!_isValidYearValue(startYear)) return false;
    if (!_isValidYearValue(endYear)) return false;
    return year >= startYear && year <= endYear;
}

/**
 * Gets the overlap between two time ranges.
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
 * Checks if two time ranges overlap.
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
 * Calculates generation gap (parent-to-child age difference).
 * Returns null if child was born before parent — impossible chronology.
 * 
 * @param {number} parentBirthYear
 * @param {number} childBirthYear
 * @returns {number|null} Generation gap in years, or null if impossible
 */
function getGenerationGap(parentBirthYear, childBirthYear) {
    if (!_isValidYearValue(parentBirthYear) || !_isValidYearValue(childBirthYear)) {
        return null;
    }
    if (childBirthYear < parentBirthYear) return null;
    return childBirthYear - parentBirthYear;
}

/**
 * Checks if a parent could plausibly have a child at that age.
 * @param {number} parentAgeAtChildBirth
 * @param {number} minParentAge
 * @param {number} maxParentAge
 * @returns {boolean}
 */
function isPlausibleParentAge(parentAgeAtChildBirth, minParentAge, maxParentAge) {
    minParentAge = _defaultIfMissing(minParentAge, TIME_CONSTANTS.DEFAULT_MIN_PARENT_AGE);
    maxParentAge = _defaultIfMissing(maxParentAge, TIME_CONSTANTS.DEFAULT_MAX_PARENT_AGE);
    if (parentAgeAtChildBirth === null || parentAgeAtChildBirth === undefined) return false;
    if (typeof parentAgeAtChildBirth !== 'number' || isNaN(parentAgeAtChildBirth)) return false;
    var min = Math.max(0, minParentAge);
    var max = Math.max(min, maxParentAge);
    return parentAgeAtChildBirth >= min && parentAgeAtChildBirth <= max;
}

// =============================================================================
// 8. PREGNANCY & BIRTH CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates pregnancy duration and birth year.
 * Normalizes conceptionMonth to 1..12 regardless of year validity.
 * 
 * @param {number} conceptionYear
 * @param {number} conceptionMonth - 1..12, defaults to 6
 * @returns {Object} { birthYear, gestationMonths, conceptionMonth, birthMonth }
 */
function calculatePregnancyDuration(conceptionYear, conceptionMonth) {
    conceptionMonth = _defaultIfMissing(conceptionMonth, 6);
    var conceptionMonthValid = Math.min(12, Math.max(1, conceptionMonth));
    
    if (!_isValidYearValue(conceptionYear)) {
        return {
            birthYear: null,
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
            conceptionMonth: conceptionMonthValid,
            birthMonth: null
        };
    }
    
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
 * Approximate conception year from birth year.
 * Assumes birthYear - 1 given that this is a year-resolution world.
 * Returns null if birthYear is invalid.
 * 
 * @param {number} birthYear
 * @returns {number|null}
 */
function getConceptionYear(birthYear) {
    if (!_isValidYearValue(birthYear)) return null;
    return birthYear - 1;
}

// =============================================================================
// 9. SUCCESSION & REIGN CALCULATIONS - PRIMARY DEFINITIONS
// =============================================================================

/**
 * Calculates age of succession (when a character inherits).
 * Returns null if the successor was born after the predecessor died.
 * 
 * @param {number} birthYear
 * @param {number} predecessorDeathYear
 * @returns {number|null}
 */
function getAgeAtSuccession(birthYear, predecessorDeathYear) {
    if (!_isValidYearValue(birthYear) || !_isValidYearValue(predecessorDeathYear)) {
        return null;
    }
    var age = predecessorDeathYear - birthYear;
    if (age < 0) return null;
    return age;
}

/**
 * Calculates the length of a reign/tenure.
 * Returns null if the end year precedes the start year.
 * Returns 0 for a legitimate same-year reign.
 * 
 * @param {number} startYear
 * @param {number|null} endYear - null for current reign
 * @param {number} currentYear - optional
 * @param {Function} getCurrentYearFn - optional
 * @returns {number|null}
 */
function getReignLength(startYear, endYear, currentYear, getCurrentYearFn) {
    endYear = (endYear === undefined) ? null : endYear;
    currentYear = (currentYear === undefined) ? null : currentYear;
    getCurrentYearFn = getCurrentYearFn || null;
    
    if (!_isValidYearValue(startYear)) return null;
    
    var actualEndYear;
    if (_isValidYearValue(endYear)) {
        actualEndYear = endYear;
    } else if (_isValidYearValue(currentYear)) {
        actualEndYear = currentYear;
    } else if (typeof getCurrentYearFn === 'function') {
        actualEndYear = getCurrentYearSafe(getCurrentYearFn);
    } else {
        actualEndYear = getCurrentYearSafe();
    }
    
    if (actualEndYear < startYear) return null;
    return actualEndYear - startYear;
}

// =============================================================================
// 10. LIFESPAN FORMATTING (DEPRECATED — move to formatting.js)
// =============================================================================

/**
 * @deprecated Use formatLifespan from formatting.js instead.
 * Kept temporarily for backward compatibility during migration.
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
// 11. DEPRECATED WRAPPER
// =============================================================================

/**
 * @deprecated Use getCurrentYearSafe instead.
 * Kept for backward compatibility with modules that still call window._getCurrentYear().
 */
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

// Lifespan formatting (deprecated)
window.formatLifespan = formatLifespan;

// Backward compatibility (deprecated)
window._getCurrentYear = _getCurrentYear;