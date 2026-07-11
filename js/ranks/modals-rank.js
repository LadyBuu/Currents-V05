/**
 * =============================================================================
 * STILL WATERS - RANK MODALS (modals-rank.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/modals-rank.js
 * 
 * This file contains ALL modal dialogs for rank operations.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankModals.openCreateRankModal(options)
 *   - RankModals.openEditRankModal(rankId, options)
 *   - RankModals.openAssignRankModal(options)
 *   - RankModals.openRankDetailsModal(rankId)
 * 
 * DEPENDENCIES:
 *   - modals-core.js: openModal, closeTopModal, _escapeHtml, _getIcon, _showToast
 *   - modals-char-select.js: openCharacterSelector
 *   - rank-state.js: RankState
 *   - rank-queries.js: RankQueries
 *   - rank-assignment.js: RankAssignment
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

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
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _getRankLevels() {
        return window.RANK_LEVELS || {
            1: { name: "Sovereign", icon: "◉", description: "Highest level" },
            2: { name: "High Noble", icon: "◧", description: "Dukes, princes" },
            3: { name: "Noble", icon: "◈", description: "Counts, earls" },
            4: { name: "Gentry", icon: "⟡", description: "Knights" },
            5: { name: "Commoner", icon: "⌂", description: "Common people" }
        };
    }

    function _getAvailableSymbols() {
        return window.AVAILABLE_SYMBOLS || ['◉', '◧', '◈', '⟡', '⌂', '✦', '✧', '✪'];
    }

    // =========================================================================
    // 2. CREATE RANK MODAL
    // =========================================================================

    function openCreateRankModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Create Rank';
            var parentRankId = options.parentRankId || null;

            var rankLevels = _getRankLevels();
            var levelOptions = '';
            for (var level in rankLevels) {
                if (rankLevels.hasOwnProperty(level)) {
                    levelOptions += '<option value="' + level + '">' + 
                        rankLevels[level].name + ' (' + rankLevels[level].icon + ')' + 
                        '</option>';
                }
            }

            var symbols = _getAvailableSymbols();
            var symbolOptions = '';
            for (var i = 0; i < symbols.length; i++) {
                symbolOptions += '<option value="' + _escapeHtml(symbols[i]) + '">' + 
                    symbols[i] + '</option>';
            }

            var allRanks = window.RankQueries.getAllRanks();
            var parentOptions = '<option value="">None</option>';
            for (var i = 0; i < allRanks.length; i++) {
                var selected = (parentRankId === allRanks[i].id) ? 'selected' : '';
                parentOptions += '<option value="' + _escapeHtml(allRanks[i].id) + '" ' + selected + '>' +
                    _escapeHtml(allRanks[i].name) + '</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Rank Name</label>' +
                '<input type="text" id="rankName" value="New Rank" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Level</label>' +
                '<select id="rankPriority" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                levelOptions +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Symbol</label>' +
                '<select id="rankSymbol" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                symbolOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="rankGender" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="either">Either</option>' +
                '<option value="male">Male Only</option>' +
                '<option value="female">Female Only</option>' +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Parent Rank</label>' +
                '<select id="rankParent" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankNumbered"> Numbered' +
                '</label>' +
                '</div>' +
                '<div>' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankDeprecateOnDeath"> Deprecate on Death' +
                '</label>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankCustomSurname"> Custom Surname Rule' +
                '</label>' +
                '</div>' +
                '<div id="rankSurnameFields" style="display: none; margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Connector</label>' +
                '<input type="text" id="rankSurnameConnector" value="of" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Prefix</label>' +
                '<input type="text" id="rankSurnamePrefix" value="" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Suffix</label>' +
                '<input type="text" id="rankSurnameSuffix" value="" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Create Rank',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('rankName').value.trim();
                    var priority = parseInt(document.getElementById('rankPriority').value) || 5;
                    var symbol = document.getElementById('rankSymbol').value;
                    var gender = document.getElementById('rankGender').value;
                    var parentId = document.getElementById('rankParent').value || null;
                    var numbered = document.getElementById('rankNumbered').checked;
                    var deprecateOnDeath = document.getElementById('rankDeprecateOnDeath').checked;
                    var customSurname = document.getElementById('rankCustomSurname').checked;

                    if (!name) {
                        _showToast('Rank name is required', 'error');
                        return;
                    }

                    var rankData = {
                        name: name,
                        priority: priority,
                        symbol: symbol || '⟡',
                        genderRestriction: gender,
                        parentRankId: parentId,
                        numbered: numbered,
                        deprecateOnDeath: deprecateOnDeath,
                        customSurnameRule: customSurname
                    };

                    if (customSurname) {
                        rankData.surnameConnector = document.getElementById('rankSurnameConnector').value || 'of';
                        rankData.surnamePrefix = document.getElementById('rankSurnamePrefix').value || '';
                        rankData.surnameSuffix = document.getElementById('rankSurnameSuffix').value || '';
                    }

                    var result = window.RankState.addRank(rankData);

                    if (result.success) {
                        _showToast('Rank created successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to create rank: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    var customSurnameCheckbox = document.getElementById('rankCustomSurname');
                    var surnameFields = document.getElementById('rankSurnameFields');

                    if (customSurnameCheckbox && surnameFields) {
                        customSurnameCheckbox.addEventListener('change', function() {
                            surnameFields.style.display = this.checked ? 'block' : 'none';
                        });
                    }
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 3. EDIT RANK MODAL
    // =========================================================================

    function openEditRankModal(rankId, options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Edit Rank';

            var rank = window.RankQueries.getRank(rankId);
            if (!rank) {
                _showToast('Rank not found', 'error');
                return null;
            }

            var rankLevels = _getRankLevels();
            var levelOptions = '';
            for (var level in rankLevels) {
                if (rankLevels.hasOwnProperty(level)) {
                    var selected = (parseInt(level) === rank.priority) ? 'selected' : '';
                    levelOptions += '<option value="' + level + '" ' + selected + '>' + 
                        rankLevels[level].name + ' (' + rankLevels[level].icon + ')' + 
                        '</option>';
                }
            }

            var symbols = _getAvailableSymbols();
            var symbolOptions = '';
            for (var i = 0; i < symbols.length; i++) {
                var selected = (symbols[i] === rank.symbol) ? 'selected' : '';
                symbolOptions += '<option value="' + _escapeHtml(symbols[i]) + '" ' + selected + '>' + 
                    symbols[i] + '</option>';
            }

            var allRanks = window.RankQueries.getAllRanks();
            var parentOptions = '<option value="">None</option>';
            for (var i = 0; i < allRanks.length; i++) {
                if (allRanks[i].id === rankId) continue;
                var selected = (allRanks[i].id === rank.parentRankId) ? 'selected' : '';
                parentOptions += '<option value="' + _escapeHtml(allRanks[i].id) + '" ' + selected + '>' +
                    _escapeHtml(allRanks[i].name) + '</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Rank Name</label>' +
                '<input type="text" id="rankEditName" value="' + _escapeHtml(rank.name) + '" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Level</label>' +
                '<select id="rankEditPriority" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                levelOptions +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Symbol</label>' +
                '<select id="rankEditSymbol" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                symbolOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="rankEditGender" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                '<option value="either" ' + (rank.genderRestriction === 'either' ? 'selected' : '') + '>Either</option>' +
                '<option value="male" ' + (rank.genderRestriction === 'male' ? 'selected' : '') + '>Male Only</option>' +
                '<option value="female" ' + (rank.genderRestriction === 'female' ? 'selected' : '') + '>Female Only</option>' +
                '</select>' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Parent Rank</label>' +
                '<select id="rankEditParent" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">' +
                '<div>' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankEditNumbered" ' + (rank.numbered ? 'checked' : '') + '> Numbered' +
                '</label>' +
                '</div>' +
                '<div>' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankEditDeprecateOnDeath" ' + (rank.deprecateOnDeath ? 'checked' : '') + '> Deprecate on Death' +
                '</label>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="rankEditCustomSurname" ' + (rank.customSurnameRule ? 'checked' : '') + '> Custom Surname Rule' +
                '</label>' +
                '</div>' +
                '<div id="rankEditSurnameFields" style="display: ' + (rank.customSurnameRule ? 'block' : 'none') + '; margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Connector</label>' +
                '<input type="text" id="rankEditSurnameConnector" value="' + _escapeHtml(rank.surnameConnector || 'of') + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Prefix</label>' +
                '<input type="text" id="rankEditSurnamePrefix" value="' + _escapeHtml(rank.surnamePrefix || '') + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '<div>' +
                '<label style="display: block; font-size: 0.55rem; color: var(--dim);">Suffix</label>' +
                '<input type="text" id="rankEditSurnameSuffix" value="' + _escapeHtml(rank.surnameSuffix || '') + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.6rem;">' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('rankEditName').value.trim();
                    var priority = parseInt(document.getElementById('rankEditPriority').value) || 5;
                    var symbol = document.getElementById('rankEditSymbol').value;
                    var gender = document.getElementById('rankEditGender').value;
                    var parentId = document.getElementById('rankEditParent').value || null;
                    var numbered = document.getElementById('rankEditNumbered').checked;
                    var deprecateOnDeath = document.getElementById('rankEditDeprecateOnDeath').checked;
                    var customSurname = document.getElementById('rankEditCustomSurname').checked;

                    if (!name) {
                        _showToast('Rank name is required', 'error');
                        return;
                    }

                    var updates = {
                        name: name,
                        priority: priority,
                        symbol: symbol || '⟡',
                        genderRestriction: gender,
                        parentRankId: parentId,
                        numbered: numbered,
                        deprecateOnDeath: deprecateOnDeath,
                        customSurnameRule: customSurname
                    };

                    if (customSurname) {
                        updates.surnameConnector = document.getElementById('rankEditSurnameConnector').value || 'of';
                        updates.surnamePrefix = document.getElementById('rankEditSurnamePrefix').value || '';
                        updates.surnameSuffix = document.getElementById('rankEditSurnameSuffix').value || '';
                    } else {
                        updates.surnameConnector = 'of';
                        updates.surnamePrefix = '';
                        updates.surnameSuffix = '';
                    }

                    var result = window.RankState.updateRank(rankId, updates);

                    if (result.success) {
                        _showToast('Rank updated successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to update rank: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    var customSurnameCheckbox = document.getElementById('rankEditCustomSurname');
                    var surnameFields = document.getElementById('rankEditSurnameFields');

                    if (customSurnameCheckbox && surnameFields) {
                        customSurnameCheckbox.addEventListener('change', function() {
                            surnameFields.style.display = this.checked ? 'block' : 'none';
                        });
                    }
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 4. ASSIGN RANK MODAL
    // =========================================================================

    function openAssignRankModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Assign Rank';
            var preselectedCharacterId = options.characterId || null;
            var preselectedRankId = options.rankId || null;

            var ranks = window.RankQueries.getAllRanks();
            var rankOptions = '<option value="">Select Rank...</option>';
            for (var i = 0; i < ranks.length; i++) {
                var selected = (preselectedRankId === ranks[i].id) ? 'selected' : '';
                rankOptions += '<option value="' + _escapeHtml(ranks[i].id) + '" ' + selected + '>' +
                    (ranks[i].symbol || '⟡') + ' ' + _escapeHtml(ranks[i].name) +
                    '</option>';
            }

            var charDisplay = preselectedCharacterId ? 'Selected' : 'Select character...';
            var charId = preselectedCharacterId || '';

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Character</label>' +
                '<button id="rankAssignChar" class="btn" style="width: 100%; padding: 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.7rem; text-align: left;">' +
                _getIconSafe('PERSON') + ' <span id="rankAssignCharDisplay">' + charDisplay + '</span>' +
                '</button>' +
                '<input type="hidden" id="rankAssignCharId" value="' + _escapeHtml(charId) + '">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Rank</label>' +
                '<select id="rankAssignRank" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                rankOptions +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<input type="text" id="rankAssignNotes" placeholder="Optional notes..." style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Assign Rank',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var charId = document.getElementById('rankAssignCharId').value;
                    var rankId = document.getElementById('rankAssignRank').value;
                    var notes = document.getElementById('rankAssignNotes').value || null;

                    if (!charId) {
                        _showToast('Please select a character', 'error');
                        return;
                    }
                    if (!rankId) {
                        _showToast('Please select a rank', 'error');
                        return;
                    }

                    var result = window.RankAssignment.assignRankToCharacter(charId, rankId, {
                        notes: notes
                    });

                    if (result.success) {
                        _showToast('Rank assigned successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to assign rank: ' + result.error, 'error');
                    }
                },
                onOpen: function() {
                    var charBtn = document.getElementById('rankAssignChar');
                    var charDisplay = document.getElementById('rankAssignCharDisplay');
                    var charHidden = document.getElementById('rankAssignCharId');

                    if (charBtn) {
                        charBtn.addEventListener('click', function() {
                            _openCharacterSelector({
                                title: 'Select Character',
                                filters: { showDeceased: false },
                                onSelect: function(char) {
                                    charDisplay.textContent = char.name + (char.surname ? ' ' + char.surname : '');
                                    charHidden.value = char.id;
                                }
                            });
                        });
                    }

                    if (preselectedCharacterId) {
                        var char = typeof window.getCharacterById === 'function' ? 
                            window.getCharacterById(preselectedCharacterId) : null;
                        if (char) {
                            charDisplay.textContent = char.name + (char.surname ? ' ' + char.surname : '');
                            charHidden.value = char.id;
                        }
                    }
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 5. RANK DETAILS MODAL
    // =========================================================================

    function openRankDetailsModal(rankId) {
        var rank = window.RankQueries.getRank(rankId);
        if (!rank) {
            _showToast('Rank not found', 'error');
            return null;
        }

        var holderStats = window.RankQueries.getRankHolderStats(rankId);
        var levelName = window.RankQueries.getRankLevelName(rank.priority);

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="font-size: 2rem; line-height: 1;">' + (rank.symbol || '⟡') + '</div>' +
            '<div>' +
            '<div style="font-size: 1rem; font-weight: bold;">' + _escapeHtml(rank.name) + '</div>' +
            '<div style="font-size: 0.65rem; color: var(--dim);">' + levelName + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Priority</div>' +
            '<div style="font-size: 0.75rem;">' + (rank.priority || 'N/A') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Holders</div>' +
            '<div style="font-size: 0.75rem;">' + (holderStats.total || 0) + ' (' + (holderStats.living || 0) + ' living)</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Gender Restriction</div>' +
            '<div style="font-size: 0.75rem;">' + (rank.genderRestriction || 'either') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Numbered</div>' +
            '<div style="font-size: 0.75rem;">' + (rank.numbered ? 'Yes' : 'No') + '</div>' +
            '</div>' +
            '</div>';

        if (rank.parentRankId) {
            var parent = window.RankQueries.getRank(rank.parentRankId);
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Parent Rank</div>' +
                '<div style="font-size: 0.75rem;">' + (parent ? _escapeHtml(parent.name) : 'Unknown') + '</div>' +
                '</div>';
        }

        if (rank.customSurnameRule) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Surname Rule</div>' +
                '<div style="font-size: 0.65rem;">' +
                _escapeHtml(rank.surnameConnector || 'of') + ' ' +
                _escapeHtml(rank.surnamePrefix || '') + 'Location' + _escapeHtml(rank.surnameSuffix || '') +
                '</div>' +
                '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Rank Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.RankModals = {
        openCreateRankModal: openCreateRankModal,
        openEditRankModal: openEditRankModal,
        openAssignRankModal: openAssignRankModal,
        openRankDetailsModal: openRankDetailsModal
    };

    // Legacy aliases
    window._rankModals = window.RankModals;

})();