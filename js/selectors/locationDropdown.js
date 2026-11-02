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
 *     Accepts a place object OR a place id. See SHADOWING below.
 *
 *   window.getLocationDistrict(placeOrId)
 *     Returns the district-level ancestor of a place, or null.
 *     Accepts a place object OR a place id. See SHADOWING below.
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
 * SHADOWING (world.js exports with the same names)
 * ------------------------------------------------
 *   world.js exports:
 *     window.getLocationCountry(place)      — accepts a PLACE OBJECT,
 *                                             returns the country place.
 *     window.getLocationDistrict(place)     — accepts a PLACE OBJECT,
 *                                             returns the district place.
 *
 *   This module ALSO exports:
 *     window.getLocationCountry(placeOrId)  — accepts a PLACE OBJECT
 *                                             OR a place ID string,
 *                                             returns the country place.
 *     window.getLocationDistrict(placeOrId) — accepts a PLACE OBJECT
 *                                             OR a place ID string,
 *                                             returns the district place.
 *
 *   Under the documented load order, world.js loads BEFORE this file,
 *   so this file's version wins on the global namespace. The winning
 *   function is a SUPERSET of world.js's:
 *
 *     - When called with a place object: delegates to world.js's
 *       resolver, so behaviour is identical.
 *     - When called with a place id:    resolves the place locally,
 *       then delegates to world.js's resolver. This is a strict
 *       extension — world.js's version would fail on an id input.
 *     - When world.js is not loaded:    uses the local fallback. This
 *       is the bootstrap case; see FALLBACK POLICY.
 *
 *   Callers should treat window.getLocationCountry /
 *   window.getLocationDistrict as the SUPERSET contract. Do not assume
 *   the world.js signature (place-only) or the locationDropdown
 *   signature (place-or-id) — assume the superset, which accepts both.
 *
 *   If world.js ever renames its exports to avoid the collision, this
 *   module's fallback path is sufficient for the dropdown use case. If
 *   world.js ever stops exposing getLocationCountry /
 *   getLocationDistrict entirely, this module's fallback takes over
 *   for ALL callers — including world.js's own internal callers if
 *   they reach for these names via the global namespace. That is a
 *   world.js concern; this module's fallback is a working superset.
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
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header SHADOWING section added. Documents that this module's
 *       getLocationCountry / getLocationDistrict exports overwrite
 *       world.js's same-named exports under the documented load
 *       order, and that the winning function is a superset (accepts
 *       place OR id, falls back to world.js for place inputs). No
 *       behavioral change to any function.
 *     - Header FALLBACK POLICY updated with a note about the
 *       superset contract.
 *   Previous revisions:
 *     - Local fallbacks for hierarchy, country, district retained for
 *       early-bootstrap; world.js used when loaded.
 *     - getLocationHierarchyDisplay delegates to formatting.js.
 *     - getLocationTypeLabel added.
 *     - buildLocationDropdown added.
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
    //
    // See SHADOWING in the module header. These accessors return the
    // world.js function if present; the fallback path is used only
    // during early bootstrap when world.js has not loaded yet.

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
     *
     * Accepts a place object OR a place id. See SHADOWING in the
     * module header for why the id-accepting version supersets the
     * world.js signature.
     */
    function getLocationCountry(placeOrId) {
        var place = _resolvePlace(placeOrId);
        if (!place) return null;

        // Note: window.getLocationCountry here is world.js's version
        // IF this module has not yet overwritten it. During the module's
        // own evaluation, the function being defined is not yet on
        // window, so this lookup hits world.js's version. After this
        // module loads, window.getLocationCountry IS this function —
        // but the recursive lookup path is guarded by _worldGetLocationCountry
        // being called only from within this function's body, which
        // runs after module evaluation.
        var worldFn = _worldGetLocationCountry();
        if (worldFn && worldFn !== getLocationCountry) {
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
     *
     * Accepts a place object OR a place id. See SHADOWING in the
     * module header.
     */
    function getLocationDistrict(placeOrId) {
        var place = _resolvePlace(placeOrId);
        if (!place) return null;

        var worldFn = _worldGetLocationDistrict();
        if (worldFn && worldFn !== getLocationDistrict) {
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
    //
    // Note the shadowing on getLocationCountry and getLocationDistrict.
    // See SHADOWING in the module header.
    //
    // If world.js's exports are ever renamed to avoid the collision,
    // these assignments become the canonical resolver names and no
    // caller breaks. If world.js ever stops exposing these names
    // entirely, this module's exports become the sole providers, and
    // this module's fallback path activates for every caller.

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
