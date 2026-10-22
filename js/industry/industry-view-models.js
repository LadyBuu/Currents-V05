/**
 * =============================================================================
 * STILL WATERS - INDUSTRY VIEW MODELS (industry-view-models.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-view-models.js
 *
 * Presentation preparation for enterprise UI.
 *
 * ARCHITECTURAL RULES:
 *   - No state access. No mutations. No persistence.
 *   - Consumes IndustryQueries + IndustryTypes only.
 *   - Returns plain objects suitable for rendering.
 *   - Presentation defaults (absent owner, empty list) live here.
 *   - Domain defaults (missing status) do NOT live here.
 *     If the domain value is missing, it is presented as absent.
 *
 * VIEWMODEL CONTRACT:
 *   Every ViewModel function returns plain data. Never HTML. Never DOM.
 *   The shape is stable; UI renderers depend on it.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-queries.js (IndustryQueries)
 *   - industry-types.js   (IndustryTypes)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryQueries === 'undefined') {
        throw new Error(
            'industry-view-models.js requires industry-queries.js to load first.'
        );
    }
    if (typeof window.IndustryTypes === 'undefined') {
        throw new Error(
            'industry-view-models.js requires industry-types.js to load first.'
        );
    }

    // =========================================================================
    // 2. PRESENTATION CONSTANTS
    // =========================================================================

    /**
     * The single character displayed when a value is absent.
     * Used everywhere. If you want a different absent glyph, change it here.
     */
    var ABSENT = '\u2014';

    var STATUS_LABELS = {
        active: 'Active',
        inactive: 'Inactive',
        bankrupt: 'Bankrupt',
        closed: 'Closed',
        demolished: 'Demolished'
    };

    var OWNER_TYPE_LABELS = {
        character: 'Character',
        household: 'Household',
        settlement: 'Settlement',
        state: 'State',
        none: 'None'
    };

    var OWNERSHIP_TYPE_LABELS = {
        public: 'Public',
        private: 'Private'
    };

    // =========================================================================
    // 3. PRIMITIVE PRESENTATION HELPERS
    // =========================================================================

    function _labelFromMap(value, map) {
        if (value === undefined || value === null) return ABSENT;
        return map[value] || String(value);
    }

    function _valueOrAbsent(value) {
        if (value === undefined || value === null) return ABSENT;
        if (typeof value === 'string' && value === '') return ABSENT;
        return value;
    }

    function _stringOrAbsent(value) {
        var v = _valueOrAbsent(value);
        return v === ABSENT ? ABSENT : String(v);
    }

    function _formatSignedInt(n) {
        if (typeof n !== 'number' || !isFinite(n)) return ABSENT;
        return (n >= 0 ? '+' : '') + n;
    }

    function _formatInt(n) {
        if (typeof n !== 'number' || !isFinite(n)) return ABSENT;
        return String(n);
    }

    function _statusClass(status) {
        if (!status) return 'status-unknown';
        return 'status-' + status;
    }

    function _profitClass(profit) {
        if (typeof profit !== 'number' || !isFinite(profit)) return '';
        return profit >= 0 ? 'value-pos' : 'value-neg';
    }

    function _wealthClass(wealth) {
        if (typeof wealth !== 'number' || !isFinite(wealth)) return '';
        return wealth >= 0 ? 'value-pos' : 'value-neg';
    }

    // =========================================================================
    // 4. LIST ROW VIEW MODEL
    // =========================================================================

    /**
     * Builds a single list row.
     *
     * @param {Object} summary — from IndustryQueries.getEnterpriseSummary
     * @returns {Object|null}
     */
    function buildListRow(summary) {
        if (!summary) return null;

        var ownerText = summary.ownerName
            ? summary.ownerName
            : (summary.ownerType && summary.ownerType !== 'none'
                ? _labelFromMap(summary.ownerType, OWNER_TYPE_LABELS)
                : null);

        return {
            id: summary.id,
            name: summary.name,
            type: summary.type,
            ownerLabel: ownerText ? ownerText : ABSENT,
            statusLabel: _labelFromMap(summary.status, STATUS_LABELS),
            statusClass: _statusClass(summary.status),
            profitLabel: _formatSignedInt(summary.annualProfit),
            profitClass: _profitClass(summary.annualProfit),
            wealthLabel: _formatInt(summary.wealth),
            debtLabel: _formatInt(summary.debt),
            workersLabel: summary.workerCount + ' / ' + summary.maxWorkers,
            ownershipLabel: _labelFromMap(
                summary.ownershipType, OWNERSHIP_TYPE_LABELS
            ),
            isPublic: summary.ownershipType === 'public'
        };
    }

    function buildListRows(summaries) {
        var rows = [];
        for (var i = 0; i < summaries.length; i++) {
            var row = buildListRow(summaries[i]);
            if (row) rows.push(row);
        }
        return rows;
    }

    // =========================================================================
    // 5. CARD VIEW MODEL
    // =========================================================================

    function buildCard(summary) {
        if (!summary) return null;

        return {
            id: summary.id,
            name: summary.name,
            type: summary.type,
            category: summary.category,

            statusLabel: _labelFromMap(summary.status, STATUS_LABELS),
            statusClass: _statusClass(summary.status),

            ownerLabel: _stringOrAbsent(summary.ownerName),
            ownerTypeLabel: _labelFromMap(summary.ownerType, OWNER_TYPE_LABELS),
            locationLabel: _stringOrAbsent(summary.locationName),

            wealthLabel: _formatInt(summary.wealth),
            wealthClass: _wealthClass(summary.wealth),
            debtLabel: _formatInt(summary.debt),
            workersLabel: summary.workerCount + ' / ' + summary.maxWorkers,
            profitLabel: _formatSignedInt(summary.annualProfit),
            profitClass: _profitClass(summary.annualProfit),

            ownershipLabel: _labelFromMap(
                summary.ownershipType, OWNERSHIP_TYPE_LABELS
            ),
            isPublic: summary.ownershipType === 'public',

            foundedYearLabel: _formatInt(summary.foundedYear),
            notesLabel: _stringOrAbsent(summary.notes)
        };
    }

    // =========================================================================
    // 6. TABLE VIEW MODEL
    // =========================================================================

    /**
     * Builds a table row. Columns requested via options.columns.
     *
     * @param {Object} summary
     * @param {Array}  columns — array of column names
     * @returns {Object|null} { id, cells: { name: { text, className? }, ... } }
     */
    function buildTableRow(summary, columns) {
        if (!summary) return null;

        var cells = {};
        for (var i = 0; i < columns.length; i++) {
            cells[columns[i]] = _buildTableCell(summary, columns[i]);
        }
        return { id: summary.id, cells: cells };
    }

    function _buildTableCell(summary, column) {
        switch (column) {
            case 'name':
                return { text: summary.name };
            case 'type':
                return { text: summary.type };
            case 'owner':
                return { text: _stringOrAbsent(summary.ownerName) };
            case 'workers':
                return { text: summary.workerCount + ' / ' + summary.maxWorkers };
            case 'wealth':
                return {
                    text: _formatInt(summary.wealth),
                    className: _wealthClass(summary.wealth)
                };
            case 'debt':
                return { text: _formatInt(summary.debt) };
            case 'profit':
                return {
                    text: _formatSignedInt(summary.annualProfit),
                    className: _profitClass(summary.annualProfit)
                };
            case 'status':
                return {
                    text: _labelFromMap(summary.status, STATUS_LABELS),
                    className: _statusClass(summary.status)
                };
            default:
                throw new Error(
                    'IndustryViewModels: unknown column "' + column + '"'
                );
        }
    }

    // =========================================================================
    // 7. DETAILS VIEW MODEL
    // =========================================================================

    /**
     * Builds the details modal view model.
     *
     * @param {Object} summary        — from IndustryQueries.getEnterpriseSummary
     * @param {Object} enterprise     — from IndustryQueries.getEnterprise
     *                                  (for worker data — workerWages, wages)
     * @param {Array}  workers        — array of { id, name, wage } resolved
     *                                  by caller (IndustryQueries.getEnterpriseWorkers)
     * @returns {Object|null}
     */
    function buildDetails(summary, enterprise, workers) {
        if (!summary || !enterprise) return null;

        var workerRows = [];
        var sourceWorkers = workers || [];
        for (var i = 0; i < sourceWorkers.length; i++) {
            var w = sourceWorkers[i];
            workerRows.push({
                id: w.id,
                name: w.name,
                wageLabel: _formatInt(w.wage)
            });
        }

        return {
            id: summary.id,
            name: summary.name,
            typeLabel: summary.type,
            categoryLabel: summary.category,

            statusLabel: _labelFromMap(summary.status, STATUS_LABELS),
            statusClass: _statusClass(summary.status),

            ownerLabel: _stringOrAbsent(summary.ownerName),
            ownerTypeLabel: _labelFromMap(summary.ownerType, OWNER_TYPE_LABELS),
            locationLabel: _stringOrAbsent(summary.locationName),

            wealthLabel: _formatInt(summary.wealth),
            wealthClass: _wealthClass(summary.wealth),
            debtLabel: _formatInt(summary.debt),
            profitLabel: _formatSignedInt(summary.annualProfit),
            profitClass: _profitClass(summary.annualProfit),

            ownershipLabel: _labelFromMap(
                summary.ownershipType, OWNERSHIP_TYPE_LABELS
            ),
            isPublic: summary.ownershipType === 'public',

            foundedYearLabel: _formatInt(summary.foundedYear),

            workersLabel: summary.workerCount + ' / ' + summary.maxWorkers,
            workers: workerRows,
            hasWorkers: workerRows.length > 0,
            noWorkersMessage: 'No workers'
        };
    }

    // =========================================================================
    // 8. WORKER MANAGEMENT VIEW MODEL
    // =========================================================================

    /**
     * Builds the worker management modal view model.
     *
     * @param {Object} summary
     * @param {Object} enterprise
     * @param {Array}  workers — [{ id, name, wage }]
     * @returns {Object|null}
     */
    function buildWorkerManagement(summary, enterprise, workers) {
        if (!summary || !enterprise) return null;

        var workerRows = [];
        var sourceWorkers = workers || [];
        for (var i = 0; i < sourceWorkers.length; i++) {
            var w = sourceWorkers[i];
            workerRows.push({
                id: w.id,
                name: w.name,
                wageValue: w.wage,
                wageLabel: _formatInt(w.wage)
            });
        }

        var baseWage = enterprise.wages !== undefined ? enterprise.wages : null;

        return {
            enterpriseId: summary.id,
            enterpriseName: summary.name,
            workersLabel: summary.workerCount + ' / ' + summary.maxWorkers,
            hasWorkers: workerRows.length > 0,
            noWorkersMessage: 'No workers assigned',
            workers: workerRows,
            baseWageValue: baseWage,
            baseWageLabel: baseWage === null ? ABSENT : _formatInt(baseWage)
        };
    }

    // =========================================================================
    // 9. FORM HELPERS
    // =========================================================================

    /**
     * Builds the owner selector state for the create/edit modal.
     */
    function buildOwnerField(ownerType, ownerId, ownerName) {
        var resolvedType = (ownerType === undefined || ownerType === null)
            ? 'none'
            : ownerType;
        return {
            type: resolvedType,
            id: ownerId || null,
            displayName: _stringOrAbsent(ownerName),
            requiresSelection:
                resolvedType === 'character' || resolvedType === 'household'
        };
    }

    /**
     * Builds a single type option entry for a select element.
     */
    function buildTypeOption(type) {
        return {
            value: type.id,
            label: type.name + ' (' + type.category + ')',
            category: type.category,
            isDefault: false
        };
    }

    /**
     * Builds an array of type option entries for a select element.
     *
     * This is the entry point modals-industry.js expects — the modal calls
     * viewModels.buildTypeOptions(allTypes) to populate the type select.
     * The singular buildTypeOption remains for callers that build the
     * option list themselves one at a time.
     *
     * @param {Array} types — array of enterprise type records
     * @returns {Array}
     */
    function buildTypeOptions(types) {
        var options = [];
        if (!Array.isArray(types)) return options;
        for (var i = 0; i < types.length; i++) {
            options.push(buildTypeOption(types[i]));
        }
        return options;
    }

    /**
     * Builds category options for the type filter select.
     */
    function buildCategoryOptions(categories) {
        var keys = Object.keys(categories).sort();
        var options = [{ value: '', label: 'All Categories' }];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            options.push({
                value: key,
                label: key.charAt(0).toUpperCase() + key.slice(1)
            });
        }
        return options;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.IndustryViewModels = Object.freeze({
        // Presentation constants (exported so UI can rely on the same glyph)
        ABSENT: ABSENT,

        // List / card / table
        buildListRow: buildListRow,
        buildListRows: buildListRows,
        buildCard: buildCard,
        buildTableRow: buildTableRow,

        // Modal-specific
        buildDetails: buildDetails,
        buildWorkerManagement: buildWorkerManagement,

        // Form helpers
        buildOwnerField: buildOwnerField,
        buildTypeOption: buildTypeOption,
        buildTypeOptions: buildTypeOptions,
        buildCategoryOptions: buildCategoryOptions
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryViewModels;
    }
})();
