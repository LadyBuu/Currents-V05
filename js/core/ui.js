/**
 * =============================================================================
 * UI SYSTEM (ui.js) - SINGLE SOURCE OF TRUTH
 * =============================================================================
 * 
 * LOCATION: js/core/ui/ui.js
 * 
 * This is the CANONICAL source for:
 * - Toast notifications
 * - Loading overlays
 * - Progress indicators
 * - Skeleton loaders
 * - Button loading states
 * - GENERIC TAB SYSTEM (pluggable)
 * 
 * All other modules should use window.showToast, window.showLoading, etc.
 * 
 * DEPENDENCIES:
 *   - formatting.js: escapeHtml, escapeHtmlPreserveSvg
 *   - icons.js: Icons
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY - Use formatting.js for escapeHtml
// =============================================================================

if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
}

if (typeof window.escapeHtmlPreserveSvg !== 'function') {
    window.escapeHtmlPreserveSvg = function(str) {
        if (!str) return '';
        if (str.includes('<svg') && str.includes('</svg>')) {
            var parts = str.split(/(<svg[^>]*>.*?<\/svg>)/gi);
            var result = '';
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (part.includes('<svg') && part.includes('</svg>')) {
                    result += part;
                } else {
                    result += window.escapeHtml(part);
                }
            }
            return result;
        }
        return window.escapeHtml(str);
    };
}

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    return '';
}

// =============================================================================
// 1. GLOBAL STYLES INJECTION
// =============================================================================

function injectGlobalStyles() {
    if (document.querySelector('#ui-global-styles')) return;
    
    var style = document.createElement('style');
    style.id = 'ui-global-styles';
    style.textContent = 
        '::-webkit-scrollbar { width: 8px; height: 8px; }' +
        '::-webkit-scrollbar-track { background: var(--bg2); border-radius: 4px; }' +
        '::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 4px; }' +
        '::-webkit-scrollbar-thumb:hover { background: var(--accent-hover); }' +
        '::selection { background: var(--accent); color: white; }' +
        'button:focus, input:focus, select:focus, textarea:focus { outline: none; ring: 2px solid var(--accent); }' +
        'button:disabled, .btn:disabled { opacity: 0.5; cursor: not-allowed; }' +
        '.clickable { cursor: pointer; transition: opacity 0.2s; }' +
        '.clickable:hover { opacity: 0.8; }' +
        '@keyframes spin { to { transform: rotate(360deg); } }' +
        '@keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }' +
        '@keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }' +
        '@keyframes toastSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }' +
        
        /* Tab Container Scrolling */
        '.tab-container-scroll {' +
        '  max-height: calc(100vh - 200px);' +
        '  overflow-y: auto;' +
        '  overflow-x: hidden;' +
        '  padding: 8px 4px 8px 8px;' +
        '  scroll-behavior: smooth;' +
        '}' +
        
        '.tab-container-scroll::-webkit-scrollbar {' +
        '  width: 6px;' +
        '}' +
        
        '.tab-container-scroll::-webkit-scrollbar-track {' +
        '  background: var(--bg2);' +
        '  border-radius: 3px;' +
        '}' +
        
        '.tab-container-scroll::-webkit-scrollbar-thumb {' +
        '  background: var(--accent);' +
        '  border-radius: 3px;' +
        '}' +
        
        '.tab-container-scroll::-webkit-scrollbar-thumb:hover {' +
        '  background: var(--accent-hover);' +
        '}';
    document.head.appendChild(style);
}

function initUI() {
    injectGlobalStyles();
}

// =============================================================================
// 2. TOAST NOTIFICATIONS - CANONICAL IMPLEMENTATION
// =============================================================================

function getToastContainer() {
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Shows a toast notification - CANONICAL VERSION
 * All modules should use this via window.showToast
 * 
 * @param {string} message - Message to display (can contain HTML/SVG)
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - Display duration in ms (default 3000)
 * @returns {HTMLElement} The toast element
 */
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    var container = getToastContainer();
    
    var colors = { 
        success: '#4a9060', 
        error: '#c84444', 
        warning: '#c87040', 
        info: '#6a9ecf' 
    };
    
    var safeContent = message;
    if (typeof window.escapeHtmlPreserveSvg === 'function') {
        safeContent = window.escapeHtmlPreserveSvg(message);
    } else {
        safeContent = window.escapeHtml(message);
    }
    
    var toast = document.createElement('div');
    var icon = '';
    switch (type) {
        case 'success': icon = _getIcon('CHECK_SIMPLE'); break;
        case 'error': icon = _getIcon('X_HEAVY'); break;
        case 'warning': icon = _getIcon('WARNING'); break;
        default: icon = _getIcon('CIRCLE_DOT');
    }
    
    toast.innerHTML = 
        '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="flex-shrink:0;">' + icon + '</span>' +
            '<span style="flex:1;word-break:break-word;">' + safeContent + '</span>' +
            '<button class="toast-close" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:1rem;padding:4px;flex-shrink:0;">✕</button>' +
        '</div>';
    toast.style.cssText = 
        'background:var(--bg2);' +
        'border-left:4px solid ' + colors[type] + ';' +
        'border-radius:8px;' +
        'padding:12px 16px;' +
        'margin-bottom:8px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
        'animation:toastSlideIn 0.3s ease;' +
        'min-width:250px;' +
        'max-width:350px;' +
        'transition:opacity 0.3s ease;';
    
    container.appendChild(toast);
    
    toast.querySelector('.toast-close').addEventListener('click', function() {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    });
    
    var timeoutId = setTimeout(function() {
        if (toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease';
            setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
        }
    }, duration);
    toast._timeoutId = timeoutId;
    
    return toast;
}

function showSuccessToast(message, duration) {
    return showToast(message, 'success', duration || 3000);
}

function showErrorToast(message, duration) {
    return showToast(message, 'error', duration || 4000);
}

function showWarningToast(message, duration) {
    return showToast(message, 'warning', duration || 3500);
}

function showInfoToast(message, duration) {
    return showToast(message, 'info', duration || 3000);
}

function showToastSequence(messages, delayBetween) {
    delayBetween = delayBetween || 500;
    for (var i = 0; i < messages.length; i++) {
        (function(index) {
            setTimeout(function() {
                showToast(messages[index].message, messages[index].type || 'info');
            }, index * delayBetween);
        })(i);
    }
}

function showPersistentToast(message, type) {
    type = type || 'info';
    var container = getToastContainer();
    var colors = { 
        success: '#4a9060', 
        error: '#c84444', 
        warning: '#c87040', 
        info: '#6a9ecf' 
    };
    
    var safeContent = message;
    if (typeof window.escapeHtmlPreserveSvg === 'function') {
        safeContent = window.escapeHtmlPreserveSvg(message);
    } else {
        safeContent = window.escapeHtml(message);
    }
    
    var toast = document.createElement('div');
    var icon = '';
    switch (type) {
        case 'success': icon = _getIcon('CHECK_SIMPLE'); break;
        case 'error': icon = _getIcon('X_HEAVY'); break;
        case 'warning': icon = _getIcon('WARNING'); break;
        default: icon = _getIcon('CIRCLE_DOT');
    }
    
    toast.innerHTML = 
        '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="flex-shrink:0;">' + icon + '</span>' +
            '<span style="flex:1;word-break:break-word;">' + safeContent + '</span>' +
            '<button class="toast-close" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:1rem;">✕</button>' +
        '</div>';
    toast.style.cssText = 
        'background:var(--bg2);' +
        'border-left:4px solid ' + colors[type] + ';' +
        'border-radius:8px;' +
        'padding:12px 16px;' +
        'margin-bottom:8px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
        'min-width:250px;' +
        'max-width:350px;';
    
    container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', function() { toast.remove(); });
    return toast;
}

function clearAllToasts() {
    var container = getToastContainer();
    container.innerHTML = '';
}

// =============================================================================
// 3. LOADING OVERLAY
// =============================================================================

var _loadingOverlay = null;
var _loadingOverlayCount = 0;

function showLoading(message) {
    message = message || 'Loading...';
    _loadingOverlayCount++;
    
    if (_loadingOverlay) {
        var messageEl = _loadingOverlay.querySelector('.loading-message');
        if (messageEl) messageEl.textContent = message;
        return _loadingOverlay;
    }
    
    _loadingOverlay = document.createElement('div');
    _loadingOverlay.className = 'loading-overlay';
    _loadingOverlay.style.cssText = 
        'position:fixed;' +
        'top:0;' +
        'left:0;' +
        'right:0;' +
        'bottom:0;' +
        'background:rgba(0,0,0,0.7);' +
        'display:flex;' +
        'align-items:center;' +
        'justify-content:center;' +
        'z-index:20000;' +
        'flex-direction:column;' +
        'gap:16px;';
    _loadingOverlay.innerHTML = 
        '<div class="loading-spinner" style="width:48px;height:48px;border:4px solid var(--bg2);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>' +
        '<div class="loading-message" style="color:white;font-size:0.9rem;">' + window.escapeHtml(message) + '</div>';
    
    document.body.appendChild(_loadingOverlay);
    return _loadingOverlay;
}

function hideLoading() {
    _loadingOverlayCount--;
    if (_loadingOverlayCount <= 0 && _loadingOverlay) {
        _loadingOverlay.remove();
        _loadingOverlay = null;
        _loadingOverlayCount = 0;
    }
}

function forceHideLoading() {
    if (_loadingOverlay) _loadingOverlay.remove();
    _loadingOverlay = null;
    _loadingOverlayCount = 0;
}

// =============================================================================
// 4. INLINE LOADING INDICATORS
// =============================================================================

function showInlineLoading(containerId, message) {
    message = message || 'Loading...';
    var container = document.getElementById(containerId);
    if (!container) return null;
    
    var loader = document.createElement('div');
    loader.className = 'inline-loader';
    loader.id = 'loader_' + containerId;
    loader.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);';
    loader.innerHTML = 
        '<div style="width:24px;height:24px;border:2px solid var(--bg2);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>' +
        '<span>' + window.escapeHtml(message) + '</span>';
    
    if (!container.dataset.originalContent) container.dataset.originalContent = container.innerHTML;
    container.innerHTML = '';
    container.appendChild(loader);
    return loader;
}

function hideInlineLoading(containerId, restoreContent) {
    restoreContent = restoreContent !== false;
    var container = document.getElementById(containerId);
    if (!container) return;
    var loader = document.getElementById('loader_' + containerId);
    if (loader) loader.remove();
    if (restoreContent && container.dataset.originalContent) {
        container.innerHTML = container.dataset.originalContent;
        delete container.dataset.originalContent;
    }
}

// =============================================================================
// 5. BUTTON LOADING STATES
// =============================================================================

function showButtonLoading(buttonId, text) {
    var button = document.getElementById(buttonId);
    if (!button) return null;
    
    var originalText = button.innerHTML;
    var loadingText = text || originalText;
    
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;"></span>' + window.escapeHtml(loadingText);
    button.dataset.originalText = originalText;
    return originalText;
}

function hideButtonLoading(buttonId) {
    var button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = false;
    if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
        delete button.dataset.originalText;
    }
}

// =============================================================================
// 6. PROGRESS INDICATORS
// =============================================================================

function showProgressBar(containerId, current, total, label) {
    label = label || '';
    var container = document.getElementById(containerId);
    if (!container) return null;
    
    var percentage = (current / total) * 100;
    var progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.style.cssText = 'background:var(--bg2);border-radius:8px;padding:8px;margin:8px 0;';
    progressContainer.innerHTML = 
        (label ? '<div style="margin-bottom:8px;font-size:0.7rem;">' + window.escapeHtml(label) + '</div>' : '') +
        '<div style="background:var(--bg3);border-radius:4px;overflow:hidden;">' +
            '<div class="progress-fill" style="width:' + percentage + '%;background:var(--accent);height:20px;transition:width 0.3s ease;display:flex;align-items:center;justify-content:center;color:white;font-size:0.6rem;">' + Math.round(percentage) + '%</div>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:0.55rem;color:var(--dim);text-align:right;">' + current + ' / ' + total + '</div>';
    
    if (!container.dataset.progressOriginal) container.dataset.progressOriginal = container.innerHTML;
    container.innerHTML = '';
    container.appendChild(progressContainer);
    return progressContainer;
}

function hideProgressBar(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (container.dataset.progressOriginal) {
        container.innerHTML = container.dataset.progressOriginal;
        delete container.dataset.progressOriginal;
    }
}

function updateProgressBar(containerId, current, total) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var progressFill = container.querySelector('.progress-fill');
    var progressText = container.querySelector('.progress-container > div:last-child');
    
    if (progressFill) {
        var percentage;
        if (total !== null && total !== undefined) {
            percentage = (current / total) * 100;
            if (progressText) progressText.textContent = current + ' / ' + total;
        } else {
            percentage = current;
            if (progressText && current) {
                var match = progressText.textContent.match(/(\d+)\s*\/\s*(\d+)/);
                if (match) {
                    var oldTotal = parseInt(match[2], 10);
                    progressText.textContent = Math.round(current * oldTotal / 100) + ' / ' + oldTotal;
                }
            }
        }
        progressFill.style.width = percentage + '%';
        progressFill.textContent = Math.round(percentage) + '%';
    }
}

// =============================================================================
// 7. SKELETON LOADERS
// =============================================================================

function showSkeletonLoader(containerId, type, count) {
    type = type || 'card';
    count = count || 3;
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var skeletonHtml = '';
    
    switch (type) {
        case 'card':
            skeletonHtml = '<div class="skeleton-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">';
            for (var i = 0; i < count; i++) {
                skeletonHtml += 
                    '<div class="skeleton-card" style="background:var(--bg2);border-radius:8px;padding:16px;animation:pulse 1.5s ease-in-out infinite;">' +
                        '<div style="width:60%;height:20px;background:var(--bg3);border-radius:4px;margin-bottom:12px;"></div>' +
                        '<div style="width:80%;height:14px;background:var(--bg3);border-radius:4px;margin-bottom:8px;"></div>' +
                        '<div style="width:40%;height:14px;background:var(--bg3);border-radius:4px;"></div>' +
                    '</div>';
            }
            skeletonHtml += '</div>';
            break;
        case 'list':
            skeletonHtml = '<div class="skeleton-list" style="display:flex;flex-direction:column;gap:12px;">';
            for (var i = 0; i < count; i++) {
                skeletonHtml += 
                    '<div class="skeleton-list-item" style="display:flex;gap:12px;padding:12px;background:var(--bg2);border-radius:8px;animation:pulse 1.5s ease-in-out infinite;">' +
                        '<div style="width:40px;height:40px;background:var(--bg3);border-radius:50%;"></div>' +
                        '<div style="flex:1;">' +
                            '<div style="width:60%;height:16px;background:var(--bg3);border-radius:4px;margin-bottom:8px;"></div>' +
                            '<div style="width:40%;height:12px;background:var(--bg3);border-radius:4px;"></div>' +
                        '</div>' +
                    '</div>';
            }
            skeletonHtml += '</div>';
            break;
        case 'table':
            skeletonHtml = '<table class="skeleton-table" style="width:100%;border-collapse:collapse;"><thead><tr>';
            for (var i = 0; i < 3; i++) {
                skeletonHtml += '<th style="padding:12px;text-align:left;">&nbsp;</th>';
            }
            skeletonHtml += '</thead><tbody>';
            for (var i = 0; i < count; i++) {
                skeletonHtml += '<tr style="animation:pulse 1.5s ease-in-out infinite;">';
                for (var j = 0; j < 3; j++) {
                    skeletonHtml += '<td style="padding:12px;"><div style="height:16px;background:var(--bg3);border-radius:4px;"></div></td>';
                }
                skeletonHtml += '</tr>';
            }
            skeletonHtml += '</tbody></table>';
            break;
        case 'text':
        default:
            skeletonHtml = '<div class="skeleton-text" style="display:flex;flex-direction:column;gap:8px;">';
            for (var i = 0; i < count; i++) {
                var width = Math.floor(70 + Math.random() * 30);
                skeletonHtml += '<div style="height:14px;background:var(--bg3);border-radius:4px;animation:pulse 1.5s ease-in-out infinite;width:' + width + '%;"></div>';
            }
            skeletonHtml += '</div>';
            break;
    }
    
    if (!container.dataset.skeletonOriginal) container.dataset.skeletonOriginal = container.innerHTML;
    container.innerHTML = skeletonHtml;
}

function hideSkeletonLoader(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (container.dataset.skeletonOriginal) {
        container.innerHTML = container.dataset.skeletonOriginal;
        delete container.dataset.skeletonOriginal;
    }
}

// =============================================================================
// 8. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Global styles
window.injectGlobalStyles = injectGlobalStyles;
window.initUI = initUI;

// Toast notifications - PRIMARY EXPORTS
window.showToast = showToast;
window.showSuccessToast = showSuccessToast;
window.showErrorToast = showErrorToast;
window.showWarningToast = showWarningToast;
window.showInfoToast = showInfoToast;
window.showToastSequence = showToastSequence;
window.showPersistentToast = showPersistentToast;
window.clearAllToasts = clearAllToasts;

// Alias for backward compatibility
window._showToast = showToast;

// Loading overlay
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.forceHideLoading = forceHideLoading;

// Inline loading
window.showInlineLoading = showInlineLoading;
window.hideInlineLoading = hideInlineLoading;

// Button loading
window.showButtonLoading = showButtonLoading;
window.hideButtonLoading = hideButtonLoading;

// Progress indicators
window.showProgressBar = showProgressBar;
window.hideProgressBar = hideProgressBar;
window.updateProgressBar = updateProgressBar;

// Skeleton loaders
window.showSkeletonLoader = showSkeletonLoader;
window.hideSkeletonLoader = hideSkeletonLoader;

// =============================================================================
// 9. GENERIC TAB SYSTEM - PLUGGABLE & EXTENSIBLE
// =============================================================================

(function() {
    'use strict';

    var _tabInitialized = false;
    
    // Registry for tab renderers - ANY module can register here
    var _tabRenderers = {};

    /**
     * Register a renderer for a tab
     * @param {string} tabId - The tab ID (matches data-tab attribute)
     * @param {function} renderFn - Function(containerId, locationId, summary) 
     * @param {boolean} requiresSettlement - Whether this tab needs settlement data
     */
    window.registerTabRenderer = function(tabId, renderFn, requiresSettlement) {
        _tabRenderers[tabId] = {
            render: renderFn,
            requiresSettlement: requiresSettlement !== false
        };
        console.log('📌 Tab registered: ' + tabId);
    };

    /**
     * Get the current location ID from various sources
     */
    function getCurrentLocationId() {
        var locId = window.currentLocationId || window.selectedLocationId;
        if (!locId) {
            var selected = document.querySelector('.location-tree-item.selected, .settlement-item.selected');
            if (selected) {
                locId = selected.dataset.nodeId || selected.dataset.locId || selected.dataset.locationId;
            }
        }
        if (!locId) {
            var places = window.getPlaces ? window.getPlaces() : [];
            if (places.length > 0) {
                locId = places[0].id;
            }
        }
        return locId;
    }

    /**
     * Build settlement summary from data
     */
    function buildSettlementSummary(locationId) {
        var data = window.SettlementState ? window.SettlementState.getSettlementData(locationId) : null;
        if (!data) return null;
        
        var ranks = window.SettlementState && window.SettlementState._getAllRanks ? 
            window.SettlementState._getAllRanks() : [];
        var rank = null;
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].id === data.rankId) {
                rank = ranks[i];
                break;
            }
        }
        
        return {
            name: data.locationName || locationId,
            rank: rank || { id: data.rankId, name: data.rankId || 'Unknown' },
            prosperity: { value: data.prosperity || 50, description: 'Stable' },
            wealth: data.wealth || 0,
            totalDebt: data.totalDebt || 0,
            netWorth: (data.wealth || 0) - (data.totalDebt || 0),
            taxRate: data.taxRate || 10,
            tradeTariff: data.tradeTariff || 5,
            industryTaxRate: data.industryTaxRate || 8,
            crimeRate: data.crimeRate || 0.05,
            foundedYear: data.foundedYear || 1250,
            lastUpgraded: data.lastUpgraded || 1250,
            specializationRoleId: data.specializationRoleId || null,
            features: [],
            justice: {
                severity: data.justiceSeverity || 'medium',
                hasWatch: data.hasWatch || false,
                watchSize: data.watchSize || 0
            },
            spending: {
                military: data.militarySpending || 0,
                infrastructure: data.infrastructureSpending || 0,
                education: data.educationSpending || 0
            }
        };
    }

    /**
     * Render a tab's content
     */
    function renderTabContent(tabId, container) {
        var locId = getCurrentLocationId();

        if (!locId) {
            container.innerHTML = '<div style="padding: 20px; color: var(--dim); text-align: center;">Select a location first</div>';
            return;
        }

        // Store current location globally
        window.currentLocationId = locId;
        window.selectedLocationId = locId;

        // Get settlement data if needed
        var settlementData = null;
        var summary = null;
        
        if (_tabRenderers[tabId] && _tabRenderers[tabId].requiresSettlement) {
            settlementData = window.SettlementState ? window.SettlementState.getSettlementData(locId) : null;
            if (!settlementData) {
                if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
                    settlementData = SettlementCrud.createSettlementData(locId);
                }
            }
            summary = buildSettlementSummary(locId);
        }

        // Check if there's a registered renderer
        if (_tabRenderers[tabId]) {
            try {
                _tabRenderers[tabId].render(container.id, locId, summary);
                return;
            } catch (e) {
                console.warn('Tab renderer failed for ' + tabId + ':', e);
                container.innerHTML = '<div style="padding: 20px; color: var(--danger);">Error loading tab content</div>';
                return;
            }
        }

        // Default handling for unknown tabs
        container.innerHTML = '<div style="padding: 20px; color: var(--dim);">Tab "' + tabId + '" has no registered renderer</div>';
    }

    /**
     * Initialize the tab system
     */
    function initTabSystem() {
        if (_tabInitialized) return;
        _tabInitialized = true;

        // Get all tabs and containers
        var tabs = document.querySelectorAll('[data-tab]');
        var containers = {};

        // Find all tab containers
        tabs.forEach(function(tab) {
            var tabId = tab.dataset.tab;
            var containerId = 'tab-' + tabId;
            var container = document.getElementById(containerId);
            if (container) {
                containers[tabId] = container;
                container.classList.add('tab-container-scroll');
            }
        });

        // Handle tab clicks
        tabs.forEach(function(tab) {
            // Remove any existing click listeners by cloning
            var newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            
            newTab.addEventListener('click', function(e) {
                var tabId = this.dataset.tab;
                
                // Update active state
                document.querySelectorAll('[data-tab]').forEach(function(t) {
                    t.classList.remove('active');
                });
                this.classList.add('active');
                
                // Show/hide containers
                Object.keys(containers).forEach(function(id) {
                    var container = containers[id];
                    if (id === tabId) {
                        container.style.display = 'block';
                        container.style.visibility = 'visible';
                        container.style.opacity = '1';
                        container.style.height = 'auto';
                        renderTabContent(id, container);
                    } else {
                        container.style.display = 'none';
                        container.style.visibility = 'hidden';
                        container.style.opacity = '0';
                    }
                });
            });
        });

        // Handle location selection - update active tab
        document.addEventListener('click', function(e) {
            var item = e.target.closest('.location-tree-item, .settlement-item');
            if (item) {
                var locId = item.dataset.nodeId || item.dataset.locId || item.dataset.locationId;
                if (locId) {
                    window.currentLocationId = locId;
                    window.selectedLocationId = locId;
                    
                    var activeTab = document.querySelector('[data-tab].active');
                    if (activeTab) {
                        var tabId = activeTab.dataset.tab;
                        var container = document.getElementById('tab-' + tabId);
                        if (container) {
                            renderTabContent(tabId, container);
                        }
                    }
                }
            }
        });

        // Initial render - find active tab or first tab
        var activeTab = document.querySelector('[data-tab].active');
        if (!activeTab && tabs.length > 0) {
            activeTab = tabs[0];
            activeTab.classList.add('active');
        }
        
        if (activeTab) {
            var tabId = activeTab.dataset.tab;
            var container = document.getElementById('tab-' + tabId);
            if (container) {
                container.style.display = 'block';
                container.style.visibility = 'visible';
                container.style.opacity = '1';
                renderTabContent(tabId, container);
            }
        }
    }

    // Expose the tab system
    window._tabRenderers = _tabRenderers;
    window.renderTabContent = renderTabContent;
    window.getCurrentLocationId = getCurrentLocationId;
    window.buildSettlementSummary = buildSettlementSummary;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTabSystem);
    } else {
        setTimeout(initTabSystem, 100);
    }

})();