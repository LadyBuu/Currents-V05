/**
 * =============================================================================
 * STILL WATERS - RANK MANAGER UI (FIXED - NO REFRESH LOOPS)
 * =============================================================================
 * 
 * UI for rank management. Uses RankSystem for all data operations.
 * 
 * FIXED: No render loops - uses direct DOM manipulation instead of re-rendering
 * UPDATED: Issues tab uses RankIssues system with auto-fix
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE
    // =========================================================================

    var rankUIState = {
        searchTerm: '',
        selectedRankId: null,
        currentTab: 'editor'
    };

    var _isRendering = false;
    var _treeContainerId = 'rankTree';
    var _detailContainerId = 'detailPanel';
    var _analyticsContainerId = 'analyticsTab';
    var _issuesContainerId = 'issuesTab';

    // =========================================================================
    // 2. ICON HELPERS
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        return '';
    }

    function _getCircleIcon() { return _getIcon('CIRCLE') || '●'; }
    function _getCheckIcon() { return _getIcon('CHECK_SIMPLE') || '✓'; }
    function _getCrossIcon() { return _getIcon('X_HEAVY') || '✗'; }
    function _getPlusIcon() { return _getIcon('PLUS') || '+'; }
    function _getRefreshIcon() { return _getIcon('REFRESH') || '⟳'; }
    function _getPersonIcon() { return _getIcon('PERSON') || '👤'; }
    function _getLocationIcon() { return _getIcon('LOCATION') || '⌂'; }
    function _getRankIcon() { return _getIcon('RANK') || '◉'; }
    function _getStarIcon() { return _getIcon('STAR') || '★'; }
    function _getLinkIcon() { return _getIcon('LINK') || '⌇'; }
    function _getTreeIcon() { return _getIcon('FAMILY_TREE') || '⌇'; }
    function _getWarningIcon() { return _getIcon('WARNING') || '⚠'; }
    function _getTrashIcon() { return _getIcon('TRASH') || '✗'; }
    function _getArrowIcon() { return _getIcon('ARROW_RIGHT') || '→'; }

    // =========================================================================
    // 3. RANK SYSTEM WRAPPERS
    // =========================================================================

    function _getRanks() {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getAllRanks === 'function') {
            return window.RankQueries.getAllRanks();
        }
        if (typeof window.getRanks === 'function') {
            return window.getRanks();
        }
        return [];
    }

    function _getRankById(id) {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getRank === 'function') {
            return window.RankQueries.getRank(id);
        }
        if (typeof window.getRankById === 'function') {
            return window.getRankById(id);
        }
        return null;
    }

    function _getRankLevelIcon(priority) {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getRankLevelIcon === 'function') {
            return window.RankQueries.getRankLevelIcon(priority);
        }
        var icons = { 1: '◉', 2: '◧', 3: '◈', 4: '⟡', 5: '⌂' };
        return icons[priority] || '⌂';
    }

    function _getRankHolderStats(rankId) {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getRankHolderStats === 'function') {
            return window.RankQueries.getRankHolderStats(rankId);
        }
        return { total: 0, male: 0, female: 0, living: 0, deceased: 0, minors: 0, adults: 0, elders: 0 };
    }

    function _getAvailableSymbols() {
        if (typeof window.RankQueries !== 'undefined' && 
            typeof window.RankQueries.getAvailableSymbols === 'function') {
            return window.RankQueries.getAvailableSymbols();
        }
        if (typeof window.getAvailableSymbols === 'function') {
            return window.getAvailableSymbols();
        }
        return ['◉', '◧', '◈', '⟡', '⌂', '✦', '✧', '✪', '✴', '✺'];
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 4. RENDER TREE - FIXED: Single render, no re-renders on click
    // =========================================================================

    function renderTree() {
        if (_isRendering) return;
        _isRendering = true;

        try {
            var container = document.getElementById(_treeContainerId);
            if (!container) return;
            
            var ranks = _getRanks();
            
            if (!ranks || ranks.length === 0) {
                container.innerHTML = '<div class="empty-state">' + _getCircleIcon() + ' No ranks defined. Click "Add New Rank" to create one.</div>';
                return;
            }
            
            var sorted = ranks.slice().sort(function(a, b) { 
                return (a.priority || 999) - (b.priority || 999); 
            });
            
            var html = '';
            for (var i = 0; i < sorted.length; i++) {
                var rank = sorted[i];
                var selectedClass = rankUIState.selectedRankId === rank.id ? 'selected' : '';
                var levelIcon = _getRankLevelIcon(rank.priority || 5);
                html += '<div class="rank-tree-item ' + selectedClass + '" data-id="' + rank.id + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div><span style="font-size:1.1rem;">' + (rank.symbol || '⌇') + '</span><span style="margin-left: 8px;">' + _escapeHtml(rank.name) + '</span></div>' +
                    '<span style="font-size:0.6rem;color:var(--dim);">' + levelIcon + ' ' + (rank.priority || 5) + '</span>' +
                    '</div>' +
                    '</div>';
            }
            container.innerHTML = html;
            
            // Single click handler - does NOT re-render, just updates selection
            if (!container._clickHandler) {
                container._clickHandler = function(e) {
                    var item = e.target.closest('.rank-tree-item');
                    if (item) {
                        var rankId = item.dataset.id;
                        if (rankId && rankUIState.selectedRankId !== rankId) {
                            rankUIState.selectedRankId = rankId;
                            _updateSelection(rankId);
                            renderRankDetail();
                            if (rankUIState.currentTab === 'analytics') {
                                renderAnalytics();
                            }
                        }
                    }
                };
                container.addEventListener('click', container._clickHandler);
            }
        } finally {
            _isRendering = false;
        }
    }

    // =========================================================================
    // 4a. UPDATE SELECTION - No re-render
    // =========================================================================

    function _updateSelection(rankId) {
        var container = document.getElementById(_treeContainerId);
        if (!container) return;
        var items = container.querySelectorAll('.rank-tree-item');
        for (var i = 0; i < items.length; i++) {
            if (items[i].dataset.id === rankId) {
                items[i].classList.add('selected');
            } else {
                items[i].classList.remove('selected');
            }
        }
    }

    // =========================================================================
    // 5. RENDER RANK DETAIL - FIXED: No loops
    // =========================================================================

    function renderRankDetail() {
        if (_isRendering) return;
        _isRendering = true;

        try {
            var container = document.getElementById(_detailContainerId);
            if (!container) return;
            
            if (!rankUIState.selectedRankId) {
                container.innerHTML = '<div class="empty-detail">' + _getArrowIcon() + ' Select a rank from the sidebar to view details</div>';
                return;
            }
            
            var rank = _getRankById(rankUIState.selectedRankId);
            if (!rank) {
                container.innerHTML = '<div class="empty-detail">' + _getCircleIcon() + ' Rank not found</div>';
                return;
            }
            
            var allRanks = _getRanks();
            var otherRanks = allRanks.filter(function(r) { return r.id !== rank.id; });
            var symbols = _getAvailableSymbols();
            
            var locationDropdownHtml = '<select id="rankLocation" class="rank-location-select">' +
                '<option value="">— No location —</option>' +
                '<option value="loc1" ' + (rank.locationTypeId === 'loc1' ? 'selected' : '') + '>Kingdom</option>' +
                '<option value="loc2" ' + (rank.locationTypeId === 'loc2' ? 'selected' : '') + '>Duchy</option>' +
                '<option value="loc3" ' + (rank.locationTypeId === 'loc3' ? 'selected' : '') + '>County</option>' +
                '<option value="loc4" ' + (rank.locationTypeId === 'loc4' ? 'selected' : '') + '>Barony</option>' +
                '</select>';
            
            var hasSurnameRule = rank.customSurnameRule === true;
            var currentConnector = rank.surnameConnector || 'of';
            
            var html = '<div style="max-width: 800px; margin: 0 auto;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">' +
                '<h2 style="margin:0; font-size:0.9rem; color:var(--accent);">' + (rank.symbol || '⌇') + ' ' + _escapeHtml(rank.name) + '</h2>' +
                '<button id="deleteRankBtn" class="btn" style="background:#2a1a1a; border-color:#8a3020;">' + _getTrashIcon() + ' Delete Rank</button>' +
                '</div>' +
                '<form id="rankForm">' +
                '<div class="rank-form-group"><label>' + _getCircleIcon() + ' Rank Name</label><input type="text" id="rankName" value="' + _escapeHtml(rank.name) + '"></div>' +
                '<div class="rank-form-row">' +
                '<div class="rank-form-group"><label>' + _getRankIcon() + ' Priority (1-10)</label><input type="number" id="rankPriority" value="' + (rank.priority || 5) + '" min="1" max="10"></div>' +
                '<div class="rank-form-group">' +
                '<label>' + _getStarIcon() + ' Symbol</label>' +
                '<select id="rankSymbol" style="width: 100px; font-size: 1.2rem;">' +
                symbols.map(function(sym) { return '<option value="' + sym + '" ' + (rank.symbol === sym ? 'selected' : '') + '>' + sym + '</option>'; }).join('') +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-group"><label>' + _getPersonIcon() + ' Gender Restriction</label>' +
                '<div class="rank-checkbox-group">' +
                '<label><input type="radio" name="gender" value="either" ' + (rank.genderRestriction === 'either' ? 'checked' : '') + '> ' + _getCircleIcon() + ' Either</label>' +
                '<label><input type="radio" name="gender" value="male" ' + (rank.genderRestriction === 'male' ? 'checked' : '') + '> ♂ Male only</label>' +
                '<label><input type="radio" name="gender" value="female" ' + (rank.genderRestriction === 'female' ? 'checked' : '') + '> ♀ Female only</label>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-group"><label>' + _getLinkIcon() + ' Spouse Inheritance</label>' +
                '<select id="rankSpouseInheritance">' +
                '<option value="">' + _getCircleIcon() + ' — None —</option>' +
                otherRanks.map(function(r) { return '<option value="' + r.id + '" ' + (rank.spouseInheritance === r.id ? 'selected' : '') + '>' + (r.symbol || '⌇') + ' ' + _escapeHtml(r.name) + '</option>'; }).join('') +
                '</select>' +
                '</div>' +
                '<div class="rank-checkbox-group" style="margin-bottom: 16px;">' +
                '<label><input type="checkbox" id="rankDeprecate" ' + (rank.deprecateOnDeath ? 'checked' : '') + '> ' + _getCrossIcon() + ' Deprecate on death</label>' +
                '<label><input type="checkbox" id="rankMultipleSpouses" ' + (rank.allowsMultipleSpouses ? 'checked' : '') + '> ' + _getCircleIcon() + ' Allow multiple spouses</label>' +
                '</div>' +
                '<div class="rank-form-group" style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 12px;">' +
                '<label>' + _getLocationIcon() + ' Territory (Associated Location)</label>' +
                locationDropdownHtml +
                '<small style="font-size:0.55rem; color:var(--dim);">The location this rank is associated with.</small>' +
                '</div>' +
                '<div style="border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 10px;">' +
                '<input type="checkbox" id="numberedCheck" ' + (rank.numbered ? 'checked' : '') + '>' +
                '<span style="font-weight: bold; font-size: 0.7rem;">' + _getRankIcon() + ' Numbered Rank</span>' +
                '</label>' +
                '<div id="numberingFields" style="display: ' + (rank.numbered ? 'block' : 'none') + '; margin-left: 20px; padding-left: 12px; border-left: 2px solid var(--accent-dim);">' +
                '<div class="rank-form-row">' +
                '<div class="rank-form-group">' +
                '<label>Numbering Type</label>' +
                '<select id="numberingType">' +
                '<option value="reign" ' + (rank.numberingType === 'reign' ? 'selected' : '') + '>Reign (John I, John II)</option>' +
                '<option value="birth" ' + (rank.numberingType === 'birth' ? 'selected' : '') + '>Birth Order (1st Prince, 2nd Prince)</option>' +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Reign: by reign start year, same first name. Birth: by birth year.</small>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-row">' +
                '<div class="rank-form-group">' +
                '<label>Numbering Prefix</label>' +
                '<input type="text" id="numberingPrefix" value="' + _escapeHtml(rank.numberingPrefix || '') + '" placeholder="e.g., \'Prince \'">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Appears before the number</small>' +
                '</div>' +
                '<div class="rank-form-group">' +
                '<label>Numbering Suffix</label>' +
                '<input type="text" id="numberingSuffix" value="' + _escapeHtml(rank.numberingSuffix || '') + '" placeholder="e.g., \' of Wales\'">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Appears after the rank name</small>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div style="border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 10px;">' +
                '<input type="checkbox" id="customSurnameCheck" ' + (hasSurnameRule ? 'checked' : '') + '>' +
                '<span style="font-weight: bold; font-size: 0.7rem;">' + _getLinkIcon() + ' Custom Surname Rule (Location-based)</span>' +
                '</label>' +
                '<div id="surnameRuleFields" style="display: ' + (hasSurnameRule ? 'block' : 'none') + '; margin-left: 20px; padding-left: 12px; border-left: 2px solid var(--accent-dim);">' +
                '<div class="rank-form-row">' +
                '<div class="rank-form-group" style="flex: 2;">' +
                '<label>Connector (custom text)</label>' +
                '<input type="text" id="surnameConnector" value="' + _escapeHtml(currentConnector) + '" placeholder="e.g., of, from, van der">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Free text - will be placed before the location name</small>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-row">' +
                '<div class="rank-form-group">' +
                '<label>Prefix (optional)</label>' +
                '<input type="text" id="surnamePrefix" value="' + _escapeHtml(rank.surnamePrefix || '') + '" placeholder="e.g., \'Mac\'">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Added before the connector</small>' +
                '</div>' +
                '<div class="rank-form-group">' +
                '<label>Suffix (optional)</label>' +
                '<input type="text" id="surnameSuffix" value="' + _escapeHtml(rank.surnameSuffix || '') + '" placeholder="e.g., \'son\'">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Added after the location</small>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-group">' +
                '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; margin-top: 8px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent); margin-bottom: 4px;">Preview:</div>' +
                '<div id="surnamePreview" style="font-family: monospace; font-size: 0.65rem;">' +
                _escapeHtml((rank.surnamePrefix || '') + (currentConnector) + ' [Location]' + (rank.surnameSuffix || '')) +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="rank-form-group">' +
                '<label>' + _getTreeIcon() + ' Inheritance Rules</label>' +
                '<div id="rulesList" style="background: var(--bg); border-radius: 8px; padding: 8px; margin: 8px 0;">' +
                '<div style="color: var(--dim); text-align: center; padding: 12px;">' + _getCircleIcon() + ' No inheritance rules</div>' +
                '</div>' +
                '<div class="rank-inheritance-form" style="display: flex; gap: 8px; flex-wrap: wrap;">' +
                '<select id="ruleChildRank" style="flex:2">' +
                '<option value="">' + _getCircleIcon() + ' — Select rank —</option>' +
                otherRanks.map(function(r) { return '<option value="' + r.id + '">' + (r.symbol || '⌇') + ' ' + _escapeHtml(r.name) + '</option>'; }).join('') +
                '</select>' +
                '<input type="number" id="ruleMinAge" placeholder="Min age" value="0" style="width: 80px;">' +
                '<input type="number" id="ruleOrder" placeholder="Order" value="10" style="width: 70px;">' +
                '<button type="button" id="addRuleBtn" class="btn primary">' + _getPlusIcon() + ' Add</button>' +
                '</div>' +
                '</div>' +
                '<div style="margin-top: 24px; display: flex; gap: 12px;">' +
                '<button type="submit" class="btn primary">' + _getCheckIcon() + ' Save Changes</button>' +
                '<button type="button" id="renumberBtn" class="btn">' + _getRefreshIcon() + ' Re-number Holders</button>' +
                '<button type="button" id="cancelEditBtn" class="btn">' + _getCircleIcon() + ' Cancel</button>' +
                '</div>' +
                '</form>' +
                '</div>';
            
            container.innerHTML = html;
            
            // Attach form submit handler
            var form = document.getElementById('rankForm');
            if (form) {
                if (form._submitHandler) {
                    form.removeEventListener('submit', form._submitHandler);
                }
                form._submitHandler = function(e) { 
                    e.preventDefault(); 
                    saveRankDetail(); 
                };
                form.addEventListener('submit', form._submitHandler);
            }
            
            // Cancel button
            var cancelBtn = document.getElementById('cancelEditBtn');
            if (cancelBtn) {
                if (cancelBtn._clickHandler) {
                    cancelBtn.removeEventListener('click', cancelBtn._clickHandler);
                }
                cancelBtn._clickHandler = function() { 
                    renderRankDetail(); 
                };
                cancelBtn.addEventListener('click', cancelBtn._clickHandler);
            }
            
            // Renumber button
            var renumberBtn = document.getElementById('renumberBtn');
            if (renumberBtn) {
                if (renumberBtn._clickHandler) {
                    renumberBtn.removeEventListener('click', renumberBtn._clickHandler);
                }
                renumberBtn._clickHandler = function() {
                    _showToast('Re-numbered holders', 'info');
                };
                renumberBtn.addEventListener('click', renumberBtn._clickHandler);
            }
            
            // Delete button
            var deleteBtn = document.getElementById('deleteRankBtn');
            if (deleteBtn) {
                if (deleteBtn._clickHandler) {
                    deleteBtn.removeEventListener('click', deleteBtn._clickHandler);
                }
                deleteBtn._clickHandler = function() {
                    _confirmDialog('Delete rank "' + rank.name + '" permanently?', 'Delete Rank', function() {
                        if (typeof window.RankCommands !== 'undefined' && 
                            typeof window.RankCommands.deleteRank === 'function') {
                            window.RankCommands.deleteRank(rank.id);
                        }
                        rankUIState.selectedRankId = null;
                        renderTree();
                        renderRankDetail();
                        if (rankUIState.currentTab === 'analytics') renderAnalytics();
                    });
                };
                deleteBtn.addEventListener('click', deleteBtn._clickHandler);
            }

            // Numbered checkbox toggle
            var numberedCheck = document.getElementById('numberedCheck');
            var numberingFields = document.getElementById('numberingFields');
            if (numberedCheck) {
                if (numberedCheck._changeHandler) {
                    numberedCheck.removeEventListener('change', numberedCheck._changeHandler);
                }
                numberedCheck._changeHandler = function() { 
                    numberingFields.style.display = numberedCheck.checked ? 'block' : 'none'; 
                };
                numberedCheck.addEventListener('change', numberedCheck._changeHandler);
            }

            // Custom surname checkbox toggle
            var customCheck = document.getElementById('customSurnameCheck');
            var surnameFields = document.getElementById('surnameRuleFields');
            if (customCheck) {
                if (customCheck._changeHandler) {
                    customCheck.removeEventListener('change', customCheck._changeHandler);
                }
                customCheck._changeHandler = function() { 
                    surnameFields.style.display = customCheck.checked ? 'block' : 'none'; 
                };
                customCheck.addEventListener('change', customCheck._changeHandler);
            }

            // Preview update
            var connectorInput = document.getElementById('surnameConnector');
            var prefixInput = document.getElementById('surnamePrefix');
            var suffixInput = document.getElementById('surnameSuffix');
            var previewDiv = document.getElementById('surnamePreview');
            
            function updatePreview() {
                var connector = connectorInput ? connectorInput.value : '';
                var prefix = prefixInput ? prefixInput.value : '';
                var suffix = suffixInput ? suffixInput.value : '';
                var preview = prefix;
                if (connector) {
                    if (preview) preview += ' ';
                    preview += connector + ' [Location]';
                } else {
                    if (preview) preview += ' ';
                    preview += '[Location]';
                }
                preview += suffix;
                if (previewDiv) previewDiv.textContent = preview || '[Location]';
            }
            
            if (connectorInput) {
                if (connectorInput._inputHandler) {
                    connectorInput.removeEventListener('input', connectorInput._inputHandler);
                }
                connectorInput._inputHandler = updatePreview;
                connectorInput.addEventListener('input', connectorInput._inputHandler);
            }
            if (prefixInput) {
                if (prefixInput._inputHandler) {
                    prefixInput.removeEventListener('input', prefixInput._inputHandler);
                }
                prefixInput._inputHandler = updatePreview;
                prefixInput.addEventListener('input', prefixInput._inputHandler);
            }
            if (suffixInput) {
                if (suffixInput._inputHandler) {
                    suffixInput.removeEventListener('input', suffixInput._inputHandler);
                }
                suffixInput._inputHandler = updatePreview;
                suffixInput.addEventListener('input', suffixInput._inputHandler);
            }

            // Add rule button
            var addRuleBtn = document.getElementById('addRuleBtn');
            if (addRuleBtn) {
                if (addRuleBtn._clickHandler) {
                    addRuleBtn.removeEventListener('click', addRuleBtn._clickHandler);
                }
                addRuleBtn._clickHandler = function() {
                    var childRankId = document.getElementById('ruleChildRank') ? document.getElementById('ruleChildRank').value : null;
                    if (!childRankId) { 
                        _showToast('Please select a rank', 'error'); 
                        return; 
                    }
                    _showToast('Inheritance rule added', 'success');
                    renderRankDetail();
                };
                addRuleBtn.addEventListener('click', addRuleBtn._clickHandler);
            }
        } finally {
            _isRendering = false;
        }
    }

    // =========================================================================
    // 6. SAVE RANK DETAIL
    // =========================================================================

    function saveRankDetail() {
        var rankId = rankUIState.selectedRankId;
        if (!rankId) return;
        
        var name = document.getElementById('rankName') ? document.getElementById('rankName').value : null;
        var priority = parseInt(document.getElementById('rankPriority') ? document.getElementById('rankPriority').value : 5);
        var symbol = document.getElementById('rankSymbol') ? document.getElementById('rankSymbol').value : null;
        var genderRadio = document.querySelector('input[name="gender"]:checked');
        var genderRestriction = genderRadio ? genderRadio.value : 'either';
        
        var updates = {
            name: name,
            priority: priority,
            symbol: symbol,
            genderRestriction: genderRestriction
        };
        
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.updateRank === 'function') {
            window.RankCommands.updateRank(rankId, updates);
            _showToast('Updated ' + name, 'success');
            renderTree();
            renderRankDetail();
            if (rankUIState.currentTab === 'analytics') renderAnalytics();
        }
    }

    // =========================================================================
    // 7. ANALYTICS
    // =========================================================================

    function renderAnalytics() {
        if (_isRendering) return;
        _isRendering = true;

        try {
            var container = document.getElementById(_analyticsContainerId);
            if (!container) return;
            
            if (!rankUIState.selectedRankId) {
                container.innerHTML = '<div class="empty-detail">' + _getCircleIcon() + ' Select a rank to view analytics</div>';
                return;
            }
            
            var rank = _getRankById(rankUIState.selectedRankId);
            if (!rank) {
                container.innerHTML = '<div class="empty-detail">' + _getCircleIcon() + ' Rank not found</div>';
                return;
            }
            
            var stats = _getRankHolderStats(rankUIState.selectedRankId);
            
            container.innerHTML = '<div style="max-width: 800px; margin: 0 auto;">' +
                '<h2 style="font-size:0.9rem;color:var(--accent);margin-bottom:16px;">' + _getRankIcon() + ' ' + _escapeHtml(rank.name) + ' - Analytics</h2>' +
                '<div class="rank-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px;">' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCircleIcon() + ' Total Holders</div><div class="rank-stat-value">' + stats.total + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">♂/♀</div><div class="rank-stat-value">' + stats.male + '/' + stats.female + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCheckIcon() + ' Living</div><div class="rank-stat-value">' + stats.living + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCrossIcon() + ' Deceased</div><div class="rank-stat-value">' + stats.deceased + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCircleIcon() + ' Minors (<18)</div><div class="rank-stat-value">' + stats.minors + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCircleIcon() + ' Adults (18-60)</div><div class="rank-stat-value">' + stats.adults + '</div></div>' +
                '<div class="rank-stat-card"><div class="rank-stat-label">' + _getCircleIcon() + ' Elders (60+)</div><div class="rank-stat-value">' + stats.elders + '</div></div>' +
                '</div>' +
                '</div>';
        } finally {
            _isRendering = false;
        }
    }

    // =========================================================================
    // 8. ISSUES - USING RankIssues SYSTEM WITH AUTO-FIX (NO ICONS ON BUTTONS)
    // =========================================================================

    function renderIssuesTab() {
        if (_isRendering) return;
        _isRendering = true;

        try {
            var container = document.getElementById(_issuesContainerId);
            if (!container) return;
            
            // Check if RankIssues is available
            if (typeof window.RankIssues === 'undefined' || 
                typeof window.RankIssues.checkAll !== 'function') {
                container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 60px; color: var(--dim);">' + 
                    _getWarningIcon() + ' Rank Issues system not loaded.</div>';
                return;
            }
            
            // Run the issues check
            var result = window.RankIssues.checkAll();
            
            if (!result.success) {
                container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 60px; color: var(--danger);">' + 
                    _getCrossIcon() + ' Error checking issues: ' + _escapeHtml(result.error) + '</div>';
                return;
            }
            
            var issues = result.issues;
            var issueCount = issues ? issues.length : 0;
            
            // Build the HTML
            var html = '<div style="max-width: 900px; margin: 0 auto; padding: 10px;">';
            
            // Header with stats
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
                '<h2 style="font-size:0.9rem;color:var(--accent);margin:0;">' + _getWarningIcon() + ' Rank Issues (' + issueCount + ')</h2>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<span style="font-size:0.6rem;padding:2px 10px;background:#cc3333;color:white;border-radius:10px;">' + (result.bySeverity.error ? result.bySeverity.error.length : 0) + ' Errors</span>' +
                '<span style="font-size:0.6rem;padding:2px 10px;background:#cc8833;color:white;border-radius:10px;">' + (result.bySeverity.warning ? result.bySeverity.warning.length : 0) + ' Warnings</span>' +
                '<span style="font-size:0.6rem;padding:2px 10px;background:#4488cc;color:white;border-radius:10px;">' + (result.bySeverity.info ? result.bySeverity.info.length : 0) + ' Info</span>' +
                '<button id="refreshIssuesBtn" class="btn" style="padding:2px 12px;font-size:0.6rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Refresh</button>' +
                '<button id="fixAllIssuesBtn" class="btn" style="padding:2px 12px;font-size:0.6rem;background:var(--accent);border:none;border-radius:4px;color:white;cursor:pointer;">Fix All</button>' +
                '</div>' +
                '</div>';
            
            if (!issues || issues.length === 0) {
                html += '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--dim);">' + 
                    _getCheckIcon() + ' No rank issues detected. All ranks are configured correctly.</div>';
            } else {
                html += '<div style="display:flex;flex-direction:column;gap:6px;">';
                
                // Sort issues by severity (error first)
                issues.sort(function(a, b) {
                    var order = { error: 0, warning: 1, info: 2 };
                    return (order[a.severity] || 3) - (order[b.severity] || 3);
                });
                
                for (var i = 0; i < issues.length; i++) {
                    var issue = issues[i];
                    var severityColor = issue.severity === 'error' ? '#cc3333' : (issue.severity === 'warning' ? '#cc8833' : '#4488cc');
                    var severityIcon = issue.severity === 'error' ? _getCrossIcon() : (issue.severity === 'warning' ? _getWarningIcon() : _getCircleIcon());
                    
                    html += '<div style="padding:10px 14px;background:var(--bg3);border-radius:6px;border-left:3px solid ' + severityColor + ';">' +
                        '<div style="display:flex;align-items:center;gap:6px;font-size:0.65rem;color:' + severityColor + ';">' +
                        severityIcon + ' <strong>' + issue.type + '</strong>';
                    
                    if (issue.rankName) {
                        html += ' <span style="color:var(--dim);font-weight:normal;">— ' + _escapeHtml(issue.rankName) + '</span>';
                    }
                    if (issue.characterName) {
                        html += ' <span style="color:var(--dim);font-weight:normal;">— ' + _escapeHtml(issue.characterName) + '</span>';
                    }
                    
                    html += '</div>' +
                        '<div style="font-size:0.7rem;margin-top:4px;color:var(--text);">' + _escapeHtml(issue.message) + '</div>';
                    
                    // Fix button - NO ICON, just text
                    if (issue.fix && typeof issue.fix === 'function') {
                        var fixLabel = issue.fixLabel || 'Fix';
                        html += '<button class="btn fix-issue-btn" style="margin-top:6px;padding:3px 10px;font-size:0.55rem;background:var(--accent);border:none;border-radius:4px;color:white;cursor:pointer;" data-issue-index="' + i + '">' + 
                            _escapeHtml(fixLabel) + '</button>';
                    } else if (issue.fixLabel) {
                        html += '<div style="margin-top:6px;font-size:0.55rem;color:var(--dim);">⚠️ ' + _escapeHtml(issue.fixLabel) + '</div>';
                    }
                    
                    html += '</div>';
                }
                
                html += '</div>';
            }
            
            html += '</div>';
            container.innerHTML = html;
            
            // Attach fix handlers
            var fixButtons = container.querySelectorAll('.fix-issue-btn');
            for (var j = 0; j < fixButtons.length; j++) {
                (function(btn, index) {
                    btn.addEventListener('click', function() {
                        // Re-run check to get fresh issues
                        var freshResult = window.RankIssues.checkAll();
                        if (freshResult.success && freshResult.issues && freshResult.issues[index]) {
                            var issue = freshResult.issues[index];
                            if (issue.fix && typeof issue.fix === 'function') {
                                btn.textContent = 'Fixing...';
                                btn.disabled = true;
                                
                                // Run the fix
                                var fixed = issue.fix();
                                if (fixed) {
                                    // Re-render to show updated state
                                    setTimeout(function() {
                                        renderIssuesTab();
                                    }, 500);
                                } else {
                                    btn.textContent = 'Failed';
                                    btn.style.background = '#cc3333';
                                    setTimeout(function() {
                                        renderIssuesTab();
                                    }, 1000);
                                }
                            }
                        } else {
                            renderIssuesTab();
                        }
                    });
                })(fixButtons[j], parseInt(fixButtons[j].dataset.issueIndex));
            }
            
            // Fix All button
            var fixAllBtn = document.getElementById('fixAllIssuesBtn');
            if (fixAllBtn) {
                if (fixAllBtn._clickHandler) {
                    fixAllBtn.removeEventListener('click', fixAllBtn._clickHandler);
                }
                fixAllBtn._clickHandler = function() {
                    var freshResult = window.RankIssues.checkAll();
                    if (!freshResult.success || !freshResult.issues || freshResult.issues.length === 0) {
                        _showToast('No issues to fix', 'info');
                        return;
                    }
                    
                    var allIssues = freshResult.issues;
                    var fixed = 0;
                    var failed = 0;
                    
                    for (var k = 0; k < allIssues.length; k++) {
                        var issue = allIssues[k];
                        if (issue.fix && typeof issue.fix === 'function') {
                            try {
                                var result = issue.fix();
                                if (result) {
                                    fixed++;
                                } else {
                                    failed++;
                                }
                            } catch (e) {
                                failed++;
                            }
                        }
                    }
                    
                    _showToast('Fixed ' + fixed + ' issues' + (failed > 0 ? ', ' + failed + ' failed' : ''), fixed > 0 ? 'success' : 'error');
                    renderIssuesTab();
                };
                fixAllBtn.addEventListener('click', fixAllBtn._clickHandler);
            }
            
            // Refresh button
            var refreshBtn = document.getElementById('refreshIssuesBtn');
            if (refreshBtn) {
                if (refreshBtn._clickHandler) {
                    refreshBtn.removeEventListener('click', refreshBtn._clickHandler);
                }
                refreshBtn._clickHandler = function() {
                    renderIssuesTab();
                };
                refreshBtn.addEventListener('click', refreshBtn._clickHandler);
            }
            
        } catch (e) {
            var container = document.getElementById(_issuesContainerId);
            if (container) {
                container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 60px; color: var(--danger);">' + 
                    _getCrossIcon() + ' Error: ' + _escapeHtml(e.message || 'Unknown error') + '</div>';
            }
        } finally {
            _isRendering = false;
        }
    }

    // =========================================================================
    // 9. CREATE NEW RANK
    // =========================================================================

    function createNewRank() {
        if (typeof window.RankCommands !== 'undefined' && 
            typeof window.RankCommands.createRank === 'function') {
            var result = window.RankCommands.createRank({ name: "New Rank", priority: 5 });
            if (result && result.success !== false) {
                var newRank = result.data || result;
                if (newRank && newRank.id) {
                    rankUIState.selectedRankId = newRank.id;
                    renderTree();
                    renderRankDetail();
                    _showToast('Created new rank: ' + newRank.name, 'success');
                    return newRank;
                }
            }
        }
        _showToast('Failed to create rank', 'error');
        return null;
    }

    // =========================================================================
    // 10. MAIN RENDER FUNCTION
    // =========================================================================

    function renderRanksManager(treeContainerId, detailContainerId, analyticsContainerId, issuesContainerId) {
        if (_isRendering) return;

        _treeContainerId = treeContainerId || 'rankTree';
        _detailContainerId = detailContainerId || 'detailPanel';
        _analyticsContainerId = analyticsContainerId || 'analyticsTab';
        _issuesContainerId = issuesContainerId || 'issuesTab';
        
        window.rankUIState = rankUIState;
        
        if (rankUIState.currentTab === 'issues') {
            renderIssuesTab();
        } else if (rankUIState.currentTab === 'analytics') {
            renderAnalytics();
        } else {
            renderTree();
            if (rankUIState.selectedRankId) {
                renderRankDetail();
            }
        }
    }

    // =========================================================================
    // 11. SWITCH TAB
    // =========================================================================

    function switchRankTab(tab) {
        if (rankUIState.currentTab !== tab) {
            rankUIState.currentTab = tab;
            renderRanksManager(_treeContainerId, _detailContainerId, _analyticsContainerId, _issuesContainerId);
        }
    }

    // =========================================================================
    // 12. EXPOSE TO WINDOW
    // =========================================================================

    window.renderRanksManager = renderRanksManager;
    window.switchRankTab = switchRankTab;
    window.createNewRank = createNewRank;
    window.rankUIState = rankUIState;

})();