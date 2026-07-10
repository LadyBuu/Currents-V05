/**
 * =============================================================================
 * STILL WATERS - MODALS CORE (modals-core.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-core.js
 * 
 * Core modal system - modal manager, dependency wrappers, simple dialogs.
 * Also contains unified character selector wrapper and location dropdown builder.
 * 
 * FIXED: _showToast now handles SVG icons correctly (innerHTML instead of textContent)
 * FIXED: All confirm buttons use simple text (no SVG leaks)
 * FIXED: Toast duration increased for better readability
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS (using icons.js)
// =============================================================================

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
// 2. DEPENDENCY WRAPPERS (Safe fallbacks)
// =============================================================================

/**
 * Safe wrapper for escapeHtml - uses ui.js version if available
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function _escapeHtml(str) {
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

/**
 * Safe wrapper for showToast - uses ui.js version if available
 * FIXED: Handles SVG icons properly, longer duration
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, info, warning)
 */
function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
    } else {
        _showToastFallback(message, type);
    }
}

/**
 * Fallback toast implementation for when window.showToast is not available
 * Uses innerHTML to properly render SVG icons
 * FIXED: Longer duration (5 seconds)
 */
function _showToastFallback(message, type) {
    var toast = document.createElement('div');
    toast.style.cssText = 
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;' +
        'background:var(--bg3);border:1px solid ' + (type === 'error' ? '#c84444' : type === 'warning' ? '#c8a844' : 'var(--accent)') + ';' +
        'border-radius:8px;padding:10px 20px;max-width:90%;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.5);' +
        'color:var(--text);font-size:0.8rem;';
    
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(function() {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(function() {
                if (toast.parentNode) toast.remove();
            }, 300);
        }
    }, 5000);
}

/**
 * Safe wrapper for getCurrentYearSafe
 * @returns {number} Current year
 */
function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    return 1250;
}

/**
 * Safe wrapper for calculateAge
 * @param {number} birthYear - Birth year
 * @param {boolean} isDeceased - Whether character is deceased
 * @param {number} deathYear - Death year (if deceased)
 * @returns {number} Age in years
 */
function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

/**
 * Safe wrapper for getCharacterById - uses accessors.js
 * @param {string} id - Character ID
 * @returns {Object|null} Character object or null
 */
function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

/**
 * Safe wrapper for getCharacters - uses accessors.js
 * @returns {Array} Array of character objects
 */
function _getCharacters() {
    if (typeof window.getCharacters === 'function') {
        return window.getCharacters();
    }
    return [];
}

/**
 * Safe wrapper for getPlaces - uses accessors.js
 * @returns {Array} Array of place objects
 */
function _getPlaces() {
    if (typeof window.getPlaces === 'function') {
        return window.getPlaces();
    }
    return [];
}

/**
 * Safe wrapper for getPlaceById - uses accessors.js
 * @param {string} id - Place ID
 * @returns {Object|null} Place object or null
 */
function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') {
        return window.getPlaceById(id);
    }
    return null;
}

/**
 * Safe wrapper for getCurrentLocation - uses accessors.js/world.js
 * @param {Object} character - Character object
 * @returns {string} Location name
 */
function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

/**
 * Safe wrapper for getActiveRankDisplay - uses accessors.js
 * @param {Object} character - Character object
 * @returns {Object|null} Rank display object or null
 */
function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') {
        return window.getActiveRankDisplay(character);
    }
    return null;
}

/**
 * Safe wrapper for getLocationTypeById - uses accessors.js
 * @param {string} id - Location type ID
 * @returns {Object|null} Location type object or null
 */
function _getLocationTypeById(id) {
    if (typeof window.getLocationTypeById === 'function') {
        return window.getLocationTypeById(id);
    }
    return null;
}

/**
 * Safe wrapper for getLocationTypePriority - uses accessors.js
 * @param {string} typeId - Location type ID
 * @returns {number} Priority or 5
 */
function _getLocationTypePriority(typeId) {
    if (typeof window.getLocationTypePriority === 'function') {
        return window.getLocationTypePriority(typeId);
    }
    return 5;
}

/**
 * Safe wrapper for saveMasterData
 */
function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

// =============================================================================
// 3. SVG HANDLING HELPERS
// =============================================================================

/**
 * Checks if a string contains SVG markup
 * @param {string} str - String to check
 * @returns {boolean} True if string contains SVG
 */
function _containsSvg(str) {
    if (!str) return false;
    return str.includes('<svg') && str.includes('</svg>');
}

/**
 * Safely escapes HTML except for SVG content
 * @param {string} str - String to escape
 * @returns {string} Escaped string with SVG preserved
 */
function _escapeHtmlPreserveSvg(str) {
    if (!str) return '';
    
    if (_containsSvg(str)) {
        var parts = str.split(/(<svg[^>]*>.*?<\/svg>)/gi);
        var result = '';
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (_containsSvg(part)) {
                result += part;
            } else {
                result += _escapeHtml(part);
            }
        }
        return result;
    }
    
    return _escapeHtml(str);
}

// =============================================================================
// 4. MODAL MANAGER
// =============================================================================

var _modalStack = [];
var _currentModalId = 0;

/**
 * Opens a modal dialog
 * @param {Object} options - Modal configuration
 * @param {string} options.title - Modal title
 * @param {string} options.content - HTML content for modal body
 * @param {Function} options.onConfirm - Callback when confirm button is clicked
 * @param {Function} options.onCancel - Callback when cancel button is clicked
 * @param {Function} options.onOpen - Callback when modal is opened (after DOM is ready)
 * @param {string} options.confirmText - Text for confirm button (default 'Confirm')
 * @param {string} options.cancelText - Text for cancel button (default 'Cancel')
 * @param {boolean} options.closeOnOverlay - Whether clicking overlay closes modal (default true)
 * @param {boolean} options.showCloseButton - Whether to show X close button (default true)
 * @param {string} options.size - Modal size: 'small', 'medium', 'large' (default 'medium')
 * @returns {HTMLElement} The created modal element
 */
function openModal(options) {
    var _options = options || {};
    var title = _options.title || 'Modal';
    var content = _options.content || '';
    var onConfirm = _options.onConfirm || null;
    var onCancel = _options.onCancel || null;
    var onOpen = _options.onOpen || null;
    var confirmText = _options.confirmText || 'Confirm';
    var cancelText = _options.cancelText || 'Cancel';
    var closeOnOverlay = _options.closeOnOverlay !== undefined ? _options.closeOnOverlay : true;
    var showCloseButton = _options.showCloseButton !== undefined ? _options.showCloseButton : true;
    var size = _options.size || 'medium';
    
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
        if (e.key === 'Escape' && _modalStack[_modalStack.length - 1]?.id === modalId) {
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    return modal;
}

/**
 * Closes the topmost (most recently opened) modal
 */
function closeTopModal() {
    var modal = _modalStack.pop();
    if (modal) modal.remove();
}

/**
 * Closes all open modals
 */
function closeAllModals() {
    _modalStack.forEach(function(m) { m.remove(); });
    _modalStack = [];
}

// =============================================================================
// 5. SIMPLE DIALOGS - FIXED: Simple text confirm buttons
// =============================================================================

/**
 * Simple alert dialog with OK button
 * @param {string} message - Alert message
 * @param {string} title - Dialog title (default 'Notice')
 */
function alertDialog(message, title) {
    title = title || 'Notice';
    openModal({ 
        title: title, 
        content: '<div>' + _escapeHtml(message) + '</div>', 
        confirmText: 'OK', 
        cancelText: '' 
    });
}

/**
 * Confirmation dialog with Yes/No buttons
 * @param {string} message - Confirmation message
 * @param {string} title - Dialog title (default 'Confirm')
 * @param {Function} onConfirm - Callback when Yes is clicked
 */
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

/**
 * Success dialog with green checkmark
 * @param {string} message - Success message
 * @param {string} title - Dialog title (default 'Success')
 */
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

/**
 * Error dialog with red X
 * @param {string} message - Error message
 * @param {string} title - Dialog title (default 'Error')
 */
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
// 6. UNIFIED CHARACTER SELECTOR WRAPPER
// =============================================================================

/**
 * Opens the unified character selector from modals-charSelect.js
 * This is the single entry point for character selection across all modals.
 * 
 * @param {Object} options
 * @param {string} options.title - Modal title
 * @param {string} options.targetId - Character ID to exclude or target
 * @param {Function} options.onSelect - Callback when character is selected
 * @param {Object} options.filters - Filter options (gender, status, location, etc.)
 * @param {string} options.preset - Preset name (partner, father, mother, child, etc.)
 * @param {Function} options.onCancel - Callback when cancelled
 * @returns {boolean} True if selector was opened
 */
function openUnifiedCharacterSelector(options) {
    options = options || {};
    var title = options.title || 'Select Character';
    var targetId = options.targetId || null;
    var onSelect = options.onSelect || function() {};
    var filters = options.filters || {};
    var preset = options.preset || null;
    var onCancel = options.onCancel || null;
    
    // Use the unified selector from modals-charSelect.js
    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: title,
            targetId: targetId,
            onSelect: onSelect,
            filters: filters,
            preset: preset
        });
        return true;
    }
    
    // Fallback to legacy selector (deprecated)
    if (typeof window.openCharacterSelectModal === 'function') {
        console.warn('Using deprecated openCharacterSelectModal. Please use openUnifiedCharacterSelector.');
        window.openCharacterSelectModal({
            title: title,
            targetCharacterId: targetId,
            onSelect: onSelect,
            filterFn: filters.filterFn || null,
            includeDeceased: filters.showDeceased || false,
            excludeId: filters.excludeId || null
        });
        return true;
    }
    
    _showToast('Character selector not available', 'error');
    return false;
}

// =============================================================================
// 7. UNIFIED LOCATION DROPDOWN BUILDER
// =============================================================================

/**
 * Builds a hierarchical location dropdown using accessors.js
 * This is the single entry point for location dropdowns across all modals.
 * 
 * @param {string} selectedId - Currently selected location ID
 * @param {string} placeholderText - Optional placeholder text (default: '-- Select a location --')
 * @param {boolean} includeAll - Whether to include "All Locations" option (default: true)
 * @param {boolean} includeUnknown - Whether to include "Unknown Location" option (default: true)
 * @returns {string} HTML for select options
 */
function buildLocationDropdown(selectedId, placeholderText, includeAll, includeUnknown) {
    placeholderText = placeholderText || '-- Select a location --';
    includeAll = includeAll !== undefined ? includeAll : true;
    includeUnknown = includeUnknown !== undefined ? includeUnknown : true;
    
    var places = _getPlaces();
    var html = '';
    
    if (placeholderText) {
        html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
    }
    if (includeAll) {
        html += '<option value="all">🌍 All Locations</option>';
    }
    
    // Build hierarchy using parentId
    var map = {};
    var roots = [];
    
    for (var i = 0; i < places.length; i++) {
        map[places[i].id] = places[i];
        if (!places[i].parentId) {
            roots.push(places[i]);
        }
    }
    
    // Sort roots by type priority
    roots.sort(function(a, b) {
        var pa = _getLocationTypePriority(a.typeId);
        var pb = _getLocationTypePriority(b.typeId);
        return pa - pb;
    });
    
    function renderChildren(parentId, level) {
        var children = [];
        for (var id in map) {
            if (map[id].parentId === parentId) {
                children.push(map[id]);
            }
        }
        children.sort(function(a, b) {
            var pa = _getLocationTypePriority(a.typeId);
            var pb = _getLocationTypePriority(b.typeId);
            return pa - pb;
        });
        
        var indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(level);
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            var selected = (selectedId === child.id) ? 'selected' : '';
            var type = _getLocationTypeById(child.typeId);
            var icon = (type && type.icon) ? type.icon : '⌂';
            var label = indent + icon + ' ' + _escapeHtml(child.displayName);
            if (type && type.displayName) {
                label += ' (' + _escapeHtml(type.displayName) + ')';
            }
            
            html += '<option value="' + child.id + '" ' + selected + '>' + label + '</option>';
            renderChildren(child.id, level + 1);
        }
    }
    
    for (var i = 0; i < roots.length; i++) {
        renderChildren(roots[i].id, 0);
    }
    
    // Unknown location option
    if (includeUnknown) {
        html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>❓ Unknown Location</option>';
    }
    
    return html;
}

/**
 * Gets a location name from an ID
 * @param {string} locationId - Location ID
 * @returns {string} Location display name
 */
function getLocationName(locationId) {
    if (!locationId) return 'Unknown';
    if (locationId === 'all') return 'All Locations';
    if (locationId === 'unknown') return 'Unknown Location';
    
    var place = _getPlaceById(locationId);
    if (place) return place.displayName;
    return 'Unknown';
}

/**
 * Gets a location ID from a display name
 * @param {string} name - Location display name
 * @returns {string|null} Location ID or null
 */
function getLocationIdByName(name) {
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
// 8. UNDO MANAGER
// =============================================================================

var _undoStack = [];
var _redoStack = [];

/**
 * Records an action for potential undo/redo
 * @param {Object} action - Action to record
 * @param {string} action.description - Human-readable description
 * @param {Function} action.undo - Function to call to undo the action
 * @param {Function} action.redo - Function to call to redo the action
 * @private
 */
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

/**
 * Undoes the last action
 * @returns {boolean} True if an action was undone, false otherwise
 */
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

/**
 * Redoes the last undone action
 * @returns {boolean} True if an action was redone, false otherwise
 */
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

/**
 * Shows a temporary undo prompt after an action
 * @param {string} actionDescription - Description of the action (e.g., "Moved character")
 * @param {Function} undoFunction - Function to call to undo the action
 * @param {Function} redoFunction - Function to call to redo the action (optional)
 * @param {number} timeoutMs - How long to show the prompt (default 5000ms)
 */
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
// 9. PREVIEW MODAL - FIXED: Simple text confirm buttons
// =============================================================================

/**
 * Opens a preview modal with consequences before confirming an action
 * @param {Object} options - Options
 * @param {string} options.title - Modal title
 * @param {Array} options.consequences - Array of consequence objects { message, severity }
 * @param {string} options.actionDescription - Description of the action for undo
 * @param {Function} options.actionUndo - Function to undo the action
 * @param {Function} options.actionRedo - Function to redo the action
 * @param {Function} options.onConfirm - Callback when action is confirmed
 */
function openPreviewModal(options) {
    var _options = options || {};
    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var xIcon = _getIcon('X_HEAVY');
    
    var consequencesHtml = (_options.consequences || []).map(function(c) {
        var icon = c.severity === 'error' ? xIcon : (c.severity === 'warning' ? warningIcon : infoIcon);
        var color = c.severity === 'error' ? '#c62828' : (c.severity === 'warning' ? '#c87040' : 'var(--dim)');
        return '<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
            '<span style="width: 24px;">' + icon + '</span>' +
            '<span style="color: ' + color + ';">' + _escapeHtml(c.message) + '</span>' +
        '</div>';
    }).join('');
    
    var modalContent = 
        '<div class="preview-modal">' +
            (consequencesHtml ? '<div style="margin-bottom: 16px;"><div style="font-weight: bold; margin-bottom: 8px;">Consequences:</div>' + consequencesHtml + '</div>' : '') +
            '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px;">' +
                    '<input type="checkbox" id="previewConfirmCheckbox">' +
                    '<span style="font-size: 0.7rem;">I understand the consequences and wish to proceed</span>' +
                '</label>' +
            '</div>' +
            (_options.actionDescription ? '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">This action can be undone: "' + _escapeHtml(_options.actionDescription) + '"</div>' : '') +
        '</div>';
    
    openModal({
        title: _options.title || 'Confirm Action',
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
            if (_options.onConfirm) _options.onConfirm();
            
            if (_options.actionUndo && _options.actionRedo) {
                showUndoPrompt(
                    _options.actionDescription || 'Action',
                    _options.actionUndo,
                    _options.actionRedo
                );
            }
        }
    });
}

// =============================================================================
// 10. EXPORTS (for use by other modal files)
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

// Core helpers
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

// Unified character selector
window.openUnifiedCharacterSelector = openUnifiedCharacterSelector;

// Unified location dropdown
window.buildLocationDropdown = buildLocationDropdown;
window.getLocationName = getLocationName;
window.getLocationIdByName = getLocationIdByName;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openModal: openModal,
        closeTopModal: closeTopModal,
        closeAllModals: closeAllModals,
        alertDialog: alertDialog,
        confirmDialog: confirmDialog,
        successDialog: successDialog,
        errorDialog: errorDialog,
        undo: undo,
        redo: redo,
        showUndoPrompt: showUndoPrompt,
        openPreviewModal: openPreviewModal,
        openUnifiedCharacterSelector: openUnifiedCharacterSelector,
        buildLocationDropdown: buildLocationDropdown,
        getLocationName: getLocationName,
        getLocationIdByName: getLocationIdByName,
        _escapeHtml: _escapeHtml,
        _escapeHtmlPreserveSvg: _escapeHtmlPreserveSvg,
        _containsSvg: _containsSvg,
        _showToast: _showToast,
        _getCurrentYear: _getCurrentYear,
        _calculateAge: _calculateAge,
        _getCharacterById: _getCharacterById,
        _getCharacters: _getCharacters,
        _getPlaces: _getPlaces,
        _getPlaceById: _getPlaceById,
        _getCurrentLocation: _getCurrentLocation,
        _getActiveRankDisplay: _getActiveRankDisplay,
        _getLocationTypeById: _getLocationTypeById,
        _getLocationTypePriority: _getLocationTypePriority,
        _saveMasterData: _saveMasterData,
        _getIcon: _getIcon
    };
}
