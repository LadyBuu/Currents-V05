/**
 * =============================================================================
 * STILL WATERS - MODULAR CULTURE EDITOR TABS (js/tabs/culture-editor-tab.js)
 * =============================================================================
 * 
 * A pluggable tab system for editing culture data.
 * 
 * USAGE:
 *   // Register a new tab
 *   CultureEditorTabs.registerTab('myTab', {
 *     label: 'My Tab',
 *     icon: 'CIRCLE',
 *     render: function(container, culture) { ... },
 *     save: function(culture) { ... return updatedCulture; },
 *     validate: function(culture) { return { valid: true, errors: [] }; }
 *   });
 * 
 *   // Open the editor
 *   CultureEditorTabs.openEditor(cultureId, {
 *     onSave: function(updatedCulture) { ... }
 *   });
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - culture-state.js (CultureState)
 *   - culture-commands.js (CultureCommands)
 * 
 * ICON POLICY: Uses icons.js via _getIcon() - NO EMOJIS
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _getCommands() {
        return typeof window.CultureCommands !== 'undefined' ? window.CultureCommands : null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') return window.getPlaces();
        return [];
    }

    function _getReligions() {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions();
        }
        return [];
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData(true);
        } else if (window.masterData) {
            try {
                localStorage.setItem('stillwaters_master', JSON.stringify(window.masterData));
            } catch(e) {}
        }
    }

    // =========================================================================
    // 2. TAB REGISTRY
    // =========================================================================

    var _tabRegistry = {};
    var _tabOrder = [];
    var _activeTabId = null;
    var _currentCulture = null;
    var _currentCultureId = null;
    var _onSaveCallback = null;
    var _modalId = null;
    var _tabDataCache = {};

    function registerTab(tabId, definition) {
        if (!tabId || typeof tabId !== 'string') {
            return false;
        }

        if (!definition.render || typeof definition.render !== 'function') {
            return false;
        }

        _tabRegistry[tabId] = {
            label: definition.label || tabId,
            icon: definition.icon || 'CIRCLE',
            render: definition.render,
            save: definition.save || null,
            validate: definition.validate || null,
            onActivate: definition.onActivate || null,
            onDeactivate: definition.onDeactivate || null
        };

        if (_tabOrder.indexOf(tabId) === -1) {
            _tabOrder.push(tabId);
        }

        return true;
    }

    function unregisterTab(tabId) {
        if (_tabRegistry[tabId]) {
            delete _tabRegistry[tabId];
            var index = _tabOrder.indexOf(tabId);
            if (index !== -1) _tabOrder.splice(index, 1);
            return true;
        }
        return false;
    }

    function getRegisteredTabs() {
        return _tabOrder.map(function(id) {
            var tab = _tabRegistry[id];
            return {
                id: id,
                label: tab.label,
                icon: tab.icon
            };
        });
    }

    function getCurrentCulture() {
        return _currentCulture;
    }

    function getCurrentCultureId() {
        return _currentCultureId;
    }

    // =========================================================================
    // 3. BUILT-IN DETAILS TAB
    // =========================================================================

    registerTab('details', {
        label: 'Details',
        icon: 'CIRCLE_DOT',
        render: function(container, culture) {
            if (!culture) {
                container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
                return;
            }

            var places = _getPlaces();
            var religions = _getReligions();

            var locationOptions = '';
            for (var i = 0; i < places.length; i++) {
                var selected = culture.locations && culture.locations.indexOf(places[i].id) !== -1 ? 'selected' : '';
                locationOptions += '<option value="' + places[i].id + '" ' + selected + '>' +
                    _escapeHtml(places[i].displayName) + '</option>';
            }

            var religionOptions = '';
            for (var i = 0; i < religions.length; i++) {
                var selected = culture.religions && culture.religions.indexOf(religions[i].id) !== -1 ? 'selected' : '';
                religionOptions += '<option value="' + religions[i].id + '" ' + selected + '>' +
                    _escapeHtml(religions[i].displayName || religions[i].name) + '</option>';
            }

            var iconOptions = '';
            var iconNames = window.Icons ? Object.keys(window.Icons) : [];
            var commonIcons = ['STAR_4', 'STAR', 'CIRCLE_DOT', 'LOCATION', 'BOOK', 'FLAG', 'CROWN', 'SHIELD', 'SWORD', 'HEART'];
            
            for (var i = 0; i < commonIcons.length; i++) {
                var name = commonIcons[i];
                if (window.Icons && window.Icons[name]) {
                    var selected = (culture.icon === name) ? 'selected' : '';
                    iconOptions += '<option value="' + name + '" ' + selected + '>' +
                        window.Icons[name] + ' ' + name + '</option>';
                }
            }

            container.innerHTML =
                '<div class="culture-editor-tab" data-tab="details" style="padding:4px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +

                '<div class="form-group" style="grid-column:1 / 2;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Name *</label>' +
                '<input type="text" id="ce_name" value="' + _escapeHtml(culture.name || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +

                '<div class="form-group" style="grid-column:2 / 3;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Display Name</label>' +
                '<input type="text" id="ce_displayName" value="' + _escapeHtml(culture.displayName || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +

                '<div class="form-group" style="grid-column:1 / 2;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon</label>' +
                '<select id="ce_icon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                iconOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="grid-column:1 / 3;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                '<textarea id="ce_description" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' + _escapeHtml(culture.description || '') + '</textarea>' +
                '</div>' +

                '<div class="form-group" style="grid-column:1 / 3;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Associated Locations</label>' +
                '<select id="ce_locations" multiple style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-height:80px;font-size:0.8rem;">' +
                locationOptions +
                '</select>' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Hold Ctrl/Cmd to select multiple</div>' +
                '</div>' +

                '<div class="form-group" style="grid-column:1 / 3;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Associated Religions</label>' +
                '<select id="ce_religions" multiple style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;min-height:80px;font-size:0.8rem;">' +
                religionOptions +
                '</select>' +
                '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">Hold Ctrl/Cmd to select multiple</div>' +
                '</div>' +

                '<div class="form-group" style="grid-column:1 / 3;">' +
                '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                '<textarea id="ce_notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' + _escapeHtml(culture.notes || '') + '</textarea>' +
                '</div>' +

                '</div>' +
                '</div>';
        },
        save: function(culture) {
            var name = document.getElementById('ce_name').value.trim();
            var displayName = document.getElementById('ce_displayName').value.trim();
            var iconSelect = document.getElementById('ce_icon');
            var icon = iconSelect ? iconSelect.value : 'STAR_4';
            var description = document.getElementById('ce_description').value.trim();
            var notes = document.getElementById('ce_notes').value.trim();

            var locationSelect = document.getElementById('ce_locations');
            var locations = [];
            for (var i = 0; i < locationSelect.options.length; i++) {
                if (locationSelect.options[i].selected && locationSelect.options[i].value) {
                    locations.push(locationSelect.options[i].value);
                }
            }

            var religionSelect = document.getElementById('ce_religions');
            var religions = [];
            for (var i = 0; i < religionSelect.options.length; i++) {
                if (religionSelect.options[i].selected && religionSelect.options[i].value) {
                    religions.push(religionSelect.options[i].value);
                }
            }

            var updates = {
                name: name,
                displayName: displayName || name,
                icon: icon,
                description: description,
                locations: locations,
                religions: religions,
                notes: notes
            };

            var updated = {};
            for (var key in culture) {
                if (culture.hasOwnProperty(key)) {
                    updated[key] = culture[key];
                }
            }
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    updated[key] = updates[key];
                }
            }

            return updated;
        },
        validate: function(culture) {
            var errors = [];
            if (!culture.name || culture.name.trim() === '') {
                errors.push('Name is required');
            }
            return { valid: errors.length === 0, errors: errors };
        }
    });

    // =========================================================================
    // 4. BUILT-IN APPEARANCE TAB
    // =========================================================================

    registerTab('appearance', {
        label: 'Appearance',
        icon: 'PERSON',
        render: function(container, culture) {
            if (!culture) {
                container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
                return;
            }

            var appearance = culture.appearance || {};

            var categories = [
                { key: 'skinTones', label: 'Skin Tones' },
                { key: 'eyeColors', label: 'Eye Colors' },
                { key: 'hairColors', label: 'Hair Colors' },
                { key: 'hairTypes', label: 'Hair Types' },
                { key: 'buildTypes', label: 'Build Types' },
                { key: 'commonFeatures', label: 'Common Features' }
            ];

            var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

            for (var i = 0; i < categories.length; i++) {
                var cat = categories[i];
                var items = appearance[cat.key] || [];
                html += '<div style="background:var(--bg3);border-radius:6px;padding:12px;border:1px solid var(--border);">';
                html += '<div style="font-size:0.7rem;font-weight:bold;color:var(--accent);margin-bottom:6px;">' + cat.label + '</div>';
                html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
                for (var j = 0; j < items.length; j++) {
                    var item = items[j];
                    html += '<span style="background:var(--bg2);padding:2px 10px;border-radius:12px;font-size:0.6rem;border:1px solid var(--border);">' +
                        _escapeHtml(item.value) + ' (' + (item.weight || 10) + ')</span>';
                }
                if (items.length === 0) {
                    html += '<span style="font-size:0.55rem;color:var(--dim);">No options defined</span>';
                }
                html += '</div></div>';
            }

            var height = appearance.height || { male: { min: 155, max: 200 }, female: { min: 145, max: 185 } };
            html += '<div style="grid-column:1 / 3;background:var(--bg3);border-radius:6px;padding:12px;border:1px solid var(--border);">';
            html += '<div style="font-size:0.7rem;font-weight:bold;color:var(--accent);margin-bottom:6px;">Height Ranges</div>';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
            html += '<div><span style="font-size:0.55rem;color:var(--dim);">Male</span> ' + (height.male?.min || 155) + '–' + (height.male?.max || 200) + ' cm</div>';
            html += '<div><span style="font-size:0.55rem;color:var(--dim);">Female</span> ' + (height.female?.min || 145) + '–' + (height.female?.max || 185) + ' cm</div>';
            html += '</div></div>';

            html += '</div>';
            container.innerHTML = html;
        },
        save: function(culture) {
            return culture;
        },
        validate: function(culture) {
            return { valid: true, errors: [] };
        }
    });

    // =========================================================================
    // 5. BUILT-IN MYTHOLOGY TAB
    // =========================================================================

    registerTab('mythology', {
        label: 'Mythology',
        icon: 'BOOK',
        render: function(container, culture) {
            if (!culture) {
                container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
                return;
            }

            var m = culture.mythology || {};

            var sections = [
                { key: 'creation', label: 'Creation Story', rows: 4 },
                { key: 'afterlife', label: 'Afterlife Beliefs', rows: 4 },
                { key: 'cosmology', label: 'Cosmology', rows: 3 }
            ];

            var listSections = [
                { key: 'keyDeities', label: 'Key Deities' },
                { key: 'keyEvents', label: 'Key Events' },
                { key: 'symbols', label: 'Symbols' },
                { key: 'themes', label: 'Themes' }
            ];

            var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

            for (var i = 0; i < sections.length; i++) {
                var s = sections[i];
                var value = m[s.key] || '';
                html += '<div class="form-group" style="grid-column:' + (i === 0 ? '1 / 3' : 'auto') + ';">';
                html += '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' + s.label + '</label>';
                html += '<textarea id="myth_' + s.key + '" rows="' + s.rows + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' + _escapeHtml(value) + '</textarea>';
                html += '</div>';
            }

            for (var i = 0; i < listSections.length; i++) {
                var s = listSections[i];
                var items = m[s.key] || [];
                html += '<div style="background:var(--bg3);border-radius:6px;padding:12px;border:1px solid var(--border);">';
                html += '<div style="font-size:0.7rem;font-weight:bold;color:var(--accent);margin-bottom:6px;">' + s.label + '</div>';
                html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
                for (var j = 0; j < items.length; j++) {
                    html += '<span style="background:var(--bg2);padding:2px 10px;border-radius:12px;font-size:0.6rem;border:1px solid var(--border);">' +
                        _escapeHtml(items[j]) + '</span>';
                }
                if (items.length === 0) {
                    html += '<span style="font-size:0.55rem;color:var(--dim);">No items defined</span>';
                }
                html += '</div></div>';
            }

            html += '</div>';
            container.innerHTML = html;
        },
        save: function(culture) {
            var m = culture.mythology || {};
            var sections = ['creation', 'afterlife', 'cosmology'];
            var updated = {};

            for (var key in culture) {
                if (culture.hasOwnProperty(key)) {
                    updated[key] = culture[key];
                }
            }

            var mythology = {};
            for (var key in m) {
                if (m.hasOwnProperty(key)) {
                    mythology[key] = m[key];
                }
            }

            for (var i = 0; i < sections.length; i++) {
                var el = document.getElementById('myth_' + sections[i]);
                if (el) {
                    mythology[sections[i]] = el.value.trim();
                }
            }

            updated.mythology = mythology;
            return updated;
        },
        validate: function(culture) {
            return { valid: true, errors: [] };
        }
    });

    // =========================================================================
    // 6. BUILT-IN CHARACTERS TAB
    // =========================================================================

    registerTab('characters', {
        label: 'Characters',
        icon: 'PERSON',
        render: function(container, culture) {
            if (!culture) {
                container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
                return;
            }

            var chars = [];
            if (window.masterData && window.masterData.data && window.masterData.data.characters) {
                for (var i = 0; i < window.masterData.data.characters.length; i++) {
                    if (window.masterData.data.characters[i].cultureId === culture.id) {
                        chars.push(window.masterData.data.characters[i]);
                    }
                }
            }

            if (chars.length === 0) {
                container.innerHTML = '<div class="empty-state" style="text-align:center;padding:40px;color:var(--dim);">' +
                    '<div class="icon" style="font-size:2rem;margin-bottom:12px;">' + _getIcon('PERSON') + '</div>' +
                    '<div class="message" style="font-size:0.8rem;">No characters in this culture</div>' +
                    '</div>';
                return;
            }

            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < chars.length; i++) {
                var c = chars[i];
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg3);border-radius:4px;">';
                html += '<span style="font-size:0.7rem;">' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</span>';
                html += '<span style="font-size:0.55rem;color:var(--dim);">' + (c.gender || 'unknown') + '</span>';
                html += '</div>';
            }
            html += '</div>';
            container.innerHTML = html;
        },
        save: function(culture) {
            return culture;
        },
        validate: function(culture) {
            return { valid: true, errors: [] };
        }
    });

    // =========================================================================
    // 7. EDITOR MODAL
    // =========================================================================

    function openEditor(cultureId, options) {
        options = options || {};

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

        _currentCultureId = cultureId;
        _currentCulture = JSON.parse(JSON.stringify(culture));
        _onSaveCallback = options.onSave || null;
        _tabDataCache = {};

        var tabIds = options.tabs || _tabOrder;
        if (tabIds.length === 0) {
            tabIds = _tabOrder;
        }

        tabIds = tabIds.filter(function(id) { return _tabRegistry[id]; });

        if (tabIds.length === 0) {
            _showToast('No tabs available', 'error');
            return;
        }

        _activeTabId = options.initialTab || tabIds[0];

        var tabNavHtml = '';
        for (var i = 0; i < tabIds.length; i++) {
            var id = tabIds[i];
            var tab = _tabRegistry[id];
            var active = (id === _activeTabId) ? 'active' : '';
            var icon = _getIcon(tab.icon) || tab.icon;
            tabNavHtml += '<button class="ce-tab-btn ' + active + '" data-tab="' + id + '" style="' +
                'padding:6px 14px;background:' + (active ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                'border:1px solid ' + (active ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:6px 6px 0 0;cursor:pointer;font-size:0.7rem;' +
                'transition:all 0.15s;' +
                '">' +
                icon + ' ' + _escapeHtml(tab.label) +
                '</button>';
        }

        var tabContentHtml = '';
        for (var i = 0; i < tabIds.length; i++) {
            var id = tabIds[i];
            var active = (id === _activeTabId) ? 'active' : '';
            tabContentHtml += '<div class="ce-tab-content ' + active + '" data-tab="' + id + '" style="' +
                'display:' + (active ? 'block' : 'none') + ';' +
                'padding:16px;background:var(--bg3);border:1px solid var(--border);' +
                'border-radius:0 6px 6px 6px;min-height:200px;' +
                '">' +
                '<div class="ce-tab-inner" id="ce_tab_' + id + '"></div>' +
                '</div>';
        }

        var modalContent =
            '<div class="culture-editor" style="max-height:80vh;display:flex;flex-direction:column;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;color:var(--dim);">' +
            'Editing: <strong>' + _escapeHtml(culture.displayName || culture.name) + '</strong>' +
            '</div>' +
            '<div class="ce-tab-nav" style="display:flex;gap:4px;flex-wrap:wrap;">' +
            tabNavHtml +
            '</div>' +
            '<div class="ce-tabs" style="flex:1;">' +
            tabContentHtml +
            '</div>' +
            '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
            '<div id="ce_validation_errors" style="font-size:0.65rem;color:var(--danger);flex:1;"></div>' +
            '<div style="display:flex;gap:8px;">' +
            '<button id="ce_cancel" class="btn" style="padding:6px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.7rem;">Cancel</button>' +
            '<button id="ce_save" class="btn primary" style="padding:6px 16px;background:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;font-size:0.7rem;color:white;">Save</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        var modal = _openModal({
            title: options.title || 'Edit Culture: ' + (culture.displayName || culture.name),
            content: modalContent,
            confirmText: '',
            cancelText: '',
            size: 'large',
            onOpen: function() {
                _renderTab(_activeTabId);

                var tabButtons = document.querySelectorAll('.ce-tab-btn');
                for (var i = 0; i < tabButtons.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function() {
                            var tabId = this.dataset.tab;
                            _switchTab(tabId);
                        });
                    })(tabButtons[i]);
                }

                var saveBtn = document.getElementById('ce_save');
                var cancelBtn = document.getElementById('ce_cancel');

                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        _saveCulture();
                    });
                }

                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function() {
                        _closeTopModal();
                    });
                }

                document.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault();
                        _saveCulture();
                    }
                });
            }
        });

        _modalId = modal ? modal.id : null;
    }

    // =========================================================================
    // 8. TAB MANAGEMENT FUNCTIONS
    // =========================================================================

    function _switchTab(tabId) {
        var tab = _tabRegistry[tabId];
        if (!tab) return;

        var currentContainer = document.getElementById('ce_tab_' + _activeTabId);
        if (currentContainer) {
            _tabDataCache[_activeTabId] = currentContainer.innerHTML;
        }

        if (_activeTabId && _tabRegistry[_activeTabId] && _tabRegistry[_activeTabId].onDeactivate) {
            try {
                _tabRegistry[_activeTabId].onDeactivate(_currentCulture);
            } catch (e) {}
        }

        _activeTabId = tabId;

        var buttons = document.querySelectorAll('.ce-tab-btn');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'var(--accent-dim)' : 'var(--bg3)';
            btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        }

        var contents = document.querySelectorAll('.ce-tab-content');
        for (var i = 0; i < contents.length; i++) {
            var content = contents[i];
            var isActive = content.dataset.tab === tabId;
            content.classList.toggle('active', isActive);
            content.style.display = isActive ? 'block' : 'none';
        }

        _renderTab(tabId);

        if (tab.onActivate) {
            try {
                tab.onActivate(_currentCulture);
            } catch (e) {}
        }
    }

    function _renderTab(tabId) {
        var tab = _tabRegistry[tabId];
        if (!tab) return;

        var container = document.getElementById('ce_tab_' + tabId);
        if (!container) return;

        if (_tabDataCache[tabId]) {
            container.innerHTML = _tabDataCache[tabId];
            return;
        }

        try {
            tab.render(container, _currentCulture);
        } catch (e) {
            container.innerHTML = '<div style="padding:20px;color:var(--danger);">Error loading tab: ' + _escapeHtml(e.message) + '</div>';
        }
    }

    function _saveCulture() {
        var commands = _getCommands();
        if (!commands) {
            _showToast('Culture system not available', 'error');
            return;
        }

        var updatedCulture = JSON.parse(JSON.stringify(_currentCulture));
        var allErrors = [];
        var hasErrors = false;

        for (var i = 0; i < _tabOrder.length; i++) {
            var id = _tabOrder[i];
            var tab = _tabRegistry[id];
            if (tab && tab.save) {
                try {
                    var result = tab.save(_currentCulture);
                    if (result) {
                        for (var key in result) {
                            if (result.hasOwnProperty(key)) {
                                updatedCulture[key] = result[key];
                            }
                        }
                    }
                } catch (e) {
                    allErrors.push('Tab "' + tab.label + '": ' + e.message);
                }
            }

            if (tab && tab.validate) {
                try {
                    var validation = tab.validate(updatedCulture);
                    if (!validation.valid && validation.errors) {
                        hasErrors = true;
                        for (var j = 0; j < validation.errors.length; j++) {
                            allErrors.push(tab.label + ': ' + validation.errors[j]);
                        }
                    }
                } catch (e) {
                    allErrors.push('Tab "' + tab.label + '" validation error: ' + e.message);
                }
            }
        }

        var errorContainer = document.getElementById('ce_validation_errors');
        if (errorContainer) {
            if (allErrors.length > 0) {
                var errorIcon = _getIcon('WARNING');
                errorContainer.innerHTML = errorIcon + ' ' + allErrors.join('; ');
                errorContainer.style.color = 'var(--danger)';
                _showToast('Please fix validation errors', 'error');
                return;
            } else {
                errorContainer.innerHTML = '';
            }
        }

        if (!updatedCulture.name || updatedCulture.name.trim() === '') {
            _showToast('Culture name is required', 'error');
            return;
        }

        var result = commands.updateCulture(_currentCultureId, updatedCulture);
        if (result && result.success) {
            _showToast('Culture updated successfully', 'success');
            _currentCulture = result.data;
            _tabDataCache = {};
            if (_onSaveCallback) {
                _onSaveCallback(result.data);
            }
            _closeTopModal();
        } else {
            _showToast('Failed to update culture: ' + (result ? result.reason : 'Unknown error'), 'error');
        }
    }

    function closeEditor() {
        _closeTopModal();
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CultureEditorTabs = {
        registerTab: registerTab,
        unregisterTab: unregisterTab,
        getRegisteredTabs: getRegisteredTabs,
        openEditor: openEditor,
        closeEditor: closeEditor,
        getCurrentCulture: getCurrentCulture,
        getCurrentCultureId: getCurrentCultureId,
        _switchTab: _switchTab,
        _renderTab: _renderTab,
        _saveCulture: _saveCulture,
        _currentCulture: _currentCulture,
        _currentCultureId: _currentCultureId
    };

    window.openCultureEditor = openEditor;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureEditorTabs;
    }

})();