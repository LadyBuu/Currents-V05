/**
 * =============================================================================
 * STILL WATERS - CULTURE VIEW MODELS
 * js/culture/culture-view-models.js
 * =============================================================================
 *
 * Presentation-ready projections of culture data.
 *
 * This module is the boundary between the domain and the renderer. The
 * renderer receives prepared objects and turns them into HTML. It does
 * not resolve locations, look up religions, inspect appearance structure,
 * interpret mythology, or decide fallback labels.
 *
 * Three kinds of "default" exist in this subsystem, and they live in
 * different layers:
 *
 *     Domain default       (CultureCommands + CultureConstants)
 *         "A newly created culture gets this appearance structure."
 *
 *     Normalization        (this module)
 *         "If displayName is absent, the label is name."
 *
 *     Presentation fallback (this module, optionally)
 *         "If icon is absent, render no icon (or a placeholder if the
 *          view model explicitly opts in)."
 *
 * Queries never invent data. Renderers never interpret missing data.
 * ViewModels decide how a missing value is presented — and only here.
 *
 * Dependencies:
 *   - CultureQueries           (all reads)
 *   - PlaceQueries             (location display names)
 *   - ReligionQueries          (religion display names)
 *   - CharacterQueries         (character counts for detail view)
 *
 * None of these is optional. If a dependency is missing, the view model
 * throws at call time. There is no "return [] and pretend the domain is
 * empty" behaviour.
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
    //
    // These are the *only* functions that decide how a missing domain value
    // is presented. Every other module asks the view model for a label, an
    // icon, or a summary string — never invents one itself.
    //

    /**
     * The human-readable label for a culture.
     *
     * Policy: displayName is authoritative if present; otherwise name.
     * An empty displayName is treated as absent.
     */
    function _labelFor(culture) {
        if (!culture) return '';
        if (typeof culture.displayName === 'string' && culture.displayName.length > 0) {
            return culture.displayName;
        }
        return culture.name || '';
    }

    /**
     * The icon to render for a culture.
     *
     * Policy: preserve whatever the culture declared. `null` means the
     * culture explicitly has no icon. Undefined means it was never set.
     * Either way, this module does not invent an icon.
     *
     * If the caller requests a placeholder, one is returned. Otherwise
     * null means null.
     */
    function _iconFor(culture, options) {
        if (!culture) return null;
        if (typeof culture.icon === 'string' && culture.icon.length > 0) {
            return culture.icon;
        }
        if (options && options.iconPlaceholder !== undefined) {
            return options.iconPlaceholder;
        }
        return null;
    }

    /**
     * The description string, or null when there is nothing to render.
     *
     * Empty string is preserved as empty string — it is a legal authored
     * value distinct from "no description at all".
     */
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

    /**
     * Resolves an array of location IDs to { id, label } pairs.
     * Missing locations are silently omitted — a broken association is
     * not a rendering concern for this projection.
     */
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

    /**
     * Resolves an array of religion IDs to { id, label } pairs.
     */
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

    /**
     * Produces a presentation-friendly mythology summary, or null when
     * there is nothing worth showing.
     *
     * The renderer receives plain { label, value } pairs and does not
     * need to know which fields mythology contains.
     */
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

    /**
     * Produces presentation-friendly appearance summary rows.
     *
     * The renderer receives [{ category, preview, remaining }] and does
     * not need to know that appearance categories are weighted option
     * lists or that `height` is an object.
     */
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
                // Format per-gender ranges as a short string.
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

            // Unknown shape: still expose it, but do not invent a preview.
            row.preview = '';
            row.remaining = 0;
            out.push(row);
        }

        return out;
    }

    // =========================================================================
    // 6. LIST ROW
    // =========================================================================
    //
    // Used by the culture list renderer. Contains everything the row needs
    // to draw itself, and nothing more.
    //

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
            label: _labelFor(culture),
            icon: _iconFor(culture, options),
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

    /**
     * Builds list rows for an array of cultures.
     */
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
    //
    // Used by anything that renders a single culture as a card (detail
    // side panels, embedded displays, search results).
    //

    function buildCard(culture) {
        return {
            id: culture.id,
            label: _labelFor(culture),
            icon: _iconFor(culture),
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
    //
    // The details view is the most information-dense projection. It is
    // built from CultureQueries.getCultureSummary so the query layer
    // remains the single source of truth for what "the culture's data"
    // means.
    //

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
            label: _labelFor(culture),
            icon: _iconFor(culture),
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
    //
    // For native <select> elements and similar controls. Icon and label
    // only — icons are not rendered inside native options; the caller can
    // decide to render them elsewhere if a custom control is used.
    //

    function buildDropdownOptions(cultures, options) {
        options = options || {};
        var selectedId = options.selectedId || null;

        var out = [];
        if (!Array.isArray(cultures)) return out;

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            out.push({
                id: c.id,
                label: _labelFor(c),
                icon: _iconFor(c),
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
