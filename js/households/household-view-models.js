/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD VIEW MODELS (household-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-view-models.js
 *
 * PURPOSE
 * -------
 * Presentation defaults and form-shaping helpers for household / residence
 * UI. This module exists so UI files don't each carry their own copy of
 * "what number goes in the empty field" and "what order should statuses
 * appear in the dropdown".
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not DOM. No elements, no event handlers, no modal lifecycle.
 *   - Not queries. Semantic reads stay in household-queries.js.
 *   - Not rules. Policy stays in household-rules.js.
 *   - Not state. Nothing is persisted.
 *   - Not constants. Catalog values (ECONOMIC_TIERS, RESIDENCE_TYPES, ...)
 *     come from household-constants.js. This module wraps them for form
 *     use; it does not re-declare their values.
 *
 * DESIGN NOTES
 * ------------
 *   - Constants are frozen. Mutating them throws in strict mode.
 *   - Shaping functions are pure: inputs → output, no side effects.
 *   - Icons route through `window.Icons` — no emoji, no ASCII art.
 *   - Returned strings are already escaped where they come from data.
 *     This module produces HTML-safe values and objects. Escaping of
 *     user-supplied strings stays in the modals (via
 *     HouseholdModals.esc).
 *
 * SURFACE (grouped)
 * -----------------
 *   FORM DEFAULTS
 *     DEFAULT_SKILL_LEVEL, DEFAULT_INITIAL_WEALTH,
 *     DEFAULT_INITIAL_REPUTATION, DEFAULT_INITIAL_RENT,
 *     DEFAULT_UNIT_COUNT, DEFAULT_MAX_UNITS,
 *     resolveInitialBuiltYear(currentYear)
 *
 *   OPTION LISTS (return <option> inner HTML)
 *     getHouseholdStatusOptions(current)
 *     getHouseholdFilterStatusOptions(current, counts)
 *     getVacancyReasonOptions(current)
 *     getRentalEndReasonOptions(current)
 *     getDemolitionReasonOptions(current)
 *     getResidenceConditionOptions(current)
 *     getResidenceTypeOptions(current)
 *
 *   STATUS BADGES
 *     getStatusBadge(status)      -> { label, color, icon }
 *     getMemberBadge(status)      -> { text, color } | null
 *
 *   COLOR HELPERS
 *     getWealthColor(wealth)
 *     getDebtColor(debt)
 *     getNetChangeColor(netChange)
 *     getProfitColor(profit)
 *     getUnitOccupancyColor(status)
 *
 *   LABEL HELPERS
 *     getViewModeLabel(mode)
 *     getUnitStatusLabel(unit)
 *     getResidenceStatusLabel(residence)
 *
 * DEPENDENCIES
 * ------------
 *   - household-constants.js (OPTIONAL — falls back to inline defaults
 *     that match the current constants catalog exactly, so a missing
 *     constants module does not break rendering. New code should always
 *     prefer the constants module; the inline defaults exist so this
 *     file can be loaded and tested in isolation.)
 *
 * LOAD ORDER
 * ----------
 *   household-constants.js
 *   household-rules.js
 *   household-view-models.js    ← this file
 *   household-orchestration.js
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js
 *   household-ui-list.js
 *   modals-*.js
 *
 * ICON POLICY: No emojis. No icons. Icons are chosen by callers
 * (HouseholdModals / modal files) using icons.js.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS ACCESS
    // =========================================================================

    function _constants() {
        return typeof window.HouseholdConstants !== 'undefined'
            ? window.HouseholdConstants
            : null;
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

    // =========================================================================
    // 1. FORM DEFAULTS
    // =========================================================================
    //
    // These are the values a modal pre-fills into an empty form field. They
    // are deliberately NOT the values a command applies when a field is
    // omitted — the command has its own (possibly stricter) defaults. These
    // are what the *user sees* when they open the modal.

    /**
     * Default skill level when a role is granted via character profession
     * on assignment. Used by:
     *   - assignCharacterToPosition (when granting a missing role)
     *   - assignCharacterToStaffPosition (same, residence side)
     */
    var DEFAULT_SKILL_LEVEL = 10;

    /**
     * Default initial wealth for a newly created household.
     */
    var DEFAULT_INITIAL_WEALTH = 0;

    /**
     * Default initial reputation for a newly created household.
     */
    var DEFAULT_INITIAL_REPUTATION = 10;

    /**
     * Default initial rent for a newly rented residence.
     */
    var DEFAULT_INITIAL_RENT = 50;

    /**
     * Default unit count for a multi-unit residence when none is specified.
     */
    var DEFAULT_UNIT_COUNT = 3;

    /**
     * Maximum units a newly created multi-unit residence can have.
     */
    var DEFAULT_MAX_UNITS = 20;

    /**
     * Determine the default built year for a new residence.
     * Returns the current year, or null if the caller doesn't have one.
     */
    function resolveInitialBuiltYear(currentYear) {
        if (typeof currentYear === 'number' && isFinite(currentYear)) {
            return currentYear;
        }
        return null;
    }

    // =========================================================================
    // 2. OPTION LISTS (return HTML strings for <select>)
    // =========================================================================

    function _buildOptions(options, current) {
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            var selected = (current === o.id) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(o.id) + '"' + selected + '>' +
                _escapeHtml(o.label) + '</option>';
        }
        return html;
    }

    /**
     * Household status options. Includes only the statuses a user should
     * be able to set manually. Diagnostic-only statuses (destroyed,
     * bankrupt) are excluded from manual editing.
     */
    function getHouseholdStatusOptions(current) {
        var statuses = [
            { id: 'active',      label: 'Active' },
            { id: 'vacant',      label: 'Vacant' },
            { id: 'abandoned',   label: 'Abandoned' },
            { id: 'declining',   label: 'Declining' },
            { id: 'deprecated',  label: 'Deprecated' }
        ];
        return _buildOptions(statuses, current);
    }

    /**
     * Household list filter options — statuses a user can filter by in
     * the list panel. Includes the empty state and destroyed (for
     * historical review) but not 'unknown' (which is a corrupt-data
     * indicator, not a filter target).
     */
    function getHouseholdFilterStatusOptions(current, counts) {
        var c = counts || {};
        var statuses = [
            { id: 'active',      label: 'Active' },
            { id: 'vacant',      label: 'Vacant' },
            { id: 'empty',       label: 'Empty' },
            { id: 'declining',   label: 'Declining' },
            { id: 'deprecated',  label: 'Deprecated' }
        ];
        var withCounts = statuses.map(function(s) {
            return {
                id: s.id,
                label: s.label + (typeof c[s.id] === 'number'
                    ? ' (' + c[s.id] + ')'
                    : '')
            };
        });
        return _buildOptions(withCounts, current);
    }

    /**
     * Residence vacancy reasons (mark vacant, mark unit vacant).
     */
    function getVacancyReasonOptions(current) {
        var reasons = [
            { id: 'household_moved',         label: 'Household moved out' },
            { id: 'household_disassociated', label: 'Household disassociated' },
            { id: 'manual',                  label: 'Manual (admin)' },
            { id: 'sold',                    label: 'Sold' },
            { id: 'destroyed',               label: 'Destroyed' }
        ];
        return _buildOptions(reasons, current);
    }

    /**
     * Rental end reasons.
     */
    function getRentalEndReasonOptions(current) {
        var reasons = [
            { id: 'tenant_moved_out', label: 'Tenant moved out' },
            { id: 'tenant_evicted',   label: 'Tenant evicted' },
            { id: 'lease_expired',    label: 'Lease expired' },
            { id: 'owner_occupying',  label: 'Owner taking possession' },
            { id: 'property_sold',    label: 'Property sold' },
            { id: 'mutual_agreement', label: 'Mutual agreement' },
            { id: 'custom',           label: 'Custom reason' }
        ];
        return _buildOptions(reasons, current);
    }

    /**
     * Demolition reasons.
     */
    function getDemolitionReasonOptions(current) {
        var reasons = [
            { id: 'condemned',  label: 'Condemned / Unsafe' },
            { id: 'fire',       label: 'Destroyed by fire' },
            { id: 'war',        label: 'Destroyed in war' },
            { id: 'renovation', label: 'Renovation / Rebuilding' },
            { id: 'decay',      label: 'Decay / Abandonment' },
            { id: 'manual',     label: 'Manual decision' }
        ];
        return _buildOptions(reasons, current);
    }

    /**
     * Residence condition options for the rehabilitate modal.
     * Prefers household-constants.js; falls back to inline defaults that
     * match the current constants catalog exactly.
     */
    function getResidenceConditionOptions(current) {
        var c = _constants();
        var conditions = c && Array.isArray(c.RESIDENCE_CONDITIONS)
            ? c.RESIDENCE_CONDITIONS
            : [
                { id: 'pristine', name: 'Pristine' },
                { id: 'good',     name: 'Good' },
                { id: 'fair',     name: 'Fair' },
                { id: 'poor',     name: 'Poor' },
                { id: 'ruined',   name: 'Ruined' }
            ];
        var options = conditions.map(function(cond) {
            return { id: cond.id, label: cond.name };
        });
        return _buildOptions(options, current);
    }

    /**
     * Residence type options for the create/edit modal.
     */
    function getResidenceTypeOptions(current) {
        var c = _constants();
        var types = c && c.RESIDENCE_TYPES ? c.RESIDENCE_TYPES : {};
        var options = [];
        var keys = Object.keys(types);
        for (var i = 0; i < keys.length; i++) {
            var t = types[keys[i]];
            options.push({
                id: t.id,
                label: t.name + ' (' + (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')'
            });
        }
        return _buildOptions(options, current);
    }

    // =========================================================================
    // 3. STATUS BADGES
    // =========================================================================
    //
    // A badge is a small UI object describing how to render a status:
    // {label, color, icon}. Modals and the list use these to render.

    /**
     * Status badge for a household status id.
     * Returns {label, color, icon}.
     *
     * `color` is a CSS variable name (e.g. 'var(--success)') or a hex
     * string, chosen to match the CSS variables available in the app.
     * `icon` is the icon key passed to icons.js.
     */
    function getStatusBadge(status) {
        switch (status) {
            case 'active':
                return { label: 'Active', color: 'var(--success)', icon: 'CIRCLE_DOT' };
            case 'vacant':
                return { label: 'Vacant', color: 'var(--warn)', icon: 'CIRCLE_HALF_LEFT' };
            case 'empty':
                return { label: 'Empty', color: 'var(--dim)', icon: 'CIRCLE_OUTLINE' };
            case 'declining':
                return { label: 'Declining', color: 'var(--warn)', icon: 'CIRCLE_HALF_LEFT' };
            case 'deprecated':
                return { label: 'Deprecated', color: 'var(--dim)', icon: 'X_HEAVY' };
            case 'destroyed':
                return { label: 'Destroyed', color: 'var(--danger)', icon: 'X_HEAVY' };
            case 'bankrupt':
                return { label: 'Bankrupt', color: 'var(--danger)', icon: 'WARNING' };
            default:
                return { label: 'Unknown', color: 'var(--dim)', icon: 'CIRCLE_OUTLINE' };
        }
    }

    /**
     * Short badge text for a household's living count. Used in the list
     * row. Returns `null` when no badge should be shown.
     */
    function getMemberBadge(status) {
        if (!status) return null;
        if (status.status === 'active' && typeof status.livingCount === 'number') {
            return { text: status.livingCount + ' living', color: '#4a9e6a' };
        }
        if (status.status === 'vacant') {
            return { text: 'Vacant', color: '#c87040' };
        }
        if (status.status === 'empty') {
            return { text: 'Empty', color: '#9e9e9e' };
        }
        if (status.status === 'declining') {
            return { text: 'Declining', color: '#c87040' };
        }
        if (status.status === 'deprecated') {
            return { text: 'Deprecated', color: '#6a6a6a' };
        }
        if (status.status === 'destroyed') {
            return { text: 'Destroyed', color: '#8a2020' };
        }
        if (status.status === 'bankrupt') {
            return { text: 'Bankrupt', color: '#8a2020' };
        }
        return null;
    }

    // =========================================================================
    // 4. COLOR HELPERS
    // =========================================================================
    //
    // Modals repeatedly compute `x >= 0 ? 'var(--success)' : 'var(--danger)'`.
    // Centralized here so the thresholds and colors are consistent.

    function getWealthColor(wealth) {
        if (typeof wealth !== 'number' || !isFinite(wealth)) return 'var(--dim)';
        return wealth >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    function getDebtColor(debt) {
        if (typeof debt !== 'number' || !isFinite(debt)) return 'var(--dim)';
        return debt > 0 ? 'var(--warn)' : null;
    }

    function getNetChangeColor(netChange) {
        if (typeof netChange !== 'number' || !isFinite(netChange)) return 'var(--dim)';
        return netChange >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    function getProfitColor(profit) {
        if (typeof profit !== 'number' || !isFinite(profit)) return 'var(--dim)';
        return profit >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    /**
     * Occupancy color for a unit snapshot. `status` is `{isVacant,
     * isDemolished}` (any subset works — missing keys default to the
     * "occupied" case).
     */
    function getUnitOccupancyColor(status) {
        if (!status) return 'var(--dim)';
        if (status.isDemolished === true) return '#8a2020';
        if (status.isVacant === true) return '#c87040';
        return '#4a9e6a';
    }

    // =========================================================================
    // 5. LABEL HELPERS
    // =========================================================================
    //
    // Human-readable labels for enum-like values. These return plain text
    // (already escaped by the caller, or escaped here if it comes from data).

    function getViewModeLabel(mode) {
        switch (mode) {
            case 'all':       return 'All Members';
            case 'at_death':  return 'At Death';
            case 'at_join':   return 'At Join';
            default:          return mode || 'All Members';
        }
    }

    function getUnitStatusLabel(unit) {
        if (!unit) return 'Unknown';
        if (unit.isDemolished === true) return 'Demolished';
        if (unit.isVacant === true) return 'Vacant';
        return 'Occupied';
    }

    function getResidenceStatusLabel(residence) {
        if (!residence) return 'Unknown';
        if (residence.isDemolished === true) return 'Demolished';
        if (residence.isVacant === true) return 'Vacant';
        return 'Occupied';
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    var api = {
        // Form defaults
        DEFAULT_SKILL_LEVEL: DEFAULT_SKILL_LEVEL,
        DEFAULT_INITIAL_WEALTH: DEFAULT_INITIAL_WEALTH,
        DEFAULT_INITIAL_REPUTATION: DEFAULT_INITIAL_REPUTATION,
        DEFAULT_INITIAL_RENT: DEFAULT_INITIAL_RENT,
        DEFAULT_UNIT_COUNT: DEFAULT_UNIT_COUNT,
        DEFAULT_MAX_UNITS: DEFAULT_MAX_UNITS,
        resolveInitialBuiltYear: resolveInitialBuiltYear,

        // Option lists
        getHouseholdStatusOptions: getHouseholdStatusOptions,
        getHouseholdFilterStatusOptions: getHouseholdFilterStatusOptions,
        getVacancyReasonOptions: getVacancyReasonOptions,
        getRentalEndReasonOptions: getRentalEndReasonOptions,
        getDemolitionReasonOptions: getDemolitionReasonOptions,
        getResidenceConditionOptions: getResidenceConditionOptions,
        getResidenceTypeOptions: getResidenceTypeOptions,

        // Status badges
        getStatusBadge: getStatusBadge,
        getMemberBadge: getMemberBadge,

        // Colors
        getWealthColor: getWealthColor,
        getDebtColor: getDebtColor,
        getNetChangeColor: getNetChangeColor,
        getProfitColor: getProfitColor,
        getUnitOccupancyColor: getUnitOccupancyColor,

        // Labels
        getViewModeLabel: getViewModeLabel,
        getUnitStatusLabel: getUnitStatusLabel,
        getResidenceStatusLabel: getResidenceStatusLabel,

        // Diagnostics
        version: 2,
        isPresentationOnly: true
    };

    window.HouseholdViewModels = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
