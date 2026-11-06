// js/tabs/government-civil-laws-tab.js
/**
 * =============================================================================
 * GOVERNMENT CIVIL LAWS TAB
 * js/tabs/government-civil-laws-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-civil-laws-tab.js
 *
 * PURPOSE:
 *   Render the settlement's civil laws, and manage them through the
 *   canonical SettlementLawCommands.
 *
 * RENDERER CONTRACT (from GovernmentManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { locationId, locationName, governmentState }
 *
 * DATA SOURCES:
 *   - SettlementLawQueries.getCivilLaws(locationId)
 *   - SettlementLawQueries.getCivilLawStatistics(locationId)
 *   - SettlementLawQueries.getCivilLaw(locationId, lawId)
 *   - SettlementLawDefinitions.LAW_TYPES / LAW_DOMAINS / LAW_SEVERITIES
 *   - SettlementLawCommands.addCivilLaw / updateCivilLaw / removeCivilLaw
 *   - SettlementQueries.getSettlementData(locationId)   (has-settlement gate)
 *   - LocationQueries.getPlaceSummary(locationId)       (header name)
 *
 * FILTERS:
 *   None. Laws are grouped by enforcement state (enforced first, then
 *   not enforced) and sorted by name inside each group. No user filter
 *   controls; nothing to persist.
 *
 * WRITE PATH:
 *   All writes go through SettlementLawCommands. The command's commit
 *   tail owns markDataDirty + saveMasterData + publish. This tab never
 *   calls saveMasterData, never calls SettlementState._updateSettlementData,
 *   and never mutates the array returned by getCivilLaws.
 *
 * DEPENDENCIES (hard — throw at load if missing):
 *   - js/settlement/settlement-law-queries.js
 *   - js/settlement/settlement-law-commands.js
 *   - js/settlement/settlement-law-definitions.js
 *   - js/settlement/settlement-queries.js
 *   - js/location/location-queries.js
 *   - js/core/modals-core.js           (openModal)
 *   - js/core/formatting.js            (escapeHtml)
 *   - js/core/icons.js                 (Icons)
 *   - js/core/tab-manager.js           (TabManager)
 *
 * DEPENDENCIES (soft — toast at click if missing):
 *   - js/core/ui.js                    (showToast)
 *   - js/core/modals-core.js           (confirmDialog / closeTopModal)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: glyphs from Icons[name] via _iconSpan; no emojis; no
 *   literal Unicode glyphs in string output (status pill is CSS-styled,
 *   the literal bullet was removed).
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Migrated from renderLawsTab(containerId, locationId) to the
 *     TabManager renderer contract fn(container, context).
 *   - Self-registers with TabManager at load:
 *         TM.register(SCOPE, TAB_ID, renderLawsTab).
 *   - Stale-location bug fixed: the tab stores its location on
 *     container.dataset.locationId; click handlers read that on every
 *     click instead of capturing a bind-time closure var. Sidebar
 *     selection changes now refresh into the new location without
 *     a full page reload.
 *   - Removed the literal `&#9679;` status glyph; the status pill is
 *     styled entirely by CSS class (is-active / is-inactive).
 *   - _refresh() now routes through TabManager.requestRender(SCOPE, TAB_ID)
 *     so a re-render does not re-enter the renderer with a stale
 *     location, and so a single renderer call re-runs the full pipeline.
 *   - Modal delegates resolved at click time; missing modal now toasts
 *     a specific error instead of throwing or silently no-oping.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'laws';
    var SCOPE  = 'government';

    // =========================================================================
    // 2. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================
    //
    // A missing dependency is a load-order bug. It must be loud, not
    // silently degraded. The bootstrap catches throws from init(); a
    // throw here will not be swallowed by the browser because tab
    // files are loaded as classic scripts and the browser reports the
    // error to the console plus fails the containing script block.

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
    if (!window.TabManager || typeof window.TabManager.register !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: tab-manager.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: modals-core.js (openModal) must load first.'
        );
    }

    var SLQ = window.SettlementLawQueries;
    var SLC = window.SettlementLawCommands;
    var SLD = window.SettlementLawDefinitions;
    var SQ  = window.SettlementQueries;
    var LQ  = window.LocationQueries;
    var TM  = window.TabManager;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        return (window.Icons && typeof window.Icons[name] === 'string')
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _icon(name);
        return i
            ? '<span class="gov-tab-icon" aria-hidden="true">' + i + '</span>'
            : '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type || 'info');
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

    function _placeSummary(locationId) {
        if (!locationId) return null;
        if (typeof LQ.getPlaceSummary === 'function') {
            try { return LQ.getPlaceSummary(locationId); }
            catch (e) { return null; }
        }
        return null;
    }

    // =========================================================================
    // 4. DEFINITION LOOKUPS
    // =========================================================================
    //
    // Every enum value the tab renders comes from SettlementLawDefinitions.
    // Unknown ids fall through to the raw id so a bad record is visible
    // without crashing the render.

    function _findDefinition(list, id) {
        if (!id || !Array.isArray(list)) return null;
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
    // 5. DATA LOADERS
    // =========================================================================
    //
    // null  → no settlement record for this location
    // []    → settlement exists, no laws
    // [...] → settlement exists, laws present
    //
    // The two empty cases are distinguished so the empty-state copy and
    // the "Add Law" affordance are correct in both.

    function _loadLaws(locationId) {
        if (!locationId) return null;
        try { return SLQ.getCivilLaws(locationId); }
        catch (e) { return null; }
    }

    function _loadStats(locationId) {
        if (!locationId) return null;
        try { return SLQ.getCivilLawStatistics(locationId); }
        catch (e) { return null; }
    }

    // =========================================================================
    // 6. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place, canAdd) {
        var name = place ? (place.displayName || place.name || '') : '';
        var addBtn = canAdd
            ? '<button type="button" class="law-btn law-btn-add" data-action="add-law">' +
                  _iconSpan('PLUS') + ' Add Law' +
              '</button>'
            : '';

        return (
            '<div class="law-tab-header">' +
                '<h3>Civil Laws - ' + _esc(name) + '</h3>' +
                '<div class="law-tab-actions">' +
                    addBtn +
                    '<button type="button" class="law-btn" data-action="refresh-laws">' +
                        _iconSpan('REFRESH') + ' Refresh' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildStats(stats) {
        var total    = stats ? stats.totalLaws   : 0;
        var enforced = stats ? stats.enforced    : 0;
        var notEnf   = stats ? stats.notEnforced : 0;

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
                    '<span class="law-stat-value is-inactive">' + notEnf + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderLawItem(law) {
        if (!law || !law.id) return '';

        var typeDef       = _lawTypeDef(law.type);
        var domainDef     = _lawDomainDef(law.domain);
        var severityDef   = _lawSeverityDef(law.severity);
        var severityColor = _lawSeverityColor(law.severity);

        var crime       = law.crimeMapping || {};
        var isEnforced  = crime.isEnforced === true;
        var statusLabel = isEnforced ? 'Enforced' : 'Not enforced';
        var statusClass = isEnforced ? 'is-active' : 'is-inactive';

        var typeIcon = typeDef && typeDef.icon ? _esc(typeDef.icon) : '';
        var typeName = typeDef ? typeDef.name : (law.type || '');
        var domainName = domainDef ? domainDef.name : (law.domain || '');
        var severityName = severityDef ? severityDef.name : (law.severity || '');

        var editIcon   = _icon('EDIT');
        var deleteIcon = _icon('X_HEAVY');

        var html = '<div class="law-item" data-law-id="' + _esc(law.id) + '">';

        // Header: name + status + actions
        html += '<div class="law-header">';
        html += '<div class="law-title">';
        html += '<span class="law-name">' + _esc(law.name || '') + '</span>';
        html += '<span class="law-status ' + statusClass + '">' +
                    _esc(statusLabel) +
                '</span>';
        html += '</div>';
        html += '<div class="law-actions">';
        html += '<button type="button" class="law-btn law-btn-edit" ' +
                    'data-action="edit-law" data-law-id="' + _esc(law.id) + '" ' +
                    'aria-label="Edit law">' + editIcon + '</button>';
        html += '<button type="button" class="law-btn law-btn-delete" ' +
                    'data-action="delete-law" data-law-id="' + _esc(law.id) + '" ' +
                    'aria-label="Delete law">' + deleteIcon + '</button>';
        html += '</div>';
        html += '</div>';

        // Body: meta + description + crime mapping + notes + timestamps
        html += '<div class="law-details">';

        html += '<div class="law-meta">';
        if (typeName) {
            html += '<span class="law-category">' +
                (typeIcon ? typeIcon + ' ' : '') +
                _esc(typeName) + '</span>';
        }
        if (domainName) {
            html += '<span class="law-domain">' + _esc(domainName) + '</span>';
        }
        if (severityName) {
            html += '<span class="law-severity" style="color:' +
                _esc(severityColor) + ';">' +
                _esc(severityName) + '</span>';
        }
        html += '</div>';

        if (law.description) {
            html += '<div class="law-description">' +
                _esc(law.description) + '</div>';
        }

        if (crime.punishment) {
            html += '<div class="law-punishment">' +
                '<span class="law-punishment-label">Punishment:</span> ' +
                '<span class="law-punishment-desc">' + _esc(crime.punishment) + '</span>' +
            '</div>';
        }

        if (crime.crimeType) {
            html += '<div class="law-crime-type">' +
                '<span class="law-crime-label">Crime type:</span> ' +
                '<span class="law-crime-value">' + _esc(crime.crimeType) + '</span>' +
            '</div>';
        }

        if (crime.notes) {
            html += '<div class="law-notes">' + _esc(crime.notes) + '</div>';
        }

        if (law.notes) {
            html += '<div class="law-notes">' + _esc(law.notes) + '</div>';
        }

        html += '<div class="law-meta-info">';
        if (typeof law.createdYear === 'number') {
            html += '<span>Enacted: ' + law.createdYear + '</span>';
        }
        if (typeof law.updatedYear === 'number' &&
            law.updatedYear !== law.createdYear) {
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
                    '<button type="button" class="law-btn law-btn-add" ' +
                        'data-action="add-law">' +
                        _iconSpan('PLUS') + ' Create First Law' +
                    '</button>' +
                '</div>'
            );
        }

        var enforced = [];
        var notEnforced = [];
        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (!law || !law.id) continue;
            var isEnf = law.crimeMapping && law.crimeMapping.isEnforced === true;
            (isEnf ? enforced : notEnforced).push(law);
        }

        var byName = function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        };
        enforced.sort(byName);
        notEnforced.sort(byName);

        var html = '';

        if (enforced.length > 0) {
            html += '<div class="law-section">';
            html += '<div class="law-section-header">Enforced Laws (' +
                enforced.length + ')</div>';
            html += '<div class="law-list">';
            for (var e = 0; e < enforced.length; e++) {
                html += _renderLawItem(enforced[e]);
            }
            html += '</div></div>';
        }

        if (notEnforced.length > 0) {
            html += '<div class="law-section">';
            html += '<div class="law-section-header">Not Enforced (' +
                notEnforced.length + ')</div>';
            html += '<div class="law-list">';
            for (var n = 0; n < notEnforced.length; n++) {
                html += _renderLawItem(notEnforced[n]);
            }
            html += '</div></div>';
        }

        return html;
    }

    function _buildEmptyState(message) {
        return '<div class="law-empty"><p>' + _esc(message) + '</p></div>';
    }

    function _buildShell(place, laws, stats) {
        if (!place) {
            return '<div class="law-tab-container">' +
                _buildEmptyState('Select a government from the sidebar to view civil laws.') +
                '</div>';
        }

        // null = no settlement record; array = settlement exists.
        var hasSettlement = laws !== null;
        var lawArray = hasSettlement ? (laws || []) : [];

        var html = '<div class="law-tab-container" ' +
            'data-location-id="' + _esc(place.id || '') + '">';

        html += _buildHeader(place, hasSettlement);

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
    // 7. RENDERER (TabManager contract: fn(container, context))
    // =========================================================================

    function renderLawsTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a government from the sidebar to view civil laws.' +
                '</div>';
            return;
        }

        var locationId = context.locationId;

        // Prefer the place projection built by the bootstrap; fall back
        // to a fresh read so the tab is self-contained if called
        // outside the TabManager pipeline (e.g. from a test).
        var place = (context.governmentState && context.governmentState.place)
            ? context.governmentState.place
            : _placeSummary(locationId);

        var laws  = _loadLaws(locationId);
        var stats = _loadStats(locationId);

        container.innerHTML = _buildShell(place, laws, stats);

        // The only piece of location state the tab keeps. Every click
        // handler reads this attribute at click time; no closure ever
        // captures a location id.
        container.dataset.locationId = locationId;

        _bindActions(container);
    }

    // =========================================================================
    // 8. ACTION BINDING (delegated, on the tab container)
    // =========================================================================
    //
    // One click listener per tab container, guarded by a marker on the
    // container. The marker survives innerHTML swaps because it is on
    // the container, not on any child. Handlers read the current
    // location from container.dataset.locationId at click time — never
    // from a closure captured at bind time.

    function _bindActions(container) {
        if (container._govLawsBound) return;
        container._govLawsBound = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target) return;
            if (!container.contains(target)) return;

            var action = target.getAttribute('data-action');
            var locationId = container.dataset.locationId;
            if (!locationId) return;

            if (action === 'add-law') {
                event.preventDefault();
                _openAddLawModal(locationId);
                return;
            }

            if (action === 'refresh-laws') {
                event.preventDefault();
                _refresh();
                _toast('Laws refreshed', 'info');
                return;
            }

            if (action === 'edit-law') {
                event.preventDefault();
                var editId = target.getAttribute('data-law-id');
                if (!editId) return;
                _openEditLawModal(locationId, editId);
                return;
            }

            if (action === 'delete-law') {
                event.preventDefault();
                var delId = target.getAttribute('data-law-id');
                if (!delId) return;

                var law;
                try { law = SLQ.getCivilLaw(locationId, delId); }
                catch (e) { law = null; }
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
                            _refresh();
                        } else {
                            _toast('Delete failed: ' + outcome.reason, 'error');
                        }
                    }
                );
                return;
            }
        });
    }

    function _refresh() {
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 9. LAW FORM (shared by add / edit)
    // =========================================================================
    //
    // Every field collected here is a canonical SettlementLawRules input:
    //   name, description, type, domain, severity, crimeMapping.*, notes
    //
    // Fields that are NOT part of the canonical schema are not rendered
    // and not collected: category, jurisdiction, punishmentType,
    // punishmentAmount, exceptions, isActive, enactedYear, amendedYear.
    // The old form fields for them are gone; the old render paths are gone.

    function _buildLawFormContent(existingLaw) {
        var law = existingLaw || {};
        var crime = law.crimeMapping || {};

        var typeOptions = '';
        for (var t = 0; t < SLD.LAW_TYPES.length; t++) {
            var type = SLD.LAW_TYPES[t];
            var typeSelected = type.id === (law.type || 'law') ? ' selected' : '';
            typeOptions += '<option value="' + _esc(type.id) + '"' +
                typeSelected + '>' + _esc(type.name) + '</option>';
        }

        var domainOptions = '';
        for (var d = 0; d < SLD.LAW_DOMAINS.length; d++) {
            var domain = SLD.LAW_DOMAINS[d];
            var domainSelected = domain.id === (law.domain || 'social') ? ' selected' : '';
            domainOptions += '<option value="' + _esc(domain.id) + '"' +
                domainSelected + '>' + _esc(domain.name) + '</option>';
        }

        var severityOptions = '';
        for (var s = 0; s < SLD.LAW_SEVERITIES.length; s++) {
            var severity = SLD.LAW_SEVERITIES[s];
            var severitySelected = severity.id === (law.severity || 'minor') ? ' selected' : '';
            severityOptions += '<option value="' + _esc(severity.id) + '"' +
                severitySelected + '>' + _esc(severity.name) + '</option>';
        }

        var html = '<div class="law-edit-form">';

        html += '<div class="form-group">' +
            '<label for="law-name-input">Law Name *</label>' +
            '<input type="text" id="law-name-input" class="form-control" ' +
                'value="' + _esc(law.name || '') + '" ' +
                'placeholder="e.g., Theft Act of 1250">' +
            '</div>';

        html += '<div class="form-group">' +
            '<label for="law-description-input">Description</label>' +
            '<textarea id="law-description-input" class="form-control" rows="2" ' +
                'placeholder="What does this law declare?">' +
                _esc(law.description || '') +
            '</textarea>' +
            '</div>';

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

        html += '<fieldset class="form-fieldset">' +
            '<legend>Crime Mapping (optional)</legend>' +
            '<div class="form-group">' +
                '<label for="law-crime-type-input">Crime Type</label>' +
                '<input type="text" id="law-crime-type-input" class="form-control" ' +
                    'value="' + _esc(crime.crimeType || '') + '" ' +
                    'placeholder="e.g., theft, assault, heresy">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="law-punishment-input">Punishment</label>' +
                '<input type="text" id="law-punishment-input" class="form-control" ' +
                    'value="' + _esc(crime.punishment || '') + '" ' +
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
                    _esc(crime.notes || '') +
                '</textarea>' +
            '</div>' +
        '</fieldset>';

        html += '<div class="form-group">' +
            '<label for="law-notes-input">Notes</label>' +
            '<textarea id="law-notes-input" class="form-control" rows="2">' +
                _esc(law.notes || '') +
            '</textarea>' +
            '</div>';

        html += '</div>';
        return html;
    }

    function _collectLawFormData(root) {
        var nameEl    = root.querySelector('#law-name-input');
        var descEl    = root.querySelector('#law-description-input');
        var typeEl    = root.querySelector('#law-type-input');
        var domainEl  = root.querySelector('#law-domain-input');
        var severityEl = root.querySelector('#law-severity-input');
        var crimeTypeEl = root.querySelector('#law-crime-type-input');
        var punishmentEl = root.querySelector('#law-punishment-input');
        var enforcedEl = root.querySelector('#law-enforced-input');
        var crimeNotesEl = root.querySelector('#law-crime-notes-input');
        var notesEl   = root.querySelector('#law-notes-input');

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
    // 10. COMMAND WRAPPERS
    // =========================================================================
    //
    // The command's commit tail owns write + rebuild + persist + publish.
    // The wrapper only converts a throw into a structured result so the
    // modal can report failure without leaving itself half-broken.

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
    // 11. MODALS
    // =========================================================================

    function _openAddLawModal(locationId) {
        if (!locationId) {
            _toast('No location selected', 'warning');
            return;
        }

        var settlement;
        try { settlement = SQ.getSettlementData(locationId); }
        catch (e) { settlement = null; }

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

        window.openModal({
            titleHtml: 'Add Civil Law - ' + _esc(placeName),
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
                _refresh();
                return true;
            }
        });
    }

    function _openEditLawModal(locationId, lawId) {
        if (!locationId || !lawId) {
            _toast('Missing law or location id', 'error');
            return;
        }

        var law;
        try { law = SLQ.getCivilLaw(locationId, lawId); }
        catch (e) { law = null; }

        if (!law) {
            _toast('Law not found', 'error');
            return;
        }

        window.openModal({
            titleHtml: 'Edit Law: ' + _esc(law.name || ''),
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
                _refresh();
                return true;
            }
        });
    }

    // =========================================================================
    // 12. REGISTRATION (playbook §5)
    // =========================================================================

    TM.register(SCOPE, TAB_ID, renderLawsTab);

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.LawsTab = {
        id: TAB_ID,
        render: renderLawsTab,

        // Data accessors, exposed for tests and future callers that
        // want the same shape the tab uses.
        getLaws: _loadLaws,
        getStats: _loadStats,

        // Definition lookups.
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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LawsTab;
    }
})();
