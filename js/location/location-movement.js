/**
 * =============================================================================
 * LOCATION MOVEMENT
 * =============================================================================
 *
 * Movement rules and calculations.
 *
 * Depends on:
 *   - LocationState (via LocationQueries / LocationHierarchy)
 *   - LocationQueries
 *   - LocationHierarchy
 *   - CharacterQueries
 *   - TimeQueries
 *
 * Does NOT mutate. Mutations belong to LocationCommands.
 * Does NOT own character move records. CharacterQueries owns those.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _queries() {
        if (!window.LocationQueries) throw new Error('LocationMovement: LocationQueries required');
        return window.LocationQueries;
    }
    function _hierarchy() {
        if (!window.LocationHierarchy) throw new Error('LocationMovement: LocationHierarchy required');
        return window.LocationHierarchy;
    }
    function _characters() {
        if (!window.CharacterQueries) throw new Error('LocationMovement: CharacterQueries required');
        return window.CharacterQueries;
    }
    function _time() {
        if (!window.TimeQueries) throw new Error('LocationMovement: TimeQueries required');
        return window.TimeQueries;
    }

    var MIN_TRAVEL_AGE = 7;

    // -------------------------------------------------------------------------
    // MOVE VALIDATION
    // -------------------------------------------------------------------------

    function canMoveTo(characterId, locationId, year) {
        if (!characterId) return { valid: false, reason: 'Character is required' };

        var character = _characters().getCharacterById(characterId);
        if (!character) return { valid: false, reason: 'Character not found' };

        if (!locationId) return { valid: false, reason: 'Destination location is required' };

        var place = _queries().getPlace(locationId);
        if (!place) return { valid: false, reason: 'Location not found' };

        if (character.isDeceased) return { valid: false, reason: 'Character is deceased' };

        var moveYear = year === undefined || year === null ? _time().getCurrentYear() : year;

        if (character.birthYear !== null && character.birthYear !== undefined && moveYear < character.birthYear) {
            return { valid: false, reason: 'Move year cannot be before character birth' };
        }

        var age = _characters().getAgeAt(characterId, moveYear);
        if (age !== null && age < MIN_TRAVEL_AGE) {
            return { valid: false, reason: 'Character is too young to travel (minimum age ' + MIN_TRAVEL_AGE + ')' };
        }

        var moves = _characters().getMoveHistory(characterId);
        for (var i = 0; i < moves.length; i++) {
            var my = moves[i].year;
            if (my === null || my === undefined) continue;
            if (my > moveYear) {
                return { valid: false, reason: 'Move year is before a later recorded move' };
            }
        }

        return { valid: true, reason: 'Valid move' };
    }

    function validateMoveSequence(characterId, moves) {
        var character = _characters().getCharacterById(characterId);
        if (!character) return { valid: false, errors: ['Character not found'] };

        if (!moves || moves.length === 0) {
            return { valid: false, errors: ['No moves to validate'] };
        }

        var errors = [];
        var sorted = moves.slice().sort(function (a, b) {
            var ay = a.year === null || a.year === undefined ? -Infinity : a.year;
            var by = b.year === null || b.year === undefined ? -Infinity : b.year;
            return ay - by;
        });

        if (character.birthYear !== null && character.birthYear !== undefined) {
            for (var i = 0; i < sorted.length; i++) {
                var y = sorted[i].year;
                if (y === null || y === undefined) {
                    errors.push('Move is missing a year');
                } else if (y < character.birthYear) {
                    errors.push('Move in year ' + y + ' is before character birth');
                }
            }
        }

        var seenYears = {};
        for (var j = 0; j < sorted.length; j++) {
            var yy = sorted[j].year;
            if (yy === null || yy === undefined) continue;
            if (seenYears[yy]) errors.push('Duplicate move year: ' + yy);
            seenYears[yy] = true;
        }

        for (var k = 0; k < sorted.length; k++) {
            var locId = sorted[k].locationId;
            if (!locId || !_queries().getPlace(locId)) {
                errors.push('Location not found for move in year ' + sorted[k].year);
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------
    // ACCESSIBILITY
    // -------------------------------------------------------------------------

    function isLocationAccessible(characterId, locationId) {
        if (!characterId || !locationId) return false;
        var character = _characters().getCharacterById(characterId);
        if (!character) return false;
        var place = _queries().getPlace(locationId);
        if (!place) return false;

        if (place.status === 'abandoned' || place.status === 'ruined') return false;
        return true;
    }

    function getTravelRestrictions(characterId) {
        var character = _characters().getCharacterById(characterId);
        if (!character) return { hard: ['Character not found'], warnings: [] };

        var hard = [];
        var warnings = [];

        if (character.isDeceased) hard.push('Character is deceased');

        var currentYear = _time().getCurrentYear();
        var age = _characters().getAgeAt(characterId, currentYear);
        if (age !== null && age < MIN_TRAVEL_AGE) {
            hard.push('Character is too young to travel (minimum age ' + MIN_TRAVEL_AGE + ')');
        }
        if (age !== null && age > 80) {
            warnings.push('Character is elderly; travel may be difficult');
        }

        if (character.activeRankId && window.RankQueries) {
            var rank = window.RankQueries.getRankById(character.activeRankId);
            if (rank && rank.priority !== undefined && rank.priority !== null && rank.priority <= 2) {
                warnings.push('Noble status may restrict travel');
            }
        }

        return { hard: hard, warnings: warnings };
    }

    // -------------------------------------------------------------------------
    // TRAVEL TIME (deterministic)
    // -------------------------------------------------------------------------

    /**
     * Deterministic travel time estimate in days, based on hierarchy distance.
     * Same-domain distances use a tighter band; cross-domain uses a wider band.
     * Returns null if either location is unknown or they are disconnected.
     */
    function getTravelTime(fromLocationId, toLocationId) {
        if (!fromLocationId || !toLocationId) return null;
        if (fromLocationId === toLocationId) return 0;

        var distance = _hierarchy().getHierarchyDistance(fromLocationId, toLocationId);
        if (distance === null) return null;

        var same = _queries().areInSameCountry(fromLocationId, toLocationId);
        if (same) {
            return 1 + distance * 2;
        }
        return 7 + distance * 3;
    }

    // -------------------------------------------------------------------------
    // MOVE STATISTICS
    // -------------------------------------------------------------------------

    function getYearsBetweenMoves(move1, move2) {
        if (!move1 || !move2) return null;
        if (move1.year === null || move1.year === undefined) return null;
        if (move2.year === null || move2.year === undefined) return null;
        return Math.abs(move1.year - move2.year);
    }

    function getAverageMoveFrequency(characterId) {
        var moves = _characters().getMoveHistory(characterId);
        if (moves.length < 2) return null;

        var total = 0;
        var intervals = 0;
        for (var i = 1; i < moves.length; i++) {
            var a = moves[i - 1].year;
            var b = moves[i].year;
            if (a === null || a === undefined || b === null || b === undefined) continue;
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
        var moves = _characters().getMoveHistory(characterId);
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
            if (counts.hasOwnProperty(key) && counts[key] > bestCount) {
                bestCount = counts[key];
                bestId = key;
            }
        }
        return bestId ? { locationId: bestId, count: bestCount } : null;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.LocationMovement = {
        canMoveTo: canMoveTo,
        validateMoveSequence: validateMoveSequence,
        isLocationAccessible: isLocationAccessible,
        getTravelRestrictions: getTravelRestrictions,
        getTravelTime: getTravelTime,
        getYearsBetweenMoves: getYearsBetweenMoves,
        getAverageMoveFrequency: getAverageMoveFrequency,
        getMostFrequentDestination: getMostFrequentDestination
    };

})();
