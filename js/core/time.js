/**
 * =============================================================================
 * STILL WATERS - TIME MANAGEMENT (time.js)
 * =============================================================================
 * 
 * LOCATION: js/core/time.js
 * 
 * SINGLE SOURCE OF TRUTH for:
 *   - Current world year resolution
 *   - Age calculations
 *   - Chronological consistency checks
 *   - Pregnancy and succession timing
 *   - Time range overlap
 * 
 * SCOPE:
 *   - Pure temporal calculations
 *   - Current-year resolution (reads masterData.data.currentYear, validates
 *     it, and falls back to TIME_CONSTANTS.DEFAULT_YEAR if invalid)
 * 
 * OUT OF SCOPE:
 *   - Lifespan/date formatting (see formatting.js)
 *   - Fertility/parent-age rules should eventually migrate to domain constants
 * 
 * SEMANTIC RULES:
 *   - Years are integers. Fractional years are invalid.
 *   - Year 0 is valid. Negative years are valid within range.
 *   - 0 = valid temporal result (newborn, zero-duration, etc.)
 *   - null = impossible chronology or invalid input
 *   - Pre-birth ages are null, NOT 0.
 *   - Invalid configuration produces null/false, not silently-normalized values.
 * 
 * DEPENDENCIES: None.
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
 * Returns true if value is a legitimate world year.
 * Requires: finite, integer, within [MIN_YEAR, MAX_YEAR].
 * Year 0 and negative years are valid.
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
 * Returns defaultValue only when value is undefined or null.
 * Preserves 0, '', false.
 * @private
 */
function _defaultIfMissing(value, defaultValue) {
    return (value === undefined || value === null) ? defaultValue : value;
}

/**
 * Returns true if value is a finite number.
 * @private
 */
function _isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Returns the first non-missing value.
 * @private
 */
function _firstPresent(a, b) {
    return (a !== undefined && a !== null) ? a : b;
}

// =============================================================================
// 3. CURRENT YEAR RESOLUTION — CANONICAL
// =============================================================================

/**
 * Gets the current world year.
 * 
 * Reads from masterData.data.currentYear when available and valid.
 * Falls back to TIME_CONSTANTS.DEFAULT_YEAR.
 * 
 * This is the ONLY place current-world-year resolution happens.
 * Other modules must not implement their own fallback.
 * 
 * @returns {number} Valid world year
 */
function getCurrentYear() {
    if (typeof window !== 'undefined'
        && window.masterData
        && window.masterData.data) {
        var year = window.masterData.data.currentYear;
        if (_isValidYearValue(year)) {
            return year;
        }
    }
    return TIME_CONSTANTS.DEFAULT_YEAR;
}

// =============================================================================
// 4. AGE CALCULATIONS
// =============================================================================

/**
 * Calculates a character's age.
 * 
 * If `currentYear` is provided and valid, it is used as the reference year.
 * If omitted, `getCurrentYear()` supplies it.
 * 
 * Returns null for impossible chronology (birth year after reference year).
 * Returns 0 for newborns (birth year equals reference year).
 * Returns null if the character is deceased but has no valid death year.
 * 
 * @param {number|null} birthYear
 * @param {boolean} [isDeceased]
 * @param {number|null} [deathYear]
 * @param {number} [currentYear] - Optional explicit reference year
 * @returns {number|null}
 */
function calculateAge(birthYear, isDeceased, deathYear, currentYear) {
    isDeceased = isDeceased === true;
    deathYear = (deathYear === undefined) ? null : deathYear;
    currentYear = (currentYear === undefined) ? null : currentYear;

    if (!_isValidYearValue(birthYear)) {
        return null;
    }

    if (isDeceased) {
        if (_isValidYearValue(deathYear)) {
            var deathAge = deathYear - birthYear;
            if (deathAge < 0) return null;
            return deathAge;
        }
        // Deceased without a valid death year: age cannot be determined
        return null;
    }

    var referenceYear;
    if (_isValidYearValue(currentYear)) {
        referenceYear = currentYear;
    } else {
        referenceYear = getCurrentYear();
    }

    var age = referenceYear - birthYear;
    if (age < 0) return null;
    return age;
}

/**
 * Absolute difference between two years.
 */
function getYearDifference(startYear, endYear) {
    if (!_isValidYearValue(startYear) || !_isValidYearValue(endYear)) {
        return null;
    }
    return Math.abs(endYear - startYear);
}

/**
 * Calculates a character's age at a specific event year.
 * 
 * Returns null if:
 *   - char has no valid birth year
 *   - eventYear is invalid
 *   - eventYear precedes birth
 *   - char is deceased with valid death year and eventYear occurs after death
 *     (when useDeathCap is enabled)
 * 
 * @param {Object|null} char
 * @param {number} eventYear
 * @param {boolean} [useDeathCap] - default true
 * @returns {number|null}
 */
function getAgeAtEvent(char, eventYear, useDeathCap) {
    useDeathCap = useDeathCap !== false;

    if (!char || !_isValidYearValue(char.birthYear)) return null;
    if (!_isValidYearValue(eventYear)) return null;

    var age = eventYear - char.birthYear;
    if (age < 0) return null;

    if (useDeathCap && char.isDeceased && _isValidYearValue(char.deathYear)) {
        if (eventYear > char.deathYear) {
            // Event occurred after death: no valid age
            return null;
        }
        var ageAtDeath = char.deathYear - char.birthYear;
        if (ageAtDeath < 0) return null;
        age = Math.min(age, ageAtDeath);
    }

    return age;
}

// =============================================================================
// 5. AGE VALIDATION
// =============================================================================

/**
 * Returns true if age is a finite, non-negative number.
 * @private
 */
function _isValidAge(age) {
    return _isFiniteNumber(age) && age >= 0;
}

/**
 * True if the given age is under the age of majority.
 * Non-finite and negative ages return false.
 */
function isMinor(age, ageOfMajority) {
    ageOfMajority = _defaultIfMissing(ageOfMajority, TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY);

    if (!_isValidAge(age)) return false;
    if (!_isFiniteNumber(ageOfMajority) || ageOfMajority < 0) return false;

    return age < ageOfMajority;
}

/**
 * True if the given age is at or above the age of majority.
 */
function isAdult(age, ageOfMajority) {
    ageOfMajority = _defaultIfMissing(ageOfMajority, TIME_CONSTANTS.DEFAULT_AGE_OF_MAJORITY);

    if (!_isValidAge(age)) return false;
    if (!_isFiniteNumber(ageOfMajority) || ageOfMajority < 0) return false;

    return age >= ageOfMajority;
}

/**
 * True if the given age falls within the fertile age range.
 * 
 * Returns false for:
 *   - non-finite or negative age
 *   - non-finite bounds
 *   - inverted range (min > max)
 */
function isFertileAge(age, minFertileAge, maxFertileAge) {
    minFertileAge = _defaultIfMissing(minFertileAge, TIME_CONSTANTS.DEFAULT_MIN_FERTILE_AGE);
    maxFertileAge = _defaultIfMissing(maxFertileAge, TIME_CONSTANTS.DEFAULT_MAX_FERTILE_AGE);

    if (!_isValidAge(age)) return false;
    if (!_isFiniteNumber(minFertileAge) || minFertileAge < 0) return false;
    if (!_isFiniteNumber(maxFertileAge) || maxFertileAge < 0) return false;
    if (minFertileAge > maxFertileAge) return false;

    return age >= minFertileAge && age <= maxFertileAge;
}

// =============================================================================
// 6. TIME RANGE UTILITIES
// =============================================================================

/**
 * True if year falls within [startYear, endYear], inclusive.
 */
function isYearInRange(year, startYear, endYear) {
    if (!_isValidYearValue(year)) return false;
    if (!_isValidYearValue(startYear)) return false;
    if (!_isValidYearValue(endYear)) return false;
    return year >= startYear && year <= endYear;
}

/**
 * Returns the overlap between two ranges or null.
 * @param {{start: number, end: number}} range1
 * @param {{start: number, end: number}} range2
 */
function getTimeRangeOverlap(range1, range2) {
    if (!range1 || !range2) return null;
    if (!_isValidYearValue(range1.start) || !_isValidYearValue(range1.end)) return null;
    if (!_isValidYearValue(range2.start) || !_isValidYearValue(range2.end)) return null;
    if (range1.start > range1.end) return null;
    if (range2.start > range2.end) return null;

    var overlapStart = Math.max(range1.start, range2.start);
    var overlapEnd = Math.min(range1.end, range2.end);

    if (overlapStart > overlapEnd) return null;
    return { start: overlapStart, end: overlapEnd };
}

/**
 * True if two ranges overlap.
 */
function doTimeRangesOverlap(range1, range2) {
    return getTimeRangeOverlap(range1, range2) !== null;
}

// =============================================================================
// 7. GENERATION & PARENT-AGE TIMING
// =============================================================================

/**
 * Generation gap between a parent and child's birth years.
 * Returns null for impossible chronology (child before parent) or invalid input.
 */
function getGenerationGap(parentBirthYear, childBirthYear) {
    if (!_isValidYearValue(parentBirthYear) || !_isValidYearValue(childBirthYear)) {
        return null;
    }
    if (childBirthYear < parentBirthYear) return null;
    return childBirthYear - parentBirthYear;
}

/**
 * True if the parent age at child's birth is within plausible bounds.
 * Non-finite ages, negative ages, and inverted ranges return false.
 */
function isPlausibleParentAge(parentAgeAtChildBirth, minParentAge, maxParentAge) {
    minParentAge = _defaultIfMissing(minParentAge, TIME_CONSTANTS.DEFAULT_MIN_PARENT_AGE);
    maxParentAge = _defaultIfMissing(maxParentAge, TIME_CONSTANTS.DEFAULT_MAX_PARENT_AGE);

    if (!_isValidAge(parentAgeAtChildBirth)) return false;
    if (!_isFiniteNumber(minParentAge) || minParentAge < 0) return false;
    if (!_isFiniteNumber(maxParentAge) || maxParentAge < 0) return false;
    if (minParentAge > maxParentAge) return false;

    return parentAgeAtChildBirth >= minParentAge && parentAgeAtChildBirth <= maxParentAge;
}

// =============================================================================
// 8. PREGNANCY & CONCEPTION
// =============================================================================

/**
 * Calculates pregnancy duration and resulting birth year.
 * 
 * Returns birthYear: null if the calculated birth year would exceed MAX_YEAR.
 * conceptionMonth is always normalized to 1..12.
 * 
 * @param {number} conceptionYear
 * @param {number} [conceptionMonth] - 1..12, default 6
 * @returns {{
 *   birthYear: number|null,
 *   gestationMonths: number,
 *   conceptionMonth: number,
 *   birthMonth: number|null
 * }}
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
    var calculatedBirthYear = conceptionYear;
    var birthMonth = birthMonthRaw;

    if (birthMonthRaw > TIME_CONSTANTS.MONTHS_PER_YEAR) {
        calculatedBirthYear = conceptionYear + 1;
        birthMonth = birthMonthRaw - TIME_CONSTANTS.MONTHS_PER_YEAR;
    }

    if (!_isValidYearValue(calculatedBirthYear)) {
        return {
            birthYear: null,
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
            conceptionMonth: conceptionMonthValid,
            birthMonth: null
        };
    }

    return {
        birthYear: calculatedBirthYear,
        gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
        conceptionMonth: conceptionMonthValid,
        birthMonth: birthMonth
    };
}

/**
 * Approximate conception year for a birth year (birthYear - 1).
 * Returns null if the resulting year is invalid.
 */
function getConceptionYear(birthYear) {
    if (!_isValidYearValue(birthYear)) return null;
    var conceptionYear = birthYear - 1;
    return _isValidYearValue(conceptionYear) ? conceptionYear : null;
}

// =============================================================================
// 9. SUCCESSION & REIGN
// =============================================================================

/**
 * Age at a specific succession year.
 * 
 * @param {number} birthYear
 * @param {number} successionYear - Year succession occurred (or predecessor's death)
 * @returns {number|null} null if successor wasn't born yet
 */
function getAgeAtSuccession(birthYear, successionYear) {
    if (!_isValidYearValue(birthYear) || !_isValidYearValue(successionYear)) {
        return null;
    }
    var age = successionYear - birthYear;
    if (age < 0) return null;
    return age;
}

/**
 * Length of a reign in years.
 * 
 * If endYear is invalid/null, uses currentYear if valid, else getCurrentYear().
 * Returns null for impossible chronology (end before start) or invalid start.
 * Returns 0 for same-year reigns.
 */
function getReignLength(startYear, endYear, currentYear) {
    endYear = (endYear === undefined) ? null : endYear;
    currentYear = (currentYear === undefined) ? null : currentYear;

    if (!_isValidYearValue(startYear)) return null;

    var actualEnd;
    if (_isValidYearValue(endYear)) {
        actualEnd = endYear;
    } else if (_isValidYearValue(currentYear)) {
        actualEnd = currentYear;
    } else {
        actualEnd = getCurrentYear();
    }

    if (actualEnd < startYear) return null;
    return actualEnd - startYear;
}

// =============================================================================
// 10. EXPORTS
// =============================================================================

window.TIME_CONSTANTS = Object.freeze(TIME_CONSTANTS);

// Canonical current year
window.getCurrentYear = getCurrentYear;

// Age calculations
window.calculateAge = calculateAge;
window.getYearDifference = getYearDifference;
window.getAgeAtEvent = getAgeAtEvent;

// Age validation
window.isMinor = isMinor;
window.isAdult = isAdult;
window.isFertileAge = isFertileAge;

// Time ranges
window.isYearInRange = isYearInRange;
window.getTimeRangeOverlap = getTimeRangeOverlap;
window.doTimeRangesOverlap = doTimeRangesOverlap;

// Generation & parent age
window.getGenerationGap = getGenerationGap;
window.isPlausibleParentAge = isPlausibleParentAge;

// Pregnancy
window.calculatePregnancyDuration = calculatePregnancyDuration;
window.getConceptionYear = getConceptionYear;

// Succession & reign
window.getAgeAtSuccession = getAgeAtSuccession;
window.getReignLength = getReignLength;

// =============================================================================
// 11. DEPRECATED ALIASES (for migration only)
// =============================================================================

/**
 * @deprecated Use getCurrentYear instead.
 */
window.getCurrentYearSafe = getCurrentYear;

/**
 * @deprecated Use getCurrentYear instead.
 */
window._getCurrentYear = getCurrentYear;