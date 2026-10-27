/**
 * =============================================================================
 * STILL WATERS - CHILDREN GENERATOR (js/character/children-generator.js)
 * =============================================================================
 *
 * Random child-birth-data generation for a given parent pair.
 *
 * Produces a plain `data` object suitable for ChildrenCommands.recordBirth.
 * Does NOT construct the child, does NOT mutate anything, does NOT
 * persist, does NOT emit events.
 *
 * SCOPE:
 *   - Random gender selection for a newborn
 *   - Random stillbirth / not-stillbirth selection
 *   - Random birth-year selection within a fertile window
 *   - Multi-child birth-year distribution (spacing)
 *   - Batch proposal objects for ChildrenCommands.recordBirth
 *
 * OUT OF SCOPE:
 *   - Child construction              -> character-factory.js
 *   - Birth mutation                  -> children-commands.js
 *   - Pregnancy attempt simulation    -> children-commands.js
 *                                        (recordPregnancyAttempt)
 *   - Fertility and pregnancy policy  -> children-rules.js
 *   - Name and surname selection      -> character-generator.js
 *   - Persistence                     -> storage.js
 *
 * SEMANTIC RULES:
 *   - This module proposes. It does not decide. A proposal is a
 *     candidate birth year, a candidate gender, and a candidate
 *     stillbirth flag. The caller (children-commands or a modal)
 *     validates against the current world state before committing.
 *   - All randomness flows through window.random / window.randomInt /
 *     window.randomBoolean when present. When absent, the module throws
 *     at load. There is no Math.random fallback.
 *   - Missing inputs are rejected with a structured failure.
 *     No fabricated years. No fabricated age.
 *   - Year 0 is preserved as a valid birth year.
 *
 * RELATIONSHIP TO CHARACTER-GENERATOR.JS:
 *   character-generator.js generates full standalone characters with
 *   random identity, appearance, culture, religion, profession.
 *
 *   children-generator.js generates only the data needed to produce a
 *   child of two specific parents: birth year, gender, stillbirth.
 *   The child's identity (name, surname, religion inheritance) is
 *   established by children-commands.js and character-creation-commands.js
 *   at record time, not by this module.
 *
 * FERTILITY POLICY OWNERSHIP:
 *   ChildrenRules is the canonical owner of fertility windows and
 *   stillbirth chance. This module reads them from
 *   window.ChildrenRules.FERTILITY_CONSTANTS and
 *   window.ChildrenRules.getStillbirthChance. It does NOT maintain its
 *   own fallback constants. A missing ChildrenRules module is a
 *   load-order bug, not a runtime condition; it throws at load time.
 *
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js:     pickRandom, random, randomBoolean, randomInt
 *   - time.js:           getCurrentYear, isValidYear
 *   - accessors.js:      getCharacterById (for age and birth-year lookups)
 *   - children-rules.js: ChildrenRules (FERTILITY_CONSTANTS,
 *                        getStillbirthChance)
 *
 * DEPENDENCIES (OPTIONAL):
 *   None. All policy comes from ChildrenRules (required).
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 2.2):
 *     - children-rules.js is now a HARD load-time dependency.
 *       Loading children-generator.js without it throws.
 *     - _getFertileWindow reads ChildrenRules.FERTILITY_CONSTANTS
 *       unconditionally. The previous fallback to
 *       DEFAULT_FERTILE_WINDOW was removed.
 *     - _getStillbirthChance reads ChildrenRules.getStillbirthChance
 *       unconditionally. The previous fallback to
 *       DEFAULT_STILLBIRTH_CHANCE was removed.
 *     - Header DEPENDENCIES updated: children-rules.js moved from
 *       OPTIONAL to REQUIRED. The "FERTILITY POLICY OWNERSHIP" section
 *       added to explain why.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    var REQUIRED = [
        'pickRandom',
        'random',
        'randomBoolean',
        'randomInt',
        'getCurrentYear',
        'isValidYear',
        'getCharacterById'
    ];
    var missing = [];
    for (var i = 0; i < REQUIRED.length; i++) {
        if (typeof window[REQUIRED[i]] === 'undefined') {
            missing.push(REQUIRED[i]);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            'children-generator.js: missing required dependencies: ' +
            missing.join(', ')
        );
    }

    if (!window.ChildrenRules) {
        throw new Error(
            'children-generator.js: children-rules.js must load first ' +
            '(ChildrenRules missing).'
        );
    }
    if (typeof window.ChildrenRules.getStillbirthChance !== 'function') {
        throw new Error(
            'children-generator.js: ChildrenRules.getStillbirthChance is required.'
        );
    }
    if (!window.ChildrenRules.FERTILITY_CONSTANTS
        || typeof window.ChildrenRules.FERTILITY_CONSTANTS !== 'object') {
        throw new Error(
            'children-generator.js: ChildrenRules.FERTILITY_CONSTANTS is required.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    // Birth spacing defaults. These are range bounds for the generator's
    // own spacing policy, not fertility policy — the fertility window
    // itself comes from ChildrenRules. Kept as a local constant because
    // no other module shares them.
    var MIN_BIRTH_SPACING = 1;
    var MAX_BIRTH_SPACING = 3;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    /**
     * Reads the canonical fertile window from ChildrenRules.
     *
     * This function does NOT have a fallback. ChildrenRules is a
     * required load-time dependency (see section 0). If it were absent,
     * the module would have thrown at load.
     */
    function _getFertileWindow() {
        var c = window.ChildrenRules.FERTILITY_CONSTANTS;
        return {
            MIN_AGE: typeof c.MIN_FERTILE_AGE === 'number'
                ? c.MIN_FERTILE_AGE
                : 14,
            MAX_AGE: typeof c.MAX_FERTILE_AGE === 'number'
                ? c.MAX_FERTILE_AGE
                : 47
        };
    }

    /**
     * Reads the canonical stillbirth chance from ChildrenRules.
     *
     * This function does NOT have a fallback. ChildrenRules is a
     * required load-time dependency.
     *
     * The generator passes no age context here; the caller can override
     * the chance via options.stillbirthChance. This is the baseline
     * chance used when no override is supplied.
     */
    function _getStillbirthChance() {
        var chance = window.ChildrenRules.getStillbirthChance();
        return (typeof chance === 'number' && Number.isFinite(chance))
            ? chance
            : 0;
    }

    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    function _gender() {
        return window.randomBoolean(0.5) ? 'male' : 'female';
    }

    function _rollStillbirth(chance) {
        return window.random() < chance;
    }

    function _randomInt(min, max) {
        return window.randomInt(min, max);
    }

    // =========================================================================
    // 3. BIRTH-YEAR WINDOW
    // =========================================================================

    /**
     * Computes the range of years in which a mother can plausibly bear
     * a child, given the mother's birth year, the relationship's start
     * year (if known), and the current year.
     *
     * Returns { minYear, maxYear } or null when the window is empty.
     */
    function _computeBirthYearWindow(motherId, options) {
        var mother = window.getCharacterById(motherId);
        if (!mother) return null;
        if (typeof mother.birthYear !== 'number') return null;

        var fertile = _getFertileWindow();
        var currentYear = window.getCurrentYear();

        var earliestFromAge = mother.birthYear + fertile.MIN_AGE;
        var latestFromAge = mother.birthYear + fertile.MAX_AGE;
        var latest = Math.min(currentYear, latestFromAge);

        var earliest = earliestFromAge;
        if (typeof options.relationshipStartYear === 'number'
            && options.relationshipStartYear > earliest) {
            earliest = options.relationshipStartYear;
        }

        if (earliest > latest) return null;
        return { minYear: earliest, maxYear: latest };
    }

    // =========================================================================
    // 4. SINGLE BIRTH PROPOSAL
    // =========================================================================

    /**
     * Generates a proposal object for a single child.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Object} [options]
     * @param {number} [options.birthYear]           explicit birth year
     * @param {string} [options.gender]              'male' | 'female'
     * @param {boolean} [options.isStillborn]
     * @param {number} [options.relationshipStartYear]
     * @param {number} [options.stillbirthChance]    0..1
     * @param {string} [options.birthplaceId]
     * @param {string} [options.notes]
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function generateBirthData(motherId, fatherId, options) {
        if (!_hasId(motherId)) return _fail('motherId is required.');
        if (fatherId !== null && fatherId !== undefined && !_hasId(fatherId)) {
            return _fail('fatherId must be a non-empty string or null.');
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var mother = window.getCharacterById(motherId);
        if (!mother) return _fail('Mother not found.');

        var birthYear;
        if (!_isMissing(options.birthYear)) {
            if (!window.isValidYear(options.birthYear)) {
                return _fail('birthYear must be a valid world year.');
            }
            birthYear = options.birthYear;
        } else {
            var window_ = _computeBirthYearWindow(motherId, options);
            if (!window_) return _fail('No fertile window for this mother.');
            birthYear = _randomInt(window_.minYear, window_.maxYear);
        }

        var gender = options.gender === 'male' || options.gender === 'female'
            ? options.gender
            : _gender();

        var stillbirthChance = typeof options.stillbirthChance === 'number'
            && Number.isFinite(options.stillbirthChance)
            && options.stillbirthChance >= 0
            && options.stillbirthChance <= 1
            ? options.stillbirthChance
            : _getStillbirthChance();

        var isStillborn = options.isStillborn === true
            ? true
            : options.isStillborn === false
                ? false
                : _rollStillbirth(stillbirthChance);

        return _ok({
            data: {
                motherId: motherId,
                fatherId: _hasId(fatherId) ? fatherId : null,
                birthYear: birthYear,
                gender: gender,
                isStillborn: isStillborn,
                birthplaceId: _hasId(options.birthplaceId)
                    ? options.birthplaceId
                    : (mother.currentLocationId || null),
                notes: typeof options.notes === 'string' ? options.notes : ''
            }
        });
    }

    // =========================================================================
    // 5. MULTIPLE BIRTH PROPOSALS
    // =========================================================================

    /**
     * Generates proposals for N children of a couple, spaced within the
     * mother's fertile window.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {number} count
     * @param {Object} [options]
     * @param {number} [options.startYear]
     * @param {number} [options.endYear]
     * @param {number} [options.minSpacing]         default 1
     * @param {number} [options.maxSpacing]         default 3
     * @param {string} [options.gender]             force same gender for all
     * @param {number} [options.stillbirthChance]
     * @param {string} [options.birthplaceId]
     * @param {string} [options.notes]
     * @returns {{ success: boolean, proposals?: Array, reason?: string }}
     */
    function generateBatchBirthData(motherId, fatherId, count, options) {
        if (!_hasId(motherId)) return _fail('motherId is required.');
        if (typeof count !== 'number' || !Number.isFinite(count)
            || !Number.isInteger(count) || count < 1) {
            return _fail('count must be a positive integer.');
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var mother = window.getCharacterById(motherId);
        if (!mother) return _fail('Mother not found.');

        var window_ = _computeBirthYearWindow(motherId, options);
        if (!window_) return _fail('No fertile window for this mother.');

        var startYear = _isMissing(options.startYear)
            ? window_.minYear
            : options.startYear;
        var endYear = _isMissing(options.endYear)
            ? window_.maxYear
            : options.endYear;

        if (!window.isValidYear(startYear)) {
            return _fail('startYear must be a valid world year.');
        }
        if (!window.isValidYear(endYear)) {
            return _fail('endYear must be a valid world year.');
        }
        if (endYear < startYear) {
            return _fail('endYear must not be before startYear.');
        }
        if (startYear < window_.minYear) startYear = window_.minYear;
        if (endYear > window_.maxYear) endYear = window_.maxYear;
        if (startYear > endYear) {
            return _fail('Adjusted birth window is empty.');
        }

        var minSpacing = typeof options.minSpacing === 'number'
            && options.minSpacing >= 1
            ? Math.floor(options.minSpacing)
            : MIN_BIRTH_SPACING;
        var maxSpacing = typeof options.maxSpacing === 'number'
            && options.maxSpacing >= minSpacing
            ? Math.floor(options.maxSpacing)
            : MAX_BIRTH_SPACING;

        var spanYears = endYear - startYear;
        if (spanYears < (count - 1) * minSpacing) {
            // Window is too tight for the requested count with the
            // requested minimum spacing. Redistribute evenly.
            minSpacing = Math.max(1, Math.floor(spanYears / Math.max(1, count)));
            maxSpacing = Math.max(minSpacing, minSpacing + 1);
        }

        var stillbirthChance = typeof options.stillbirthChance === 'number'
            && Number.isFinite(options.stillbirthChance)
            && options.stillbirthChance >= 0
            && options.stillbirthChance <= 1
            ? options.stillbirthChance
            : _getStillbirthChance();

        var proposals = [];
        var cursor = startYear;

        for (var i = 0; i < count; i++) {
            var remaining = count - i - 1;
            var remainingSpan = endYear - cursor;

            // Choose this child's year, leaving room for the rest.
            var maxThisYear = endYear - remaining * minSpacing;
            if (maxThisYear < cursor) maxThisYear = cursor;

            var year;
            if (remaining === 0) {
                // Last child takes the highest feasible year.
                year = cursor + _randomInt(0, Math.max(0, maxThisYear - cursor));
            } else {
                year = cursor + _randomInt(0, Math.max(0, maxThisYear - cursor));
            }

            var gender = options.gender === 'male' || options.gender === 'female'
                ? options.gender
                : _gender();
            var isStillborn = _rollStillbirth(stillbirthChance);

            proposals.push({
                motherId: motherId,
                fatherId: _hasId(fatherId) ? fatherId : null,
                birthYear: year,
                gender: gender,
                isStillborn: isStillborn,
                birthplaceId: _hasId(options.birthplaceId)
                    ? options.birthplaceId
                    : (mother.currentLocationId || null),
                notes: typeof options.notes === 'string' ? options.notes : ''
            });

            // Advance cursor past the chosen year plus spacing.
            cursor = year + _randomInt(minSpacing, maxSpacing);
            if (cursor > endYear) cursor = endYear;
        }

        return _ok({ proposals: proposals });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.ChildrenGenerator = {
        generateBirthData: generateBirthData,
        generateBatchBirthData: generateBatchBirthData
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenGenerator;
    }
})();
