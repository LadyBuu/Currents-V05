/**
 * =============================================================================
 * SELECTOR BASE - Shared utilities for selectors (js/selectors/selector-base.js)
 * =============================================================================
 * 
 * This file provides shared utilities for building selector modals.
 * 
 * DEPENDENCIES:
 *   - formatting.js (core)
 *   - icons.js (core)
 *   - modals-core.js (core)
 *   - QueryHelpers (core)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS - Core only
    // =========================================================================

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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
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

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    function _debounce(fn, delay) {
        var timeoutId;
        return function() {
            var args = arguments;
            var context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function() {
                fn.apply(context, args);
            }, delay);
        };
    }

    // =========================================================================
    // 2. GENDER HELPERS
    // =========================================================================

    function getGenderSymbol(gender) {
        if (gender === 'male') return '♂';
        if (gender === 'female') return '♀';
        return '⚥';
    }

    function getGenderLabel(gender) {
        if (gender === 'male') return 'Male';
        if (gender === 'female') return 'Female';
        return 'Unknown';
    }

    // =========================================================================
    // 3. RELATIONSHIP HELPERS - Core only (no system dependencies)
    // =========================================================================

    /**
     * Checks if two characters are blood relatives using ONLY character data
     * This is a core-level query - NO relationship system dependency
     */
    function isBloodRelativeBasic(charId1, charId2) {
        if (!charId1 || !charId2 || charId1 === charId2) return false;

        var char1 = typeof window.getCharacterById === 'function' ? window.getCharacterById(charId1) : null;
        var char2 = typeof window.getCharacterById === 'function' ? window.getCharacterById(charId2) : null;
        if (!char1 || !char2) return false;

        // Direct parent-child
        if (char1.motherId === charId2 || char1.fatherId === charId2) return true;
        if (char2.motherId === charId1 || char2.fatherId === charId1) return true;

        // Siblings (share a parent)
        if (char1.motherId && char2.motherId && char1.motherId === char2.motherId) return true;
        if (char1.fatherId && char2.fatherId && char1.fatherId === char2.fatherId) return true;

        // Grandparent-grandchild
        if (char1.motherId) {
            var mother = typeof window.getCharacterById === 'function' ? window.getCharacterById(char1.motherId) : null;
            if (mother && (mother.motherId === charId2 || mother.fatherId === charId2)) return true;
        }
        if (char1.fatherId) {
            var father = typeof window.getCharacterById === 'function' ? window.getCharacterById(char1.fatherId) : null;
            if (father && (father.motherId === charId2 || father.fatherId === charId2)) return true;
        }

        return false;
    }

    /**
     * Checks if two characters are spouses using ONLY character data
     * This is a core-level query - NO relationship system dependency
     */
    function isSpouseBasic(charId1, charId2) {
        if (!charId1 || !charId2 || charId1 === charId2) return false;

        var char1 = typeof window.getCharacterById === 'function' ? window.getCharacterById(charId1) : null;
        if (!char1 || !char1.relationships) return false;

        for (var i = 0; i < char1.relationships.length; i++) {
            var rel = char1.relationships[i];
            var partnerId = rel.partnerId || rel.participantB || (rel.participantA === charId1 ? rel.participantB : rel.participantA);
            
            if (partnerId === charId2) {
                var relType = rel.type || (rel.details && rel.details.type);
                if (relType === 'committed' || relType === 'marriage' || relType === 'romance') {
                    return true;
                }
            }
        }

        return false;
    }

    // =========================================================================
    // 4. SELECTOR BASE CLASS
    // =========================================================================

    function SelectorBase(options) {
        this.options = options || {};
        this.state = {
            isOpen: false,
            modalId: null,
            onSelect: options.onSelect || function() {},
            onCancel: options.onCancel || function() {},
            filters: options.filters || {},
            results: []
        };
        this._listenerCleanup = [];
    }

    /**
     * Escapes HTML for safe rendering
     */
    SelectorBase.prototype.escapeHtml = function(str) {
        return _escapeHtml(str);
    };

    /**
     * Gets an icon
     */
    SelectorBase.prototype.getIcon = function(name) {
        return _getIconSafe(name);
    };

    /**
     * Gets gender symbol
     */
    SelectorBase.prototype.getGenderSymbol = function(gender) {
        return getGenderSymbol(gender);
    };

    /**
     * Checks if two characters are blood relatives
     */
    SelectorBase.prototype.isBloodRelative = function(id1, id2) {
        return isBloodRelativeBasic(id1, id2);
    };

    /**
     * Checks if two characters are spouses
     */
    SelectorBase.prototype.isSpouse = function(id1, id2) {
        return isSpouseBasic(id1, id2);
    };

    /**
     * Opens a modal with the given content
     */
    SelectorBase.prototype.openModal = function(title, content, confirmText, onConfirm) {
        var self = this;
        var modal = _openModal({
            title: title,
            content: content,
            confirmText: confirmText || 'Cancel',
            cancelText: '',
            showConfirm: true,
            onConfirm: function() {
                self.state.isOpen = false;
                if (self.state.onCancel) {
                    self.state.onCancel();
                }
                if (onConfirm) onConfirm();
            }
        });
        this.state.modalId = modal ? modal.id : null;
        this.state.isOpen = true;
        return modal;
    };

    /**
     * Closes the selector
     */
    SelectorBase.prototype.close = function() {
        this.state.isOpen = false;
        this._cleanup();
        _closeTopModal();
    };

    /**
     * Registers a listener for cleanup
     */
    SelectorBase.prototype._registerListener = function(element, event, handler) {
        element.addEventListener(event, handler);
        this._listenerCleanup.push(function() {
            element.removeEventListener(event, handler);
        });
    };

    /**
     * Cleans up all registered event listeners
     */
    SelectorBase.prototype._cleanup = function() {
        for (var i = 0; i < this._listenerCleanup.length; i++) {
            try {
                this._listenerCleanup[i]();
            } catch (e) {}
        }
        this._listenerCleanup = [];
    };

    /**
     * Debounce helper
     */
    SelectorBase.prototype.debounce = function(fn, delay) {
        return _debounce(fn, delay || 300);
    };

    /**
     * Show toast message
     */
    SelectorBase.prototype.showToast = function(message, type) {
        _showToast(message, type || 'info');
    };

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SelectorBase = SelectorBase;
    window._SelectorBaseHelpers = {
        escapeHtml: _escapeHtml,
        getIcon: _getIconSafe,
        getGenderSymbol: getGenderSymbol,
        getGenderLabel: getGenderLabel,
        isBloodRelativeBasic: isBloodRelativeBasic,
        isSpouseBasic: isSpouseBasic,
        openModal: _openModal,
        closeTopModal: _closeTopModal,
        showToast: _showToast,
        debounce: _debounce
    };

})();