// js/tabs/government-civil-laws-tab.js
/**
 * =============================================================================
 * CIVIL LAWS TAB (js/tabs/government-civil-laws-tab.js)
 * =============================================================================
 *
 * PURPOSE:
 *   Modular tab for viewing and managing civil laws for a location.
 *
 * =============================================================================
 * SETTLEMENT INTEGRATION STATUS — READ THIS
 * =============================================================================
 *
 * This tab is a PREVIEW. It writes laws to settlementData.civilLaws, and
 * nothing else in the tree reads that field. Until the settlement domain
 * is wired, laws created here do not affect crime, religion, settlement
 * law, or any other system.
 *
 * What's missing on the settlement side (all of it user-facing, none of
 * it hidden):
 *
 *   1. A canonical write command.
 *      SettlementLawCommands.addCivilLaw(locationId, lawData) does not
 *      exist in this build. The tab falls back to
 *      SettlementState._updateSettlementData(locationId, { civilLaws })
 *      — a PRIVATE method. If that method does not exist either, every
 *      write fails with a visible toast, and the integration-status
 *      panel says so.
 *
 *   2. A canonical read query.
 *      SettlementLawQueries.getCivilLaws(locationId) does not exist.
 *      The tab reads data.civilLaws off the raw settlement record
 *      returned by getSettlementData.
 *
 *   3. Consumers.
 *      Crime, religion, and settlement never consult civilLaws. A law
 *      saying "theft is punished by death" has no effect today. It is
 *      stored; it is not enforced.
 *
 *   4. Canonical enum source.
 *      The tab defines its own PUNISHMENT_TYPES / LAW_CATEGORIES /
 *      SEVERITY_LEVELS, which do not match SettlementLawDefinitions.*.
 *      Reconciling them requires the settlement-law-* files, which are
 *      not available at the time this file was rewritten.
 *
 * What IS wired in this revision:
 *
 *   - The modal API uses titleHtml / contentHtml (key translation in
 *     _openModal). Before this, the modal body was empty and typing
 *     into the form was impossible.
 *   - Every onConfirm / onOpen reads inputs via root.querySelector,
 *     not document.getElementById. Two open modals no longer cross-read.
 *   - Every write inspects the _updateSettlementData return value. A
 *     failed write shows a toast and keeps the modal open; the tab
 *     never reports success on a null/undefined return.
 *   - Every successful write calls saveMasterData() and
 *     invalidateAccessorCaches() once.
 *   - The banner and integration-status panel are rendered on every
 *     view. The user is told, every time, that these laws are stored
 *     locally and consumed by nothing.
 *
 * When the settlement side is wired:
 *   - Replace the fallback write with SettlementLawCommands.addCivilLaw.
 *   - Replace the fallback read with SettlementLawQueries.getCivilLaws.
 *   - Replace the local PUNISHMENT_TYPES / LAW_CATEGORIES /
 *     SEVERITY_LEVELS with SettlementLawDefinitions.* values.
 *   - Delete the banner and integration-status panel.
 *
 * =============================================================================
 * DEPENDENCIES (checked at load time):
 *   - accessors.js   (getPlaceById)
 *   - formatting.js  (escapeHtml)
 *   - icons.js       (Icons)
 *   - ui.js          (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 *   - time.js        (getCurrentYear)
 *
 * DEPENDENCIES (checked at call time, integration-status panel reports
 * presence or absence):
 *   - SettlementState (window.SettlementState._updateSettlementData)
 *   - window.getSettlementData / window.getOrCreateSettlementData
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The call sites pass
 *   title / content. The local _openModal translates.
 *
 * MODAL INPUT SCOPING:
 *   Every onConfirm reads inputs via root.querySelector.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: formatting.js (escapeHtml) ' +
            'must load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-civil-laws-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-civil-laws-tab.js: time.js (getCurrentYear) must ' +
            'load first.'
        );
    }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    var CIVIL_LAWS_FIELD = 'civilLaws';

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function'
            ? window.getPlaceById(id)
            : null;
    }

    function _escapeHtml(value) {
        return window.escapeHtml(value);
    }

    function _escapeNumber(n) {
        return window.escapeHtml(
            typeof n === 'number' && isFinite(n) ? String(n) : '0'
        );
    }

    function _getIcon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        }
    }

    function _openModal(opts) {
        var forwarded = {};
        for (var k in opts) {
            if (Object.prototype.hasOwnProperty.call(opts, k)) {
                forwarded[k] = opts[k];
            }
        }
        if (forwarded.titleHtml === undefined && forwarded.title !== undefined) {
            forwarded.titleHtml = forwarded.title;
        }
        if (forwarded.contentHtml === undefined && forwarded.content !== undefined) {
            forwarded.contentHtml = forwarded.content;
        }
        return window.openModal(forwarded);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        // Defensive fallback. generateId is a core dependency; if it is
        // absent the page is missing core/ids.js. The fallback keeps the
        // tab functional so the user can still see their data.
        return prefix + '_' + Date.now() + '_' +
            Math.random().toString(36).slice(2, 8);
    }

    // =========================================================================
    // 3. SETTLEMENT INTEGRATION DETECTION
    // =========================================================================
    //
    // Each check reports "present" or "missing" and a short reason. The
    // integration-status panel reads these and shows them, so a user can
    // see exactly which piece of the settlement domain needs wiring.

    function _detectSettlementState() {
        if (typeof window.SettlementState === 'undefined'
            || window.SettlementState === null) {
            return { ok: false, reason: 'window.SettlementState is not loaded.' };
        }
        if (typeof window.SettlementState._updateSettlementData !== 'function') {
            return {
                ok: false,
                reason: 'SettlementState._updateSettlementData (private) is ' +
                    'not available. Writes will fail.'
            };
        }
        return { ok: true, reason: 'Available.' };
    }

    function _detectSettlementReadAccessor() {
        if (typeof window.getSettlementData === 'function') {
            return { ok: true, reason: 'window.getSettlementData is available.' };
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return {
                ok: true,
                reason: 'window.getOrCreateSettlementData is available ' +
                    '(fallback).'
            };
        }
        return {
            ok: false,
            reason: 'Neither window.getSettlementData nor ' +
                'window.getOrCreateSettlementData is loaded. Reads will fail.'
        };
    }

    function _detectSettlementLawCommands() {
        if (typeof window.SettlementLawCommands === 'undefined'
            || window.SettlementLawCommands === null) {
            return {
                ok: false,
                reason: 'SettlementLawCommands is not loaded. This tab ' +
                    'falls back to the private settlement write path.'
            };
        }
        return { ok: true, reason: 'Available. (Not yet used by this tab.)' };
    }

    function _getIntegrationStatus() {
        return {
            settlementState: _detectSettlementState(),
            readAccessor: _detectSettlementReadAccessor(),
            lawCommands: _detectSettlementLawCommands()
        };
    }

    // =========================================================================
    // 4. LAW DATA (via settlement record)
    // =========================================================================

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
    }

    function _writeSettlementData(locationId, updates) {
        if (typeof window.SettlementState === 'undefined'
            || window.SettlementState === null
            || typeof window.SettlementState._updateSettlementData !== 'function') {
            return { success: false, reason: 'settlement-write-unavailable' };
        }
        try {
            var result = window.SettlementState._updateSettlementData(
                locationId, updates
            );
            if (result === null || result === undefined) {
                return {
                    success: false,
                    reason: '_updateSettlementData returned ' +
                        (result === null ? 'null' : 'undefined')
                };
            }
            return { success: true };
        } catch (e) {
            return {
                success: false,
                reason: (e && e.message) ? e.message : 'update threw'
            };
        }
    }

    function _readLaws(locationId) {
        var data = _getSettlementData(locationId);
        if (!data) return { ok: false, reason: 'no-settlement-data', laws: [] };
        var laws = Array.isArray(data[CIVIL_LAWS_FIELD])
            ? data[CIVIL_LAWS_FIELD]
            : [];
        return { ok: true, laws: laws };
    }

    function _saveLaws(locationId, laws) {
        var updates = {};
        updates[CIVIL_LAWS_FIELD] = laws;
        return _writeSettlementData(locationId, updates);
    }

    function _findLaw(locationId, lawId) {
        var result = _readLaws(locationId);
        if (!result.ok) return null;
        for (var i = 0; i < result.laws.length; i++) {
            if (result.laws[i].id === lawId) return result.laws[i];
        }
        return null;
    }

    function _addLaw(locationId, lawData) {
        var read = _readLaws(locationId);
        if (!read.ok) {
            return { success: false, reason: 'cannot-read-laws' };
        }
        var laws = read.laws.slice();
        var newLaw = {
            id: _generateId('law'),
            name: lawData.name.trim(),
            description: lawData.description || '',
            category: lawData.category || 'civil',
            severity: lawData.severity || 'medium',
            punishment: lawData.punishment || '',
            punishmentType: lawData.punishmentType || 'fine',
            punishmentAmount: lawData.punishmentAmount || 0,
            isActive: lawData.isActive !== false,
            enactedYear: _getCurrentYear(),
            amendedYear: null,
            jurisdiction: lawData.jurisdiction || 'local',
            exceptions: lawData.exceptions || '',
            notes: lawData.notes || ''
        };
        laws.push(newLaw);

        var write = _saveLaws(locationId, laws);
        if (!write.success) {
            return { success: false, reason: write.reason };
        }

        _persistAndInvalidate();

        return { success: true, law: newLaw };
    }

    function _updateLaw(locationId, lawId, updates) {
        var read = _readLaws(locationId);
        if (!read.ok) {
            return { success: false, reason: 'cannot-read-laws' };
        }
        var laws = read.laws.slice();
        var found = false;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].id !== lawId) continue;
            found = true;
            var l = laws[i];
            if (updates.name !== undefined) l.name = updates.name.trim();
            if (updates.description !== undefined) l.description = updates.description;
            if (updates.category !== undefined) l.category = updates.category;
            if (updates.severity !== undefined) l.severity = updates.severity;
            if (updates.punishment !== undefined) l.punishment = updates.punishment;
            if (updates.punishmentType !== undefined) l.punishmentType = updates.punishmentType;
            if (updates.punishmentAmount !== undefined) l.punishmentAmount = updates.punishmentAmount;
            if (updates.isActive !== undefined) l.isActive = updates.isActive;
            if (updates.jurisdiction !== undefined) l.jurisdiction = updates.jurisdiction;
            if (updates.exceptions !== undefined) l.exceptions = updates.exceptions;
            if (updates.notes !== undefined) l.notes = updates.notes;
            l.amendedYear = _getCurrentYear();
            break;
        }
        if (!found) {
            return { success: false, reason: 'law-not-found' };
        }

        var write = _saveLaws(locationId, laws);
        if (!write.success) {
            return { success: false, reason: write.reason };
        }

        _persistAndInvalidate();

        return { success: true, law: _findLaw(locationId, lawId) };
    }

    function _deleteLaw(locationId, lawId) {
        var read = _readLaws(locationId);
        if (!read.ok) {
            return { success: false, reason: 'cannot-read-laws' };
        }
        var filtered = [];
        for (var i = 0; i < read.laws.length; i++) {
            if (read.laws[i].id !== lawId) filtered.push(read.laws[i]);
        }

        var write = _saveLaws(locationId, filtered);
        if (!write.success) {
            return { success: false, reason: write.reason };
        }

        _persistAndInvalidate();

        return { success: true };
    }

    function _persistAndInvalidate() {
        if (typeof window.saveMasterData === 'function') {
            try { window.saveMasterData(); } catch (e) { /* logged below */ }
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            try { window.invalidateAccessorCaches(); } catch (e) { /* ignore */ }
        }
    }

    // =========================================================================
    // 5. ENUMS (LOCAL, NOT SETTLEMENT-CANONICAL — see header)
    // =========================================================================

    var PUNISHMENT_TYPES = {
        fine:             { label: 'Fine',             icon: 'COIN' },
        imprisonment:     { label: 'Imprisonment',     icon: 'LOCK' },
        exile:            { label: 'Exile',            icon: 'FLAG' },
        execution:        { label: 'Execution',        icon: 'SWORD' },
        mutilation:       { label: 'Mutilation',       icon: 'WARNING' },
        flogging:         { label: 'Flogging',         icon: 'WARNING' },
        publicShaming:    { label: 'Public Shaming',   icon: 'WARNING' },
        communityService: { label: 'Community Service', icon: 'PERSON' },
        compensation:     { label: 'Compensation',     icon: 'COIN' },
        demotion:         { label: 'Demotion',         icon: 'CROWN' },
        warning:          { label: 'Warning',          icon: 'WARNING' },
        houseArrest:      { label: 'House Arrest',     icon: 'HOME' },
        slavery:          { label: 'Enslavement',      icon: 'LOCK' }
    };

    var LAW_CATEGORIES = {
        civil:          { label: 'Civil',          icon: 'SHIELD' },
        criminal:       { label: 'Criminal',       icon: 'SWORD' },
        commercial:     { label: 'Commercial',     icon: 'COIN' },
        property:       { label: 'Property',       icon: 'HOME' },
        family:         { label: 'Family',         icon: 'HEART' },
        religious:      { label: 'Religious',      icon: 'STAR_4' },
        administrative: { label: 'Administrative', icon: 'GEAR' },
        constitutional: { label: 'Constitutional', icon: 'CROWN' },
        military:       { label: 'Military',       icon: 'SHIELD' },
        labor:          { label: 'Labor',          icon: 'PERSON' }
    };

    var SEVERITY_LEVELS = {
        minor:   { label: 'Minor',   token: 'var(--ok)' },
        medium:  { label: 'Medium',  token: 'var(--warning)' },
        major:   { label: 'Major',   token: 'var(--danger-lt)' },
        severe:  { label: 'Severe',  token: 'var(--danger)' },
        capital: { label: 'Capital', token: 'var(--danger)' }
    };

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    function _renderIntegrationBanner() {
        return (
            '<div class="law-integration-banner" role="note" ' +
                'style="padding:10px 14px;margin-bottom:14px;' +
                'background:var(--warning-soft);' +
                'border:1px solid var(--warning);' +
                'border-radius:6px;font-size:0.65rem;line-height:1.5;' +
                'color:var(--text);">' +
                '<strong>Preview only — not wired to the settlement domain.</strong> ' +
                'Laws created here are stored in <code>settlementData.civilLaws</code> ' +
                'and nothing else in the game reads them. Crime, religion, ' +
                'settlement law, and every other system ignore these laws. ' +
                'The editor is functional so you can build your data model; ' +
                'the enforcement and cross-domain integration are not yet in place.' +
            '</div>'
        );
    }

    function _renderIntegrationStatus(status) {
        function line(label, entry) {
            var color = entry.ok ? 'var(--ok)' : 'var(--danger-lt)';
            var glyph = entry.ok ? '✓' : '✗';
            return (
                '<div class="law-integration-line" ' +
                    'style="display:flex;gap:8px;align-items:flex-start;' +
                    'padding:3px 0;font-size:0.6rem;">' +
                    '<span style="color:' + color + ';font-weight:600;' +
                        'min-width:12px;">' + glyph + '</span>' +
                    '<span style="color:var(--dim);min-width:150px;">' +
                        _escapeHtml(label) + '</span>' +
                    '<span style="color:var(--text);flex:1;">' +
                        _escapeHtml(entry.reason) + '</span>' +
                '</div>'
            );
        }

        return (
            '<div class="law-integration-status" ' +
                'style="padding:10px 14px;margin-bottom:14px;' +
                'background:var(--bg2);' +
                'border:1px solid var(--border);' +
                'border-radius:6px;">' +
                '<div style="font-size:0.65rem;font-weight:600;' +
                    'color:var(--accent);margin-bottom:6px;' +
                    'font-family:var(--f-display);letter-spacing:0.05em;' +
                    'text-transform:uppercase;">' +
                    'Settlement integration status' +
                '</div>' +
                line('Settlement write path', status.settlementState) +
                line('Settlement read path', status.readAccessor) +
                line('Canonical law command', status.lawCommands) +
            '</div>'
        );
    }

    function _renderLawItem(law) {
        var severity = SEVERITY_LEVELS[law.severity] || SEVERITY_LEVELS.medium;
        var category = LAW_CATEGORIES[law.category] || LAW_CATEGORIES.civil;
        var punishment = PUNISHMENT_TYPES[law.punishmentType] ||
            PUNISHMENT_TYPES.fine;

        var punishmentIcon = _getIcon(punishment.icon);
        var categoryIcon = _getIcon(category.icon);
        var statusToken = law.isActive ? 'var(--ok)' : 'var(--danger-lt)';
        var statusLabel = law.isActive ? 'Active' : 'Inactive';

        var html = '<div class="law-item" data-law-id="' +
            _escapeHtml(law.id) + '">';

        // Header
        html += '<div class="law-header">';
        html += '<div class="law-title">';
        html += '<span class="law-name">' +
            _escapeHtml(law.name) + '</span>';
        html += '<span class="law-status" style="color:' +
            statusToken + ';">● ' + statusLabel + '</span>';
        html += '</div>';
        html += '<div class="law-actions">';
        html += '<button class="law-btn law-btn-edit" ' +
            'data-action="edit-law" data-law-id="' +
            _escapeHtml(law.id) + '">' + _getIcon('EDIT') + '</button>';
        html += '<button class="law-btn law-btn-delete" ' +
            'data-action="delete-law" data-law-id="' +
            _escapeHtml(law.id) + '">' + _getIcon('X_HEAVY') + '</button>';
        html += '</div>';
        html += '</div>';

        // Body
        html += '<div class="law-details">';
        html += '<div class="law-meta">';
        html += '<span class="law-category">' + categoryIcon + ' ' +
            _escapeHtml(category.label) + '</span>';
        html += '<span class="law-severity" style="color:' +
            severity.token + ';">' + _escapeHtml(severity.label) + '</span>';
        html += '<span class="law-jurisdiction">' +
            _escapeHtml(law.jurisdiction || 'Local') + '</span>';
        html += '</div>';

        if (law.description) {
            html += '<div class="law-description">' +
                _escapeHtml(law.description) + '</div>';
        }

        html += '<div class="law-punishment">';
        html += '<span class="law-punishment-label">Punishment:</span>';
        html += '<span class="law-punishment-type">' + punishmentIcon + ' ' +
            _escapeHtml(punishment.label) + '</span>';
        if (typeof law.punishmentAmount === 'number' &&
            law.punishmentAmount > 0) {
            html += '<span class="law-punishment-amount">' +
                _escapeHtml(law.punishmentAmount.toLocaleString()) +
                ' gold</span>';
        }
        if (law.punishment) {
            html += '<span class="law-punishment-desc">' +
                _escapeHtml(law.punishment) + '</span>';
        }
        html += '</div>';

        if (law.exceptions) {
            html += '<div class="law-exceptions">';
            html += '<span class="law-exceptions-label">Exceptions:</span>';
            html += '<span class="law-exceptions-text">' +
                _escapeHtml(law.exceptions) + '</span>';
            html += '</div>';
        }

        if (law.notes) {
            html += '<div class="law-notes">' +
                _escapeHtml(law.notes) + '</div>';
        }

        html += '<div class="law-meta-info">';
        html += '<span>Enacted: ' +
            _escapeNumber(law.enactedYear) + '</span>';
        if (law.amendedYear) {
            html += ' <span>Amended: ' +
                _escapeNumber(law.amendedYear) + '</span>';
        }
        html += '</div>';

        html += '</div>';
        html += '</div>';

        return html;
    }

    function _renderEmptyState(message) {
        return (
            '<div class="law-empty">' +
                '<p>' + _escapeHtml(message) + '</p>' +
            '</div>'
        );
    }

    function _renderLawsTabBody(place) {
        if (!place) {
            return _renderEmptyState(
                'Select a location to view civil laws.'
            );
        }

        var read = _readLaws(place.id);
        var status = _getIntegrationStatus();

        var html = '<div class="law-tab-container" ' +
            'data-location-id="' + _escapeHtml(place.id) + '">';

        // Header
        html += '<div class="law-tab-header">';
        html += '<h3>Civil Laws - ' +
            _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="law-tab-actions">';
        html += '<button class="law-btn law-btn-add" ' +
            'data-action="add-law">' +
            _getIcon('PLUS') + ' Add Law' +
            '</button>';
        html += '<button class="law-btn law-btn-refresh" ' +
            'data-action="refresh-laws">' +
            _getIcon('REFRESH') + ' Refresh' +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Loud caveat
        html += _renderIntegrationBanner();
        html += _renderIntegrationStatus(status);

        // If the read path is broken, we cannot show laws. Show why.
        if (!read.ok) {
            html += _renderEmptyState(
                'Settlement data is unavailable for this location. ' +
                'Civil laws cannot be loaded or saved here. ' +
                'See the integration status above.'
            );
            html += '</div>'; // law-tab-container
            return html;
        }

        var laws = read.laws;
        var activeLaws = laws.filter(function(l) { return l.isActive; });
        var inactiveLaws = laws.filter(function(l) { return !l.isActive; });

        // Stats
        html += '<div class="law-stats-summary">';
        html += '<div class="law-stat">' +
            '<span class="law-stat-label">Total Laws</span>' +
            '<span class="law-stat-value">' + laws.length + '</span>' +
            '</div>';
        html += '<div class="law-stat">' +
            '<span class="law-stat-label">Active</span>' +
            '<span class="law-stat-value" style="color:var(--ok);">' +
            activeLaws.length + '</span>' +
            '</div>';
        html += '<div class="law-stat">' +
            '<span class="law-stat-label">Inactive</span>' +
            '<span class="law-stat-value" style="color:var(--danger-lt);">' +
            inactiveLaws.length + '</span>' +
            '</div>';
        html += '</div>';

        // List
        if (laws.length === 0) {
            html += '<div class="law-empty">';
            html += '<p>No civil laws established for this location.</p>';
            html += '<button class="law-btn law-btn-add" ' +
                'data-action="add-law">' +
                _getIcon('PLUS') + ' Create First Law' +
                '</button>';
            html += '</div>';
        } else {
            if (activeLaws.length > 0) {
                html += '<div class="law-section">';
                html += '<div class="law-section-header">Active Laws</div>';
                html += '<div class="law-list">';
                for (var a = 0; a < activeLaws.length; a++) {
                    html += _renderLawItem(activeLaws[a]);
                }
                html += '</div>';
                html += '</div>';
            }

            if (inactiveLaws.length > 0) {
                html += '<div class="law-section law-section-inactive">';
                html += '<div class="law-section-header law-section-toggle" ' +
                    'data-toggle="inactive-laws">';
                html += '<span>Inactive Laws (' + inactiveLaws.length + ')</span>';
                html += '<span class="law-toggle-icon">' +
                    _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="law-section-body" style="display:none;">';
                html += '<div class="law-list">';
                for (var i = 0; i < inactiveLaws.length; i++) {
                    html += _renderLawItem(inactiveLaws[i]);
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div>'; // law-tab-container
        return html;
    }

    // =========================================================================
    // 7. LAW FORM (shared between add and edit modals)
    // =========================================================================

    function _buildLawFormContent(existingLaw) {
        var law = existingLaw || {};

        var catOptions = '';
        for (var catKey in LAW_CATEGORIES) {
            if (!Object.prototype.hasOwnProperty.call(LAW_CATEGORIES, catKey)) {
                continue;
            }
            var sel = (catKey === (law.category || 'civil')) ? ' selected' : '';
            catOptions += '<option value="' + _escapeHtml(catKey) + '"' +
                sel + '>' + _escapeHtml(LAW_CATEGORIES[catKey].label) +
                '</option>';
        }

        var sevOptions = '';
        for (var sevKey in SEVERITY_LEVELS) {
            if (!Object.prototype.hasOwnProperty.call(SEVERITY_LEVELS, sevKey)) {
                continue;
            }
            var sel2 = (sevKey === (law.severity || 'medium')) ? ' selected' : '';
            sevOptions += '<option value="' + _escapeHtml(sevKey) + '"' +
                sel2 + '>' + _escapeHtml(SEVERITY_LEVELS[sevKey].label) +
                '</option>';
        }

        var punOptions = '';
        for (var punKey in PUNISHMENT_TYPES) {
            if (!Object.prototype.hasOwnProperty.call(PUNISHMENT_TYPES, punKey)) {
                continue;
            }
            var sel3 = (punKey === (law.punishmentType || 'fine'))
                ? ' selected'
                : '';
            punOptions += '<option value="' + _escapeHtml(punKey) + '"' +
                sel3 + '>' + _escapeHtml(PUNISHMENT_TYPES[punKey].label) +
                '</option>';
        }

        var html = '<div class="law-edit-form">';

        html += '<div class="form-group">';
        html += '<label for="law-name-input">Law Name *</label>';
        html += '<input type="text" id="law-name-input" class="form-control" ' +
            'value="' + _escapeHtml(law.name || '') + '" ' +
            'placeholder="e.g., Theft Act 1250">';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label for="law-desc-input">Description</label>';
        html += '<textarea id="law-desc-input" class="form-control" rows="3" ' +
            'placeholder="Detailed description of the law">' +
            _escapeHtml(law.description || '') + '</textarea>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group">';
        html += '<label for="law-category-select">Category</label>';
        html += '<select id="law-category-select" class="form-control">' +
            catOptions + '</select>';
        html += '</div>';
        html += '<div class="form-group">';
        html += '<label for="law-severity-select">Severity</label>';
        html += '<select id="law-severity-select" class="form-control">' +
            sevOptions + '</select>';
        html += '</div>';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label for="law-jurisdiction-input">Jurisdiction</label>';
        html += '<input type="text" id="law-jurisdiction-input" ' +
            'class="form-control" ' +
            'value="' + _escapeHtml(law.jurisdiction || 'Local') + '" ' +
            'placeholder="e.g., Local, Regional, Kingdom-wide">';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label>Punishment</label>';
        html += '<div class="form-row">';
        html += '<div class="form-group" style="flex:1;">';
        html += '<select id="law-punishment-type" class="form-control">' +
            punOptions + '</select>';
        html += '</div>';
        html += '<div class="form-group" style="flex:0 0 120px;">';
        html += '<input type="number" id="law-punishment-amount" ' +
            'class="form-control" min="0" ' +
            'value="' + _escapeNumber(law.punishmentAmount || 0) + '" ' +
            'placeholder="Amount">';
        html += '</div>';
        html += '</div>';
        html += '<textarea id="law-punishment-desc" class="form-control" ' +
            'rows="2" ' +
            'placeholder="Detailed punishment description">' +
            _escapeHtml(law.punishment || '') + '</textarea>';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label for="law-exceptions-input">Exceptions (optional)</label>';
        html += '<textarea id="law-exceptions-input" class="form-control" ' +
            'rows="2" placeholder="Who or what is exempt from this law?">' +
            _escapeHtml(law.exceptions || '') + '</textarea>';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label for="law-notes-input">Notes</label>';
        html += '<textarea id="law-notes-input" class="form-control" ' +
            'rows="2" placeholder="Additional notes">' +
            _escapeHtml(law.notes || '') + '</textarea>';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label class="law-checkbox-label">';
        html += '<input type="checkbox" id="law-active-input" ' +
            (law.isActive !== false ? 'checked' : '') + '> ';
        html += 'Law is active and enforceable';
        html += '</label>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _collectLawFormData(root) {
        var nameEl = root.querySelector('#law-name-input');
        var descEl = root.querySelector('#law-desc-input');
        var categoryEl = root.querySelector('#law-category-select');
        var severityEl = root.querySelector('#law-severity-select');
        var jurisdictionEl = root.querySelector('#law-jurisdiction-input');
        var punishmentTypeEl = root.querySelector('#law-punishment-type');
        var punishmentAmountEl = root.querySelector('#law-punishment-amount');
        var punishmentDescEl = root.querySelector('#law-punishment-desc');
        var exceptionsEl = root.querySelector('#law-exceptions-input');
        var notesEl = root.querySelector('#law-notes-input');
        var activeEl = root.querySelector('#law-active-input');

        if (!nameEl) return null;

        var name = nameEl.value.trim();
        if (!name) return null;

        return {
            name: name,
            description: descEl ? descEl.value.trim() : '',
            category: categoryEl ? categoryEl.value : 'civil',
            severity: severityEl ? severityEl.value : 'medium',
            jurisdiction: jurisdictionEl
                ? (jurisdictionEl.value.trim() || 'Local')
                : 'Local',
            punishmentType: punishmentTypeEl
                ? punishmentTypeEl.value
                : 'fine',
            punishmentAmount: punishmentAmountEl
                ? (parseInt(punishmentAmountEl.value, 10) || 0)
                : 0,
            punishment: punishmentDescEl ? punishmentDescEl.value.trim() : '',
            exceptions: exceptionsEl ? exceptionsEl.value.trim() : '',
            notes: notesEl ? notesEl.value.trim() : '',
            isActive: activeEl ? activeEl.checked === true : true
        };
    }

    // =========================================================================
    // 8. MODALS
    // =========================================================================

    function _openAddLawModal(locationId, onComplete) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        // Pre-flight: if the settlement write path is unavailable, warn
        // loudly and do not open the modal. Better than letting the user
        // type a whole form and then get "Save failed".
        var status = _detectSettlementState();
        if (!status.ok) {
            _showToast(
                'Settlement write path unavailable. ' +
                'Laws cannot be saved on this build. See the ' +
                'integration status panel.',
                'error'
            );
            return;
        }

        _openModal({
            title: 'Create New Law in ' +
                (place.displayName || place.name),
            content: _buildLawFormContent(null),
            confirmText: 'Create Law',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var lawData = _collectLawFormData(root);
                if (!lawData) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var result = _addLaw(locationId, lawData);
                if (!result.success) {
                    _showToast(
                        'Failed to save law: ' +
                        (result.reason || 'unknown'),
                        'error'
                    );
                    return false;
                }

                _showToast(
                    'Law "' + lawData.name + '" created. ' +
                    'It is stored locally but not wired to any other system.',
                    'warning'
                );
                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openEditLawModal(locationId, lawId, onComplete) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var law = _findLaw(locationId, lawId);
        if (!law) {
            _showToast('Law not found', 'error');
            return;
        }

        var status = _detectSettlementState();
        if (!status.ok) {
            _showToast(
                'Settlement write path unavailable. ' +
                'Edits cannot be saved on this build.',
                'error'
            );
            return;
        }

        _openModal({
            title: 'Edit Law: ' + law.name,
            content: _buildLawFormContent(law),
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var lawData = _collectLawFormData(root);
                if (!lawData) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var result = _updateLaw(locationId, lawId, lawData);
                if (!result.success) {
                    _showToast(
                        'Failed to update law: ' +
                        (result.reason || 'unknown'),
                        'error'
                    );
                    return false;
                }

                _showToast('Law updated (local only)', 'info');
                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. MAIN RENDER
    // =========================================================================

    function renderLawsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Civil laws tab container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderLawsTabBody(place);
        container.dataset.locationId = locationId || '';

        if (!container._lawTabBound) {
            container._lawTabBound = true;

            container.addEventListener('click', function(e) {
                var target = e.target.closest('[data-action]');
                if (!target) return;

                var action = target.dataset.action;
                var currentLocationId = container.dataset.locationId;
                var refresh = function() {
                    renderLawsTab(containerId, currentLocationId);
                };

                switch (action) {
                    case 'add-law':
                        if (currentLocationId) {
                            _openAddLawModal(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'refresh-laws':
                        if (currentLocationId) {
                            renderLawsTab(containerId, currentLocationId);
                            _showToast('Laws refreshed', 'info');
                        }
                        break;

                    case 'edit-law':
                        var lawIdEdit = target.dataset.lawId;
                        if (lawIdEdit && currentLocationId) {
                            _openEditLawModal(
                                currentLocationId, lawIdEdit, refresh
                            );
                        }
                        break;

                    case 'delete-law':
                        var lawIdDel = target.dataset.lawId;
                        if (lawIdDel && currentLocationId) {
                            var law = _findLaw(currentLocationId, lawIdDel);
                            if (!law) break;
                            _confirmDialog(
                                'Delete the law "' + law.name + '"? ' +
                                'This cannot be undone.',
                                'Delete Law',
                                function() {
                                    var result = _deleteLaw(
                                        currentLocationId, lawIdDel
                                    );
                                    if (!result.success) {
                                        _showToast(
                                            'Failed to delete law: ' +
                                            (result.reason || 'unknown'),
                                            'error'
                                        );
                                        return;
                                    }
                                    _showToast('Law deleted (local only)', 'info');
                                    refresh();
                                }
                            );
                        }
                        break;
                }
            });

            // Toggle for inactive laws
            container.addEventListener('click', function(e) {
                var toggle = e.target.closest('[data-toggle="inactive-laws"]');
                if (!toggle) return;
                var body = toggle.nextElementSibling;
                if (!body) return;
                var isHidden = body.style.display === 'none';
                body.style.display = isHidden ? 'block' : 'none';
                var icon = toggle.querySelector('.law-toggle-icon');
                if (icon) {
                    icon.innerHTML = isHidden
                        ? _getIcon('TRIANGLE_DOWN')
                        : _getIcon('TRIANGLE_RIGHT');
                }
            });
        }
    }

    function refreshLawsTab(locationId, containerId) {
        var id = containerId || 'laws-tab';
        var container = document.getElementById(id);
        if (!container) {
            // Fallback — search by class on the page. Warning: this
            // returns the first match; if two civil-laws tabs are on the
            // page, pass the id to disambiguate.
            var candidates = document.querySelectorAll(
                '.law-tab-container, #laws-tab'
            );
            if (candidates.length === 0) return;
            container = candidates[0];
            id = container.id || id;
        }
        renderLawsTab(id, locationId);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.LawsTab = {
        render: renderLawsTab,
        refresh: refreshLawsTab,
        getLaws: function(locationId) {
            var r = _readLaws(locationId);
            return r.ok ? r.laws : [];
        },
        addLaw: _addLaw,
        updateLaw: _updateLaw,
        deleteLaw: _deleteLaw,
        getLawById: _findLaw,
        getIntegrationStatus: _getIntegrationStatus,
        PUNISHMENT_TYPES: PUNISHMENT_TYPES,
        LAW_CATEGORIES: LAW_CATEGORIES,
        SEVERITY_LEVELS: SEVERITY_LEVELS,
        _renderLawItem: _renderLawItem,
        _openAddLawModal: _openAddLawModal,
        _openEditLawModal: _openEditLawModal
    };

    window.renderLawsTab = renderLawsTab;
    window.refreshLawsTab = refreshLawsTab;

})();
