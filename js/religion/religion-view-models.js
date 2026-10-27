/**
 * =============================================================================
 * STILL WATERS - RELIGION VIEW MODELS (religion-view-models.js)
 * =============================================================================
 * 
 * LOCATION: js/religion/religion-view-models.js
 * 
 * Prepares UI-ready view models from canonical religion data by calling
 * ReligionQueries. This is the boundary between the query layer and the
 * render layer.
 * 
 * The renderer (religion-render.js) consumes these rows. It does not call
 * ReligionQueries directly, does not touch ReligionState, and does not
 * perform domain lookups.
 * 
 * DEPENDENCIES:
 *   - religion-queries.js: ReligionQueries
 *   - religion-format.js: ReligionFormat (display names)
 *   - accessors.js: getCharacterById, getPlaceById
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 4 UI BOUNDARY (2026):
 *   - New module. Extracted per-row data preparation from religion-ui-list.js.
 *   - Renderer will consume the row shapes produced here.
 *   - No colors. No glyphs. No CSS class names. Only data + semantic labels
 *     that the renderer translates into classes.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getQueries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionViewModels requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _getFormat() {
        if (typeof window.ReligionFormat === 'undefined') {
            throw new Error('ReligionViewModels requires ReligionFormat.');
        }
        return window.ReligionFormat;
    }

    function _getCharacterName(characterId) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(characterId);
        }
        if (typeof window.getCharacterById === 'function') {
            var char = window.getCharacterById(characterId);
            if (char) {
                return char.name + (char.surname ? ' ' + char.surname : '');
            }
        }
        return 'Unknown';
    }

    function _getPlaceName(placeId) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(placeId);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(placeId);
            if (place) return place.displayName;
        }
        return 'Unknown';
    }

    function _resolveLocationNames(locationIds) {
        if (!locationIds || locationIds.length === 0) return [];
        var names = [];
        for (var i = 0; i < locationIds.length; i++) {
            names.push(_getPlaceName(locationIds[i]));
        }
        return names;
    }

    // =========================================================================
    // 2. RELIGION ROW
    // =========================================================================

    function buildReligionRow(religion) {
        if (!religion) return null;

        var queries = _getQueries();
        var format = _getFormat();

        var followerCount = queries.getFollowerCount(religion.id);
        var godCount = queries.getGodCount(religion.id);
        var lawCount = queries.getLawsByReligion(religion.id).length;
        var placeCount = queries.getPlaceOfWorshipCount(religion.id);

        var traitId = religion.trait || null;
        var traitLabel = traitId ? format.getReligiousTraitName(traitId) : '';

        var leaderName = religion.leader
            ? _getCharacterName(religion.leader.characterId)
            : null;
        var leaderTitle = religion.leader ? (religion.leader.title || null) : null;

        var locationNames = _resolveLocationNames(religion.locations || []);

        return {
            id: religion.id,
            name: religion.name,
            displayName: religion.displayName || religion.name,
            icon: religion.icon || '',
            description: religion.description || '',

            traitId: traitId,
            traitLabel: traitLabel,

            isDeprecated: religion.isDeprecated === true,
            isOrganized: religion.isOrganized === true,
            allowsConversion: religion.allowsConversion === true,
            proselytizes: religion.proselytizes === true,

            followerCount: followerCount,
            godCount: godCount,
            lawCount: lawCount,
            placeCount: placeCount,

            leaderName: leaderName,
            leaderTitle: leaderTitle,

            locationNames: locationNames,
            locationCount: locationNames.length
        };
    }

    function buildReligionRows(religions) {
        if (!religions || !religions.length) return [];
        var rows = [];
        for (var i = 0; i < religions.length; i++) {
            var row = buildReligionRow(religions[i]);
            if (row) rows.push(row);
        }
        return rows;
    }

    // =========================================================================
    // 3. SORTING
    // =========================================================================

    var SORT_FOLLOWERS = 'followers';
    var SORT_NAME = 'name';
    var SORT_NONE = 'none';

    function sortRows(rows, sortBy) {
        if (!rows || rows.length === 0) return rows;
        var copy = rows.slice();

        switch (sortBy) {
            case SORT_NAME:
                copy.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
                return copy;

            case SORT_FOLLOWERS:
                copy.sort(function(a, b) {
                    return b.followerCount - a.followerCount;
                });
                return copy;

            case SORT_NONE:
            case undefined:
            case null:
                return copy;

            default:
                throw new Error('ReligionViewModels: unknown sort key "' + sortBy + '"');
        }
    }

    // =========================================================================
    // 4. DETAILS VIEW MODEL
    // =========================================================================

    function buildReligionDetailsModel(religionId) {
        var queries = _getQueries();
        var format = _getFormat();

        var religion = queries.getReligion(religionId);
        if (!religion) return null;

        var row = buildReligionRow(religion);

        var traitId = religion.trait || null;
        var inheritanceRuleType = religion.inheritanceRule
            ? religion.inheritanceRule.type
            : null;

        var gods = queries.getGodsByReligion(religionId).map(function(g) {
            return {
                id: g.id,
                name: g.name,
                displayName: g.displayName || g.name,
                symbol: g.symbol || '',
                domain: g.domain || '',
                gender: g.gender || '',
                alignment: g.alignment || ''
            };
        });

        var laws = queries.getLawsByReligion(religionId).map(function(l) {
            return {
                id: l.id,
                name: l.name,
                type: l.type,
                typeLabel: format.getLawTypeName(l.type),
                category: l.lawCategory,
                categoryLabel: format.getLawCategoryName(l.lawCategory),
                domain: l.domain,
                domainLabel: format.getLawDomainName(l.domain),
                severity: l.severity,
                severityLabel: format.getLawSeverityName(l.severity),
                isEnforced: !!(l.crimeMapping && l.crimeMapping.isEnforced)
            };
        });

        var places = queries.getPlacesOfWorshipByReligion(religionId).map(function(p) {
            // Place is currently an ID (or {id, religionId, religionName} from
            // the index). Full place data is a Phase 5 / ADR Decision 2 concern.
            var placeId = (typeof p === 'string') ? p : p.id;
            return { id: placeId };
        });

        return {
            row: row,
            religion: religion,
            traitLabel: traitId ? format.getReligiousTraitName(traitId) : '',
            inheritanceLabel: inheritanceRuleType
                ? format.getInheritanceRuleName(inheritanceRuleType)
                : '',
            gods: gods,
            laws: laws,
            places: places
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ReligionViewModels = {
        // Row building
        buildReligionRow: buildReligionRow,
        buildReligionRows: buildReligionRows,
        buildReligionDetailsModel: buildReligionDetailsModel,

        // Sorting
        sortRows: sortRows,
        SORT_FOLLOWERS: SORT_FOLLOWERS,
        SORT_NAME: SORT_NAME,
        SORT_NONE: SORT_NONE
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionViewModels: window.ReligionViewModels
        };
    }

})();
