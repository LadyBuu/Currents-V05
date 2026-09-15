/**
 * =============================================================================
 * STILL WATERS - TIME MANAGEMENT (time.js)
 * =============================================================================
 *
 * LOCATION: js/core/time.js
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - Current world year resolution
 *   - Canonical year validation
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
 *   - Fertility/parent-age domain policy (see simulation-generators.js;
 *     the constants currently still live here for historical reasons and
 *     will migrate when a domain configuration layer exists)
 *
 * SEMANTIC RULES:
 *   - Years are integers. Fractional years are invalid.
 *   - Year 0 is valid. Negative years are valid within range.
 *   - 0 = valid temporal result (newborn, zero-duration, etc.)
 *   - null = impossible chronology or invalid input
 *   - Pre-birth ages are null, NOT 0.
 *   - Missing optional arguments → default.
 *     Invalid explicit arguments → null/false; NOT silently normalized.
 *   - Invalid configuration produces null/false, not silently-normalized
 *     values.
 *
 * DEPENDENCIES:
 *   - Application dependencies: None.
 *   - Browser globals used: window (for masterData access only).
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TIME_CONSTANTS = Object.freeze({
        DEFAULT_YEAR: 1250,
        MIN_YEAR: -10000,
        MAX_YEAR: 9999,
        DEFAULT_AGE_OF_MAJORITY: 18,
        // NOTE: the following fertility and parent-age defaults are
        // domain policy, not generic time infrastructure. They remain
        // here as documented debt and will move to a simulation/domain
        // configuration module once one exists.
        DEFAULT_MIN_FERTILE_AGE: 14,
        DEFAULT_MAX_FERTILE_AGE: 47,
        DEFAULT_MIN_PARENT_AGE: 12,
        DEFAULT_MAX_PARENT_AGE: 70,
        PREGNANCY_MONTHS: 9,
        MONTHS_PER_YEAR: 12
    });

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

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

    function _defaultIfMissing(value, defaultValue) {
        return (value === undefined || value === null) ? defaultValue : value;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    /**
     * True if value is a finite number (for age-like quantities).
     * @private
     */
    function _isValidAge(age) {
        return _isFiniteNumber(age) && age >= 0;
    }

    /**
     * Resolves a reference year from a caller-supplied optional argument.
     *
     *   missing (undefined/null) → resolve via getCurrentYear()
     *   valid world year         → that year
     *   explicitly invalid       → null (caller must abort)
     *
     * @private
     * @returns {number|null}
     */
    function _resolveReferenceYear(candidate) {
        if (candidate === undefined || candidate === null) {
            return getCurrentYear();
        }
        if (_isValidYearValue(candidate)) return candidate;
        return null;
    }

    // =========================================================================
    // 3. CURRENT YEAR RESOLUTION — CANONICAL
    // =========================================================================

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

    // =========================================================================
    // 4. PUBLIC YEAR VALIDATION
    // =========================================================================

    /**
     * Canonical validator for world years.
     *
     * Missing (undefined/null) returns false. Wrong type, non-finite,
     * non-integer, and out-of-range values all return false. Year 0 and
     * negative years within range are valid.
     *
     * Other modules should call this rather than reimplement the bounds
     * check against TIME_CONSTANTS.
     *
     * @param {*} year
     * @returns {boolean}
     */
    function isValidYear(year) {
        return _isValidYearValue(year);
    }

    // =========================================================================
    // 5. AGE CALCULATIONS
    // =========================================================================

    /**
     * Calculates a character's age.
     *
     * isDeceased:
     *   missing (undefined/null) → treated as false
     *   boolean                  → used as-is
     *   anything else            → invalid input; returns null
     *
     * currentYear:
     *   missing (undefined/null) → resolved via getCurrentYear()
     *   valid world year         → used as reference
     *   explicitly invalid       → null (caller error)
     *
     * Returns null for impossible chronology (birth year after reference).
     * Returns 0 for newborns.
     * Returns null if the character is deceased but has no valid death year.
     *
     * @param {number|null} birthYear
     * @param {boolean} [isDeceased]
     * @param {number|null} [deathYear]
     * @param {number} [currentYear]
     * @returns {number|null}
     */
    function calculateAge(birthYear, isDeceased, deathYear, currentYear) {
        // isDeceased strictness
        if (isDeceased === undefined || isDeceased === null) {
            isDeceased = false;
        } else if (typeof isDeceased !== 'boolean') {
            return null;
        }

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

        var referenceYear = _resolveReferenceYear(currentYear);
        if (referenceYear === null) return null;

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
     * isDeceased is read strictly: only the boolean true activates the
     * death cap. Any other value (including truthy non-booleans) is
     * treated as "not deceased" for the purpose of this calculation.
     * This function does not validate the character object itself;
     * malformed characters are validation.js's concern.
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

        if (useDeathCap
            && char.isDeceased === true
            && _isValidYearValue(char.deathYear)) {
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

    // =========================================================================
    // 6. AGE VALIDATION
    // =========================================================================

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
     * Returns false for invalid age or invalid/inverted bounds.
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

    // =========================================================================
    // 7. TIME RANGE UTILITIES
    // =========================================================================

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
     * Ranges are inclusive.
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

    // =========================================================================
    // 8. GENERATION & PARENT-AGE TIMING
    // =========================================================================

    /**
     * Generation gap between a parent and child's birth years.
     * Returns null for impossible chronology (child before parent) or
     * invalid input.
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
     * Returns false for invalid ages and inverted ranges.
     *
     * Defaults for the bounds are domain policy; see TIME_CONSTANTS.
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

    // =========================================================================
    // 9. PREGNANCY & CONCEPTION
    // =========================================================================

    /**
     * Calculates pregnancy duration and resulting birth year.
     *
     * conceptionMonth:
     *   missing (undefined/null) → defaults to 6
     *   integer in [1, 12]       → used as-is
     *   anything else            → invalid; whole result reports null
     *                              birthYear and null birthMonth
     *
     * conceptionYear:
     *   missing or invalid       → null birthYear
     *
     * @param {number} conceptionYear
     * @param {number} [conceptionMonth] - 1..12
     * @returns {{
     *   birthYear: number|null,
     *   gestationMonths: number,
     *   conceptionMonth: number|null,
     *   birthMonth: number|null
     * }}
     */
    function calculatePregnancyDuration(conceptionYear, conceptionMonth) {
        var defaultResult = {
            birthYear: null,
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
            conceptionMonth: null,
            birthMonth: null
        };

        if (conceptionMonth === undefined || conceptionMonth === null) {
            conceptionMonth = 6;
        } else if (!Number.isInteger(conceptionMonth)
                   || conceptionMonth < 1
                   || conceptionMonth > 12) {
            return defaultResult;
        }

        if (!_isValidYearValue(conceptionYear)) {
            return {
                birthYear: null,
                gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
                conceptionMonth: conceptionMonth,
                birthMonth: null
            };
        }

        var birthMonthRaw = conceptionMonth + TIME_CONSTANTS.PREGNANCY_MONTHS;
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
                conceptionMonth: conceptionMonth,
                birthMonth: null
            };
        }

        return {
            birthYear: calculatedBirthYear,
            gestationMonths: TIME_CONSTANTS.PREGNANCY_MONTHS,
            conceptionMonth: conceptionMonth,
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

    // =========================================================================
    // 10. SUCCESSION & REIGN
    // =========================================================================

    /**
     * Age at a specific accession year.
     *
     * `accessionYear` is the year the successor took power. If your
     * historical model distinguishes between predecessor's death year
     * and successor's accession year, callers must pass the accession
     * year explicitly; this function does not assume the two coincide.
     *
     * @param {number} birthYear
     * @param {number} accessionYear
     * @returns {number|null} null if successor wasn't born yet
     */
    function getAgeAtSuccession(birthYear, accessionYear) {
        if (!_isValidYearValue(birthYear) || !_isValidYearValue(accessionYear)) {
            return null;
        }
        var age = accessionYear - birthYear;
        if (age < 0) return null;
        return age;
    }

    /**
     * Length of a reign in years.
     *
     * endYear:
     *   missing (undefined/null) → resolved via currentYear (explicit or
     *                              getCurrentYear())
     *   valid world year         → used as-is
     *   explicitly invalid       → null
     *
     * currentYear:
     *   missing (undefined/null) → resolved via getCurrentYear()
     *   valid world year         → used if endYear is missing
     *   explicitly invalid       → null
     *
     * Returns null for impossible chronology (end before start).
     * Returns 0 for same-year reigns.
     */
    function getReignLength(startYear, endYear, currentYear) {
        endYear = (endYear === undefined) ? null : endYear;
        currentYear = (currentYear === undefined) ? null : currentYear;

        if (!_isValidYearValue(startYear)) return null;

        // Reject explicitly invalid currentYear up front.
        var resolvedCurrent = null;
        if (currentYear !== null) {
            if (!_isValidYearValue(currentYear)) return null;
            resolvedCurrent = currentYear;
        } else {
            resolvedCurrent = getCurrentYear();
        }

        var actualEnd;
        if (endYear === null) {
            actualEnd = resolvedCurrent;
        } else if (_isValidYearValue(endYear)) {
            actualEnd = endYear;
        } else {
            return null;
        }

        if (actualEnd < startYear) return null;
        return actualEnd - startYear;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.TIME_CONSTANTS = TIME_CONSTANTS;

    // Canonical year validation
    window.isValidYear = isValidYear;

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

    // =========================================================================
    // 12. DEPRECATED ALIASES (for migration only)
    // =========================================================================

    /**
     * @deprecated Use getCurrentYear instead.
     */
    window.getCurrentYearSafe = getCurrentYear;

    /**
     * @deprecated Use getCurrentYear instead.
     */
    window._getCurrentYear = getCurrentYear;

})();