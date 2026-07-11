/**
 * =============================================================================
 * STILL WATERS - MODALS CORE (modals-core.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-core.js
 * 
 * Core modal system - modal manager, simple dialogs.
 * 
 * DEPENDENCIES (uses external single sources):
 *   - formatting.js: escapeHtml, escapeHtmlPreserveSvg, containsSvg
 *   - ui.js: showToast
 *   - accessors.js: getCharacterById, getCharacters, getPlaces, getPlaceById
 *   - time.js: getCurrentYearSafe, calculateAge
 *   - icons.js: Icons
 * 
 * ICON POLICY: Minimal icons from icons.js only
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION
// =============================================================================

if (typeof window.escapeHtml !== 'function') {
    throw new Error('modals-core.js: escapeHtml not loaded. Ensure formatting.js loads first.');
}

// =============================================================================
// 1. DEPENDENCY WRAPPERS - ALIASES TO CANONICAL SOURCES
// =============================================================================

function _escapeHtml(str) {
    return window.escapeHtml(str);
}

function _escapeHtmlPreserveSvg(str) {
    if (typeof window.escapeHtmlPreserveSvg === 'function') {
        return window.escapeHtmlPreserveSvg(str);
    }
    return window.escapeHtml(str);
}

function _containsSvg(str) {
    if (typeof window.containsSvg === 'function') {
        return window.containsSvg(str);
    }
    return str && str.includes('<svg') && str.includes('</svg>');
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    return 1250;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') {
        return window.getCharacters();
    }
    return [];
}

function _getPlaces() {
    if (typeof window.getPlaces === 'function') {
        return window.getPlaces();
    }
    return [];
}

function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') {
        return window.getPlaceById(id);
    }
    return null;
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') {
        return window.getActiveRankDisplay(character);
    }
    return null;
}

function _getLocationTypeById(id) {
    if (typeof window.getLocationTypeById === 'function') {
        return window.getLocationTypeById(id);
    }
    return null;
}

function _getLocationTypePriority(typeId) {
    if (typeof window.getLocationTypePriority === 'function') {
        return window.getLocationTypePriority(typeId);
    }
    return 5;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    if (window.Icons && window.Icons.CIRCLE) {
        return window.Icons.CIRCLE;
    }
    return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
}

// =============================================================================
// 2. MODAL MANAGER
// =============================================================================

var _modalStack = [];
var _currentModalId = 0;

function openModal(options) {
    options = options || {};
    var title = options.title || 'Modal';
    var content = options.content || '';
    var onConfirm = options.onConfirm || null;
    var onCancel = options.onCancel || null;
    var onOpen = options.onOpen || null;
    var confirmText = options.confirmText || 'Confirm';
    var cancelText = options.cancelText || 'Cancel';
    var closeOnOverlay = options.closeOnOverlay !== undefined ? options.closeOnOverlay : true;
    var showCloseButton = options.showCloseButton !== undefined ? options.showCloseButton : true;
    var size = options.size || 'medium';
    
    var modalId = 'modal_' + (++_currentModalId);
    
    var modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; z-index:10000; display:flex; align-items:center; justify-content:center;';
    modal.style.zIndex = (10000 + _modalStack.length).toString();
    
    var maxWidth = size === 'small' ? '400px' : (size === 'large' ? '700px' : '550px');
    
    var escapedTitle = _escapeHtmlPreserveSvg(title);
    var closeIcon = _getIcon('X_HEAVY');
    
    modal.innerHTML = 
        '<div class="modal-overlay" data-close="true" style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8);"></div>' +
        '<div class="modal-container" style="position:relative; background:var(--bg2); border-radius:12px; max-width:' + maxWidth + '; width:90%; max-height:85vh; overflow-y:auto; border:1px solid var(--border);">' +
            '<div class="modal-header" style="padding:16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">' +
                '<h3 style="margin:0; font-family:Cinzel,serif; font-size:0.9rem; display:flex; align-items:center; gap:8px;">' + escapedTitle + '</h3>' +
                (showCloseButton ? '<button class="modal-close-btn" style="background:none; border:none; color:var(--dim); font-size:1.2rem; cursor:pointer; padding:4px 8px;">' + closeIcon + '</button>' : '') +
            '</div>' +
            '<div class="modal-body" style="padding:16px;">' + content + '</div>' +
            ((onConfirm || cancelText) ? 
            '<div class="modal-footer" style="padding:16px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">' +
                (cancelText ? '<button class="btn cancel-btn" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 14px; border-radius:6px; cursor:pointer;">' + _escapeHtml(cancelText) + '</button>' : '') +
                (onConfirm ? '<button class="btn primary confirm-btn" style="background:var(--accent); border:1px solid var(--accent); color:white; padding:6px 14px; border-radius:6px; cursor:pointer;">' + _escapeHtml(confirmText) + '</button>' : '') +
            '</div>' : '') +
        '</div>';
    
    document.body.appendChild(modal);
    _modalStack.push(modal);
    
    var closeModal = function() {
        modal.remove();
        _modalStack = _modalStack.filter(function(m) { return m.id !== modalId; });
    };
    
    var closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (closeOnOverlay) {
        var overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) { 
                if (e.target.dataset.close === 'true') closeModal(); 
            });
        }
    }
    
    var cancelBtn = modal.querySelector('.cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() { 
            if (onCancel) onCancel(); 
            closeModal(); 
        });
    }
    
    var confirmBtn = modal.querySelector('.confirm-btn');
    if (confirmBtn && onConfirm) {
        confirmBtn.addEventListener('click', function() { 
            onConfirm(); 
            closeModal(); 
        });
    }
    
    if (onOpen) {
        setTimeout(function() {
            onOpen();
        }, 50);
    }
    
    var escapeHandler = function(e) {
        if (e.key === 'Escape' && _modalStack[_modalStack.length - 1] && _modalStack[_modalStack.length - 1].id === modalId) {
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    return modal;
}

function closeTopModal() {
    var modal = _modalStack.pop();
    if (modal) modal.remove();
}

function closeAllModals() {
    _modalStack.forEach(function(m) { m.remove(); });
    _modalStack = [];
}

// =============================================================================
// 3. SIMPLE DIALOGS
// =============================================================================

function alertDialog(message, title) {
    title = title || 'Notice';
    openModal({ 
        title: title, 
        content: '<div>' + _escapeHtml(message) + '</div>', 
        confirmText: 'OK', 
        cancelText: '' 
    });
}

function confirmDialog(message, title, onConfirm) {
    title = title || 'Confirm';
    openModal({ 
        title: title, 
        content: '<div>' + _escapeHtml(message) + '</div>', 
        confirmText: 'Yes', 
        cancelText: 'No', 
        onConfirm: onConfirm 
    });
}

function successDialog(message, title) {
    title = title || 'Success';
    var checkIcon = _getIcon('CHECK_SIMPLE');
    openModal({ 
        title: title, 
        content: '<div style="color:#4a9060;">' + checkIcon + ' ' + _escapeHtml(message) + '</div>', 
        confirmText: 'OK', 
        cancelText: '' 
    });
}

function errorDialog(message, title) {
    title = title || 'Error';
    var xIcon = _getIcon('X_HEAVY');
    openModal({ 
        title: title, 
        content: '<div style="color:#c84444;">' + xIcon + ' ' + _escapeHtml(message) + '</div>', 
        confirmText: 'OK', 
        cancelText: '' 
    });
}

// =============================================================================
// 4. UNIFIED CHARACTER SELECTOR WRAPPER - FORWARDS TO modals-char-select.js
// =============================================================================

function openUnifiedCharacterSelector(options) {
    options = options || {};
    var title = options.title || 'Select Character';
    var targetId = options.targetId || null;
    var onSelect = options.onSelect || function() {};
    var filters = options.filters || {};
    var preset = options.preset || null;
    var onCancel = options.onCancel || null;
    
    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: title,
            targetId: targetId,
            onSelect: onSelect,
            filters: filters,
            preset: preset,
            onCancel: onCancel
        });
        return true;
    }
    
    _showToast('Character selector not available', 'error');
    return false;
}

// =============================================================================
// 5. UNIFIED LOCATION DROPDOWN BUILDER - FORWARDS TO locationDropdown.js
// =============================================================================

function buildLocationDropdown(selectedId, placeholderText, includeAll, includeUnknown) {
    if (typeof window.buildHierarchicalLocationOptions === 'function' && 
        typeof window.renderHierarchicalLocationOptionsHtml === 'function') {
        var allPlaces = _getPlaces();
        var options = window.buildHierarchicalLocationOptions(allPlaces);
        return window.renderHierarchicalLocationOptionsHtml(options, selectedId);
    }
    
    var places = _getPlaces();
    var html = '';
    if (placeholderText) {
        html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
    }
    if (includeAll) {
        html += '<option value="all"' + (selectedId === 'all' ? ' selected' : '') + '>All Locations</option>';
    }
    for (var i = 0; i < places.length; i++) {
        var selected = (selectedId === places[i].id) ? 'selected' : '';
        html += '<option value="' + places[i].id + '" ' + selected + '>' + _escapeHtml(places[i].displayName) + '</option>';
    }
    if (includeUnknown) {
        html += '<option value="unknown"' + (selectedId === 'unknown' ? ' selected' : '') + '>Unknown Location</option>';
    }
    return html;
}

function getLocationName(locationId) {
    if (typeof window.getPlaceName === 'function') {
        return window.getPlaceName(locationId);
    }
    if (!locationId) return 'Unknown';
    if (locationId === 'all') return 'All Locations';
    if (locationId === 'unknown') return 'Unknown Location';
    var place = _getPlaceById(locationId);
    if (place) return place.displayName;
    return 'Unknown';
}

function getLocationIdByName(name) {
    if (typeof window.getPlaceByDisplayName === 'function') {
        var place = window.getPlaceByDisplayName(name);
        return place ? place.id : null;
    }
    if (!name) return null;
    var places = _getPlaces();
    for (var i = 0; i < places.length; i++) {
        if (places[i].displayName === name || places[i].variableKey === name) {
            return places[i].id;
        }
    }
    return null;
}

// =============================================================================
// 6. UNDO MANAGER
// =============================================================================

var _undoStack = [];
var _redoStack = [];

function _recordAction(action) {
    _undoStack.push({
        description: action.description,
        undo: action.undo,
        redo: action.redo || action.undo,
        timestamp: Date.now(),
        id: 'undo_' + _undoStack.length + '_' + Date.now()
    });
    while (_undoStack.length > 50) _undoStack.shift();
    _redoStack.length = 0;
}

function undo() {
    var action = _undoStack.pop();
    if (!action) {
        _showToast('Nothing to undo', 'info');
        return false;
    }
    if (action.undo && typeof action.undo === 'function') {
        action.undo();
        _redoStack.push(action);
        _showToast('Undid: ' + (action.description || 'Last action'), 'info');
        return true;
    }
    return false;
}

function redo() {
    var action = _redoStack.pop();
    if (!action) {
        _showToast('Nothing to redo', 'info');
        return false;
    }
    if (action.redo && typeof action.redo === 'function') {
        action.redo();
        _undoStack.push(action);
        _showToast('Redid: ' + (action.description || 'Last action'), 'info');
        return true;
    }
    return false;
}

function showUndoPrompt(actionDescription, undoFunction, redoFunction, timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    _recordAction({
        description: actionDescription,
        undo: undoFunction,
        redo: redoFunction || undoFunction
    });
    
    var undoToast = document.createElement('div');
    undoToast.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10001; background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:12px 16px; display:flex; gap:12px; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    var undoIcon = _getIcon('UNDO');
    undoToast.innerHTML = 
        '<span>' + _escapeHtml(actionDescription) + '</span>' +
        '<button id="undoToastBtn" style="background:var(--accent); border:none; color:white; padding:4px 12px; border-radius:4px; cursor:pointer;">' + undoIcon + ' Undo</button>';
    document.body.appendChild(undoToast);
    
    var undoBtn = undoToast.querySelector('#undoToastBtn');
    var timeout = setTimeout(function() { undoToast.remove(); }, timeoutMs);
    
    undoBtn.addEventListener('click', function() {
        clearTimeout(timeout);
        undo();
        undoToast.remove();
    });
}

// =============================================================================
// 7. PREVIEW MODAL
// =============================================================================

function openPreviewModal(options) {
    options = options || {};
    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var xIcon = _getIcon('X_HEAVY');
    
    var consequencesHtml = (options.consequences || []).map(function(c) {
        var icon = c.severity === 'error' ? xIcon : (c.severity === 'warning' ? warningIcon : infoIcon);
        var color = c.severity === 'error' ? '#c62828' : (c.severity === 'warning' ? '#c87040' : 'var(--dim)');
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light);">' +
            '<span style="width:24px;">' + icon + '</span>' +
            '<span style="color:' + color + ';">' + _escapeHtml(c.message) + '</span>' +
        '</div>';
    }).join('');
    
    var modalContent = 
        '<div class="preview-modal">' +
            (consequencesHtml ? '<div style="margin-bottom:16px;"><div style="font-weight:bold;margin-bottom:8px;">Consequences:</div>' + consequencesHtml + '</div>' : '') +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;">' +
                    '<input type="checkbox" id="previewConfirmCheckbox">' +
                    '<span style="font-size:0.7rem;">I understand the consequences and wish to proceed</span>' +
                '</label>' +
            '</div>' +
            (options.actionDescription ? '<div class="info-note" style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.6rem;">This action can be undone: "' + _escapeHtml(options.actionDescription) + '"</div>' : '') +
        '</div>';
    
    openModal({
        title: options.title || 'Confirm Action',
        content: modalContent,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        onOpen: function() {
            var checkbox = document.getElementById('previewConfirmCheckbox');
            var confirmBtn = document.querySelector('.modal-footer .confirm-btn');
            if (checkbox && confirmBtn) {
                checkbox.addEventListener('change', function() {
                    confirmBtn.disabled = !checkbox.checked;
                    confirmBtn.style.opacity = checkbox.checked ? '1' : '0.5';
                    confirmBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
                });
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
            }
        },
        onConfirm: function() {
            if (options.onConfirm) options.onConfirm();
            if (options.actionUndo && options.actionRedo) {
                showUndoPrompt(
                    options.actionDescription || 'Action',
                    options.actionUndo,
                    options.actionRedo
                );
            }
        }
    });
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

// Modal manager
window.openModal = openModal;
window.closeTopModal = closeTopModal;
window.closeAllModals = closeAllModals;
window.openPreviewModal = openPreviewModal;

// Simple dialogs
window.alertDialog = alertDialog;
window.confirmDialog = confirmDialog;
window.successDialog = successDialog;
window.errorDialog = errorDialog;

// Undo/Redo
window.undo = undo;
window.redo = redo;
window.showUndoPrompt = showUndoPrompt;

// Core helpers - FORWARDING to canonical sources
window._escapeHtml = _escapeHtml;
window._escapeHtmlPreserveSvg = _escapeHtmlPreserveSvg;
window._containsSvg = _containsSvg;
window._showToast = _showToast;
window._getCurrentYear = _getCurrentYear;
window._calculateAge = _calculateAge;
window._getCharacterById = _getCharacterById;
window._getCharacters = _getCharacters;
window._getPlaces = _getPlaces;
window._getPlaceById = _getPlaceById;
window._getCurrentLocation = _getCurrentLocation;
window._getActiveRankDisplay = _getActiveRankDisplay;
window._getLocationTypeById = _getLocationTypeById;
window._getLocationTypePriority = _getLocationTypePriority;
window._saveMasterData = _saveMasterData;
window._getIcon = _getIcon;

// Unified character selector - FORWARDING
window.openUnifiedCharacterSelector = openUnifiedCharacterSelector;

// Unified location dropdown - FORWARDING
window.buildLocationDropdown = buildLocationDropdown;
window.getLocationName = getLocationName;
window.getLocationIdByName = getLocationIdByName;