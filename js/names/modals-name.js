/**
 * =============================================================================
 * NAME MODALS - UI for name generation and management
 * =============================================================================
 * 
 * Responsibilities:
 * - Name generation preview
 * - Surname management (view history, revert)
 * - Name list management (add/remove names)
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _showToast)
 *   - name-state.js (NameState)
 *   - name-queries.js (NameQueries)
 *   - name-commands.js (NameCommands)
 *   - name-rules.js (NameRules)
 *   - accessors.js (getPlaceById, getPlaces)
 * 
 * ICON POLICY: Uses icons.js only, NO emojis in UI
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    // =========================================================================
    // 2. OPEN NAME GENERATOR PREVIEW MODAL
    // =========================================================================

    function openNameGeneratorModal(options) {
        options = options || {};

        var title = options.title || 'Generate Name';
        var countryId = options.countryId || null;
        var gender = options.gender || 'all';
        var onSelect = options.onSelect || function() {};

        // Get available countries
        var places = _getPlaces();
        var countryOptions = '<option value="">Select country...</option>';
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var selected = (p.id === countryId) ? 'selected' : '';
            countryOptions += '<option value="' + p.id + '" ' + selected + '>' +
                _escapeHtml(p.displayName) +
                '</option>';
        }

        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var refreshIcon = _getIcon('REFRESH');

        var modalContent =
            '<div style="max-height: 500px; overflow-y: auto;">' +
            // Country selection
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">' +
            locationIcon + ' Country/Culture' +
            '</label>' +
            '<select id="nameGenCountry" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            countryOptions +
            '</select>' +
            '</div>' +

            // Gender selection
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">' +
            personIcon + ' Gender' +
            '</label>' +
            '<select id="nameGenGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<option value="all" ' + (gender === 'all' ? 'selected' : '') + '>All</option>' +
            '<option value="male" ' + (gender === 'male' ? 'selected' : '') + '>Male</option>' +
            '<option value="female" ' + (gender === 'female' ? 'selected' : '') + '>Female</option>' +
            '</select>' +
            '</div>' +

            // Generate button and preview
            '<div style="display: flex; gap: 8px; margin-bottom: 12px;">' +
            '<button id="nameGenGenerateBtn" class="btn primary" style="flex: 1; padding: 8px; background: var(--accent); border: 1px solid var(--accent); color: white; border-radius: 6px; cursor: pointer;">' +
            refreshIcon + ' Generate' +
            '</button>' +
            '</div>' +

            // Preview area
            '<div id="nameGenPreview" style="background: var(--bg3); padding: 12px; border-radius: 6px; min-height: 40px; text-align: center; font-size: 1.1rem; font-weight: bold; margin-bottom: 12px;">' +
            'Click Generate to preview' +
            '</div>' +

            // History (if character is provided)
            (options.characterId ? _buildNameHistoryHtml(options.characterId) : '') +

            '</div>';

        var modal = _openModal({
            title: title,
            content: modalContent,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: function() {
                var previewEl = document.getElementById('nameGenPreview');
                if (previewEl) {
                    var nameText = previewEl.textContent || previewEl.innerText || '';
                    if (nameText && nameText !== 'Click Generate to preview') {
                        onSelect(nameText);
                    } else {
                        _showToast('Please generate a name first', 'warning');
                        return false;
                    }
                }
                return true;
            }
        });

        // Attach generate handler
        setTimeout(function() {
            var generateBtn = document.getElementById('nameGenGenerateBtn');
            var countrySelect = document.getElementById('nameGenCountry');
            var genderSelect = document.getElementById('nameGenGender');
            var previewEl = document.getElementById('nameGenPreview');

            if (generateBtn && countrySelect && genderSelect && previewEl) {
                generateBtn.addEventListener('click', function() {
                    var countryId = countrySelect.value;
                    var gender = genderSelect.value;

                    if (!countryId) {
                        _showToast('Please select a country', 'warning');
                        return;
                    }

                    var name = NameQueries.getRandomName(countryId, gender);
                    if (name) {
                        previewEl.textContent = name;
                    } else {
                        previewEl.textContent = 'No names available for this country';
                    }
                });
            }
        }, 100);

        return modal;
    }

    // =========================================================================
    // 3. BUILD NAME HISTORY HTML
    // =========================================================================

    function _buildNameHistoryHtml(characterId) {
        var changes = NameQueries.getSurnameChanges(characterId);
        var birthSurname = NameQueries.getBirthSurname(characterId);
        var currentSurname = NameQueries.getCurrentSurname(characterId);

        if (changes.length === 0 && !birthSurname) {
            return '';
        }

        var historyIcon = _getIcon('BOOK');
        var html =
            '<div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px;">' +
            '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">' +
            historyIcon + ' Surname History' +
            '</div>' +
            '<div style="background: var(--bg3); padding: 8px; border-radius: 4px; max-height: 150px; overflow-y: auto; font-size: 0.6rem;">';

        if (birthSurname) {
            html += '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light);">' +
                '<span style="color: var(--dim);">Birth</span>' +
                '<span>' + _escapeHtml(birthSurname) + '</span>' +
                '</div>';
        }

        for (var i = 0; i < changes.length; i++) {
            var c = changes[i];
            var isCurrent = (i === changes.length - 1);
            var color = isCurrent ? 'var(--accent)' : 'var(--dim)';
            html += '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light);">' +
                '<span style="color: ' + color + ';">' + (isCurrent ? 'Current' : c.year + ' (' + (c.reason || 'change') + ')') + '</span>' +
                '<span>' + _escapeHtml(c.surname) + '</span>' +
                '</div>';
        }

        html += '</div>' +
            (changes.length > 0 ? '<button id="revertSurnameBtn" class="btn small" style="margin-top: 8px; padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">↩ Revert Last Change</button>' : '') +
            '</div>';

        return html;
    }

    // =========================================================================
    // 4. OPEN SURNAME MANAGEMENT MODAL
    // =========================================================================

    function openSurnameManagementModal(characterId, onSuccess) {
        var character = _getCharacterById(characterId);
        if (!character) {
            _showToast('Character not found', 'error');
            return;
        }

        var history = NameQueries.getSurnameHistory(characterId);
        var birthSurname = history ? history.birthSurname : character.surname || '';
        var changes = history ? history.entries : [];
        var currentSurname = character.surname || '';

        var personIcon = _getIcon('PERSON');
        var bookIcon = _getIcon('BOOK');
        var checkIcon = _getIcon('CHECK_SIMPLE');

        // Build change list
        var changeHtml = '';
        if (changes.length === 0) {
            changeHtml = '<div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.6rem;">No surname changes recorded</div>';
        } else {
            for (var i = changes.length - 1; i >= 0; i--) {
                var c = changes[i];
                var isCurrent = (i === changes.length - 1);
                var color = isCurrent ? 'var(--accent)' : 'var(--dim)';
                var prefix = isCurrent ? '▶' : '•';
                changeHtml += '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span>' + prefix + ' ' + c.year + ' - ' + (c.reason || 'change') + '</span>' +
                    '<span style="color: ' + color + ';">' + _escapeHtml(c.surname) + ' ' +
                    (c.previousSurname ? '← ' + _escapeHtml(c.previousSurname) : '') +
                    '</span>' +
                    '</div>';
            }
        }

        var modalContent =
            '<div style="max-height: 500px; overflow-y: auto;">' +
            '<div style="background: var(--bg2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
            personIcon + ' <strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>' +
            '</div>' +

            // Current surname
            '<div style="display: flex; gap: 12px; margin-bottom: 12px;">' +
            '<div style="flex: 1; background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">Current Surname</div>' +
            '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent);">' + _escapeHtml(currentSurname) + '</div>' +
            '</div>' +
            '<div style="flex: 1; background: var(--bg3); padding: 8px; border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">Birth Surname</div>' +
            '<div style="font-size: 0.9rem;">' + _escapeHtml(birthSurname) + '</div>' +
            '</div>' +
            '</div>' +

            // Change history
            '<div style="margin-bottom: 12px;">' +
            '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">' +
            bookIcon + ' History (' + changes.length + ' changes)' +
            '</div>' +
            '<div style="background: var(--bg3); padding: 8px; border-radius: 4px; max-height: 150px; overflow-y: auto;">' +
            changeHtml +
            '</div>' +
            '</div>' +

            // Action buttons
            '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">' +
            (changes.length > 0 ? '<button id="revertSurnameBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">↩ Revert Last Change</button>' : '') +
            '<button id="clearSurnameHistoryBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">' + checkIcon + ' Clear History</button>' +
            '</div>' +

            '</div>';

        var modal = _openModal({
            title: 'Surname Management: ' + character.name,
            content: modalContent,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (onSuccess) onSuccess();
            }
        });

        // Attach handlers
        setTimeout(function() {
            var revertBtn = document.getElementById('revertSurnameBtn');
            if (revertBtn) {
                revertBtn.addEventListener('click', function() {
                    var result = NameCommands.revertLastSurnameChange(character);
                    if (result) {
                        _closeTopModal();
                        setTimeout(function() {
                            openSurnameManagementModal(characterId, onSuccess);
                        }, 100);
                    }
                });
            }

            var clearBtn = document.getElementById('clearSurnameHistoryBtn');
            if (clearBtn) {
                clearBtn.addEventListener('click', function() {
                    if (confirm('Clear all surname history entries? This action cannot be undone.')) {
                        var history = NameState.getSurnameHistory(characterId);
                        if (history) {
                            history.entries = [];
                            history.lastUpdated = character.birthYear || _getCurrentYear();
                            _saveMasterData();
                            NameState.invalidateCache();
                            _showToast('Surname history cleared', 'info');
                            _closeTopModal();
                            setTimeout(function() {
                                openSurnameManagementModal(characterId, onSuccess);
                            }, 100);
                        }
                    }
                });
            }
        }, 100);

        return modal;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.openNameGeneratorModal = openNameGeneratorModal;
    window.openSurnameManagementModal = openSurnameManagementModal;

})();