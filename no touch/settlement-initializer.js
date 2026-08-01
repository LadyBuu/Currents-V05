/**
 * =============================================================================
 * SETTLEMENT INITIALIZER - Auto-create settlements for all locations
 * =============================================================================
 * 
 * This file ensures every location has settlement data.
 * Call ensureSettlementData(locationId) whenever a location is selected.
 * 
 * DEPENDENCIES:
 *   - settlement-crud.js (SettlementCrud.createSettlementData)
 *   - location-state.js (LocationState.getPlace)
 * 
 * USAGE:
 *   // In your tab render functions, call this first:
 *   var settlement = ensureSettlementData(locationId);
 *   if (!settlement) { /* handle error */ 
 * 
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

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _createSettlementData(locationId, initialData) {
        if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
            return SettlementCrud.createSettlementData(locationId, initialData);
        }
        return null;
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _initializing = false;
    var _initializedLocations = {};

    // =========================================================================
    // 3. MAIN FUNCTIONS
    // =========================================================================

    /**
     * Ensures a location has settlement data. Creates it if missing.
     * @param {string} locationId - The location ID
     * @param {Object} initialData - Optional initial settlement data
     * @returns {Object|null} The settlement data, or null if failed
     */
    function ensureSettlementData(locationId, initialData) {
        if (!locationId) {
            return null;
        }

        // Check if already has settlement data
        var existing = _getSettlementData(locationId);
        if (existing) {
            return existing;
        }

        // Prevent re-entrancy
        if (_initializing) {
            return null;
        }

        _initializing = true;

        try {
            // Verify location exists
            var place = _getPlaceById(locationId);
            if (!place) {
                return null;
            }

            // Create settlement data
            var result = _createSettlementData(locationId, initialData);
            if (result) {
                _initializedLocations[locationId] = true;
                return result;
            }

            return null;

        } finally {
            _initializing = false;
        }
    }

    /**
     * Initializes all locations with settlement data
     * @param {boolean} silent - If true, don't show toast notifications
     * @returns {number} Number of settlements created
     */
    function initializeAllSettlements(silent) {
        silent = silent || false;

        var places = _getPlaces();
        var count = 0;

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            var data = _getSettlementData(place.id);
            if (!data) {
                var result = _createSettlementData(place.id);
                if (result) {
                    count++;
                    _initializedLocations[place.id] = true;
                }
            }
        }

        if (!silent && count > 0) {
            _showToast('Initialized ' + count + ' settlements', 'success');
        }

        return count;
    }

    /**
     * Checks if a location has settlement data
     * @param {string} locationId - The location ID
     * @returns {boolean} True if settlement data exists
     */
    function hasSettlementData(locationId) {
        return !!_getSettlementData(locationId);
    }

    /**
     * Gets settlement data, ensuring it exists first
     * @param {string} locationId - The location ID
     * @returns {Object|null} The settlement data, or null if failed
     */
    function getSettlementDataSafe(locationId) {
        return ensureSettlementData(locationId);
    }

    // =========================================================================
    // 4. AUTO-INITIALIZE ON LOAD
    // =========================================================================

    // Initialize all settlements when the page loads
    function autoInitialize() {
        // Wait for dependencies to be ready
        setTimeout(function() {
            try {
                initializeAllSettlements(true);
            } catch(e) {
                // Silently fail - will retry on first tab selection
            }
        }, 300);
    }

    // Also expose a function to force initialization from the console
    window._initAllSettlements = function() {
        return initializeAllSettlements(false);
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitialize);
    } else {
        autoInitialize();
    }

    // =========================================================================
    // 5. PATCH EXISTING TAB FUNCTIONS
    // =========================================================================

    // Patch renderSettlementOverview to auto-create settlement data
    var _originalRenderOverview = window.renderSettlementOverview;
    if (typeof _originalRenderOverview === 'function') {
        window.renderSettlementOverview = function(containerId, locationId, summary) {
            // Ensure settlement data exists
            var settlement = ensureSettlementData(locationId);
            if (!settlement) {
                var container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = '<div class="error-state">Failed to initialize settlement data</div>';
                }
                return;
            }
            // If no summary provided, get it
            if (!summary) {
                summary = typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary ?
                    SettlementQueries.getSettlementSummary(locationId) : null;
            }
            _originalRenderOverview(containerId, locationId, summary);
        };
    }

    // Patch renderSettlementFeatures to auto-create settlement data
    var _originalRenderFeatures = window.renderSettlementFeatures;
    if (typeof _originalRenderFeatures === 'function') {
        window.renderSettlementFeatures = function(containerId, locationId, summary) {
            var settlement = ensureSettlementData(locationId);
            if (!settlement) {
                var container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = '<div class="error-state">Failed to initialize settlement data</div>';
                }
                return;
            }
            if (!summary) {
                summary = typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary ?
                    SettlementQueries.getSettlementSummary(locationId) : null;
            }
            _originalRenderFeatures(containerId, locationId, summary);
        };
    }

    // Patch renderSettlementEconomy to auto-create settlement data
    var _originalRenderEconomy = window.renderSettlementEconomy;
    if (typeof _originalRenderEconomy === 'function') {
        window.renderSettlementEconomy = function(containerId, locationId, summary) {
            var settlement = ensureSettlementData(locationId);
            if (!settlement) {
                var container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = '<div class="error-state">Failed to initialize settlement data</div>';
                }
                return;
            }
            if (!summary) {
                summary = typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary ?
                    SettlementQueries.getSettlementSummary(locationId) : null;
            }
            _originalRenderEconomy(containerId, locationId, summary);
        };
    }



    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.ensureSettlementData = ensureSettlementData;
    window.initializeAllSettlements = initializeAllSettlements;
    window.hasSettlementData = hasSettlementData;
    window.getSettlementDataSafe = getSettlementDataSafe;

})();