/**
 * =============================================================================
 * LOCATION QUERIES - Complex read operations for location data
 * =============================================================================
 * 
 * Responsibilities:
 * - Search and filter locations
 * - Statistics and analytics
 * - Location comparison
 * - Population analytics
 * - Move analytics
 * - ROLE-LOCATION INTEGRATION (NEW)
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState)
 *   - accessors.js (getCharacters, getPlaces)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
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

    function _getLocationTypePriority(typeId) {
        return LocationState.getLocationTypePriority(typeId);
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;

        if (character.moves && character.moves.length > 0) {
            var sortedMoves = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove && lastMove.locationId) {
                return lastMove.locationId;
            }
        }

        if (character.currentLocationId) return character.currentLocationId;
        if (character.birthplaceId) return character.birthplaceId;

        return null;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getTeachingThresholds() {
        return window.TEACHING_THRESHOLDS || {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getRole(id);
        }
        return null;
    }

    // =========================================================================
    // 3. SEARCH LOCATIONS
    // =========================================================================

    function searchLocations(options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            var places = LocationState.getAllPlaces({ includeDeprecated: options.includeDeprecated || false });

            var results = [];

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var match = true;

                // Search by name
                if (options.search) {
                    var searchLower = options.search.toLowerCase();
                    var nameMatch = place.displayName && place.displayName.toLowerCase().indexOf(searchLower) !== -1;
                    var keyMatch = place.variableKey && place.variableKey.toLowerCase().indexOf(searchLower) !== -1;
                    var noteMatch = place.notes && place.notes.toLowerCase().indexOf(searchLower) !== -1;
                    if (!nameMatch && !keyMatch && !noteMatch) {
                        match = false;
                    }
                }

                // Filter by type
                if (match && options.typeId) {
                    if (place.typeId !== options.typeId) {
                        match = false;
                    }
                }

                // Filter by parent
                if (match && options.parentId) {
                    if (place.parentId !== options.parentId) {
                        match = false;
                    }
                }

                // Filter by status
                if (match && options.status) {
                    if (place.status !== options.status) {
                        match = false;
                    }
                }

                // Filter by isCapital
                if (match && options.isCapital !== undefined) {
                    if (!!place.isCapital !== options.isCapital) {
                        match = false;
                    }
                }

                // Filter by has children
                if (match && options.hasChildren !== undefined) {
                    var children = LocationState.getPlaceChildren(place.id, false);
                    var hasChildren = children.length > 0;
                    if (hasChildren !== options.hasChildren) {
                        match = false;
                    }
                }

                if (match) {
                    results.push(place);
                }
            }

            // Sorting
            if (options.sortBy) {
                results.sort(function(a, b) {
                    var compare = 0;
                    switch (options.sortBy) {
                        case 'name':
                            compare = (a.displayName || '').localeCompare(b.displayName || '');
                            break;
                        case 'type':
                            var typeA = LocationState.getLocationTypeName(a.typeId);
                            var typeB = LocationState.getLocationTypeName(b.typeId);
                            compare = typeA.localeCompare(typeB);
                            break;
                        case 'createdAt':
                            compare = (a.createdAt || 0) - (b.createdAt || 0);
                            break;
                        case 'updatedAt':
                            compare = (a.updatedAt || 0) - (b.updatedAt || 0);
                            break;
                        default:
                            compare = (a.displayName || '').localeCompare(b.displayName || '');
                    }
                    return options.sortOrder === 'desc' ? -compare : compare;
                });
            }

            if (options.limit) {
                results = results.slice(0, options.limit);
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. LOCATION STATISTICS
    // =========================================================================

    function getLocationStatistics(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var place = LocationState.getPlace(locationId);
            if (!place) return null;

            var children = LocationState.getPlaceChildren(locationId, true);
            var directChildren = LocationState.getPlaceChildren(locationId, false);
            var population = LocationState.getPopulationCount(locationId, false);
            var ownPopulation = LocationState.getOwnPopulation(locationId, false);
            var hierarchy = LocationState.getPlaceHierarchy(locationId);

            var stats = {
                id: place.id,
                name: place.displayName,
                type: LocationState.getLocationTypeName(place.typeId),
                typePriority: LocationState.getLocationTypePriority(place.typeId),
                status: place.status || 'active',
                isCapital: place.isCapital || false,
                parentId: place.parentId || null,
                parentName: place.parentId ? (LocationState.getPlace(place.parentId)?.displayName || 'Unknown') : null,
                depth: hierarchy.length,
                childCount: directChildren.length,
                totalDescendants: children.length,
                ownPopulation: ownPopulation,
                totalPopulation: population,
                variableKey: place.variableKey || null,
                notes: place.notes || null,
                createdAt: place.createdAt,
                updatedAt: place.updatedAt
            };

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    function getGlobalLocationStatistics() {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var places = LocationState.getAllPlaces({ includeDeprecated: false });
            var types = LocationState.getLocationTypes();

            var stats = {
                totalLocations: places.length,
                byType: {},
                byStatus: {},
                capitals: 0,
                rootLocations: 0,
                withChildren: 0,
                totalPopulation: 0,
                typeCounts: {}
            };

            for (var i = 0; i < places.length; i++) {
                var place = places[i];

                // By type
                var typeName = LocationState.getLocationTypeName(place.typeId);
                if (!stats.byType[typeName]) {
                    stats.byType[typeName] = 0;
                }
                stats.byType[typeName]++;

                // By status
                var status = place.status || 'active';
                if (!stats.byStatus[status]) {
                    stats.byStatus[status] = 0;
                }
                stats.byStatus[status]++;

                if (place.isCapital) stats.capitals++;

                if (!place.parentId) stats.rootLocations++;

                var children = LocationState.getPlaceChildren(place.id, false);
                if (children.length > 0) stats.withChildren++;

                stats.totalPopulation += LocationState.getPopulationCount(place.id, false);

                // Type priority counts
                var priority = LocationState.getLocationTypePriority(place.typeId);
                if (!stats.typeCounts[priority]) {
                    stats.typeCounts[priority] = 0;
                }
                stats.typeCounts[priority]++;
            }

            // Add type names
            stats.typeNames = {};
            for (var i = 0; i < types.length; i++) {
                stats.typeNames[types[i].id] = types[i].displayName;
            }

            stats.averagePopulation = stats.totalLocations > 0 ? Math.round(stats.totalPopulation / stats.totalLocations) : 0;

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. POPULATION TRENDS
    // =========================================================================

    function getPopulationTrends(locationId, years) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            years = years || 10;
            var currentYear = _getCurrentYear();

            // Get all characters at this location
            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();

            var yearlyData = {};
            var startYear = currentYear - years;

            for (var year = startYear; year <= currentYear; year++) {
                yearlyData[year] = { alive: 0, born: 0, died: 0, netChange: 0 };
            }

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                var charLocationId = _getCurrentLocationId(char);

                if (!charLocationId || !locationIdSet.has(charLocationId)) continue;

                var birthYear = char.birthYear;
                var deathYear = char.deathYear;

                // Count alive in each year
                for (var year = startYear; year <= currentYear; year++) {
                    if (birthYear && birthYear <= year) {
                        if (!deathYear || deathYear > year) {
                            if (yearlyData[year]) {
                                yearlyData[year].alive++;
                            }
                        }
                    }
                }

                // Count births
                if (birthYear && birthYear >= startYear && birthYear <= currentYear) {
                    if (yearlyData[birthYear]) {
                        yearlyData[birthYear].born++;
                    }
                }

                // Count deaths
                if (deathYear && deathYear >= startYear && deathYear <= currentYear) {
                    if (yearlyData[deathYear]) {
                        yearlyData[deathYear].died++;
                    }
                }
            }

            // Calculate net change
            for (var year = startYear; year <= currentYear; year++) {
                if (yearlyData[year]) {
                    yearlyData[year].netChange = yearlyData[year].born - yearlyData[year].died;
                }
            }

            var result = {
                locationId: locationId,
                locationName: LocationState.getPlace(locationId)?.displayName || 'Unknown',
                years: years,
                startYear: startYear,
                endYear: currentYear,
                data: yearlyData,
                trends: {
                    averagePopulation: 0,
                    totalBirths: 0,
                    totalDeaths: 0,
                    netGrowth: 0,
                    growthRate: 0
                }
            };

            var totalAlive = 0;
            var totalBirths = 0;
            var totalDeaths = 0;
            var count = 0;

            for (var year in yearlyData) {
                if (yearlyData.hasOwnProperty(year)) {
                    totalAlive += yearlyData[year].alive;
                    totalBirths += yearlyData[year].born;
                    totalDeaths += yearlyData[year].died;
                    count++;
                }
            }

            result.trends.averagePopulation = count > 0 ? Math.round(totalAlive / count) : 0;
            result.trends.totalBirths = totalBirths;
            result.trends.totalDeaths = totalDeaths;
            result.trends.netGrowth = totalBirths - totalDeaths;
            result.trends.growthRate = totalAlive > 0 ? Math.round((result.trends.netGrowth / (totalAlive / count)) * 100) : 0;

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. LOCATION COMPARISON
    // =========================================================================

    function compareLocations(locationId1, locationId2) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var stats1 = getLocationStatistics(locationId1);
            var stats2 = getLocationStatistics(locationId2);

            if (!stats1 || !stats2) return null;

            var result = {
                location1: stats1,
                location2: stats2,
                comparison: {
                    populationDifference: stats1.totalPopulation - stats2.totalPopulation,
                    depthDifference: stats1.depth - stats2.depth,
                    childCountDifference: stats1.childCount - stats2.childCount,
                    larger: stats1.totalPopulation > stats2.totalPopulation ? stats1.name : stats2.name,
                    deeper: stats1.depth > stats2.depth ? stats1.name : stats2.name,
                    moreChildren: stats1.childCount > stats2.childCount ? stats1.name : stats2.name
                }
            };

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. RANKINGS
    // =========================================================================

    function getLargestLocations(limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;
            var places = LocationState.getAllPlaces({ includeDeprecated: false });
            var withPopulation = [];

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var population = LocationState.getPopulationCount(place.id, false);
                withPopulation.push({
                    location: place,
                    population: population,
                    typeName: LocationState.getLocationTypeName(place.typeId),
                    isCapital: place.isCapital || false
                });
            }

            withPopulation.sort(function(a, b) {
                return b.population - a.population;
            });

            return withPopulation.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    function getMostDenseLocations(limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;
            var places = LocationState.getAllPlaces({ includeDeprecated: false });
            var withDensity = [];

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var population = LocationState.getPopulationCount(place.id, false);
                var children = LocationState.getPlaceChildren(place.id, true);
                var area = children.length + 1; // Rough estimate

                withDensity.push({
                    location: place,
                    population: population,
                    density: Math.round(population / area),
                    typeName: LocationState.getLocationTypeName(place.typeId),
                    isCapital: place.isCapital || false
                });
            }

            withDensity.sort(function(a, b) {
                return b.density - a.density;
            });

            return withDensity.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. MOVE ANALYTICS
    // =========================================================================

    function getMoveStatistics(characterId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var moves = LocationState.getMoveHistory(characterId);
            var character = typeof window.getCharacterById === 'function' ? window.getCharacterById(characterId) : null;

            if (!character) return null;

            var stats = {
                characterId: characterId,
                characterName: character.name + (character.surname ? ' ' + character.surname : ''),
                totalMoves: moves.length,
                uniqueLocations: 0,
                firstMove: null,
                lastMove: null,
                averageYearsBetweenMoves: 0,
                byLocation: {},
                byDecade: {}
            };

            var locationSet = new Set();

            for (var i = 0; i < moves.length; i++) {
                var move = moves[i];
                locationSet.add(move.locationId);

                if (!stats.firstMove || move.year < stats.firstMove.year) {
                    stats.firstMove = move;
                }
                if (!stats.lastMove || move.year > stats.lastMove.year) {
                    stats.lastMove = move;
                }

                var locationName = move.locationName || 'Unknown';
                if (!stats.byLocation[locationName]) {
                    stats.byLocation[locationName] = 0;
                }
                stats.byLocation[locationName]++;

                var decade = Math.floor(move.year / 10) * 10;
                if (!stats.byDecade[decade]) {
                    stats.byDecade[decade] = 0;
                }
                stats.byDecade[decade]++;
            }

            stats.uniqueLocations = locationSet.size;

            if (moves.length > 1) {
                var totalYears = 0;
                for (var i = 1; i < moves.length; i++) {
                    totalYears += Math.abs(moves[i].year - moves[i - 1].year);
                }
                stats.averageYearsBetweenMoves = Math.round((totalYears / (moves.length - 1)) * 10) / 10;
            }

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    function getMigrationPatterns(locationId, years) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            years = years || 10;
            var currentYear = _getCurrentYear();
            var startYear = currentYear - years;

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();

            var inMigration = 0;
            var outMigration = 0;
            var byYear = {};

            for (var year = startYear; year <= currentYear; year++) {
                byYear[year] = { in: 0, out: 0 };
            }

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var moves = LocationState.getMoveHistory(char.id);
                for (var j = 0; j < moves.length; j++) {
                    var move = moves[j];
                    if (move.year < startYear || move.year > currentYear) continue;

                    var isIn = locationIdSet.has(move.locationId);
                    var wasIn = move.fromLocationId ? locationIdSet.has(move.fromLocationId) : false;

                    if (isIn && !wasIn && move.fromLocationId) {
                        inMigration++;
                        if (byYear[move.year]) byYear[move.year].in++;
                    }
                    if (!isIn && wasIn) {
                        outMigration++;
                        if (byYear[move.year]) byYear[move.year].out++;
                    }
                }
            }

            var result = {
                locationId: locationId,
                locationName: LocationState.getPlace(locationId)?.displayName || 'Unknown',
                years: years,
                startYear: startYear,
                endYear: currentYear,
                totalInMigration: inMigration,
                totalOutMigration: outMigration,
                netMigration: inMigration - outMigration,
                byYear: byYear
            };

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. ROLE-LOCATION INTEGRATION (NEW)
    // =========================================================================

    /**
     * Gets all roles present at a location (with counts)
     * @param {string} locationId - Location ID
     * @returns {Object} Role distribution at location
     */
    function getRolesAtLocation(locationId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            if (!locationId) return {};

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();
            var roles = {};

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = _getCurrentLocationId(char);
                if (charLocationId && locationIdSet.has(charLocationId)) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            if (!roles[prof.id]) {
                                var role = _getRoleById(prof.id);
                                roles[prof.id] = {
                                    id: prof.id,
                                    name: prof.name || (role ? role.name : prof.id),
                                    count: 0,
                                    characters: []
                                };
                            }
                            roles[prof.id].count++;
                            roles[prof.id].characters.push(char.id);
                        }
                    }
                }
            }

            return roles;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets characters at a location with a specific role
     * @param {string} locationId - Location ID
     * @param {string} roleId - Role ID
     * @param {boolean} mastersOnly - Only masters (skill 76+)
     * @returns {Array} Character objects with role details
     */
    function getCharactersByRoleAtLocation(locationId, roleId, mastersOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            if (!locationId || !roleId) return [];

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var characters = _getCharacters();
            var results = [];
            var thresholds = _getTeachingThresholds();

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = _getCurrentLocationId(char);
                if (!charLocationId || !locationIdSet.has(charLocationId)) continue;

                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        var prof = char.professions[j];
                        if (prof.id === roleId) {
                            var skillLevel = prof.skillLevel || 0;
                            if (mastersOnly && skillLevel < 76) continue;

                            results.push({
                                character: char,
                                profession: prof,
                                skillLevel: skillLevel,
                                skillTier: _getSkillLevelName(skillLevel),
                                isMaster: skillLevel >= 76,
                                isExpert: skillLevel >= 76,
                                isJourneyman: skillLevel >= 51,
                                canTeach: skillLevel >= 51
                            });
                            break;
                        }
                    }
                }
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets profession distribution at a location
     * @param {string} locationId - Location ID
     * @returns {Object} Distribution stats
     */
    function getProfessionDistribution(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            if (!locationId) return null;

            var roles = getRolesAtLocation(locationId);
            var roleIds = Object.keys(roles);
            var total = 0;

            for (var i = 0; i < roleIds.length; i++) {
                total += roles[roleIds[i]].count;
            }

            var distribution = {};
            for (var i = 0; i < roleIds.length; i++) {
                var id = roleIds[i];
                distribution[id] = {
                    name: roles[id].name,
                    count: roles[id].count,
                    percentage: total > 0 ? Math.round((roles[id].count / total) * 100) : 0
                };
            }

            // Get top 5 roles
            var sorted = roleIds.slice().sort(function(a, b) {
                return roles[b].count - roles[a].count;
            });
            var topRoles = [];
            for (var i = 0; i < Math.min(5, sorted.length); i++) {
                var id = sorted[i];
                topRoles.push({
                    id: id,
                    name: roles[id].name,
                    count: roles[id].count,
                    percentage: total > 0 ? Math.round((roles[id].count / total) * 100) : 0
                });
            }

            return {
                locationId: locationId,
                totalProfessions: total,
                uniqueRoles: roleIds.length,
                distribution: distribution,
                topRoles: topRoles
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.LocationQueries = {
        searchLocations: searchLocations,
        getLocationStatistics: getLocationStatistics,
        getGlobalLocationStatistics: getGlobalLocationStatistics,
        getPopulationTrends: getPopulationTrends,
        compareLocations: compareLocations,
        getLargestLocations: getLargestLocations,
        getMostDenseLocations: getMostDenseLocations,
        getMoveStatistics: getMoveStatistics,
        getMigrationPatterns: getMigrationPatterns,
        // NEW: Role-location integration
        getRolesAtLocation: getRolesAtLocation,
        getCharactersByRoleAtLocation: getCharactersByRoleAtLocation,
        getProfessionDistribution: getProfessionDistribution
    };

})();