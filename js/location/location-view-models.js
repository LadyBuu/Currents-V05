/**
 * =============================================================================
 * LOCATION VIEW MODELS
 * =============================================================================
 *
 * Translates domain query results into render-ready structures.
 * This is where presentation defaults live.
 *
 * Depends on:
 *   - LocationQueries
 *   - LocationHierarchy
 *   - LocationMovement
 *   - CharacterQueries
 *
 * Does NOT mutate. Does NOT touch DOM. Does NOT call Commands.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _queries() {
        if (!window.LocationQueries) throw new Error('LocationViewModels: LocationQueries required');
        return window.LocationQueries;
    }
    function _hierarchy() {
        if (!window.LocationHierarchy) throw new Error('LocationViewModels: LocationHierarchy required');
        return window.LocationHierarchy;
    }
    function _movement() {
        if (!window.LocationMovement) throw new Error('LocationViewModels: LocationMovement required');
        return window.LocationMovement;
    }
    function _characters() {
        if (!window.CharacterQueries) throw new Error('LocationViewModels: CharacterQueries required');
        return window.CharacterQueries;
    }

    // -------------------------------------------------------------------------
    // FORMATTING PRIMITIVES
    // -------------------------------------------------------------------------

    function displayName(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        return value;
    }

    function formatPopulation(n) {
        if (n === null || n === undefined) return null;
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
    }

    function resolveCultureLabel(cultureId) {
        if (!cultureId) return null;
        if (!window.CultureQueries) return null;
        var c = window.CultureQueries.getCulture(cultureId);
        if (!c) return null;
        return c.displayName || c.name || null;
    }

    // -------------------------------------------------------------------------
    // LOCATION TREE
    // -------------------------------------------------------------------------

    function buildLocationTree(options) {
        options = options || {};
        var places = _queries().getAllPlaces({ includeDeprecated: options.includeDeprecated === true });
        var includeFilters = options.search || options.typeId || options.status;

        if (includeFilters) {
            var matched = {};
            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                var ok = true;
                if (options.search) {
                    var lower = options.search.toLowerCase();
                    var nameOk = p.displayName && p.displayName.toLowerCase().indexOf(lower) !== -1;
                    var keyOk = p.variableKey && p.variableKey.toLowerCase().indexOf(lower) !== -1;
                    if (!nameOk && !keyOk) ok = false;
                }
                if (ok && options.typeId && p.typeId !== options.typeId) ok = false;
                if (ok && options.status && p.status !== options.status) ok = false;
                if (ok) matched[p.id] = true;
            }

            // Include ancestors of matches so the tree keeps structure.
            var withAncestors = {};
            Object.keys(matched).forEach(function (id) {
                var chain = _queries().getPlaceHierarchy(id);
                for (var j = 0; j < chain.length; j++) withAncestors[chain[j].id] = true;
            });

            places = places.filter(function (p) { return withAncestors[p.id]; });
        }

        var nodes = {};
        var roots = [];

        for (var k = 0; k < places.length; k++) {
            var place = places[k];
            var type = _queries().getLocationType(place.typeId);
            var node = {
                id: place.id,
                name: displayName(place.displayName, '(unnamed)'),
                typeId: place.typeId,
                typeName: type ? type.displayName : null,
                typePriority: type ? type.priority : null,
                parentId: place.parentId === undefined ? null : place.parentId,
                isCapital: place.isCapital === true,
                status: place.status === undefined ? null : place.status,
                cultureLabel: resolveCultureLabel(place.cultureId),
                ownPopulation: _queries().getOwnPopulation(place.id, false),
                totalPopulation: _queries().getPopulationCount(place.id, false),
                children: []
            };
            node.populationLabel = formatPopulation(node.totalPopulation);
            nodes[node.id] = node;
        }

        Object.keys(nodes).forEach(function (id) {
            var node = nodes[id];
            if (node.parentId && nodes[node.parentId]) {
                nodes[node.parentId].children.push(node);
            } else {
                roots.push(node);
            }
        });

        function sortRecursive(list) {
            list.sort(function (a, b) {
                var ap = a.typePriority === null ? 99 : a.typePriority;
                var bp = b.typePriority === null ? 99 : b.typePriority;
                if (ap !== bp) return ap - bp;
                return a.name.localeCompare(b.name);
            });
            for (var i = 0; i < list.length; i++) {
                if (list[i].children.length > 0) sortRecursive(list[i].children);
            }
        }
        sortRecursive(roots);

        return roots;
    }

    // -------------------------------------------------------------------------
    // HIERARCHY ROWS
    // -------------------------------------------------------------------------

    function buildHierarchyRows(placeId) {
        var chain = _queries().getPlaceHierarchy(placeId);
        var rows = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            var type = _queries().getLocationType(p.typeId);
            rows.push({
                id: p.id,
                depth: i,
                name: displayName(p.displayName, '(unnamed)'),
                typeName: type ? type.displayName : null,
                isCapital: p.isCapital === true,
                isCurrent: p.id === placeId,
                cultureLabel: resolveCultureLabel(p.cultureId)
            });
        }
        return rows;
    }

    // -------------------------------------------------------------------------
    // MOVE ROWS
    // -------------------------------------------------------------------------

    function buildMoveRows(characterId) {
        var moves = _queries().getMoveHistory(characterId);
        var rows = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            rows.push({
                index: i,
                year: m.year === undefined ? null : m.year,
                locationName: displayName(m.locationName, '(unknown location)'),
                fromLocationName: displayName(m.fromLocationName, null),
                note: m.note || null,
                isBirthMove: m.isBirthMove === true
            });
        }
        return rows;
    }

    // -------------------------------------------------------------------------
    // LOCATION CARD
    // -------------------------------------------------------------------------

    function buildLocationCard(placeId) {
        var place = _queries().getPlace(placeId);
        if (!place) return null;

        var type = _queries().getLocationType(place.typeId);
        var parent = place.parentId ? _queries().getPlace(place.parentId) : null;

        return {
            id: place.id,
            name: displayName(place.displayName, '(unnamed)'),
            typeName: type ? type.displayName : null,
            typePriority: type ? type.priority : null,
            isCapital: place.isCapital === true,
            status: place.status === undefined ? null : place.status,
            parentName: parent ? displayName(parent.displayName, '(unnamed)') : null,
            childCount: _queries().getPlaceChildren(place.id, false).length,
            population: _queries().getPopulationCount(place.id, false),
            ownPopulation: _queries().getOwnPopulation(place.id, false),
            variableKey: place.variableKey === undefined ? null : place.variableKey,
            notes: place.notes === undefined ? null : place.notes,
            cultureLabel: resolveCultureLabel(place.cultureId)
        };
    }

    // -------------------------------------------------------------------------
    // MOVE CHARACTER MODAL
    // -------------------------------------------------------------------------

    function buildMoveCharacterModel(characterId) {
        var character = _characters().getCharacterById(characterId);
        if (!character) return null;

        var currentLocationId = _characters().getCurrentLocationId(characterId);
        var currentLocation = currentLocationId ? _queries().getPlace(currentLocationId) : null;

        return {
            characterId: characterId,
            displayName: displayName(character.name, '(unnamed)') +
                (character.surname ? ' ' + character.surname : ''),
            currentLocationName: currentLocation ? displayName(currentLocation.displayName, '(unnamed)') : null,
            currentYear: window.TimeQueries ? window.TimeQueries.getCurrentYear() : null,
            destinationOptions: _buildDestinationOptions(currentLocationId)
        };
    }

    function _buildDestinationOptions(excludePlaceId) {
        var tree = buildLocationTree({});
        var options = [];

        function walk(nodes, depth) {
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.id !== excludePlaceId) {
                    options.push({
                        id: n.id,
                        label: n.name,
                        typeName: n.typeName,
                        isCapital: n.isCapital,
                        depth: depth
                    });
                }
                walk(n.children, depth + 1);
            }
        }
        walk(tree, 0);
        return options;
    }

    // -------------------------------------------------------------------------
    // BULK MOVE MODEL
    // -------------------------------------------------------------------------

    function buildBulkMoveModel(fromPlaceId) {
        var fromPlace = _queries().getPlace(fromPlaceId);
        if (!fromPlace) return null;

        var candidates = _characters().getCharactersAtLocation(fromPlaceId, { aliveOnly: true });
        var characterRows = [];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            characterRows.push({
                id: c.id,
                displayName: displayName(c.name, '(unnamed)') +
                    (c.surname ? ' ' + c.surname : '')
            });
        }

        return {
            fromPlaceId: fromPlaceId,
            fromPlaceName: displayName(fromPlace.displayName, '(unnamed)'),
            characterRows: characterRows,
            destinationOptions: _buildDestinationOptions(fromPlaceId),
            currentYear: window.TimeQueries ? window.TimeQueries.getCurrentYear() : null
        };
    }

    // -------------------------------------------------------------------------
    // MOVE HISTORY
    // -------------------------------------------------------------------------

    function buildMoveHistoryModel(characterId) {
        var character = _characters().getCharacterById(characterId);
        if (!character) return null;
        return {
            characterId: characterId,
            displayName: displayName(character.name, '(unnamed)') +
                (character.surname ? ' ' + character.surname : ''),
            rows: buildMoveRows(characterId)
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.LocationViewModels = {
        displayName: displayName,
        formatPopulation: formatPopulation,

        buildLocationTree: buildLocationTree,
        buildHierarchyRows: buildHierarchyRows,
        buildMoveRows: buildMoveRows,
        buildLocationCard: buildLocationCard,

        buildMoveCharacterModel: buildMoveCharacterModel,
        buildBulkMoveModel: buildBulkMoveModel,
        buildMoveHistoryModel: buildMoveHistoryModel
    };

})();
