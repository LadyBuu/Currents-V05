/**
 * =============================================================================
 * LOCATION MOVEMENT - Business logic for character movement
 * =============================================================================
 * 
 * Responsibilities:
 * - Move validation rules
 * - Travel time/distance calculation
 * - Movement restrictions
 * - Migration pattern analysis
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState)
 *   - location-hierarchy.js (LocationHierarchy)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingMovement = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
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

    // =========================================================================
    // 3. MOVE VALIDATION
    // =========================================================================

    function canMoveTo(characterId, locationId, year) {
        if (_processingMovement) {
            return { valid: false, reason: 'Movement validation already in progress' };
        }
        _processingMovement = true;

        try {
            if (!characterId) {
                return { valid: false, reason: 'Character is required' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                return { valid: false, reason: 'Character not found' };
            }

            if (!locationId) {
                return { valid: false, reason: 'Destination location is required' };
            }

            var place = LocationState.getPlace(locationId);
            if (!place) {
                return { valid: false, reason: 'Location not found' };
            }

            if (character.isDeceased) {
                return { valid: false, reason: 'Character is deceased' };
            }

            var moveYear = year || _getCurrentYear();
            if (character.birthYear && moveYear < character.birthYear) {
                return { valid: false, reason: 'Move year cannot be before character birth' };
            }

            // Check if character is old enough to travel (minimum age 7)
            var age = _calculateAge(character.birthYear, false, null);
            if (age < 7) {
                return { valid: false, reason: 'Character is too young to travel (minimum age 7)' };
            }

            // Check if year is after a later recorded move
            var moves = LocationState.getMoveHistory(characterId);
            for (var i = 0; i < moves.length; i++) {
                if (moves[i].year > moveYear) {
                    return { valid: false, reason: 'Move year is before a later recorded move' };
                }
            }

            // Check if location is accessible
            if (!isLocationAccessible(characterId, locationId)) {
                return { valid: false, reason: 'Location is not accessible' };
            }

            return { valid: true, reason: 'Valid move' };

        } finally {
            _processingMovement = false;
        }
    }

    function validateMoveSequence(characterId, moves) {
        if (_processingMovement) {
            return { valid: false, errors: ['Movement validation already in progress'] };
        }
        _processingMovement = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                return { valid: false, errors: ['Character not found'] };
            }

            var errors = [];

            if (!moves || moves.length === 0) {
                return { valid: false, errors: ['No moves to validate'] };
            }

            // Sort moves by year
            var sortedMoves = moves.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });

            // Check birth year
            if (character.birthYear) {
                for (var i = 0; i < sortedMoves.length; i++) {
                    if (sortedMoves[i].year < character.birthYear) {
                        errors.push('Move in year ' + sortedMoves[i].year + ' is before character birth');
                    }
                }
            }

            // Check duplicate years
            var yearSet = {};
            for (var i = 0; i < sortedMoves.length; i++) {
                var year = sortedMoves[i].year;
                if (yearSet[year]) {
                    errors.push('Duplicate move year: ' + year);
                }
                yearSet[year] = true;
            }

            // Check each location exists
            for (var i = 0; i < sortedMoves.length; i++) {
                var place = LocationState.getPlace(sortedMoves[i].locationId);
                if (!place) {
                    errors.push('Location not found for move in year ' + sortedMoves[i].year);
                }
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };

        } finally {
            _processingMovement = false;
        }
    }

    // =========================================================================
    // 4. TRAVEL RULES
    // =========================================================================

    function getTravelTime(fromLocationId, toLocationId) {
        if (_processingMovement) {
            return 0;
        }
        _processingMovement = true;

        try {
            if (!fromLocationId || !toLocationId) {
                return 0;
            }

            var fromPlace = LocationState.getPlace(fromLocationId);
            var toPlace = LocationState.getPlace(toLocationId);

            if (!fromPlace || !toPlace) {
                return 0;
            }

            // If same location, travel time is 0
            if (fromLocationId === toLocationId) {
                return 0;
            }

            // Check if in same country
            if (LocationState.areInSameCountry(fromLocationId, toLocationId)) {
                // Same country: 1-3 days
                return Math.floor(Math.random() * 3) + 1;
            }

            // Check if in same region (priority 2)
            var fromCountry = LocationState.getCountryId(fromLocationId);
            var toCountry = LocationState.getCountryId(toLocationId);

            if (fromCountry === toCountry) {
                // Same country but different region: 3-7 days
                return Math.floor(Math.random() * 5) + 3;
            }

            // Different countries: 7-30 days
            return Math.floor(Math.random() * 24) + 7;

        } finally {
            _processingMovement = false;
        }
    }

    function isLocationAccessible(characterId, locationId) {
        if (_processingMovement) {
            return false;
        }
        _processingMovement = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                return false;
            }

            var place = LocationState.getPlace(locationId);
            if (!place) {
                return false;
            }

            // Check if location is active
            if (place.status === 'abandoned' || place.status === 'ruined') {
                return false;
            }

            // Check if location is accessible (has population)
            var population = LocationState.getPopulationCount(locationId, false);
            if (population === 0) {
                return false;
            }

            return true;

        } finally {
            _processingMovement = false;
        }
    }

    function getTravelRestrictions(characterId) {
        if (_processingMovement) {
            return [];
        }
        _processingMovement = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                return ['Character not found'];
            }

            var restrictions = [];

            if (character.isDeceased) {
                restrictions.push('Character is deceased');
            }

            var age = _calculateAge(character.birthYear, false, null);
            if (age < 7) {
                restrictions.push('Character is too young to travel (minimum age 7)');
            }

            if (character.activeRankId) {
                var rank = typeof window.getRankById === 'function' ? window.getRankById(character.activeRankId) : null;
                if (rank && rank.priority && rank.priority <= 2) {
                    // Nobles may have travel restrictions
                    restrictions.push('Noble status may restrict travel');
                }
            }

            return restrictions;

        } finally {
            _processingMovement = false;
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationMovement = {
        canMoveTo: canMoveTo,
        validateMoveSequence: validateMoveSequence,
        getTravelTime: getTravelTime,
        isLocationAccessible: isLocationAccessible,
        getTravelRestrictions: getTravelRestrictions
    };

})();