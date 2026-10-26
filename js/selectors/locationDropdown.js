/**
 * =============================================================================
 * STILL WATERS - LOCATION DROPDOWN (js/selectors/locationDropdown.js)
 * =============================================================================
 *
 * LOCATION: js/selectors/locationDropdown.js
 *
 * PURPOSE
 * -------
 * Builds <select> option lists for location pickers, and formats
 * location hierarchies for display. Used by household, residence,
 * character, and settlement modals wherever a location must be chosen
 * or displayed.
 *
 * PUBLIC SURFACE
 * --------------
 *   window.buildLocationDropdown(selectedId, placeholder, showAllOption)
 *     Returns the <option> inner HTML for a location <select>. When
 *     `showAllOption` is truthy, a leading "All locations" option is
 *     prepended.
 *
 *   window.getLocationHierarchyDisplay(placeOrId)
 *     Returns the display string for a place's hierarchy, root → leaf,
 *     using formatting.js's formatLocationHierarchy. Returns '' for
 *     missing or unresolvable input.
 *
 *   window.getLocationCountry(placeOrId)
 *     Returns the country-level ancestor of a place, or null.
 *
 *   window.getLocationDistrict(placeOrId)
 *     Returns the district-level ancestor of a place, or null.
 *
 *   window.getLocationTypeLabel(typeId)
 *     Returns the display name for a location type, or 'Unknown'.
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not the world query layer. Hierarchy resolution, country
 *     resolution, and district resolution live in world.js
 *     (getParentChain, getLocationCountry, getLocationDistrict).
 *     This module is a UI wrapper.
 *   - Not a formatter. Hierarchy → display string formatting lives in
 *     formatting.js (formatLocationHierarchy).
 *   - Not a mutation. Everything here is a read.
 *
 * FALLBACK POLICY (REVISED)
 * -------------------------
 *   The prior version duplicated the hierarchy walker, the country
 *   resolver, and the district resolver locally, with subtle
 *   divergences from world.js:
 *
 *     - The local walker used a hard-coded safety cap of 20 iterations
 *       rather than Set-based cycle detection.
 *     - The local country resolver accepted anything whose location
 *       type had priority 1, not `locationScope === 'country'`. That
 *       matched the legacy schema, not the current one.
 *     - The local district resolver had the same priority-based
 *       interpretation.
 *
 *   This rewrite delegates to world.js for hierarchy/country/district
 *   resolution. The local fallbacks are retained ONLY for the case
 *   where world.js hasn't loaded yet (early bootstrap), so this module
 *   can still produce a functioning dropdown. If world.js is loaded —
 *   which it always is in the normal load order — the fallbacks never
 *   execute.
 *
 *   When world.js is not loaded and the fallbacks are used, the country
 *   and district resolution will use locationType.priority (level 1 =
 *   country, level 3 = district), which matches the historical schema.
 *   If a future data migration ever changes the interpretation, callers
 *   should treat the fallback's output as potentially stale and rely on
 *   world.js for the canonical answer.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - accessors.js   (getPlaces, getPlaceById, getLocationTypeById)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - world.js            (getParentChain, getLocationCountry,
 *                          getLocationDistrict)
 *   - formatting.js       (formatLocationHierarchy)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'locationDropdown.js: ' + name + ' is required'
            );
        }
        return fn;
    }

    var _getPlaces = _requireFunction(
        'getPlaces (accessors.js)', window.getPlaces
    );
    var _getPlaceById = _requireFunction(
        'getPlaceById (accessors.js)', window.getPlaceById
    );

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _resolvePlace(placeOrId) {
        if (!placeOrId) return null;
        if (typeof placeOrId === 'string') {
            if (!_hasId(placeOrId)) return null;
            return _getPlaceById(placeOrId);
        }
        if (typeof placeOrId === 'object' && _hasId(placeOrId.id)) {
            return placeOrId;
        }
        return null;
    }

    function _getDisplayName(place) {
        if (!place) return '';
        if (typeof place.displayName === 'string' && place.displayName.length > 0) {
            return place.displayName;
        }
        if (typeof place.name === 'string' && place.name.length > 0) {
            return place.name;
        }
        return '';
    }

    // =========================================================================
    // 2. HIERARCHY RESOLUTION (delegated to world.js with local fallback)
    // =========================================================================

    function _worldGetParentChain() {
        if (typeof window.getParentChain === 'function') {
            return window.getParentChain;
        }
        return null;
    }

    function _worldGetLocationCountry() {
        if (typeof window.getLocationCountry === 'function') {
            return window.getLocationCountry;
        }
        return null;
    }

    function _worldGetLocationDistrict() {
        if (typeof window.getLocationDistrict === 'function') {
            return window.getLocationDistrict;
        }
        return null;
    }

    function _formattingFormatHierarchy() {
        if (typeof window.formatLocationHierarchy === 'function') {
            return window.formatLocationHierarchy;
        }
        return null;
    }

    /**
     * Local fallback for parent chain resolution. Used only when world.js
     * has not loaded. Bounded walk with a visited set (not a hard cap),
     * matching world.js's cycle-safe behavior rather than the prior
     * version's 20-iteration cap.
     */
    function _fallbackParentChain(place) {
        if (!place || !_hasId(place.id)) return [];
        var chain = [];
        var current = place;
        var seen = new Set();
        while (current) {
            if (!_hasId(current.id)) break;
            if (seen.has(current.id)) break;
            seen.add(current.id);
            chain.unshift(current);
            if (_isMissing(current.parentId)) break;
            current = _getPlaceById(current.parentId);
        }
        return chain;
    }

    /**
     * Local fallback for country resolution. Uses locationScope if
     * present; falls back to priority 1 (legacy schema).
     */
    function _fallbackLocationCountry(place) {
        if (!place) return null;
        var chain = _fallbackParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            var type = chain[i].typeId
                ? window.getLocationTypeById(chain[i].typeId) : null;
            if (!type) continue;
            if (type.locationScope === 'country') return chain[i];
            if (type.locationScope === undefined
                && type.priority === 1) return chain[i];
        }
        return null;
    }

    /**
     * Local fallback for district resolution.
     */
    function _fallbackLocationDistrict(place) {
        if (!place) return null;
        var chain = _fallbackParentChain(place);
        for (var i = 0; i < chain.length; i++) {
            var type = chain[i].typeId
                ? window.getLocationTypeById(chain[i].typeId) : null;
            if (!type) continue;
            if (type.locationScope === 'district') return chain[i];
            if (type.locationScope === undefined
                && type.priority === 3) return chain[i];
        }
        return null;
    }

    // =========================================================================
    // 3. PUBLIC QUERIES
    // =========================================================================

    /**
     * Returns the display string for a place's hierarchy, root → leaf.
     * Uses formatting.formatLocationHierarchy when available; otherwise
     * joins names with ' → '.
     *
     * @param {Object|string} placeOrId
     * @returns {string}
     */
    function getLocationHierarchyDisplay(placeOrId) {
        var place = _resolvePlace(placeOrId);
        if (!place) return '';

        var worldParentChain = _worldGetParentChain();
        var chain;
        if (worldParentChain) {
            try {
                chain = worldParentChain(place);
            } catch (e) {
                chain = _fallbackParentChain(place);
            }
        } else {
            chain = _fallbackParentChain(place);
        }

        if (!Array.isArray(chain) || chain.length === 0) return '';

        // Preferred path: formatting.formatLocationHierarchy takes an
        // array of {displayName} objects. Build that projection and call.
        var formatFn = _formattingFormatHierarchy();
        if (formatFn) {
            var projected = [];
            for (var i = 0; i < chain.length; i++) {
                var name = _getDisplayName(chain[i]);
                if (!name) continue;
                projected.push({ displayName: name });
            }
            if (projected.length > 0) {
                try {
                    return formatFn(projected);
                } catch (e) {
                    // Fall through to local join.
                }
            }
        }

        // Fallback: join names directly.
        var names = [];
        for (var j = 0; j < chain.length; j++) {
            var n = _getDisplayName(chain[j]);
            if (n) names.push(n);
        }
        return names.join(' → ');
    }

    /**
     * Returns the country-level ancestor of a place, or null.
     * Delegates to world.getLocationCountry when available.
     */
    function getLocationCountry(placeOrId) {
        var place = _resolvePlace(placeOrId);
        if (!place) return null;

        var worldFn = _worldGetLocationCountry();
        if (worldFn) {
            try {
                return worldFn(place);
            } catch (e) {
                // Fall through to local.
            }
        }
        return _fallbackLocationCountry(place);
    }

    /**
     * Returns the district-level ancestor of a place, or null.
     * Delegates to world.getLocationDistrict when available.
     */
    function getLocationDistrict(placeOrId) {
        var place = _resolvePlace(placeOrId);
        if (!place) return null;

        var worldFn = _worldGetLocationDistrict();
        if (worldFn) {
            try {
                return worldFn(place);
            } catch (e) {
                // Fall through to local.
            }
        }
        return _fallbackLocationDistrict(place);
    }

    /**
     * Returns the display name for a location type, or 'Unknown'.
     */
    function getLocationTypeLabel(typeId) {
        if (!_hasId(typeId)) return 'Unknown';
        if (typeof window.getLocationTypeById !== 'function') return 'Unknown';
        var type = window.getLocationTypeById(typeId);
        if (!type) return 'Unknown';
        if (typeof type.displayName === 'string' && type.displayName.length > 0) {
            return type.displayName;
        }
        if (typeof type.name === 'string' && type.name.length > 0) {
            return type.name;
        }
        return 'Unknown';
    }

    // =========================================================================
    // 4. DROPDOWN BUILDER
    // =========================================================================

    /**
     * Builds <option> inner HTML for a location select.
     *
     * Options are sorted alphabetically by display name. The selected id
     * (if any) is marked. When `showAllOption` is truthy, a leading
     * `<option value="">All locations</option>` is prepended.
     *
     * @param {string|null} selectedId
     * @param {string} [placeholder] - ignored when showAllOption is truthy;
     *   used as a leading option when showAllOption is falsy and
     *   placeholder is a non-empty string.
     * @param {boolean} [showAllOption]
     * @returns {string}
     */
    function buildLocationDropdown(selectedId, placeholder, showAllOption) {
        var places = _getPlaces();
        if (!Array.isArray(places)) places = [];

        var html = '';

        if (showAllOption) {
            var allSelected = _isMissing(selectedId) || selectedId === ''
                ? ' selected' : '';
            html += '<option value=""' + allSelected + '>All locations</option>';
        } else if (typeof placeholder === 'string' && placeholder.length > 0) {
            var phSelected = _isMissing(selectedId) || selectedId === ''
                ? ' selected' : '';
            html += '<option value=""' + phSelected + '>'
                + _escapeHtml(placeholder) + '</option>';
        } else if (_isMissing(selectedId) || selectedId === '') {
            // No placeholder, no showAll: emit an empty leading option so
            // the select doesn't auto-select the first place.
            html += '<option value=""></option>';
        }

        var sorted = places.slice().sort(function(a, b) {
            var an = _getDisplayName(a);
            var bn = _getDisplayName(b);
            return an.localeCompare(bn);
        });

        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            if (!p || !_hasId(p.id)) continue;
            var label = _getDisplayName(p) || p.id;
            var selected = (p.id === selectedId) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(p.id) + '"'
                + selected + '>'
                + _escapeHtml(label)
                + '</option>';
        }

        return html;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.buildLocationDropdown = buildLocationDropdown;
    window.getLocationHierarchyDisplay = getLocationHierarchyDisplay;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;
    window.getLocationTypeLabel = getLocationTypeLabel;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildLocationDropdown: buildLocationDropdown,
            getLocationHierarchyDisplay: getLocationHierarchyDisplay,
            getLocationCountry: getLocationCountry,
            getLocationDistrict: getLocationDistrict,
            getLocationTypeLabel: getLocationTypeLabel
        };
    }

})();
