
/**
 * =============================================================================
 * CIVIL LAWS TAB (js/tabs/government-civil-laws-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Provides a modular tab for viewing and managing civil laws,
 *          legal codes, punishments, and legal precedents for a location.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getCharacters)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#039;';
            return m;
        });
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') return window.getIcon(name);
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return true;
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' && 
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        return null;
    }

    // =========================================================================
    // 2. LAW DATA MANAGEMENT
    // =========================================================================

    function _getLawsForLocation(locationId) {
        var data = _getSettlementData(locationId);
        if (!data) return [];
        return data.civilLaws || [];
    }

    function _saveLawsForLocation(locationId, laws) {
        var updates = { civilLaws: laws };
        return _updateSettlementData(locationId, updates);
    }

    function _getLawById(locationId, lawId) {
        var laws = _getLawsForLocation(locationId);
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].id === lawId) {
                return laws[i];
            }
        }
        return null;
    }

    function _addLaw(locationId, lawData) {
        var laws = _getLawsForLocation(locationId);
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
        _saveLawsForLocation(locationId, laws);
        return newLaw;
    }

    function _updateLaw(locationId, lawId, updates) {
        var laws = _getLawsForLocation(locationId);
        var found = false;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].id === lawId) {
                if (updates.name) laws[i].name = updates.name.trim();
                if (updates.description !== undefined) laws[i].description = updates.description;
                if (updates.category) laws[i].category = updates.category;
                if (updates.severity) laws[i].severity = updates.severity;
                if (updates.punishment !== undefined) laws[i].punishment = updates.punishment;
                if (updates.punishmentType) laws[i].punishmentType = updates.punishmentType;
                if (updates.punishmentAmount !== undefined) laws[i].punishmentAmount = updates.punishmentAmount;
                if (updates.isActive !== undefined) laws[i].isActive = updates.isActive;
                if (updates.jurisdiction) laws[i].jurisdiction = updates.jurisdiction;
                if (updates.exceptions !== undefined) laws[i].exceptions = updates.exceptions;
                if (updates.notes !== undefined) laws[i].notes = updates.notes;
                laws[i].amendedYear = _getCurrentYear();
                found = true;
                break;
            }
        }
        if (!found) return null;
        _saveLawsForLocation(locationId, laws);
        return _getLawById(locationId, lawId);
    }

    function _deleteLaw(locationId, lawId) {
        var laws = _getLawsForLocation(locationId);
        var newLaws = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].id !== lawId) {
                newLaws.push(laws[i]);
            }
        }
        _saveLawsForLocation(locationId, newLaws);
        return true;
    }

    // =========================================================================
    // 3. PUNISHMENT TYPE OPTIONS
    // =========================================================================

    var PUNISHMENT_TYPES = {
        fine: { label: 'Fine', icon: 'COIN' },
        imprisonment: { label: 'Imprisonment', icon: 'LOCK' },
        exile: { label: 'Exile', icon: 'FLAG' },
        execution: { label: 'Execution', icon: 'SWORD' },
        mutilation: { label: 'Mutilation', icon: 'WARNING' },
        flogging: { label: 'Flogging', icon: 'WARNING' },
        publicShaming: { label: 'Public Shaming', icon: 'WARNING' },
        communityService: { label: 'Community Service', icon: 'PERSON' },
        compensation: { label: 'Compensation', icon: 'COIN' },
        demotion: { label: 'Demotion', icon: 'CROWN_DOWN' },
        warning: { label: 'Warning', icon: 'WARNING' },
        houseArrest: { label: 'House Arrest', icon: 'HOME' },
        slavery: { label: 'Enslavement', icon: 'LOCK' }
    };

    var LAW_CATEGORIES = {
        civil: { label: 'Civil', icon: 'SCALE' },
        criminal: { label: 'Criminal', icon: 'SWORD' },
        commercial: { label: 'Commercial', icon: 'COIN' },
        property: { label: 'Property', icon: 'HOME' },
        family: { label: 'Family', icon: 'HEART' },
        religious: { label: 'Religious', icon: 'STAR' },
        administrative: { label: 'Administrative', icon: 'GEAR' },
        constitutional: { label: 'Constitutional', icon: 'CROWN' },
        military: { label: 'Military', icon: 'SHIELD' },
        labor: { label: 'Labor', icon: 'PERSON' }
    };

    var SEVERITY_LEVELS = {
        minor: { label: 'Minor', color: '#5cb85c' },
        medium: { label: 'Medium', color: '#f0ad4e' },
        major: { label: 'Major', color: '#d9534f' },
        severe: { label: 'Severe', color: '#c9302c' },
        capital: { label: 'Capital', color: '#8b0000' }
    };

    // =========================================================================
    // 4. RENDER FUNCTIONS
    // =========================================================================

    function _renderLawItem(law, locationId) {
        var severity = SEVERITY_LEVELS[law.severity] || SEVERITY_LEVELS.medium;
        var category = LAW_CATEGORIES[law.category] || LAW_CATEGORIES.civil;
        var punishment = PUNISHMENT_TYPES[law.punishmentType] || PUNISHMENT_TYPES.fine;
        var punishmentIcon = _getIcon(punishment.icon) || '';
        var categoryIcon = _getIcon(category.icon) || '';
        var statusColor = law.isActive ? '#28a745' : '#dc3545';
        var statusLabel = law.isActive ? 'Active' : 'Inactive';

        var html = '<div class="law-item" data-law-id="' + _escapeHtml(law.id) + '">';
        
        // Law header
        html += '<div class="law-header">';
        html += '<div class="law-title">';
        html += '<span class="law-name">' + _escapeHtml(law.name) + '</span>';
        html += '<span class="law-status" style="color:' + statusColor + ';">● ' + statusLabel + '</span>';
        html += '</div>';
        html += '<div class="law-actions">';
        html += '<button class="law-btn law-btn-edit" data-action="edit-law" data-law-id="' + _escapeHtml(law.id) + '">' + _getIcon('EDIT') + '</button>';
        html += '<button class="law-btn law-btn-delete" data-action="delete-law" data-law-id="' + _escapeHtml(law.id) + '">' + _getIcon('TRASH') + '</button>';
        html += '</div>';
        html += '</div>';

        // Law details
        html += '<div class="law-details">';
        html += '<div class="law-meta">';
        html += '<span class="law-category">' + categoryIcon + ' ' + category.label + '</span>';
        html += '<span class="law-severity" style="color:' + severity.color + ';">' + severity.label + '</span>';
        html += '<span class="law-jurisdiction">' + _escapeHtml(law.jurisdiction || 'Local') + '</span>';
        html += '</div>';

        if (law.description) {
            html += '<div class="law-description">' + _escapeHtml(law.description) + '</div>';
        }

        // Punishment
        html += '<div class="law-punishment">';
        html += '<span class="law-punishment-label">Punishment:</span>';
        html += '<span class="law-punishment-type">' + punishmentIcon + ' ' + punishment.label + '</span>';
        if (law.punishmentAmount > 0) {
            html += '<span class="law-punishment-amount">' + law.punishmentAmount.toLocaleString() + ' gold</span>';
        }
        if (law.punishment) {
            html += '<span class="law-punishment-desc">' + _escapeHtml(law.punishment) + '</span>';
        }
        html += '</div>';

        // Exceptions
        if (law.exceptions) {
            html += '<div class="law-exceptions">';
            html += '<span class="law-exceptions-label">Exceptions:</span>';
            html += '<span class="law-exceptions-text">' + _escapeHtml(law.exceptions) + '</span>';
            html += '</div>';
        }

        // Notes
        if (law.notes) {
            html += '<div class="law-notes">' + _escapeHtml(law.notes) + '</div>';
        }

        // Meta info
        html += '<div class="law-meta-info">';
        html += '<span>Enacted: ' + (law.enactedYear || 'Unknown') + '</span>';
        if (law.amendedYear) {
            html += ' <span>Amended: ' + law.amendedYear + '</span>';
        }
        html += '</div>';

        html += '</div>'; // end law-details
        html += '</div>'; // end law-item

        return html;
    }

    function _renderLawsTab(place) {
        if (!place) {
            return '<div class="law-details-empty">Select a location to view civil laws.</div>';
        }

        var laws = _getLawsForLocation(place.id);
        var activeLaws = laws.filter(function(l) { return l.isActive; });
        var inactiveLaws = laws.filter(function(l) { return !l.isActive; });

        // Calculate stats
        var stats = {
            total: laws.length,
            active: activeLaws.length,
            inactive: inactiveLaws.length,
            byCategory: {},
            bySeverity: {}
        };

        for (var i = 0; i < laws.length; i++) {
            var cat = laws[i].category || 'civil';
            stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
            var sev = laws[i].severity || 'medium';
            stats.bySeverity[sev] = (stats.bySeverity[sev] || 0) + 1;
        }

        var html = '<div class="law-tab-container">';
        
        // Header
        html += '<div class="law-tab-header">';
        html += '<h3>Civil Laws - ' + _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="law-tab-actions">';
        html += '<button class="law-btn law-btn-add" data-action="add-law">' + _getIcon('PLUS') + ' Add Law</button>';
        html += '<button class="law-btn law-btn-refresh" data-action="refresh-laws">' + _getIcon('REFRESH') + ' Refresh</button>';
        html += '</div>';
        html += '</div>';

        // Stats summary
        html += '<div class="law-stats-summary">';
        html += '<div class="law-stat"><span class="law-stat-label">Total Laws</span><span class="law-stat-value">' + stats.total + '</span></div>';
        html += '<div class="law-stat"><span class="law-stat-label">Active</span><span class="law-stat-value" style="color:#28a745;">' + stats.active + '</span></div>';
        html += '<div class="law-stat"><span class="law-stat-label">Inactive</span><span class="law-stat-value" style="color:#dc3545;">' + stats.inactive + '</span></div>';
        html += '</div>';

        // Category breakdown
        if (Object.keys(stats.byCategory).length > 0) {
            html += '<div class="law-category-breakdown">';
            for (var catKey in stats.byCategory) {
                var cat = LAW_CATEGORIES[catKey] || { label: catKey };
                html += '<span class="law-category-tag">' + cat.label + ': ' + stats.byCategory[catKey] + '</span>';
            }
            html += '</div>';
        }

        // Laws list
        if (laws.length === 0) {
            html += '<div class="law-empty">';
            html += '<p>No civil laws established for this location.</p>';
            html += '<button class="law-btn law-btn-add" data-action="add-law">' + _getIcon('PLUS') + ' Create First Law</button>';
            html += '</div>';
        } else {
            // Active laws
            if (activeLaws.length > 0) {
                html += '<div class="law-section">';
                html += '<div class="law-section-header">Active Laws</div>';
                html += '<div class="law-list">';
                for (var a = 0; a < activeLaws.length; a++) {
                    html += _renderLawItem(activeLaws[a], place.id);
                }
                html += '</div>';
                html += '</div>';
            }

            // Inactive laws (collapsed by default)
            if (inactiveLaws.length > 0) {
                html += '<div class="law-section law-section-inactive">';
                html += '<div class="law-section-header law-section-toggle" data-toggle="inactive-laws">';
                html += '<span>Inactive Laws (' + inactiveLaws.length + ')</span>';
                html += '<span class="law-toggle-icon">' + _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="law-section-body" style="display:none;">';
                html += '<div class="law-list">';
                for (var i = 0; i < inactiveLaws.length; i++) {
                    html += _renderLawItem(inactiveLaws[i], place.id);
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 5. MODALS
    // =========================================================================

    function _openAddLawModal(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var content = _buildLawFormContent(null);

        _openModal({
            title: 'Create New Law in ' + (place.displayName || place.name),
            content: content,
            confirmText: 'Create Law',
            cancelText: 'Cancel',
            onConfirm: function() {
                var lawData = _collectLawFormData();
                if (!lawData) return;
                
                var result = _addLaw(locationId, lawData);
                if (result) {
                    _showToast('Law "' + lawData.name + '" created', 'success');
                    refreshLawsTab(locationId);
                }
            }
        });
    }

    function _openEditLawModal(locationId, lawId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var law = _getLawById(locationId, lawId);
        if (!law) {
            _showToast('Law not found', 'error');
            return;
        }

        var content = _buildLawFormContent(law);

        _openModal({
            title: 'Edit Law: ' + law.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var lawData = _collectLawFormData();
                if (!lawData) return;
                
                var result = _updateLaw(locationId, lawId, lawData);
                if (result) {
                    _showToast('Law updated', 'success');
                    refreshLawsTab(locationId);
                }
            }
        });
    }

    function _buildLawFormContent(existingLaw) {
        var law = existingLaw || {};
        var isEdit = !!existingLaw;

        var html = '<div class="law-edit-form">';

        // Name
        html += '<div class="form-group">';
        html += '<label for="law-name-input">Law Name *</label>';
        html += '<input type="text" id="law-name-input" class="form-control" value="' + _escapeHtml(law.name || '') + '" placeholder="e.g., Theft Act 1250">';
        html += '</div>';

        // Description
        html += '<div class="form-group">';
        html += '<label for="law-desc-input">Description</label>';
        html += '<textarea id="law-desc-input" class="form-control" rows="3" placeholder="Detailed description of the law">' + _escapeHtml(law.description || '') + '</textarea>';
        html += '</div>';

        // Category and Severity
        html += '<div class="form-row">';
        html += '<div class="form-group">';
        html += '<label for="law-category-select">Category</label>';
        html += '<select id="law-category-select" class="form-control">';
        for (var catKey in LAW_CATEGORIES) {
            var cat = LAW_CATEGORIES[catKey];
            var selected = (catKey === (law.category || 'civil')) ? ' selected' : '';
            html += '<option value="' + catKey + '"' + selected + '>' + cat.label + '</option>';
        }
        html += '</select>';
        html += '</div>';

        html += '<div class="form-group">';
        html += '<label for="law-severity-select">Severity</label>';
        html += '<select id="law-severity-select" class="form-control">';
        for (var sevKey in SEVERITY_LEVELS) {
            var sev = SEVERITY_LEVELS[sevKey];
            var selected = (sevKey === (law.severity || 'medium')) ? ' selected' : '';
            html += '<option value="' + sevKey + '"' + selected + '>' + sev.label + '</option>';
        }
        html += '</select>';
        html += '</div>';
        html += '</div>';

        // Jurisdiction
        html += '<div class="form-group">';
        html += '<label for="law-jurisdiction-input">Jurisdiction</label>';
        html += '<input type="text" id="law-jurisdiction-input" class="form-control" value="' + _escapeHtml(law.jurisdiction || 'Local') + '" placeholder="e.g., Local, Regional, Kingdom-wide">';
        html += '</div>';

        // Punishment
        html += '<div class="form-group">';
        html += '<label>Punishment</label>';
        html += '<div class="form-row">';
        html += '<div class="form-group" style="flex:1;">';
        html += '<select id="law-punishment-type" class="form-control">';
        for (var punKey in PUNISHMENT_TYPES) {
            var pun = PUNISHMENT_TYPES[punKey];
            var selected = (punKey === (law.punishmentType || 'fine')) ? ' selected' : '';
            html += '<option value="' + punKey + '"' + selected + '>' + pun.label + '</option>';
        }
        html += '</select>';
        html += '</div>';
        html += '<div class="form-group" style="flex:0 0 120px;">';
        html += '<input type="number" id="law-punishment-amount" class="form-control" min="0" value="' + (law.punishmentAmount || 0) + '" placeholder="Amount">';
        html += '</div>';
        html += '</div>';
        html += '<textarea id="law-punishment-desc" class="form-control" rows="2" placeholder="Detailed punishment description">' + _escapeHtml(law.punishment || '') + '</textarea>';
        html += '</div>';

        // Exceptions
        html += '<div class="form-group">';
        html += '<label for="law-exceptions-input">Exceptions (optional)</label>';
        html += '<textarea id="law-exceptions-input" class="form-control" rows="2" placeholder="Who or what is exempt from this law?">' + _escapeHtml(law.exceptions || '') + '</textarea>';
        html += '</div>';

        // Notes
        html += '<div class="form-group">';
        html += '<label for="law-notes-input">Notes</label>';
        html += '<textarea id="law-notes-input" class="form-control" rows="2" placeholder="Additional notes">' + _escapeHtml(law.notes || '') + '</textarea>';
        html += '</div>';

        // Active status
        html += '<div class="form-group">';
        html += '<label class="law-checkbox-label">';
        html += '<input type="checkbox" id="law-active-input" ' + (law.isActive !== false ? 'checked' : '') + '> ';
        html += 'Law is active and enforceable';
        html += '</label>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _collectLawFormData() {
        var nameInput = document.getElementById('law-name-input');
        var descInput = document.getElementById('law-desc-input');
        var categorySelect = document.getElementById('law-category-select');
        var severitySelect = document.getElementById('law-severity-select');
        var jurisdictionInput = document.getElementById('law-jurisdiction-input');
        var punishmentType = document.getElementById('law-punishment-type');
        var punishmentAmount = document.getElementById('law-punishment-amount');
        var punishmentDesc = document.getElementById('law-punishment-desc');
        var exceptionsInput = document.getElementById('law-exceptions-input');
        var notesInput = document.getElementById('law-notes-input');
        var activeCheck = document.getElementById('law-active-input');

        var name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
            _showToast('Law name is required', 'error');
            return null;
        }

        return {
            name: name,
            description: descInput ? descInput.value.trim() : '',
            category: categorySelect ? categorySelect.value : 'civil',
            severity: severitySelect ? severitySelect.value : 'medium',
            jurisdiction: jurisdictionInput ? jurisdictionInput.value.trim() || 'Local' : 'Local',
            punishmentType: punishmentType ? punishmentType.value : 'fine',
            punishmentAmount: punishmentAmount ? parseInt(punishmentAmount.value) || 0 : 0,
            punishment: punishmentDesc ? punishmentDesc.value.trim() : '',
            exceptions: exceptionsInput ? exceptionsInput.value.trim() : '',
            notes: notesInput ? notesInput.value.trim() : '',
            isActive: activeCheck ? activeCheck.checked : true
        };
    }

    // =========================================================================
    // 6. MAIN EXPORTED FUNCTIONS
    // =========================================================================

    /**
     * Renders the civil laws tab for a specific location
     * @param {string} containerId - The ID of the container element
     * @param {string} locationId - The ID of the location to display
     */
    function renderLawsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Civil laws tab container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderLawsTab(place);
        container.dataset.locationId = locationId || '';

        // Set up event listeners
        var addBtn = container.querySelector('[data-action="add-law"]');
        if (addBtn) {
            addBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    _openAddLawModal(currentLocationId);
                } else {
                    _showToast('No location selected', 'warning');
                }
            });
        }

        var refreshBtn = container.querySelector('[data-action="refresh-laws"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    renderLawsTab(containerId, currentLocationId);
                    _showToast('Laws refreshed', 'info');
                }
            });
        }

        // Inactive laws toggle
        var toggle = container.querySelector('.law-section-toggle');
        if (toggle) {
            toggle.addEventListener('click', function() {
                var body = this.nextElementSibling;
                if (body) {
                    var isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'block' : 'none';
                    var icon = this.querySelector('.law-toggle-icon');
                    if (icon) {
                        icon.innerHTML = isHidden ? _getIcon('TRIANGLE_DOWN') : _getIcon('TRIANGLE_RIGHT');
                    }
                }
            });
        }

        // Law action buttons (delegated)
        container.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.dataset.action;
            var currentLocationId = container.dataset.locationId;
            var lawId = target.dataset.lawId;

            switch (action) {
                case 'add-law':
                    if (currentLocationId) _openAddLawModal(currentLocationId);
                    break;

                case 'refresh-laws':
                    if (currentLocationId) {
                        renderLawsTab(containerId, currentLocationId);
                        _showToast('Laws refreshed', 'info');
                    }
                    break;

                case 'edit-law':
                    if (lawId && currentLocationId) {
                        _openEditLawModal(currentLocationId, lawId);
                    }
                    break;

                case 'delete-law':
                    if (lawId && currentLocationId) {
                        var law = _getLawById(currentLocationId, lawId);
                        if (law) {
                            _confirmDialog(
                                'Are you sure you want to delete the law "' + law.name + '"? This action cannot be undone.',
                                'Delete Law',
                                function() {
                                    _deleteLaw(currentLocationId, lawId);
                                    _showToast('Law deleted', 'info');
                                    renderLawsTab(containerId, currentLocationId);
                                }
                            );
                        }
                    }
                    break;
            }
        });
    }

    /**
     * Refreshes the civil laws tab
     * @param {string} locationId - The ID of the location to display
     */
    function refreshLawsTab(locationId) {
        var container = document.querySelector('.law-tab-container');
        if (!container) {
            var containers = document.querySelectorAll('.law-tab-container, #laws-tab');
            if (containers.length > 0) {
                container = containers[0];
            }
        }
        if (container) {
            renderLawsTab(container.id || 'laws-tab', locationId);
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.LawsTab = {
        render: renderLawsTab,
        refresh: refreshLawsTab,
        getLaws: _getLawsForLocation,
        addLaw: _addLaw,
        updateLaw: _updateLaw,
        deleteLaw: _deleteLaw,
        getLawById: _getLawById,
        PUNISHMENT_TYPES: PUNISHMENT_TYPES,
        LAW_CATEGORIES: LAW_CATEGORIES,
        SEVERITY_LEVELS: SEVERITY_LEVELS,
        _renderLawItem: _renderLawItem,
        _openAddLawModal: _openAddLawModal,
        _openEditLawModal: _openEditLawModal
    };

    // Legacy aliases
    window.renderLawsTab = renderLawsTab;
    window.refreshLawsTab = refreshLawsTab;

})();