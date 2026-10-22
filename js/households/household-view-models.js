/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD VIEW MODELS (household-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-view-models.js
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
 *
 * DESIGN NOTES
 * ------------
 *   - Constants are frozen. Mutating them throws in strict mode.
 *   - Shaping functions are pure: inputs → output, no side effects.
 *   - Icons route through `_getIcon` — no emoji, no ASCII art.
 *   - Returned strings are *already escaped* by the caller. This module
 *     produces HTML-free values and objects. Escaping stays in the modals.
 *   - Where the caller already has a current value (e.g. current status),
 *     the helper accepts it as a parameter and returns an `options` string
 *     with the current value selected.
 *
 * CONSUMERS
 * ---------
 *   modals-household.js           — default wealth/reputation, status options,
 *                                   status badge, wealth color
 *   modals-household-economy.js   — net change color
 *   modals-household-staff.js     — DEFAULT_SKILL_LEVEL
 *   modals-residence.js           — vacancy reasons, demolition reasons,
 *                                   initial built year
 *   modals-residence-rental.js    — initial rent, rental end reasons
 *   modals-residence-staff.js     — DEFAULT_SKILL_LEVEL
 *   household-ui-list.js          — status badge, member badge
 *
 * LOAD ORDER
 * ----------
 *   household-constants.js
 *   household-rules.js
 *   household-view-models.js    ← this file
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
 * DEPENDENCIES
 * ------------
 *   - household-constants.js (optional — falls back to inline defaults)
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _constants() {
        return typeof window.HouseholdConstants !== 'undefined'
            ? window.HouseholdConstants
            : null;
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name) || '';
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    // =========================================================================
    // 2. FORM DEFAULTS
    // =========================================================================
    //
    // These are the values a modal pre-fills into an empty form field. They
    // are deliberately NOT the values a command applies when a field is
    // omitted — the command has its own (possibly stricter) defaults. These
    // are what the *user sees* when they open the modal.
    // =========================================================================

    /**
     * Default skill level when a role is granted via character profession.
     * Used by:
     *   - assignCharacterToPosition (when granting a missing role)
     *   - assignCharacterToStaffPosition (same, residence side)
     */
    var DEFAULT_SKILL_LEVEL = 10;

    /**
     * Default initial wealth for a newly created household.
     * User can override in the create-household modal.
     */
    var DEFAULT_INITIAL_WEALTH = 0;

    /**
     * Default initial reputation for a newly created household.
     * User can override in the create-household modal.
     */
    var DEFAULT_INITIAL_REPUTATION = 10;

    /**
     * Default initial rent for a newly rented residence.
     * User can override in the set-renter modal.
     */
    var DEFAULT_INITIAL_RENT = 50;

    /**
     * Default unit count for a multi-unit residence when none is specified.
     * Used by createResidence when `unitCount` is omitted. Kept here for
     * UI parity — the create-residence modal can show the same number.
     */
    var DEFAULT_UNIT_COUNT = 3;

    /**
     * Maximum units a newly created multi-unit residence can have.
     * Matches the residence-system default; exposed for form validation.
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
    // 3. OPTION LISTS (return HTML strings for <select>)
    // =========================================================================
    //
    // These produce a full <select> body with the current value selected.
    // The caller wraps it in a `<select data-field="...">` tag. Keeping the
    // option body here means every place that shows a status filter shows
    // the same statuses in the same order.

    /**
     * Household status options. Includes only the statuses a user should
     * be able to set manually. Diagnostic-only statuses (destroyed) are
     * excluded.
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
        // Append counts if provided
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
            { id: 'household_moved',        label: 'Household moved out' },
            { id: 'household_disassociated', label: 'Household disassociated' },
            { id: 'manual',                 label: 'Manual (admin)' },
            { id: 'sold',                   label: 'Sold' },
            { id: 'destroyed',              label: 'Destroyed' }
        ];
        return _buildOptions(reasons, current);
    }

    /**
     * Rental end reasons.
     */
    function getRentalEndReasonOptions(current) {
        var reasons = [
            { id: 'tenant_moved_out',   label: 'Tenant moved out' },
            { id: 'tenant_evicted',     label: 'Tenant evicted' },
            { id: 'lease_expired',      label: 'Lease expired' },
            { id: 'owner_occupying',    label: 'Owner taking possession' },
            { id: 'property_sold',      label: 'Property sold' },
            { id: 'mutual_agreement',   label: 'Mutual agreement' },
            { id: 'custom',             label: 'Custom reason' }
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

    // =========================================================================
    // 4. STATUS BADGES
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
     * `icon` is the icon key passed to `_getIcon`.
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
     * Short badge text for a household's living count. Used in the list row.
     * Returns `null` when no badge should be shown.
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
    // 5. COLOR HELPERS
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

    function getUnitOccupancyColor(status) {
        // status is {isVacant, isDemolished}
        if (!status) return 'var(--dim)';
        if (status.isDemolished) return '#8a2020';
        if (status.isVacant) return '#c87040';
        return '#4a9e6a';
    }

    // =========================================================================
    // 6. LABEL HELPERS
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
        if (unit.isDemolished) return 'Demolished';
        if (unit.isVacant) return 'Vacant';
        return 'Occupied';
    }

    function getResidenceStatusLabel(residence) {
        if (!residence) return 'Unknown';
        if (residence.isDemolished) return 'Demolished';
        if (residence.isVacant) return 'Vacant';
        return 'Occupied';
    }

    // =========================================================================
    // 7. EXPORTS
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
        version: 1,
        isPresentationOnly: true
    };

    window.HouseholdViewModels = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
