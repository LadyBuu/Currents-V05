// js/tabs/government-civil-laws-tab.js
/**
 * =============================================================================
 * GOVERNMENT CIVIL LAWS TAB
 * =============================================================================
 *
 * LOCATION: js/tabs/government-civil-laws-tab.js
 *
 * PURPOSE:
 *   Render the settlement's civil laws, and manage them through the
 *   canonical SettlementLawCommands.
 *
 * ARCHITECTURE:
 *   This tab is a THIN SHELL. It does not define its own enums, does not
 *   write settlement data directly, and does not reimplement any law
 *   validation.
 *
 *   - Reads      → SettlementLawQueries  (getCivilLaws, getCivilLawStatistics)
 *   - Enums      → SettlementLawDefinitions (LAW_TYPES, LAW_DOMAINS, LAW_SEVERITIES)
 *   - Validation → SettlementLawRules     (called indirectly by the command)
 *   - Writes     → SettlementLawCommands  (addCivilLaw, updateCivilLaw, removeCivilLaw)
 *
 *   The tab does not call saveMasterData. The command's commit tail does.
 *   The tab does not call SettlementState._updateSettlementData. That method
 *   does not exist on the canonical State surface.
 *
 * LAW SCHEMA (canonical, from SettlementLawRules.validateNewLaw):
 *   {
 *     name          string   required, trimmed, non-empty
 *     description   string   optional
 *     type          string   required, id from LAW_TYPES
 *     domain        string   required, id from LAW_DOMAINS
 *     severity      string   required, id from LAW_SEVERITIES
 *     crimeMapping  {
 *       crimeType   string|null
 *       punishment  string|null
 *       isEnforced  boolean
 *       notes       string
 *     }
 *     notes         string   optional
 *     createdYear   number   set by the command
 *     updatedYear   number   set by the command
 *     id            string   set by the command
 *   }
 *
 *   The tab does NOT expose `category`, `jurisdiction`, `punishmentType`,
 *   `punishmentAmount`, `exceptions`, `isActive`, `enactedYear`,
 *   `amendedYear`. Those fields are not part of the canonical schema. The
 *   old form fields for them are gone; the old render paths for them are
 *   gone.
 *
 * SEVERITY COLOR:
 *   Severity colors come from SettlementLawDefinitions.LAW_SEVERITIES[i].color.
 *   The tab renders the color as a data attribute; CSS uses it. No
 *   hardcoded color literals. No local severity-to-color map.
 *
 * MISSING DATA:
 *   - No settlement record  → whole tab renders an empty state; Add is
 *                             still allowed? No — no settlement means no
 *                             locationId context. The tab does not offer
 *                             Add when there is no settlement record.
 *   - Settlement, no laws   → "No laws yet" empty state with Add button
 *   - Statistics null       → stats strip renders zeros
 *
 * LOAD ORDER (must be satisfied when this file loads):
 *   - settlement-law-queries.js
 *   - settlement-law-commands.js
 *   - settlement-law-definitions.js
 *   - settlement-queries.js    (hasSettlement check)
 *   - location-queries.js      (getPlaceSummary)
 *   - modals-core.js           (openModal, closeTopModal, confirmDialog)
 *   - ui.js                    (showToast)
 *   - formatting.js            (escapeHtml)
 *   - icons.js                 (Icons)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.SettlementLawQueries) {
        throw new Error(
            'government-civil-laws-tab.js: settlement-law-queries.js must load first.'
        );
    }
    if (!window.SettlementLawCommands) {
        throw new Error(
            'government-civil-laws-tab.js: settlement-law-commands.js must load first.'
        );
    }
    if (!window.SettlementLawDefinitions) {
        throw new Error(
            'government-civil-laws-tab.js: settlement-law-definitions.js must load first.'
        );
    }
    if (!window.SettlementQueries) {
        throw new Error(
            'government-civil-laws-tab.js: settlement-queries.js must load first.'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'government-civil-laws-tab.js: location-queries.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: modals-core.js (openModal) must load first.'
        );
    }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    var SLQ = window.SettlementLawQueries;
    var SLC = window.SettlementLawCommands;
    var SLD = window.SettlementLawDefinitions;
    var SQ = window.SettlementQueries;
    var LQ = window.LocationQueries;

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && typeof window.Icons[name] === 'string'
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _getIcon(name);
        return i
            ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>'
            : '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(message, type || 'info');
        }
    }

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else {
            _toast('confirmDialog unavailable', 'error');
        }
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _openModal(opts) {
        return window.openModal(opts);
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        return LQ.getPlaceSummary(locationId);
    }

    // =========================================================================
    // 3. DEFINITION LOOKUPS
    // =========================================================================
    //
    // Every enum value the tab renders comes from SettlementLawDefinitions.
    // These helpers resolve an id to its definition object, and return
    // null for an unknown id (which renders as the raw id, so a bad
    // record is visible but does not crash).

    function _findDefinition(list, id) {
        if (!id) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
        return null;
    }

    function _lawTypeDef(typeId) {
        return _findDefinition(SLD.LAW_TYPES, typeId);
    }

    function _lawDomainDef(domainId) {
        return _findDefinition(SLD.LAW_DOMAINS, domainId);
    }

    function _lawSeverityDef(severityId) {
        return _findDefinition(SLD.LAW_SEVERITIES, severityId);
    }

    function _lawTypeName(typeId) {
        var def = _lawTypeDef(typeId);
        return def ? def.name : (typeId || '');
    }

    function _lawDomainName(domainId) {
        var def = _lawDomainDef(domainId);
        return def ? def.name : (domainId || '');
    }

    function _lawSeverityName(severityId) {
        var def = _lawSeverityDef(severityId);
        return def ? def.name : (severityId || '');
    }

    function _lawSeverityColor(severityId) {
        var def = _lawSeverityDef(severityId);
        return def ? def.color : 'var(--tmut)';
    }

    // =========================================================================
    // 4. DATA LOADERS
    // =========================================================================

    /**
     * Returns the law array for a location. Returns null when no
     * settlement record exists. Returns [] when the settlement exists
     * but has no laws. The two are distinguished for the empty-state
     * copy.
     */
    function _loadLaws(locationId) {
        if (!locationId) return null;
        return SLQ.getCivilLaws(locationId);
    }

    /**
     * Returns the civil-law statistics for a location, or null when no
     * settlement record exists.
     */
    function _loadStats(locationId) {
        if (!locationId) return null;
        return SLQ.getCivilLawStatistics(locationId);
    }

    // =========================================================================
    // 5. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place, canAdd) {
        var name = place ? (place.displayName || place.name || '') : '';
        var addIcon = _iconSpan('PLUS');
        var refreshIcon = _iconSpan('REFRESH');

        var addBtn = canAdd
            ? '<button type="button" class="law-btn law-btn-add" data-action="add-law">' +
                addIcon + ' Add Law' +
              '</button>'
            : '';

        return (
            '<div class="law-tab-header">' +
                '<h3>Civil Laws - ' + _escapeHtml(name) + '</h3>' +
                '<div class="law-tab-actions">' +
                    addBtn +
                    '<button type="button" class="law-btn" data-action="refresh-laws">' +
                        refreshIcon + ' Refresh' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildStats(stats) {
        var total = stats ? stats.totalLaws : 0;
        var enforced = stats ? stats.enforced : 0;
        var notEnforced = stats ? stats.notEnforced : 0;

        return (
            '<div class="law-stats-summary">' +
                '<div class="law-stat">' +
                    '<span class="law-stat-label">Total Laws</span>' +
                    '<span class="law-stat-value">' + total + '</span>' +
                '</div>' +
                '<div class="law-stat">' +
                    '<span class="law-stat-label">Enforced</span>' +
                    '<span class="law-stat-value is-active">' + enforced + '</span>' +
                '</div>' +
                '<div class="law-stat">' +
                    '<span class="law-stat-label">Not Enforced</span>' +
                    '<span class="law-stat-value is-inactive">' + notEnforced + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    /**
     * Renders a single law item.
     *
     * Reads only canonical fields: name, description, type, domain,
     * severity, crimeMapping, notes, createdYear, updatedYear.
     *
     * The status pill uses crimeMapping.isEnforced (a boolean field of
     * the crime mapping), not a fabricated top-level isActive field.
     * A law with no crime mapping renders as "Not enforced".
     */
    function _renderLawItem(law) {
        if (!law || !law.id) return '';

        var typeDef = _lawTypeDef(law.type);
        var domainDef = _lawDomainDef(law.domain);
        var severityDef = _lawSeverityDef(law.severity);
        var severityColor = _lawSeverityColor(law.severity);

        var crime = law.crimeMapping || {};
        var isEnforced = crime.isEnforced === true;
        var statusLabel = isEnforced ? 'Enforced' : 'Not enforced';
        var statusClass = isEnforced ? 'is-active' : 'is-inactive';

        var typeIcon = typeDef && typeDef.icon ? _escapeHtml(typeDef.icon) : '';
        var typeName = typeDef ? typeDef.name : (law.type || '');
        var domainName = domainDef ? domainDef.name : (law.domain || '');
        var severityName = severityDef ? severityDef.name : (law.severity || '');

        var editIcon = _getIcon('EDIT');
        var deleteIcon = _getIcon('X_HEAVY');

        var html = '<div class="law-item" data-law-id="' + _escapeHtml(law.id) + '">';

        // Header
        html += '<div class="law-header">';
        html += '<div class="law-title">';
        html += '<span class="law-name">' + _escapeHtml(law.name || '') + '</span>';
        html += '<span class="law-status ' + statusClass + '">&#9679; ' +
            _escapeHtml(statusLabel) + '</span>';
        html += '</div>';
        html += '<div class="law-actions">';
        html += '<button type="button" class="law-btn law-btn-edit" ' +
            'data-action="edit-law" data-law-id="' + _escapeHtml(law.id) + '">' +
            editIcon + '</button>';
        html += '<button type="button" class="law-btn law-btn-delete" ' +
            'data-action="delete-law" data-law-id="' + _escapeHtml(law.id) + '">' +
            deleteIcon + '</button>';
        html += '</div>';
        html += '</div>';

        // Body
        html += '<div class="law-details">';

        // Meta row: type, domain, severity
        html += '<div class="law-meta">';
        if (typeName) {
            html += '<span class="law-category">' +
                (typeIcon ? typeIcon + ' ' : '') +
                _escapeHtml(typeName) + '</span>';
        }
        if (domainName) {
            html += '<span class="law-domain">' +
                _escapeHtml(domainName) + '</span>';
        }
        if (severityName) {
            html += '<span class="law-severity" ' +
                'style="color: ' + _escapeHtml(severityColor) + ';">' +
                _escapeHtml(severityName) + '</span>';
        }
        html += '</div>';

        // Description
        if (law.description) {
            html += '<div class="law-description">' +
                _escapeHtml(law.description) + '</div>';
        }

        // Punishment (from crimeMapping)
        if (crime.punishment) {
            html += '<div class="law-punishment">';
            html += '<span class="law-punishment-label">Punishment:</span> ';
            html += '<span class="law-punishment-desc">' +
                _escapeHtml(crime.punishment) + '</span>';
            html += '</div>';
        }

        // Crime type (from crimeMapping)
        if (crime.crimeType) {
            html += '<div class="law-crime-type">';
            html += '<span class="law-crime-label">Crime type:</span> ';
            html += '<span class="law-crime-value">' +
                _escapeHtml(crime.crimeType) + '</span>';
            html += '</div>';
        }

        // Crime notes (from crimeMapping)
        if (crime.notes) {
            html += '<div class="law-notes">' +
                _escapeHtml(crime.notes) + '</div>';
        }

        // General notes
        if (law.notes) {
            html += '<div class="law-notes">' +
                _escapeHtml(law.notes) + '</div>';
        }

        // Timestamps
        html += '<div class="law-meta-info">';
        if (typeof law.createdYear === 'number') {
            html += '<span>Enacted: ' + law.createdYear + '</span>';
        }
        if (typeof law.updatedYear === 'number' && law.updatedYear !== law.createdYear) {
            html += ' <span>Amended: ' + law.updatedYear + '</span>';
        }
        html += '</div>';

        html += '</div>'; // .law-details
        html += '</div>'; // .law-item

        return html;
    }

    function _buildLawList(laws) {
        if (!Array.isArray(laws) || laws.length === 0) {
            return (
                '<div class="law-empty">' +
                    '<p>No civil laws established for this location.</p>' +
                    '<button type="button" class="law-btn law-btn-add" data-action="add-law">' +
                        _iconSpan('PLUS') + ' Create First Law' +
                    '</button>' +
                '</div>'
            );
        }

        // Enforced laws first, then by name.
        var enforced = [];
        var notEnforced = [];
        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (!law || !law.id) continue;
            var isEnf = law.crimeMapping && law.crimeMapping.isEnforced === true;
            (isEnf ? enforced : notEnforced).push(law);
        }

        enforced.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        notEnforced.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var html = '';

        if (enforced.length > 0) {
            html += '<div class="law-section">';
            html += '<div class="law-section-header">Enforced Laws (' +
                enforced.length + ')</div>';
            html += '<div class="law-list">';
            for (var e = 0; e < enforced.length; e++) {
                html += _renderLawItem(enforced[e]);
            }
            html += '</div>';
            html += '</div>';
        }

        if (notEnforced.length > 0) {
            html += '<div class="law-section">';
            html += '<div class="law-section-header">Not Enforced (' +
                notEnforced.length + ')</div>';
            html += '<div class="law-list">';
            for (var n = 0; n < notEnforced.length; n++) {
                html += _renderLawItem(notEnforced[n]);
            }
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    function _buildEmptyState(message) {
        return (
            '<div class="law-empty">' +
                '<p>' + _escapeHtml(message) + '</p>' +
            '</div>'
        );
    }

    function _buildShell(place, laws, stats) {
        if (!place) {
            return '<div class="law-tab-container">' +
                _buildEmptyState('Select a location to view civil laws.') +
                '</div>';
        }

        // laws === null means no settlement record exists.
        var hasSettlement = laws !== null;
        var lawArray = hasSettlement ? (laws || []) : [];

        var canAdd = hasSettlement;

        var html = '<div class="law-tab-container" ' +
            'data-location-id="' + _escapeHtml(place.id || '') + '">';

        html += _buildHeader(place, canAdd);

        if (!hasSettlement) {
            html += _buildEmptyState(
                'No settlement record exists for this location. ' +
                'Civil laws cannot be viewed or added here.'
            );
            html += '</div>';
            return html;
        }

        html += _buildStats(stats);
        html += _buildLawList(lawArray);

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    function renderLawsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('Civil laws tab container not found:', containerId);
            }
            return;
        }

        var place = locationId ? _placeSummary(locationId) : null;
        var laws = locationId ? _loadLaws(locationId) : null;
        var stats = locationId ? _loadStats(locationId) : null;

        container.innerHTML = _buildShell(place, laws, stats);
        container.dataset.locationId = locationId || '';

        _bindActions(container, containerId, locationId);
    }

    // =========================================================================
    // 7. ACTION BINDING
    // =========================================================================

    function _bindActions(container, containerId, locationId) {
        if (container._govLawsBound) return;
        container._govLawsBound = true;

        function refresh() {
            try {
                renderLawsTab(containerId, locationId);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-civil-laws-tab: refresh failed', err);
                }
                _toast('Laws refresh failed; see console.', 'error');
            }
        }

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target) return;
            if (!container.contains(target)) return;

            var action = target.getAttribute('data-action');

            if (action === 'add-law') {
                event.preventDefault();
                _openAddLawModal(locationId, refresh);
                return;
            }

            if (action === 'refresh-laws') {
                event.preventDefault();
                refresh();
                _toast('Laws refreshed', 'info');
                return;
            }

            if (action === 'edit-law') {
                event.preventDefault();
                var editId = target.getAttribute('data-law-id');
                if (!editId) return;
                _openEditLawModal(locationId, editId, refresh);
                return;
            }

            if (action === 'delete-law') {
                event.preventDefault();
                var delId = target.getAttribute('data-law-id');
                if (!delId) return;
                var law = SLQ.getCivilLaw(locationId, delId);
                if (!law) {
                    _toast('Law not found', 'error');
                    return;
                }
                _confirm(
                    'Delete the law "' + (law.name || '') + '"? ' +
                    'This cannot be undone.',
                    'Delete Law',
                    function () {
                        var outcome = _deleteLaw(locationId, delId);
                        if (outcome.success) {
                            _toast('Law deleted', 'info');
                            refresh();
                        } else {
                            _toast('Delete failed: ' + outcome.reason, 'error');
                        }
                    }
                );
                return;
            }
        });
    }

    // =========================================================================
    // 8. FORM BUILDER (shared between add and edit)
    // =========================================================================

    function _buildLawFormContent(existingLaw) {
        var law = existingLaw || {};
        var crime = law.crimeMapping || {};

        // Type options
        var typeOptions = '';
        for (var t = 0; t < SLD.LAW_TYPES.length; t++) {
            var type = SLD.LAW_TYPES[t];
            var typeSelected = type.id === (law.type || 'law') ? ' selected' : '';
            typeOptions += '<option value="' + _escapeHtml(type.id) + '"' +
                typeSelected + '>' + _escapeHtml(type.name) + '</option>';
        }

        // Domain options
        var domainOptions = '';
        for (var d = 0; d < SLD.LAW_DOMAINS.length; d++) {
            var domain = SLD.LAW_DOMAINS[d];
            var domainSelected = domain.id === (law.domain || 'social') ? ' selected' : '';
            domainOptions += '<option value="' + _escapeHtml(domain.id) + '"' +
                domainSelected + '>' + _escapeHtml(domain.name) + '</option>';
        }

        // Severity options
        var severityOptions = '';
        for (var s = 0; s < SLD.LAW_SEVERITIES.length; s++) {
            var severity = SLD.LAW_SEVERITIES[s];
            var severitySelected = severity.id === (law.severity || 'minor') ? ' selected' : '';
            severityOptions += '<option value="' + _escapeHtml(severity.id) + '"' +
                severitySelected + '>' + _escapeHtml(severity.name) + '</option>';
        }

        var html = '<div class="law-edit-form">';

        // Name
        html += '<div class="form-group">' +
            '<label for="law-name-input">Law Name *</label>' +
            '<input type="text" id="law-name-input" class="form-control" ' +
                'value="' + _escapeHtml(law.name || '') + '" ' +
                'placeholder="e.g., Theft Act of 1250">' +
            '</div>';

        // Description
        html += '<div class="form-group">' +
            '<label for="law-description-input">Description</label>' +
            '<textarea id="law-description-input" class="form-control" rows="2" ' +
                'placeholder="What does this law declare?">' +
                _escapeHtml(law.description || '') + '</textarea>' +
            '</div>';

        // Type / domain / severity row
        html += '<div class="form-row">';
        html += '<div class="form-group">' +
            '<label for="law-type-input">Type *</label>' +
            '<select id="law-type-input" class="form-control">' +
                typeOptions + '</select>' +
            '</div>';
        html += '<div class="form-group">' +
            '<label for="law-domain-input">Domain *</label>' +
            '<select id="law-domain-input" class="form-control">' +
                domainOptions + '</select>' +
            '</div>';
        html += '<div class="form-group">' +
            '<label for="law-severity-input">Severity *</label>' +
            '<select id="law-severity-input" class="form-control">' +
                severityOptions + '</select>' +
            '</div>';
        html += '</div>';

        // Crime mapping
        html += '<fieldset class="form-fieldset">' +
            '<legend>Crime Mapping (optional)</legend>' +
            '<div class="form-group">' +
                '<label for="law-crime-type-input">Crime Type</label>' +
                '<input type="text" id="law-crime-type-input" class="form-control" ' +
                    'value="' + _escapeHtml(crime.crimeType || '') + '" ' +
                    'placeholder="e.g., theft, assault, heresy">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="law-punishment-input">Punishment</label>' +
                '<input type="text" id="law-punishment-input" class="form-control" ' +
                    'value="' + _escapeHtml(crime.punishment || '') + '" ' +
                    'placeholder="e.g., 20 lashes, 50 gold fine, exile">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="law-checkbox-label">' +
                    '<input type="checkbox" id="law-enforced-input"' +
                    (crime.isEnforced === true ? ' checked' : '') + '> ' +
                    'Crime mapping is enforced' +
                '</label>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="law-crime-notes-input">Crime Notes</label>' +
                '<textarea id="law-crime-notes-input" class="form-control" rows="2">' +
                    _escapeHtml(crime.notes || '') + '</textarea>' +
            '</div>' +
            '</fieldset>';

        // Notes
        html += '<div class="form-group">' +
            '<label for="law-notes-input">Notes</label>' +
            '<textarea id="law-notes-input" class="form-control" rows="2">' +
                _escapeHtml(law.notes || '') + '</textarea>' +
            '</div>';

        html += '</div>';
        return html;
    }

    /**
     * Reads the form values from a modal root. Returns null if a
     * required field is missing or empty; the caller decides whether to
     * surface a toast.
     *
     * Every field collected here is a canonical SettlementLawRules
     * input. Fields that are not part of the schema are not collected.
     */
    function _collectLawFormData(root) {
        var nameEl = root.querySelector('#law-name-input');
        var descEl = root.querySelector('#law-description-input');
        var typeEl = root.querySelector('#law-type-input');
        var domainEl = root.querySelector('#law-domain-input');
        var severityEl = root.querySelector('#law-severity-input');
        var crimeTypeEl = root.querySelector('#law-crime-type-input');
        var punishmentEl = root.querySelector('#law-punishment-input');
        var enforcedEl = root.querySelector('#law-enforced-input');
        var crimeNotesEl = root.querySelector('#law-crime-notes-input');
        var notesEl = root.querySelector('#law-notes-input');

        if (!nameEl || !typeEl || !domainEl || !severityEl) return null;

        var name = nameEl.value.trim();
        if (!name) return null;

        return {
            name: name,
            description: descEl ? descEl.value.trim() : '',
            type: typeEl.value,
            domain: domainEl.value,
            severity: severityEl.value,
            crimeMapping: {
                crimeType: crimeTypeEl ? (crimeTypeEl.value.trim() || null) : null,
                punishment: punishmentEl ? (punishmentEl.value.trim() || null) : null,
                isEnforced: enforcedEl ? enforcedEl.checked === true : false,
                notes: crimeNotesEl ? crimeNotesEl.value.trim() : ''
            },
            notes: notesEl ? notesEl.value.trim() : ''
        };
    }

    // =========================================================================
    // 9. COMMAND WRAPPERS
    // =========================================================================
    //
    // Each wrapper:
    //   - calls the canonical SettlementLawCommands method
    //   - returns { success: true } on success
    //   - returns { success: false, reason } on failure or throw
    //
    // The throw case is important: SettlementCommandCommit.commit throws
    // when persist fails. The wrapper catches that throw, converts it
    // to a structured result, and the modal reports it as a save failure
    // without leaving the modal half-broken.

    function _addLaw(locationId, lawData) {
        try {
            var result = SLC.addCivilLaw(locationId, lawData);
            if (!result || !result.success) {
                return {
                    success: false,
                    reason: (result && result.code) ? result.code : 'unknown'
                };
            }
            return { success: true, law: result.law };
        } catch (err) {
            return {
                success: false,
                reason: (err && err.message) ? err.message : 'save threw'
            };
        }
    }

    function _updateLaw(locationId, lawId, updates) {
        try {
            var result = SLC.updateCivilLaw(locationId, lawId, updates);
            if (!result || !result.success) {
                return {
                    success: false,
                    reason: (result && result.code) ? result.code : 'unknown'
                };
            }
            return { success: true, law: result.law };
        } catch (err) {
            return {
                success: false,
                reason: (err && err.message) ? err.message : 'save threw'
            };
        }
    }

    function _deleteLaw(locationId, lawId) {
        try {
            var result = SLC.removeCivilLaw(locationId, lawId);
            if (!result || !result.success) {
                return {
                    success: false,
                    reason: (result && result.code) ? result.code : 'unknown'
                };
            }
            return { success: true };
        } catch (err) {
            return {
                success: false,
                reason: (err && err.message) ? err.message : 'delete threw'
            };
        }
    }

    // =========================================================================
    // 10. MODALS
    // =========================================================================

    function _openAddLawModal(locationId, onComplete) {
        if (!locationId) {
            _toast('No location selected', 'warning');
            return;
        }

        var settlement = SQ.getSettlementData(locationId);
        if (!settlement) {
            _toast(
                'No settlement record exists for this location. ' +
                'A settlement must exist before civil laws can be added.',
                'error'
            );
            return;
        }

        var place = _placeSummary(locationId);
        var placeName = place ? (place.displayName || place.name || '') : '';

        _openModal({
            titleHtml: 'Add Civil Law - ' + _escapeHtml(placeName),
            contentHtml: _buildLawFormContent(null),
            confirmText: 'Create Law',
            cancelText: 'Cancel',
            size: 'large',
            onConfirm: function (root) {
                var lawData = _collectLawFormData(root);
                if (!lawData) {
                    _toast('Law name is required', 'error');
                    return false;
                }

                var outcome = _addLaw(locationId, lawData);
                if (!outcome.success) {
                    _toast('Failed to save law: ' + outcome.reason, 'error');
                    return false;
                }

                _toast('Law "' + lawData.name + '" created', 'success');
                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openEditLawModal(locationId, lawId, onComplete) {
        if (!locationId || !lawId) {
            _toast('Missing law or location id', 'error');
            return;
        }

        var law = SLQ.getCivilLaw(locationId, lawId);
        if (!law) {
            _toast('Law not found', 'error');
            return;
        }

        var place = _placeSummary(locationId);
        var placeName = place ? (place.displayName || place.name || '') : '';

        _openModal({
            titleHtml: 'Edit Law: ' + _escapeHtml(law.name || ''),
            contentHtml: _buildLawFormContent(law),
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            size: 'large',
            onConfirm: function (root) {
                var updates = _collectLawFormData(root);
                if (!updates) {
                    _toast('Law name is required', 'error');
                    return false;
                }

                var outcome = _updateLaw(locationId, lawId, updates);
                if (!outcome.success) {
                    _toast('Failed to update law: ' + outcome.reason, 'error');
                    return false;
                }

                _toast('Law updated', 'success');
                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    // =========================================================================
    // 11. REFRESH HELPER (public)
    // =========================================================================

    function refreshLawsTab(locationId, containerId) {
        var id = containerId || 'laws-tab';
        var container = document.getElementById(id);
        if (!container) {
            var candidates = document.querySelectorAll(
                '.law-tab-container, #laws-tab, [data-tab-content]'
            );
            if (candidates.length === 0) return;
            container = candidates[0];
            var cur = container;
            while (cur && !cur.id && cur.parentElement) cur = cur.parentElement;
            id = cur && cur.id ? cur.id : id;
        }
        renderLawsTab(id, locationId);
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.LawsTab = {
        render: renderLawsTab,
        refresh: refreshLawsTab,
        // Data accessors, exposed for tests and future callers that
        // want the same shape the tab uses.
        getLaws: function (locationId) {
            return _loadLaws(locationId);
        },
        getStats: function (locationId) {
            return _loadStats(locationId);
        },
        // Definition lookups (thin wrappers, exposed for consistency
        // with the other tabs).
        lawTypeName: _lawTypeName,
        lawDomainName: _lawDomainName,
        lawSeverityName: _lawSeverityName,
        lawSeverityColor: _lawSeverityColor,
        // Form accessors, exposed for tests.
        _buildLawFormContent: _buildLawFormContent,
        _collectLawFormData: _collectLawFormData,
        _openAddLawModal: _openAddLawModal,
        _openEditLawModal: _openEditLawModal,
        // Rendering helpers, exposed for tests.
        _renderLawItem: _renderLawItem
    };

    window.renderLawsTab = renderLawsTab;
    window.refreshLawsTab = refreshLawsTab;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LawsTab;
    }
})();
