/**
 * =============================================================================
 * LOCATION MOVEMENT - Business logic for character movement
 * =============================================================================
 * 
 * LOCATION: js/location/location-movement.js
 * 
 * Responsibilities:
 * - Move validation rules
 * - Travel time/distance calculation
 * - Movement restrictions
 * - Migration pattern analysis
 * 
 * DEPENDENCIES:
 *   - LocationState (public API)
 *   - LocationHierarchy (public API)
 *   - Core wrappers from modals-core.js
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
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getCurrentYear() {
        return typeof window._getCurrentYear === 'function' ? window._getCurrentYear() : 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window._calculateAge === 'function') {
            return window._calculateAge(birthYear, isDeceased, deathYear);
        }
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getRankById(id) {
        try {
            if (typeof window.getRankById === 'function') {
                return window.getRankById(id);
            }
            if (typeof window._getRankById === 'function') {
                return window._getRankById(id);
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    // =========================================================================
    // 3. MOVE VALIDATION
    // =========================================================================

    /**
     * Validates if a character can move to a location
     * @param {string} characterId - Character ID
     * @param {string} locationId - Destination location ID
     * @param {number} year - Year of move
     * @returns {Object} { valid: boolean, reason: string }
     */
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

    /**
     * Validates a sequence of moves for a character
     * @param {string} characterId - Character ID
     * @param {Array} moves - Array of { year, locationId } objects
     * @returns {Object} { valid: boolean, errors: Array }
     */
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

    /**
     * Estimates travel time between two locations
     * @param {string} fromLocationId - Origin location ID
     * @param {string} toLocationId - Destination location ID
     * @returns {number} Estimated days to travel
     */
    function getTravelTime(fromLocationId, toLocationId) {
        if (_processingMovement) {
            return 0;
        }
        _processingMovement = true;

        try {
            if (!fromLocationId || !toLocationId) {
                return 0;
            }

            if (fromLocationId === toLocationId) {
                return 0;
            }

            var fromPlace = LocationState.getPlace(fromLocationId);
            var toPlace = LocationState.getPlace(toLocationId);

            if (!fromPlace || !toPlace) {
                return 0;
            }

            // Check if in same country
            var fromCountry = LocationState.getCountryId(fromLocationId);
            var toCountry = LocationState.getCountryId(toLocationId);

            if (fromCountry === toCountry) {
                // Same country: 1-7 days depending on hierarchy depth
                var fromDepth = LocationState.getPlaceHierarchy(fromLocationId).length;
                var toDepth = LocationState.getPlaceHierarchy(toLocationId).length;
                var depthDiff = Math.abs(fromDepth - toDepth);
                
                // Same country: 1-3 days if close, 3-7 if far
                if (depthDiff <= 2) {
                    return Math.floor(Math.random() * 3) + 1;
                } else {
                    return Math.floor(Math.random() * 5) + 3;
                }
            }

            // Different countries: 7-30 days depending on distance
            // Estimate based on hierarchy levels
            var fromDepth = LocationState.getPlaceHierarchy(fromLocationId).length;
            var toDepth = LocationState.getPlaceHierarchy(toLocationId).length;
            var totalDepth = fromDepth + toDepth;
            
            if (totalDepth <= 4) {
                return Math.floor(Math.random() * 10) + 7;
            } else if (totalDepth <= 8) {
                return Math.floor(Math.random() * 15) + 10;
            } else {
                return Math.floor(Math.random() * 20) + 15;
            }

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Checks if a location is accessible to a character
     * @param {string} characterId - Character ID
     * @param {string} locationId - Location ID
     * @returns {boolean} True if accessible
     */
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

            // Check if location has population
            var population = LocationState.getPopulationCount(locationId, false);
            if (population === 0) {
                return false;
            }

            return true;

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Gets travel restrictions for a character
     * @param {string} characterId - Character ID
     * @returns {Array} Array of restriction messages
     */
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

            if (age > 80) {
                restrictions.push('Character is elderly and travel may be difficult');
            }

            // Check if character has a rank that restricts travel
            if (character.activeRankId) {
                var rank = _getRankById(character.activeRankId);
                if (rank && rank.priority && rank.priority <= 2) {
                    // Nobles may have travel restrictions
                    restrictions.push('Noble status may restrict travel');
                }
            }

            // Check if character has dependents
            var allChars = typeof window._getCharacters === 'function' ? window._getCharacters() : [];
            if (allChars && allChars.length > 0) {
                var hasChildren = false;
                for (var i = 0; i < allChars.length; i++) {
                    if (allChars[i].motherId === characterId || allChars[i].fatherId === characterId) {
                        hasChildren = true;
                        break;
                    }
                }
                if (hasChildren && age < 18) {
                    restrictions.push('Character has children to care for');
                }
            }

            return restrictions;

        } finally {
            _processingMovement = false;
        }
    }

    // =========================================================================
    // 5. MOVEMENT DISTANCE CALCULATIONS
    // =========================================================================

    /**
     * Calculates the distance between two locations in hierarchy steps
     * @param {string} locationId1 - First location ID
     * @param {string} locationId2 - Second location ID
     * @returns {number} Distance in hierarchy steps
     */
    function getHierarchyDistance(locationId1, locationId2) {
        if (_processingMovement) {
            return 0;
        }
        _processingMovement = true;

        try {
            if (!locationId1 || !locationId2) return 0;
            if (locationId1 === locationId2) return 0;

            var lca = LocationState.findLowestCommonAncestor(locationId1, locationId2);
            if (!lca) {
                // No common ancestor - different root hierarchies
                return 99;
            }

            var depth1 = LocationState.getPlaceHierarchy(locationId1).length;
            var depth2 = LocationState.getPlaceHierarchy(locationId2).length;
            var lcaDepth = LocationState.getPlaceHierarchy(lca.id).length;

            return (depth1 - lcaDepth) + (depth2 - lcaDepth);

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Checks if two locations are related (share an ancestor)
     * @param {string} locationId1 - First location ID
     * @param {string} locationId2 - Second location ID
     * @returns {boolean} True if related
     */
    function areLocationsRelated(locationId1, locationId2) {
        if (_processingMovement) {
            return false;
        }
        _processingMovement = true;

        try {
            if (!locationId1 || !locationId2) return false;
            if (locationId1 === locationId2) return true;

            var lca = LocationState.findLowestCommonAncestor(locationId1, locationId2);
            return lca !== null;

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Gets the common ancestor of multiple locations
     * @param {Array} locationIds - Array of location IDs
     * @returns {Object|null} Common ancestor place or null
     */
    function getCommonAncestor(locationIds) {
        if (_processingMovement) {
            return null;
        }
        _processingMovement = true;

        try {
            if (!locationIds || locationIds.length === 0) return null;
            if (locationIds.length === 1) return LocationState.getPlace(locationIds[0]);

            var common = null;
            for (var i = 0; i < locationIds.length; i++) {
                var place = LocationState.getPlace(locationIds[i]);
                if (!place) return null;
                
                if (i === 0) {
                    common = place;
                } else {
                    var lca = LocationState.findLowestCommonAncestor(common.id, place.id);
                    if (!lca) return null;
                    common = lca;
                }
            }

            return common;

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Gets the distance in years between two moves
     * @param {Object} move1 - First move object
     * @param {Object} move2 - Second move object
     * @returns {number} Years between moves
     */
    function getYearsBetweenMoves(move1, move2) {
        if (!move1 || !move2) return 0;
        return Math.abs((move1.year || 0) - (move2.year || 0));
    }

    /**
     * Calculates average move frequency for a character
     * @param {string} characterId - Character ID
     * @returns {number} Average years between moves
     */
    function getAverageMoveFrequency(characterId) {
        if (_processingMovement) {
            return 0;
        }
        _processingMovement = true;

        try {
            var moves = LocationState.getMoveHistory(characterId);
            if (moves.length < 2) return 0;

            var totalYears = 0;
            for (var i = 1; i < moves.length; i++) {
                totalYears += Math.abs(moves[i].year - moves[i - 1].year);
            }

            return Math.round((totalYears / (moves.length - 1)) * 10) / 10;

        } finally {
            _processingMovement = false;
        }
    }

    /**
     * Gets the most visited location for a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} { id: string, name: string, count: number }
     */
    function getMostVisitedLocation(characterId) {
        if (_processingMovement) {
            return null;
        }
        _processingMovement = true;

        try {
            var moves = LocationState.getMoveHistory(characterId);
            if (moves.length === 0) return null;

            var locationCounts = {};
            for (var i = 0; i < moves.length; i++) {
                var locId = moves[i].locationId;
                if (!locId) continue;
                if (!locationCounts[locId]) {
                    locationCounts[locId] = 0;
                }
                locationCounts[locId]++;
            }

            var maxCount = 0;
            var mostVisited = null;
            for (var locId in locationCounts) {
                if (locationCounts.hasOwnProperty(locId)) {
                    if (locationCounts[locId] > maxCount) {
                        maxCount = locationCounts[locId];
                        mostVisited = locId;
                    }
                }
            }

            if (mostVisited) {
                var place = LocationState.getPlace(mostVisited);
                return {
                    id: mostVisited,
                    name: place ? place.displayName : 'Unknown',
                    count: maxCount
                };
            }

            return null;

        } finally {
            _processingMovement = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.LocationMovement = {
        // Validation
        canMoveTo: canMoveTo,
        validateMoveSequence: validateMoveSequence,

        // Travel
        getTravelTime: getTravelTime,
        isLocationAccessible: isLocationAccessible,
        getTravelRestrictions: getTravelRestrictions,

        // Distance
        getHierarchyDistance: getHierarchyDistance,
        areLocationsRelated: areLocationsRelated,
        getCommonAncestor: getCommonAncestor,

        // Statistics
        getYearsBetweenMoves: getYearsBetweenMoves,
        getAverageMoveFrequency: getAverageMoveFrequency,
        getMostVisitedLocation: getMostVisitedLocation
    };

})();