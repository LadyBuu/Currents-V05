/**
 * =============================================================================
 * STILL WATERS - CULTURE VIEW MODELS
 * js/culture/culture-view-models.js
 * =============================================================================
 *
 * Presentation-ready projections of culture data.
 *
 * Three kinds of "default" exist in this subsystem, and they live in
 * different layers:
 *
 *     Domain default       (CultureCommands + CultureConstants)
 *     Normalization        (this module)
 *     Presentation fallback (this module, optionally)
 *
 * Public single-value helpers (labelFor, iconFor) are exposed so that
 * other domains (Location, Character) can ask "what is this culture's
 * label?" without building a full view model or re-implementing the
 * displayName/name policy themselves.
 *
 * Dependencies:
 *   - CultureQueries
 *   - PlaceQueries
 *   - ReligionQueries
 *   - CharacterQueries
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REQUIREMENT
    // =========================================================================

    function _requireQueries() {
        if (!window.CultureQueries) {
            throw new Error('CultureViewModels requires CultureQueries.');
        }
        return window.CultureQueries;
    }

    function _requirePlaceQueries() {
        if (!window.PlaceQueries) {
            throw new Error('CultureViewModels requires PlaceQueries.');
        }
        return window.PlaceQueries;
    }

    function _requireReligionQueries() {
        if (!window.ReligionQueries) {
            throw new Error('CultureViewModels requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _requireCharacterQueries() {
        if (!window.CharacterQueries) {
            throw new Error('CultureViewModels requires CharacterQueries.');
        }
        return window.CharacterQueries;
    }

    // =========================================================================
    // 2. NORMALIZATION HELPERS
    // =========================================================================

    /**
     * The human-readable label for a culture.
     *
     * Policy: displayName is authoritative if non-empty; otherwise name.
     *
     * Public API. Other domains should call this rather than re-implement
     * the displayName/name fallback.
     */
    function labelFor(culture) {
        if (!culture) return '';
        if (typeof culture.displayName === 'string' && culture.displayName.length > 0) {
            return culture.displayName;
        }
        return culture.name || '';
    }

    /**
     * The icon to render for a culture.
     *
     * Policy: preserve whatever the culture declared. Null means explicitly
     * no icon. Undefined means never set. This function does not invent one.
     *
     * @param {Object} culture
     * @param {Object} [options]
     * @param {string} [options.iconPlaceholder] - If supplied, used when
     *        the culture has no icon. Callers should only pass this when
     *        a placeholder is genuinely wanted (e.g. an empty list marker).
     *        Omit it to preserve absence.
     */
    function iconFor(culture, options) {
        if (!culture) return null;
        if (typeof culture.icon === 'string' && culture.icon.length > 0) {
            return culture.icon;
        }
        if (options && options.iconPlaceholder !== undefined) {
            return options.iconPlaceholder;
        }
        return null;
    }

    function _descriptionFor(culture) {
        if (!culture) return null;
        if (typeof culture.description !== 'string') return null;
        return culture.description;
    }

    function _notesFor(culture) {
        if (!culture) return null;
        if (typeof culture.notes !== 'string' || culture.notes.length === 0) return null;
        return culture.notes;
    }

    // =========================================================================
    // 3. LOCATION / RELIGION LABELS
    // =========================================================================

    function _resolveLocations(locationIds) {
        if (!Array.isArray(locationIds) || locationIds.length === 0) return [];
        var placeQueries = _requirePlaceQueries();
        var out = [];
        for (var i = 0; i < locationIds.length; i++) {
            var place = placeQueries.getPlaceById(locationIds[i]);
            if (!place) continue;
            out.push({
                id: place.id,
                label: place.displayName || place.name || ''
            });
        }
        return out;
    }

    function _resolveReligions(religionIds) {
        if (!Array.isArray(religionIds) || religionIds.length === 0) return [];
        var religionQueries = _requireReligionQueries();
        var out = [];
        for (var i = 0; i < religionIds.length; i++) {
            var religion = religionQueries.getReligionById(religionIds[i]);
            if (!religion) continue;
            out.push({
                id: religion.id,
                label: religion.displayName || religion.name || ''
            });
        }
        return out;
    }

    // =========================================================================
    // 4. MYTHOLOGY SUMMARY
    // =========================================================================

    function _mythologySummaryFor(culture) {
        if (!culture || !culture.mythology) return null;
        var m = culture.mythology;

        var sections = [];

        if (typeof m.creation === 'string' && m.creation.length > 0) {
            sections.push({ label: 'Creation', value: m.creation });
        }
        if (typeof m.afterlife === 'string' && m.afterlife.length > 0) {
            sections.push({ label: 'Afterlife', value: m.afterlife });
        }
        if (typeof m.cosmology === 'string' && m.cosmology.length > 0) {
            sections.push({ label: 'Cosmology', value: m.cosmology });
        }
        if (Array.isArray(m.keyDeities) && m.keyDeities.length > 0) {
            sections.push({ label: 'Deities', values: m.keyDeities.slice() });
        }
        if (Array.isArray(m.keyEvents) && m.keyEvents.length > 0) {
            sections.push({ label: 'Key Events', values: m.keyEvents.slice() });
        }
        if (Array.isArray(m.symbols) && m.symbols.length > 0) {
            sections.push({ label: 'Symbols', values: m.symbols.slice() });
        }
        if (Array.isArray(m.themes) && m.themes.length > 0) {
            sections.push({ label: 'Themes', values: m.themes.slice() });
        }

        if (sections.length === 0) return null;
        return { sections: sections };
    }

    // =========================================================================
    // 5. APPEARANCE SUMMARY
    // =========================================================================

    function _appearanceSummaryFor(culture, options) {
        if (!culture || !culture.appearance) return [];
        options = options || {};
        var previewCount = typeof options.previewCount === 'number'
            ? options.previewCount
            : 5;

        var out = [];
        var appearance = culture.appearance;

        for (var key in appearance) {
            if (!Object.prototype.hasOwnProperty.call(appearance, key)) continue;
            var category = appearance[key];
            var row = { category: key };

            if (key === 'height' && category && typeof category === 'object') {
                var parts = [];
                for (var gender in category) {
                    if (!Object.prototype.hasOwnProperty.call(category, gender)) continue;
                    var range = category[gender];
                    if (range && typeof range.min === 'number' && typeof range.max === 'number') {
                        parts.push(gender + ': ' + range.min + '-' + range.max);
                    }
                }
                row.preview = parts.join(', ');
                row.remaining = 0;
                out.push(row);
                continue;
            }

            if (Array.isArray(category)) {
                var values = [];
                for (var i = 0; i < category.length && i < previewCount; i++) {
                    if (category[i] && typeof category[i].value === 'string') {
                        values.push(category[i].value);
                    }
                }
                row.preview = values.join(', ');
                row.remaining = Math.max(0, category.length - values.length);
                out.push(row);
                continue;
            }

            row.preview = '';
            row.remaining = 0;
            out.push(row);
        }

        return out;
    }

    // =========================================================================
    // 6. LIST ROW
    // =========================================================================

    function buildListRow(culture, options) {
        options = options || {};

        var locations = options.showLocations !== false
            ? _resolveLocations(culture.locations)
            : [];
        var religions = options.showReligions !== false
            ? _resolveReligions(culture.religions)
            : [];

        var mythologySummary = options.showMythology !== false
            ? _mythologySummaryFor(culture)
            : null;

        return {
            id: culture.id,
            label: labelFor(culture),
            icon: iconFor(culture, options),
            description: _descriptionFor(culture),
            locations: locations,
            religions: religions,
            hasMythology: mythologySummary !== null,
            associatedLocationCount: Array.isArray(culture.locations)
                ? culture.locations.length
                : 0,
            selected: !!options.selected
        };
    }

    function buildListRows(cultures, options) {
        options = options || {};
        var out = [];
        if (!Array.isArray(cultures)) return out;
        for (var i = 0; i < cultures.length; i++) {
            out.push(buildListRow(cultures[i], options));
        }
        return out;
    }

    // =========================================================================
    // 7. CARD
    // =========================================================================

    function buildCard(culture) {
        return {
            id: culture.id,
            label: labelFor(culture),
            icon: iconFor(culture),
            description: _descriptionFor(culture),
            locations: _resolveLocations(culture.locations),
            religions: _resolveReligions(culture.religions),
            appearance: _appearanceSummaryFor(culture),
            mythology: _mythologySummaryFor(culture),
            notes: _notesFor(culture),
            associatedLocationCount: Array.isArray(culture.locations)
                ? culture.locations.length
                : 0,
            religionCount: Array.isArray(culture.religions)
                ? culture.religions.length
                : 0
        };
    }

    // =========================================================================
    // 8. DETAILS
    // =========================================================================

    function buildDetails(cultureId) {
        var queries = _requireQueries();
        var summary = queries.getCultureSummary(cultureId);
        if (!summary) return null;

        var culture = summary;

        var characterCount = summary.characterCount || 0;
        var appearanceRows = _appearanceSummaryFor({
            appearance: culture.appearance
        });

        return {
            id: culture.id,
            label: labelFor(culture),
            icon: iconFor(culture),
            description: _descriptionFor(culture),
            notes: _notesFor(culture),

            statistics: {
                associatedLocationCount: Array.isArray(culture.locations)
                    ? culture.locations.length
                    : 0,
                religionCount: Array.isArray(culture.religions)
                    ? culture.religions.length
                    : 0,
                characterCount: characterCount,
                appearanceOptionCount: _countAppearanceOptions(culture.appearance)
            },

            locations: _resolveLocations(culture.locations),
            religions: _resolveReligions(culture.religions),
            appearance: appearanceRows,
            mythology: _mythologySummaryFor(culture)
        };
    }

    function _countAppearanceOptions(appearance) {
        if (!appearance || typeof appearance !== 'object') return 0;
        var total = 0;
        for (var key in appearance) {
            if (!Object.prototype.hasOwnProperty.call(appearance, key)) continue;
            if (Array.isArray(appearance[key])) total += appearance[key].length;
        }
        return total;
    }

    // =========================================================================
    // 9. DROPDOWN OPTIONS
    // =========================================================================

    function buildDropdownOptions(cultures, options) {
        options = options || {};
        var selectedId = options.selectedId || null;

        var out = [];
        if (!Array.isArray(cultures)) return out;

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            out.push({
                id: c.id,
                label: labelFor(c),
                icon: iconFor(c),
                selected: c.id === selectedId
            });
        }

        out.sort(function(a, b) {
            return a.label.localeCompare(b.label);
        });

        return out;
    }

    // =========================================================================
    // 10. PUBLIC API
    // =========================================================================

    window.CultureViewModels = {
        // Single-value helpers (public — safe for other domains to call)
        labelFor: labelFor,
        iconFor: iconFor,

        // Row projections
        buildListRow: buildListRow,
        buildListRows: buildListRows,

        // Single-culture projections
        buildCard: buildCard,
        buildDetails: buildDetails,

        // Control projections
        buildDropdownOptions: buildDropdownOptions
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureViewModels;
    }

})();
