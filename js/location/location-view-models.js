/**
 * =============================================================================
 * LOCATION VIEW MODELS
 * =============================================================================
 *
 * Translates domain query results into render-ready structures.
 * This is where presentation defaults live.
 *
 * Depends on (checked at load time):
 *   - LocationQueries
 *   - LocationHierarchy
 *   - LocationMovement
 *   - CharacterQueries
 *   - time.js (window.getCurrentYearSafe)
 *
 * Does NOT mutate. Does NOT touch DOM. Does NOT call Commands.
 *
 * Note on TimeQueries:
 *   TimeQueries does not exist. Time is accessed through the window-global
 *   helper window.getCurrentYearSafe, defined in js/core/time.js.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationQueries) {
        throw new Error(
            'location-view-models.js requires location-queries.js first.'
        );
    }
    if (!window.LocationHierarchy) {
        throw new Error(
            'location-view-models.js requires location-hierarchy.js first.'
        );
    }
    if (!window.LocationMovement) {
        throw new Error(
            'location-view-models.js requires location-movement.js first.'
        );
    }
    if (!window.CharacterQueries) {
        throw new Error(
            'location-view-models.js requires character-queries.js ' +
            '(CharacterQueries) first.'
        );
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error(
            'location-view-models.js requires time.js (getCurrentYearSafe).'
        );
    }

    var _requiredCharacterQueryMethods = [
        'getCharacterById',
        'getCurrentLocationId',
        'getCharactersAtLocation'
    ];
    for (var _i = 0; _i < _requiredCharacterQueryMethods.length; _i++) {
        var _m = _requiredCharacterQueryMethods[_i];
        if (typeof window.CharacterQueries[_m] !== 'function') {
            throw new Error(
                'location-view-models.js: CharacterQueries.' + _m +
                ' is required.'
            );
        }
    }

    var LQ = window.LocationQueries;
    var LH = window.LocationHierarchy;
    var LM = window.LocationMovement;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 2. FORMATTING PRIMITIVES
    // =========================================================================

    /**
     * Returns fallback when value is null, undefined, or empty string.
     * Otherwise returns value.
     *
     * This is the sole place in the location domain where a default label is
     * fabricated. Domain modules never do this.
     */
    function displayName(value, fallback) {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        return value;
    }

    /**
     * Formats a population number for display. Returns null when the input
     * is not a finite number. 1000 -> '1.0k'.
     */
    function formatPopulation(n) {
        if (typeof n !== 'number' || !isFinite(n)) return null;
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
    }

    /**
     * Resolves a culture id to a display label.
     * Returns null when cultureId is missing, CultureQueries is not loaded,
     * or the culture is not found.
     *
     * No fallback to a fabricated label; the caller decides what to render.
     */
    function resolveCultureLabel(cultureId) {
        if (!cultureId) return null;
        if (!window.CultureQueries ||
            typeof window.CultureQueries.getCulture !== 'function') {
            return null;
        }
        var c = window.CultureQueries.getCulture(cultureId);
        if (!c) return null;
        if (typeof c.displayName === 'string' && c.displayName.length > 0) {
            return c.displayName;
        }
        if (typeof c.name === 'string' && c.name.length > 0) {
            return c.name;
        }
        return null;
    }

    // =========================================================================
    // 3. LOCATION TREE
    // =========================================================================

    /**
     * Builds the render tree from LocationQueries.
     *
     * Filters preserve hierarchy: matched nodes and their ancestors are kept.
     * Sort is by type priority (ascending), then name.
     *
     * Each node:
     *   { id, name, typeId, typeName, typePriority, parentId, isCapital,
     *     status, cultureLabel, ownPopulation, totalPopulation,
     *     populationLabel, children: [], depth }
     *
     * `depth` is filled during the recursive sort pass.
     */
    function buildLocationTree(options) {
        options = options || {};
        var places = LQ.getAllPlaces({
            includeDeprecated: options.includeDeprecated === true
        });
        var includeFilters = options.search || options.typeId || options.status;

        if (includeFilters) {
            var matched = {};
            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                var ok = true;
                if (options.search) {
                    var lower = options.search.toLowerCase();
                    var nameOk = p.displayName &&
                        p.displayName.toLowerCase().indexOf(lower) !== -1;
                    var keyOk = p.variableKey &&
                        p.variableKey.toLowerCase().indexOf(lower) !== -1;
                    if (!nameOk && !keyOk) ok = false;
                }
                if (ok && options.typeId && p.typeId !== options.typeId) {
                    ok = false;
                }
                if (ok && options.status && p.status !== options.status) {
                    ok = false;
                }
                if (ok) matched[p.id] = true;
            }

            // Include ancestors of matches so the tree keeps structure.
            var withAncestors = {};
            Object.keys(matched).forEach(function (id) {
                var chain = LQ.getPlaceHierarchy(id);
                for (var j = 0; j < chain.length; j++) {
                    withAncestors[chain[j].id] = true;
                }
            });

            places = places.filter(function (p) {
                return withAncestors[p.id];
            });
        }

        var nodes = {};
        var roots = [];

        for (var k = 0; k < places.length; k++) {
            var place = places[k];
            var type = LQ.getLocationType(place.typeId);
            var node = {
                id: place.id,
                name: displayName(place.displayName, '(unnamed)'),
                typeId: place.typeId,
                typeName: type ? type.displayName : null,
                typePriority: type ? type.priority : null,
                parentId: (place.parentId === undefined) ? null : place.parentId,
                isCapital: place.isCapital === true,
                status: (place.status === undefined) ? null : place.status,
                cultureLabel: resolveCultureLabel(place.cultureId),
                ownPopulation: LQ.getOwnPopulation(place.id, false),
                totalPopulation: LQ.getPopulationCount(place.id, false),
                children: [],
                depth: 0
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

        function sortRecursive(list, depth) {
            list.sort(function (a, b) {
                var ap = (a.typePriority === null) ? 99 : a.typePriority;
                var bp = (b.typePriority === null) ? 99 : b.typePriority;
                if (ap !== bp) return ap - bp;
                return a.name.localeCompare(b.name);
            });
            for (var i = 0; i < list.length; i++) {
                list[i].depth = depth;
                if (list[i].children.length > 0) {
                    sortRecursive(list[i].children, depth + 1);
                }
            }
        }
        sortRecursive(roots, 0);

        return roots;
    }

    // =========================================================================
    // 4. HIERARCHY ROWS
    // =========================================================================

    /**
     * Flat list of ancestors + self, root first.
     * Each row:
     *   { id, depth, name, typeName, isCapital, isCurrent, cultureLabel }
     */
    function buildHierarchyRows(placeId) {
        var chain = LQ.getPlaceHierarchy(placeId);
        var rows = [];
        for (var i = 0; i < chain.length; i++) {
            var p = chain[i];
            var type = LQ.getLocationType(p.typeId);
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

    // =========================================================================
    // 5. MOVE ROWS
    // =========================================================================

    /**
     * Flat list of move rows in chronological order (oldest first).
     * The UI renders them in reverse.
     *
     * Each row:
     *   { index, year, locationName, fromLocationName, note, isBirthMove }
     */
    function buildMoveRows(characterId) {
        var moves = LQ.getMoveHistory(characterId);
        var rows = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            rows.push({
                index: i,
                year: (m.year === undefined) ? null : m.year,
                locationName: displayName(m.locationName, '(unknown location)'),
                fromLocationName: displayName(m.fromLocationName, null),
                note: m.note || null,
                isBirthMove: m.isBirthMove === true
            });
        }
        return rows;
    }

    // =========================================================================
    // 6. LOCATION CARD
    // =========================================================================

    /**
     * Single-location projection for a detail panel.
     * Returns null when the place does not exist.
     */
    function buildLocationCard(placeId) {
        var place = LQ.getPlace(placeId);
        if (!place) return null;

        var type = LQ.getLocationType(place.typeId);
        var parent = place.parentId ? LQ.getPlace(place.parentId) : null;

        return {
            id: place.id,
            name: displayName(place.displayName, '(unnamed)'),
            typeName: type ? type.displayName : null,
            typePriority: type ? type.priority : null,
            isCapital: place.isCapital === true,
            status: (place.status === undefined) ? null : place.status,
            parentName: parent ? displayName(parent.displayName, '(unnamed)') : null,
            childCount: LQ.getPlaceChildren(place.id, false).length,
            population: LQ.getPopulationCount(place.id, false),
            ownPopulation: LQ.getOwnPopulation(place.id, false),
            variableKey: (place.variableKey === undefined) ? null : place.variableKey,
            notes: (place.notes === undefined) ? null : place.notes,
            cultureLabel: resolveCultureLabel(place.cultureId)
        };
    }

    // =========================================================================
    // 7. MOVE CHARACTER MODAL
    // =========================================================================

    /**
     * Model for the single-move modal.
     * Returns null when the character does not exist.
     *
     * destinationOptions excludes the character's current location.
     */
    function buildMoveCharacterModel(characterId) {
        var character = CQ.getCharacterById(characterId);
        if (!character) return null;

        var currentLocationId = CQ.getCurrentLocationId(characterId);
        var currentLocation = currentLocationId
            ? LQ.getPlace(currentLocationId)
            : null;

        var displayLabel = displayName(character.name, '(unnamed)');
        if (character.surname) {
            displayLabel = displayLabel + ' ' + character.surname;
        }

        return {
            characterId: characterId,
            displayName: displayLabel,
            currentLocationName: currentLocation
                ? displayName(currentLocation.displayName, '(unnamed)')
                : null,
            currentYear: window.getCurrentYearSafe(),
            destinationOptions: _buildDestinationOptions(currentLocationId)
        };
    }

    /**
     * Walks the full location tree and returns a flat list of options.
     * Excludes excludePlaceId when provided.
     */
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

    // =========================================================================
    // 8. BULK MOVE MODEL
    // =========================================================================

    /**
     * Model for the bulk-move modal.
     * Returns null when the source place does not exist.
     *
     * Only living characters at the source place are listed.
     */
    function buildBulkMoveModel(fromPlaceId) {
        var fromPlace = LQ.getPlace(fromPlaceId);
        if (!fromPlace) return null;

        var candidates = CQ.getCharactersAtLocation(fromPlaceId, { aliveOnly: true });
        var characterRows = [];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var label = displayName(c.name, '(unnamed)');
            if (c.surname) label = label + ' ' + c.surname;
            characterRows.push({
                id: c.id,
                displayName: label
            });
        }

        return {
            fromPlaceId: fromPlaceId,
            fromPlaceName: displayName(fromPlace.displayName, '(unnamed)'),
            characterRows: characterRows,
            destinationOptions: _buildDestinationOptions(fromPlaceId),
            currentYear: window.getCurrentYearSafe()
        };
    }

    // =========================================================================
    // 9. MOVE HISTORY
    // =========================================================================

    /**
     * Model for the move-history modal.
     * Returns null when the character does not exist.
     */
    function buildMoveHistoryModel(characterId) {
        var character = CQ.getCharacterById(characterId);
        if (!character) return null;

        var displayLabel = displayName(character.name, '(unnamed)');
        if (character.surname) {
            displayLabel = displayLabel + ' ' + character.surname;
        }

        return {
            characterId: characterId,
            displayName: displayLabel,
            rows: buildMoveRows(characterId)
        };
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationViewModels;
    }

})();
