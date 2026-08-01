/**
 * =============================================================================
 * STILL WATERS - CULTURE MODALS (js/culture/modals-culture.js)
 * =============================================================================
 * 
 * UI modals for culture management (CRUD, mythology, appearance).
 * 
 * FIXES:
 *   - Create culture modal uses icon dropdown from icons.js
 *   - Edit culture modal properly loads and saves
 *   - Culture details modal shows all data
 *   - Save properly closes modal
 *   - Fixed: Edit modal doesn't conflict with CultureEditorTabs
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. ICON HELPERS
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconDropdown(selectedIcon, placeholder) {
        if (typeof window.getIconDropdown === 'function') {
            return window.getIconDropdown(selectedIcon, placeholder);
        }

        // Fallback: build icon dropdown manually
        if (!window.Icons) {
            return '<input type="text" id="cultureIcon" value="✦" placeholder="Icon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">';
        }

        var iconNames = Object.keys(window.Icons);
        var html = '';
        
        if (placeholder) {
            html += '<option value="">' + _escapeHtml(placeholder) + '</option>';
        }

        // Common icons first
        var commonIcons = ['LOCATION', 'HOME', 'PERSON', 'CROWN', 'STAR_4', 'STAR', 'SHIELD',
            'FLAG', 'GEAR', 'BOOK', 'SWORD', 'KEY', 'LOCK', 'CIRCLE',
            'SQUARE', 'DIAMOND', 'PLUS', 'MINUS', 'SEARCH', 'EDIT', 'HEART'];

        var shown = {};
        for (var i = 0; i < commonIcons.length; i++) {
            var name = commonIcons[i];
            if (window.Icons[name] && !shown[name]) {
                shown[name] = true;
                var selected = (selectedIcon === name) ? 'selected' : '';
                var iconPreview = window.Icons[name];
                html += '<option value="' + name + '" ' + selected + '>' +
                    iconPreview + ' ' + name + '</option>';
            }
        }

        // All other icons
        for (var i = 0; i < iconNames.length; i++) {
            var name = iconNames[i];
            if (!shown[name] && window.Icons[name]) {
                var selected = (selectedIcon === name) ? 'selected' : '';
                var iconPreview = window.Icons[name];
                html += '<option value="' + name + '" ' + selected + '>' +
                    iconPreview + ' ' + name + '</option>';
            }
        }

        return html;
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _getCommands() {
        return typeof window.CultureCommands !== 'undefined' ? window.CultureCommands : null;
    }

    function _getQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getReligions() {
        if (typeof window.ReligionState !== 'undefined' && 
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions();
        }
        return [];
    }

    // =========================================================================
    // 3. CREATE CULTURE MODAL - WITH ICON DROPDOWN
    // =========================================================================

    function openCreateCultureModal(onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var commands = _getCommands();
            if (!commands) {
                _showToast('Culture system not available', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var iconDropdownHtml = _getIconDropdown('', 'Select an icon...');

            var modalContent = 
                '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;color:var(--dim);">' +
                'Create a new culture with appearance templates and mythology.' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name *</label>' +
                '<input type="text" id="cultureName" placeholder="e.g., Nordic, Mediterranean" autofocus style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Display Name</label>' +
                '<input type="text" id="cultureDisplayName" placeholder="e.g., Nordic Peoples" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon</label>' +
                '<select id="cultureIcon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                iconDropdownHtml +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                '<textarea id="cultureDescription" rows="2" placeholder="Describe this culture..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +

                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                infoIcon + ' You can add appearance options and mythology after creation.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Culture',
                content: modalContent,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('cultureName').value.trim();
                    var displayName = document.getElementById('cultureDisplayName').value.trim();
                    var iconSelect = document.getElementById('cultureIcon');
                    var icon = iconSelect ? iconSelect.value : '✦';
                    var description = document.getElementById('cultureDescription').value.trim();

                    if (!name) {
                        _showToast('Culture name is required', 'error');
                        return false;
                    }

                    var result = commands.createCulture({
                        name: name,
                        displayName: displayName || name,
                        icon: icon,
                        description: description,
                        notes: 'Created manually'
                    });

                    if (result && result.success) {
                        _showToast('Created culture: ' + name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to create culture: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 4. EDIT CULTURE MODAL - SIMPLE VERSION (NO CULTUREEDITORTABS CONFLICT)
    // =========================================================================

    function openEditCultureModal(cultureId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var state = _getState();
            var commands = _getCommands();

            if (!state || !commands) {
                _showToast('Culture system not available', 'error');
                return;
            }

            var culture = state.getCulture(cultureId);
            if (!culture) {
                _showToast('Culture not found', 'error');
                return;
            }

            // Use the new CultureEditorTabs system if available - but handle properly
            if (typeof window.openCultureEditor === 'function') {
                // Close the current modal first, then open the editor
                _closeTopModal();
                // Reset the flag so the editor can open
                _openingModal = false;
                window.openCultureEditor(cultureId, {
                    title: 'Edit Culture: ' + (culture.displayName || culture.name),
                    onSave: function(updated) {
                        if (onSuccess) onSuccess(updated);
                    }
                });
                return;
            }

            // Fallback: legacy edit modal (kept for compatibility)
            var allPlaces = _getPlaces();
            var allReligions = _getReligions();

            // Build location options with multiple select
            var locationOptions = '';
            for (var i = 0; i < allPlaces.length; i++) {
                var selected = culture.locations && culture.locations.indexOf(allPlaces[i].id) !== -1 ? 'selected' : '';
                locationOptions += '<option value="' + allPlaces[i].id + '" ' + selected + '>' + 
                    _escapeHtml(allPlaces[i].displayName) + '</option>';
            }

            // Build religion options with multiple select
            var religionOptions = '';
            for (var i = 0; i < allReligions.length; i++) {
                var selected = culture.religions && culture.religions.indexOf(allReligions[i].id) !== -1 ? 'selected' : '';
                religionOptions += '<option value="' + allReligions[i].id + '" ' + selected + '>' + 
                    _escapeHtml(allReligions[i].displayName || allReligions[i].name) + '</option>';
            }

            // Build icon dropdown
            var iconDropdownHtml = _getIconDropdown(culture.icon || 'STAR_4', 'Select an icon...');

            var modalContent = 
                '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;">' +
                '<strong>' + _escapeHtml(culture.displayName || culture.name) + '</strong>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name *</label>' +
                '<input type="text" id="editCultureName" value="' + _escapeHtml(culture.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Display Name</label>' +
                '<input type="text" id="editCultureDisplayName" value="' + _escapeHtml(culture.displayName || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon</label>' +
                '<select id="editCultureIcon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                iconDropdownHtml +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                '<textarea id="editCultureDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' + _escapeHtml(culture.description || '') + '</textarea>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Associated Locations</label>' +
                '<select id="editCultureLocations" multiple style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-height:60px;">' +
                locationOptions +
                '</select>' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Hold Ctrl/Cmd to select multiple</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Associated Religions</label>' +
                '<select id="editCultureReligions" multiple style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-height:60px;">' +
                religionOptions +
                '</select>' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Hold Ctrl/Cmd to select multiple</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="editCultureNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' + _escapeHtml(culture.notes || '') + '</textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Culture: ' + (culture.displayName || culture.name),
                content: modalContent,
                confirmText: 'Save',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editCultureName').value.trim();
                    var displayName = document.getElementById('editCultureDisplayName').value.trim();
                    var iconSelect = document.getElementById('editCultureIcon');
                    var icon = iconSelect ? iconSelect.value : '✦';
                    var description = document.getElementById('editCultureDescription').value.trim();
                    var notes = document.getElementById('editCultureNotes').value.trim();

                    // Get selected locations
                    var locationSelect = document.getElementById('editCultureLocations');
                    var locations = [];
                    for (var i = 0; i < locationSelect.options.length; i++) {
                        if (locationSelect.options[i].selected && locationSelect.options[i].value) {
                            locations.push(locationSelect.options[i].value);
                        }
                    }

                    // Get selected religions
                    var religionSelect = document.getElementById('editCultureReligions');
                    var religions = [];
                    for (var i = 0; i < religionSelect.options.length; i++) {
                        if (religionSelect.options[i].selected && religionSelect.options[i].value) {
                            religions.push(religionSelect.options[i].value);
                        }
                    }

                    if (!name) {
                        _showToast('Culture name is required', 'error');
                        return false;
                    }

                    var result = commands.updateCulture(cultureId, {
                        name: name,
                        displayName: displayName || name,
                        icon: icon,
                        description: description,
                        locations: locations,
                        religions: religions,
                        notes: notes
                    });

                    if (result && result.success) {
                        _showToast('Culture updated', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to update culture: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. DELETE CULTURE MODAL
    // =========================================================================

    function openDeleteCultureModal(cultureId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var state = _getState();
            var commands = _getCommands();

            if (!state || !commands) {
                _showToast('Culture system not available', 'error');
                return;
            }

            var culture = state.getCulture(cultureId);
            if (!culture) {
                _showToast('Culture not found', 'error');
                return;
            }

            if (typeof window.confirmDialog === 'function') {
                window.confirmDialog(
                    'Delete "' + (culture.displayName || culture.name) + '" permanently?',
                    'Delete Culture',
                    function() {
                        var result = commands.deleteCulture(cultureId);
                        if (result && result.success) {
                            _showToast('Deleted: ' + (culture.displayName || culture.name), 'info');
                            _closeTopModal();
                            if (onSuccess) onSuccess();
                        } else {
                            _showToast('Failed to delete culture: ' + (result ? result.reason : 'Unknown error'), 'error');
                        }
                    }
                );
            } else {
                if (confirm('Delete "' + (culture.displayName || culture.name) + '" permanently?')) {
                    var result = commands.deleteCulture(cultureId);
                    if (result && result.success) {
                        _showToast('Deleted: ' + (culture.displayName || culture.name), 'info');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete culture: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                }
            }

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. CULTURE DETAILS MODAL
    // =========================================================================

    function openCultureDetailsModal(cultureId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var state = _getState();
            var queries = _getQueries();

            if (!state || !queries) {
                _showToast('Culture system not available', 'error');
                return;
            }

            var culture = state.getCulture(cultureId);
            if (!culture) {
                _showToast('Culture not found', 'error');
                return;
            }

            var summary = queries.getCultureSummary(cultureId);
            if (!summary) {
                _showToast('Could not get culture summary', 'error');
                return;
            }

            var icon = culture.icon || '✦';

            var locationList = '';
            if (culture.locations && culture.locations.length > 0) {
                var names = [];
                for (var i = 0; i < culture.locations.length; i++) {
                    var place = typeof window.getPlaceById === 'function' ? 
                        window.getPlaceById(culture.locations[i]) : null;
                    names.push(place ? place.displayName : culture.locations[i]);
                }
                locationList = names.map(function(n) { return '<div style="font-size:0.6rem;padding:2px 0;">• ' + _escapeHtml(n) + '</div>'; }).join('');
            } else {
                locationList = '<div style="font-size:0.6rem;color:var(--dim);">No locations associated</div>';
            }

            var religionList = '';
            if (culture.religions && culture.religions.length > 0) {
                var names = [];
                for (var i = 0; i < culture.religions.length; i++) {
                    var religion = typeof window.ReligionState !== 'undefined' && 
                        typeof window.ReligionState.getReligion === 'function' ?
                        window.ReligionState.getReligion(culture.religions[i]) : null;
                    names.push(religion ? (religion.displayName || religion.name) : culture.religions[i]);
                }
                religionList = names.map(function(n) { return '<div style="font-size:0.6rem;padding:2px 0;">• ' + _escapeHtml(n) + '</div>'; }).join('');
            } else {
                religionList = '<div style="font-size:0.6rem;color:var(--dim);">No religions associated</div>';
            }

            var appearanceHtml = '';
            if (culture.appearance) {
                var categories = [];
                for (var key in culture.appearance) {
                    if (culture.appearance.hasOwnProperty(key) && Array.isArray(culture.appearance[key])) {
                        var options = culture.appearance[key];
                        var preview = options.slice(0, 5).map(function(o) { 
                            return o.value + ' (' + o.weight + ')'; 
                        }).join(', ');
                        if (options.length > 5) {
                            preview += ', +' + (options.length - 5) + ' more';
                        }
                        categories.push('<div style="font-size:0.55rem;"><span style="color:var(--dim);">' + 
                            _escapeHtml(key) + ':</span> ' + _escapeHtml(preview) + '</div>');
                    }
                }
                if (categories.length > 0) {
                    appearanceHtml = '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px;">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Appearance</div>' +
                        categories.join('') +
                        '</div>';
                }
            }

            var mythologyHtml = '';
            if (culture.mythology) {
                var parts = [];
                if (culture.mythology.creation) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Creation:</span> ' + _escapeHtml(culture.mythology.creation) + '</div>');
                }
                if (culture.mythology.afterlife) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Afterlife:</span> ' + _escapeHtml(culture.mythology.afterlife) + '</div>');
                }
                if (culture.mythology.cosmology) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Cosmology:</span> ' + _escapeHtml(culture.mythology.cosmology) + '</div>');
                }
                if (culture.mythology.keyDeities && culture.mythology.keyDeities.length > 0) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Deities:</span> ' + 
                        _escapeHtml(culture.mythology.keyDeities.join(', ')) + '</div>');
                }
                if (culture.mythology.keyEvents && culture.mythology.keyEvents.length > 0) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Key Events:</span> ' + 
                        _escapeHtml(culture.mythology.keyEvents.join(', ')) + '</div>');
                }
                if (culture.mythology.symbols && culture.mythology.symbols.length > 0) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Symbols:</span> ' + 
                        _escapeHtml(culture.mythology.symbols.join(', ')) + '</div>');
                }
                if (culture.mythology.themes && culture.mythology.themes.length > 0) {
                    parts.push('<div style="font-size:0.6rem;"><span style="color:var(--dim);">Themes:</span> ' + 
                        _escapeHtml(culture.mythology.themes.join(', ')) + '</div>');
                }
                if (parts.length > 0) {
                    mythologyHtml = '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px;">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Mythology</div>' +
                        parts.join('') +
                        '</div>';
                }
            }

            var modalContent = 
                '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.6rem;color:var(--dim);">Culture</div>' +
                '<div style="font-size:0.9rem;font-weight:bold;">' + icon + ' ' + _escapeHtml(culture.displayName || culture.name) + '</div>' +
                (culture.description ? '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(culture.description) + '</div>' : '') +
                '</div>' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.6rem;color:var(--dim);">Statistics</div>' +
                '<div style="font-size:0.75rem;">' +
                '<div>' + (culture.locations ? culture.locations.length : 0) + ' locations</div>' +
                '<div>' + (culture.religions ? culture.religions.length : 0) + ' religions</div>' +
                '<div>' + (summary.appearanceOptionCount || 0) + ' appearance options</div>' +
                '</div>' +
                '</div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Locations</div>' +
                locationList +
                '</div>' +
                '<div style="background:var(--bg2);padding:12px;border-radius:8px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Religions</div>' +
                religionList +
                '</div>' +
                '</div>' +

                appearanceHtml +
                mythologyHtml +

                (culture.notes ? '<div style="font-size:0.55rem;color:var(--dim);padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' + _escapeHtml(culture.notes) + '</div>' : '') +

                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button id="editCultureBtn" class="btn primary" style="font-size:0.7rem;padding:4px 12px;">Edit</button>' +
                '<button id="deleteCultureBtn" class="btn danger" style="font-size:0.7rem;padding:4px 12px;">Delete</button>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Culture Details',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var editBtn = document.getElementById('editCultureBtn');
                if (editBtn) {
                    editBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openEditCultureModal(cultureId, onSuccess);
                    });
                }

                var deleteBtn = document.getElementById('deleteCultureBtn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openDeleteCultureModal(cultureId, onSuccess);
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openCreateCultureModal = openCreateCultureModal;
    window.openEditCultureModal = openEditCultureModal;
    window.openDeleteCultureModal = openDeleteCultureModal;
    window.openCultureDetailsModal = openCultureDetailsModal;

    // Also expose the icon dropdown helper
    window._getIconDropdown = _getIconDropdown;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateCultureModal: openCreateCultureModal,
            openEditCultureModal: openEditCultureModal,
            openDeleteCultureModal: openDeleteCultureModal,
            openCultureDetailsModal: openCultureDetailsModal,
            _getIconDropdown: _getIconDropdown
        };
    }

})();