/**
 * =============================================================================
 * LOCATION MOVEMENT
 * =============================================================================
 *
 * LOCATION: js/location/location-movement.js
 *
 * Movement rules and calculations.
 *
 * Depends on (checked at load time):
 *   - LocationState
 *   - LocationQueries
 *   - LocationHierarchy
 *   - CharacterQueries
 *   - time.js (window.getCurrentYear, window.calculateAge)
 *
 * Does NOT mutate. Mutations belong to LocationCommands.
 * Does NOT own character move records. CharacterQueries owns those.
 *
 * Note on time helpers:
 *   Time is accessed through the canonical window-global helpers in
 *   js/core/time.js:
 *     - window.getCurrentYear()       — canonical current year
 *     - window.calculateAge(birthYear, isDeceased, deathYear, asOfYear)
 *
 *   The deprecated window.getCurrentYearSafe alias is NOT used here.
 *
 * Note on getAgeAt:
 *   CharacterQueries.getAgeAt does not exist. It was a phantom method in an
 *   older version of this file that silently returned undefined and disabled
 *   the minimum-age guard. Age-at-year is resolved via _ageAtYear below,
 *   which delegates to window.calculateAge.
 *
 * Note on RankQueries:
 *   The optional noble-status warning reads through RankQueries. The
 *   canonical method name is RankQueries.getRank(rankId) — NOT
 *   getRankById(rankId). The latter is a name that appears on accessors.js
 *   (legacy) and character-system.js (shim), but NOT on RankQueries.
 *   Prior revisions of this file guarded on `RankQueries.getRankById`
 *   (undefined), so the warning silently never fired. Fixed.
 *
 *   RankQueries remains an OPTIONAL dependency. When absent, the
 *   warning is skipped and the rest of the module functions normally.
 *   When present, the warning correctly identifies rank priority 1 and 2
 *   holders (Sovereign, High Noble) as potentially travel-restricted.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getTravelRestrictions now reads RankQueries.getRank(activeRankId)
 *       instead of the non-existent RankQueries.getRankById(...). The
 *       previous guard (`typeof window.RankQueries.getRankById ===
 *       'function'`) always returned false, so the "Noble status may
 *       restrict travel" warning never fired. Now the guard checks the
 *       correct method name, and the warning appears for characters
 *       with rank priority 1 or 2.
 *     - Header note on RankQueries added, documenting the method-name
 *       discrepancy (getRank vs getRankById) and its history.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationState) {
        throw new Error('location-movement.js requires location-state.js first.');
    }
    if (!window.LocationQueries) {
        throw new Error(
            'location-movement.js requires location-queries.js first.'
        );
    }
    if (!window.LocationHierarchy) {
        throw new Error(
            'location-movement.js requires location-hierarchy.js first.'
        );
    }
    if (!window.CharacterQueries) {
        throw new Error(
            'location-movement.js requires character-queries.js ' +
            '(CharacterQueries) first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'location-movement.js requires time.js (getCurrentYear).'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'location-movement.js requires time.js (calculateAge).'
        );
    }

    var _requiredQueryMethods = [
        'getPlace',
        'areInSameCountry'
    ];
    for (var _i = 0; _i < _requiredQueryMethods.length; _i++) {
        var _m = _requiredQueryMethods[_i];
        if (typeof window.LocationQueries[_m] !== 'function') {
            throw new Error(
                'location-movement.js: LocationQueries.' + _m +
                ' is required.'
            );
        }
    }

    if (typeof window.LocationHierarchy.getHierarchyDistance !== 'function') {
        throw new Error(
            'location-movement.js: LocationHierarchy.getHierarchyDistance ' +
            'is required.'
        );
    }

    var _requiredCharacterQueryMethods = [
        'getCharacterById',
        'getMoveHistory'
    ];
    for (var _j = 0; _j < _requiredCharacterQueryMethods.length; _j++) {
        var _q = _requiredCharacterQueryMethods[_j];
        if (typeof window.CharacterQueries[_q] !== 'function') {
            throw new Error(
                'location-movement.js: CharacterQueries.' + _q +
                ' is required.'
            );
        }
    }

    var LQ = window.LocationQueries;
    var LH = window.LocationHierarchy;
    var CQ = window.CharacterQueries;

    var MIN_TRAVEL_AGE = 7;

    // =========================================================================
    // 2. AGE RESOLUTION
    // =========================================================================

    /**
     * Age of a character at a given year. Delegates to window.calculateAge.
     *
     * Returns:
     *   number   age at year (non-negative)
     *   null     if the character has no usable birth year, or year < birthYear
     *
     * Deceased handling: if the character is deceased and deathYear is known,
     * calculateAge caps at death. If the character is deceased and deathYear
     * is unknown, calculateAge uses the current year as the cap; for
     * movement-validation purposes this is acceptable, since a deceased
     * character is refused earlier in canMoveTo.
     */
    function _ageAtYear(character, year) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number' ||
            !isFinite(character.birthYear)) return null;
        if (typeof year !== 'number' || !isFinite(year)) return null;
        if (year < character.birthYear) return null;

        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear,
            year
        );
    }

    // =========================================================================
    // 3. MOVE VALIDATION
    // =========================================================================

    /**
     * Validates whether a character can move to a location in a given year.
     *
     * Returns { valid: boolean, reason: string }.
     * Does not mutate. Does not commit. Does not call LocationCommands.
     */
    function canMoveTo(characterId, locationId, year) {
        if (!characterId) {
            return { valid: false, reason: 'Character is required' };
        }

        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }

        if (!locationId) {
            return { valid: false, reason: 'Destination location is required' };
        }

        var place = LQ.getPlace(locationId);
        if (!place) {
            return { valid: false, reason: 'Location not found' };
        }

        if (character.isDeceased) {
            return { valid: false, reason: 'Character is deceased' };
        }

        var moveYear = (year === undefined || year === null)
            ? window.getCurrentYear()
            : year;

        if (character.birthYear !== null &&
            character.birthYear !== undefined &&
            moveYear < character.birthYear) {
            return {
                valid: false,
                reason: 'Move year cannot be before character birth'
            };
        }

        var age = _ageAtYear(character, moveYear);
        if (age !== null && age < MIN_TRAVEL_AGE) {
            return {
                valid: false,
                reason: 'Character is too young to travel (minimum age ' +
                    MIN_TRAVEL_AGE + ')'
            };
        }

        var moves = CQ.getMoveHistory(characterId);
        for (var i = 0; i < moves.length; i++) {
            var my = moves[i].year;
            if (my === null || my === undefined) continue;
            if (my > moveYear) {
                return {
                    valid: false,
                    reason: 'Move year is before a later recorded move'
                };
            }
        }

        return { valid: true, reason: 'Valid move' };
    }

    /**
     * Validates a proposed sequence of moves for a character.
     *
     * The sequence is sorted by year before validation. Errors collected:
     *   - missing year
     *   - year before birth
     *   - duplicate year
     *   - unknown location
     *
     * Returns { valid: boolean, errors: string[] }.
     */
    function validateMoveSequence(characterId, moves) {
        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return { valid: false, errors: ['Character not found'] };
        }

        if (!moves || moves.length === 0) {
            return { valid: false, errors: ['No moves to validate'] };
        }

        var errors = [];
        var sorted = moves.slice().sort(function (a, b) {
            var ay = (a.year === null || a.year === undefined)
                ? -Infinity
                : a.year;
            var by = (b.year === null || b.year === undefined)
                ? -Infinity
                : b.year;
            return ay - by;
        });

        if (character.birthYear !== null &&
            character.birthYear !== undefined) {
            for (var i = 0; i < sorted.length; i++) {
                var y = sorted[i].year;
                if (y === null || y === undefined) {
                    errors.push('Move is missing a year');
                } else if (y < character.birthYear) {
                    errors.push(
                        'Move in year ' + y + ' is before character birth'
                    );
                }
            }
        }

        var seenYears = {};
        for (var j = 0; j < sorted.length; j++) {
            var yy = sorted[j].year;
            if (yy === null || yy === undefined) continue;
            if (seenYears[yy]) {
                errors.push('Duplicate move year: ' + yy);
            }
            seenYears[yy] = true;
        }

        for (var k = 0; k < sorted.length; k++) {
            var locId = sorted[k].locationId;
            if (!locId || !LQ.getPlace(locId)) {
                errors.push(
                    'Location not found for move in year ' +
                    sorted[k].year
                );
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 4. ACCESSIBILITY
    // =========================================================================

    /**
     * Structural accessibility. Does not consider age or life stage.
     * A place with status 'abandoned' or 'ruined' is not accessible.
     */
    function isLocationAccessible(characterId, locationId) {
        if (!characterId || !locationId) return false;
        var character = CQ.getCharacterById(characterId);
        if (!character) return false;
        var place = LQ.getPlace(locationId);
        if (!place) return false;

        if (place.status === 'abandoned' || place.status === 'ruined') {
            return false;
        }
        return true;
    }

    /**
     * Returns { hard: string[], warnings: string[] }.
     * hard: blocking restrictions.
     * warnings: soft advisories, not blocking.
     *
     * Does not throw on missing deps. Age and rank checks are best-effort;
     * a missing RankQueries module downgrades to no noble-status warning.
     *
     * The rank check reads RankQueries.getRank(activeRankId) — the
     * canonical method on RankQueries. NOT getRankById, which lives on
     * accessors.js and the character-system.js shim, not on RankQueries.
     * See the header's note on RankQueries.
     */
    function getTravelRestrictions(characterId) {
        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return { hard: ['Character not found'], warnings: [] };
        }

        var hard = [];
        var warnings = [];

        if (character.isDeceased) hard.push('Character is deceased');

        var currentYear = window.getCurrentYear();
        var age = _ageAtYear(character, currentYear);
        if (age !== null && age < MIN_TRAVEL_AGE) {
            hard.push(
                'Character is too young to travel (minimum age ' +
                MIN_TRAVEL_AGE + ')'
            );
        }
        if (age !== null && age > 80) {
            warnings.push('Character is elderly; travel may be difficult');
        }

        if (character.activeRankId &&
            window.RankQueries &&
            typeof window.RankQueries.getRank === 'function') {
            var rank = window.RankQueries.getRank(character.activeRankId);
            if (rank &&
                rank.priority !== undefined &&
                rank.priority !== null &&
                rank.priority <= 2) {
                warnings.push('Noble status may restrict travel');
            }
        }

        return { hard: hard, warnings: warnings };
    }

    // =========================================================================
    // 5. TRAVEL TIME
    // =========================================================================

    /**
     * Deterministic travel time estimate in days, based on hierarchy distance.
     * Same-country distances use a tighter band; cross-country uses a wider
     * band. Returns null if either location is unknown or they are
     * disconnected.
     */
    function getTravelTime(fromLocationId, toLocationId) {
        if (!fromLocationId || !toLocationId) return null;
        if (fromLocationId === toLocationId) return 0;

        var distance = LH.getHierarchyDistance(fromLocationId, toLocationId);
        if (distance === null) return null;

        var same = LQ.areInSameCountry(fromLocationId, toLocationId);
        if (same) {
            return 1 + distance * 2;
        }
        return 7 + distance * 3;
    }

    // =========================================================================
    // 6. MOVE STATISTICS
    // =========================================================================

    function getYearsBetweenMoves(move1, move2) {
        if (!move1 || !move2) return null;
        if (move1.year === null || move1.year === undefined) return null;
        if (move2.year === null || move2.year === undefined) return null;
        return Math.abs(move1.year - move2.year);
    }

    function getAverageMoveFrequency(characterId) {
        var moves = CQ.getMoveHistory(characterId);
        if (moves.length < 2) return null;

        var total = 0;
        var intervals = 0;
        for (var i = 1; i < moves.length; i++) {
            var a = moves[i - 1].year;
            var b = moves[i].year;
            if (a === null || a === undefined ||
                b === null || b === undefined) continue;
            total += Math.abs(b - a);
            intervals++;
        }
        if (intervals === 0) return null;
        return Math.round((total / intervals) * 10) / 10;
    }

    /**
     * The location the character has the most move records pointing at.
     * Returns null if there are no moves.
     */
    function getMostFrequentDestination(characterId) {
        var moves = CQ.getMoveHistory(characterId);
        if (moves.length === 0) return null;

        var counts = {};
        for (var i = 0; i < moves.length; i++) {
            var id = moves[i].locationId;
            if (!id) continue;
            counts[id] = (counts[id] || 0) + 1;
        }

        var bestId = null;
        var bestCount = 0;
        for (var key in counts) {
            if (Object.prototype.hasOwnProperty.call(counts, key) &&
                counts[key] > bestCount) {
                bestCount = counts[key];
                bestId = key;
            }
        }
        return bestId
            ? { locationId: bestId, count: bestCount }
            : null;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.LocationMovement = {
        // Constants
        MIN_TRAVEL_AGE: MIN_TRAVEL_AGE,

        // Validation
        canMoveTo: canMoveTo,
        validateMoveSequence: validateMoveSequence,

        // Accessibility
        isLocationAccessible: isLocationAccessible,
        getTravelRestrictions: getTravelRestrictions,

        // Travel time
        getTravelTime: getTravelTime,

        // Statistics
        getYearsBetweenMoves: getYearsBetweenMoves,
        getAverageMoveFrequency: getAverageMoveFrequency,
        getMostFrequentDestination: getMostFrequentDestination
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationMovement;
    }

})();
