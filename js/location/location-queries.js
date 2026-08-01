/**
 * =============================================================================
 * LOCATION QUERIES - Complex read operations for location data
 * =============================================================================
 * 
 * LOCATION: js/location/location-queries.js
 * 
 * Responsibilities:
 * - Search and filter locations
 * - Statistics and analytics
 * - Location comparison
 * - Population analytics
 * - Move analytics
 * - ROLE-LOCATION INTEGRATION (with fallbacks)
 * - APPRENTICESHIP-LOCATION INTEGRATION (with fallbacks)
 * 
 * DEPENDENCIES:
 *   - LocationState (public API)
 *   - Core wrappers from modals-core.js
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
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _getCharacters() {
        return typeof window._getCharacters === 'function' ? window._getCharacters() : [];
    }

    function _getCurrentYear() {
        return typeof window._getCurrentYear === 'function' ? window._getCurrentYear() : 1250;
    }

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getRoleById(id) {
        try {
            if (typeof window.getRoleById === 'function') {
                return window.getRoleById(id);
            }
            if (typeof window._getRoleById === 'function') {
                return window._getRoleById(id);
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    function _getLocationTypePriority(typeId) {
        return LocationState.getLocationTypePriority(typeId);
    }

    function _getLocationTypeName(typeId) {
        return LocationState.getLocationTypeName(typeId);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    // =========================================================================
    // 3. SKILL LEVEL HELPERS (with fallbacks)
    // =========================================================================

    function _getSkillLevelName(level) {
        try {
            if (typeof window.ApprenticeshipQueries !== 'undefined' &&
                typeof window.ApprenticeshipQueries.getSkillLevelName === 'function') {
                return window.ApprenticeshipQueries.getSkillLevelName(level);
            }
            if (typeof window.getSkillLevelName === 'function') {
                return window.getSkillLevelName(level);
            }
        } catch (e) {
            // Ignore
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getTeachingThresholds() {
        try {
            if (window.TEACHING_THRESHOLDS) return window.TEACHING_THRESHOLDS;
        } catch (e) {
            // Ignore
        }
        return {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    // =========================================================================
    // 4. APPRENTICESHIP HELPERS (with fallbacks)
    // =========================================================================

    function _isApprentice(characterId) {
        try {
            if (typeof window.isApprentice === 'function') {
                return window.isApprentice(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.isApprentice === 'function') {
                return window.ApprenticeshipSystem.isApprentice(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return false;
    }

    function _isMaster(characterId) {
        try {
            if (typeof window.isMaster === 'function') {
                return window.isMaster(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.isMaster === 'function') {
                return window.ApprenticeshipSystem.isMaster(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return false;
    }

    function _getMaster(characterId) {
        try {
            if (typeof window.getMaster === 'function') {
                return window.getMaster(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.getMaster === 'function') {
                return window.ApprenticeshipSystem.getMaster(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    function _getApprentices(characterId, activeOnly) {
        try {
            if (typeof window.getApprentices === 'function') {
                return window.getApprentices(characterId, activeOnly);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.getApprentices === 'function') {
                return window.ApprenticeshipSystem.getApprentices(characterId, activeOnly);
            }
        } catch (e) {
            // Ignore
        }
        return [];
    }

    function _getApprenticeshipRole(characterId) {
        try {
            if (typeof window.getApprenticeshipRole === 'function') {
                return window.getApprenticeshipRole(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.getApprenticeshipRole === 'function') {
                return window.ApprenticeshipSystem.getApprenticeshipRole(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    function _getSkillLevel(characterId) {
        try {
            if (typeof window.getSkillLevel === 'function') {
                return window.getSkillLevel(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.getSkillLevel === 'function') {
                return window.ApprenticeshipSystem.getSkillLevel(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return 0;
    }

    function _getApprenticeship(characterId) {
        try {
            if (typeof window.getApprenticeship === 'function') {
                return window.getApprenticeship(characterId);
            }
            if (typeof window.ApprenticeshipSystem !== 'undefined' &&
                typeof window.ApprenticeshipSystem.getApprenticeship === 'function') {
                return window.ApprenticeshipSystem.getApprenticeship(characterId);
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    // =========================================================================
    // 5. SEARCH LOCATIONS
    // =========================================================================

    function searchLocations(options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            var places = LocationState.getAllPlaces({ 
                includeDeprecated: options.includeDeprecated || false 
            });

            var results = [];

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var match = true;

                if (options.search) {
                    var searchLower = options.search.toLowerCase();
                    var nameMatch = place.displayName && place.displayName.toLowerCase().indexOf(searchLower) !== -1;
                    var keyMatch = place.variableKey && place.variableKey.toLowerCase().indexOf(searchLower) !== -1;
                    var noteMatch = place.notes && place.notes.toLowerCase().indexOf(searchLower) !== -1;
                    if (!nameMatch && !keyMatch && !noteMatch) {
                        match = false;
                    }
                }

                if (match && options.typeId) {
                    if (place.typeId !== options.typeId) {
                        match = false;
                    }
                }

                if (match && options.parentId) {
                    if (place.parentId !== options.parentId) {
                        match = false;
                    }
                }

                if (match && options.status) {
                    if (place.status !== options.status) {
                        match = false;
                    }
                }

                if (match && options.isCapital !== undefined) {
                    if (!!place.isCapital !== options.isCapital) {
                        match = false;
                    }
                }

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
    // 6. LOCATION STATISTICS
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

                var typeName = LocationState.getLocationTypeName(place.typeId);
                if (!stats.byType[typeName]) {
                    stats.byType[typeName] = 0;
                }
                stats.byType[typeName]++;

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

                var priority = LocationState.getLocationTypePriority(place.typeId);
                if (!stats.typeCounts[priority]) {
                    stats.typeCounts[priority] = 0;
                }
                stats.typeCounts[priority]++;
            }

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
    // 7. POPULATION TRENDS
    // =========================================================================

    function getPopulationTrends(locationId, years) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            years = years || 10;
            var currentYear = _getCurrentYear();

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            var characters = _getCharacters();
            var yearlyData = {};
            var startYear = currentYear - years;

            for (var year = startYear; year <= currentYear; year++) {
                yearlyData[year] = { alive: 0, born: 0, died: 0, netChange: 0 };
            }

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                var charLocationId = LocationState.getCurrentLocationId(char.id);

                if (!charLocationId || !locationIdSet[charLocationId]) continue;

                var birthYear = char.birthYear;
                var deathYear = char.deathYear;

                for (var year = startYear; year <= currentYear; year++) {
                    if (birthYear && birthYear <= year) {
                        if (!deathYear || deathYear > year) {
                            if (yearlyData[year]) {
                                yearlyData[year].alive++;
                            }
                        }
                    }
                }

                if (birthYear && birthYear >= startYear && birthYear <= currentYear) {
                    if (yearlyData[birthYear]) {
                        yearlyData[birthYear].born++;
                    }
                }

                if (deathYear && deathYear >= startYear && deathYear <= currentYear) {
                    if (yearlyData[deathYear]) {
                        yearlyData[deathYear].died++;
                    }
                }
            }

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
    // 8. LOCATION COMPARISON
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
    // 9. RANKINGS
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
                var area = children.length + 1;

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
    // 10. MOVE ANALYTICS
    // =========================================================================

    function getMoveStatistics(characterId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var moves = LocationState.getMoveHistory(characterId);
            var character = _getCharacterById(characterId);

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
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

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

                    var isIn = locationIdSet[move.locationId] || false;
                    var wasIn = move.fromLocationId ? (locationIdSet[move.fromLocationId] || false) : false;

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
    // 11. ROLE-LOCATION INTEGRATION
    // =========================================================================

    function getRolesAtLocation(locationId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            if (!locationId) return {};

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            var characters = _getCharacters();
            var roles = {};

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = LocationState.getCurrentLocationId(char.id);
                if (charLocationId && locationIdSet[charLocationId]) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            var roleId = prof.id || prof;
                            if (!roles[roleId]) {
                                var role = _getRoleById(roleId);
                                roles[roleId] = {
                                    id: roleId,
                                    name: prof.name || (role ? role.name : roleId),
                                    count: 0,
                                    characters: []
                                };
                            }
                            roles[roleId].count++;
                            roles[roleId].characters.push(char.id);
                        }
                    }
                }
            }

            return roles;

        } finally {
            _processingQuery = false;
        }
    }

    function getCharactersByRoleAtLocation(locationId, roleId, mastersOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            if (!locationId || !roleId) return [];

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            var characters = _getCharacters();
            var results = [];
            var thresholds = _getTeachingThresholds();

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = LocationState.getCurrentLocationId(char.id);
                if (!charLocationId || !locationIdSet[charLocationId]) continue;

                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        var prof = char.professions[j];
                        var profId = prof.id || prof;
                        if (profId === roleId) {
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
    // 12. APPRENTICESHIP-LOCATION QUERIES
    // =========================================================================

    function getApprenticesAtLocation(locationId, activeOnly) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!locationId) return [];

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            var characters = _getCharacters();
            var results = [];

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = LocationState.getCurrentLocationId(char.id);
                if (!charLocationId || !locationIdSet[charLocationId]) continue;

                var isApprentice = _isApprentice(char.id);
                if (isApprentice) {
                    var master = _getMaster(char.id);
                    var role = _getApprenticeshipRole(char.id);
                    var skillLevel = _getSkillLevel(char.id);
                    var status = 'ongoing';

                    if (activeOnly) {
                        var app = _getApprenticeship(char.id);
                        if (app && app.status) status = app.status;
                        if (status !== 'ongoing') continue;
                    }

                    var masterInfo = null;
                    if (master && typeof master === 'object') {
                        masterInfo = master;
                    } else if (master && typeof master === 'string') {
                        masterInfo = _getCharacterById(master);
                    }

                    var roleObj = null;
                    if (role && typeof role === 'string') {
                        roleObj = _getRoleById(role);
                    } else if (role && typeof role === 'object') {
                        roleObj = role;
                    }

                    results.push({
                        apprentice: char,
                        master: masterInfo,
                        role: roleObj,
                        roleId: typeof role === 'string' ? role : (role ? role.id : null),
                        skillLevel: skillLevel,
                        status: status
                    });
                }
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    function getMastersAtLocation(locationId, roleId, activeOnly) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!locationId) return [];

            var locationIds = LocationState.getAllSubLocationIds(locationId);
            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            var characters = _getCharacters();
            var results = [];

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocationId = LocationState.getCurrentLocationId(char.id);
                if (!charLocationId || !locationIdSet[charLocationId]) continue;

                var isMaster = _isMaster(char.id);
                if (isMaster) {
                    if (roleId) {
                        var hasRole = false;
                        if (char.professions) {
                            for (var j = 0; j < char.professions.length; j++) {
                                var prof = char.professions[j];
                                var profId = prof.id || prof;
                                if (profId === roleId && (prof.skillLevel || 0) >= 76) {
                                    hasRole = true;
                                    break;
                                }
                            }
                        }
                        if (!hasRole) continue;
                    }

                    var apprentices = _getApprentices(char.id, true) || [];
                    if (activeOnly && apprentices.length === 0) continue;

                    var apprenticeDetails = [];
                    for (var j = 0; j < Math.min(10, apprentices.length); j++) {
                        var app = apprentices[j];
                        var appChar = typeof app === 'string' ? _getCharacterById(app) : app;
                        if (appChar) {
                            apprenticeDetails.push({
                                id: appChar.id,
                                name: appChar.name + (appChar.surname ? ' ' + appChar.surname : '')
                            });
                        }
                    }

                    results.push({
                        master: char,
                        apprenticeCount: apprentices.length,
                        apprentices: apprenticeDetails
                    });
                }
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    function getApprenticeshipDensity(locationId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (!locationId) return null;

            var apprentices = getApprenticesAtLocation(locationId, true);
            var masters = getMastersAtLocation(locationId, null, true);
            var population = LocationState.getPopulationCount(locationId, false);
            var place = LocationState.getPlace(locationId);

            var byRole = {};
            for (var i = 0; i < apprentices.length; i++) {
                var roleId = apprentices[i].roleId;
                if (roleId) {
                    if (!byRole[roleId]) {
                        var role = _getRoleById(roleId);
                        byRole[roleId] = {
                            id: roleId,
                            name: role ? role.name : roleId,
                            count: 0
                        };
                    }
                    byRole[roleId].count++;
                }
            }

            var sortedRoles = Object.keys(byRole).sort(function(a, b) {
                return byRole[b].count - byRole[a].count;
            });
            var topRoles = [];
            for (var i = 0; i < Math.min(5, sortedRoles.length); i++) {
                topRoles.push(byRole[sortedRoles[i]]);
            }

            return {
                locationId: locationId,
                locationName: place ? place.displayName : 'Unknown',
                totalApprentices: apprentices.length,
                totalMasters: masters.length,
                masterToApprenticeRatio: masters.length > 0 ? 
                    Math.round((apprentices.length / masters.length) * 10) / 10 : 0,
                apprenticeDensity: population > 0 ? 
                    Math.round((apprentices.length / population) * 1000) / 10 : 0,
                byRole: byRole,
                topRoles: topRoles,
                masters: masters.slice(0, 10)
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS
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
        getRolesAtLocation: getRolesAtLocation,
        getCharactersByRoleAtLocation: getCharactersByRoleAtLocation,
        getProfessionDistribution: getProfessionDistribution,
        getApprenticesAtLocation: getApprenticesAtLocation,
        getMastersAtLocation: getMastersAtLocation,
        getApprenticeshipDensity: getApprenticeshipDensity
    };

})();