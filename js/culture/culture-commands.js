/**
 * =============================================================================
 * STILL WATERS - CULTURE COMMANDS (js/culture/culture-commands.js)
 * =============================================================================
 * 
 * All write operations for culture management.
 * 
 * FIXES:
 *   - Properly saves to masterData
 *   - Ensures cultures array exists
 *   - Proper cache invalidation after save
 *   - FIXED: updateCulture actually persists to localStorage
 *   - FIXED: createCulture persists immediately
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
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

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _invalidateCaches() {
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
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

    function _ensureCulturesArray() {
        if (window.masterData && window.masterData.data) {
            if (!window.masterData.data.cultures) {
                window.masterData.data.cultures = [];
                _saveMasterData();
            }
            return window.masterData.data.cultures;
        }
        return [];
    }

    function _getDefaultAppearance() {
        return window.CULTURE_DEFAULT_APPEARANCE || {
            skinTones: [{ value: 'Fair', weight: 50 }, { value: 'Olive', weight: 30 }, { value: 'Dark', weight: 20 }],
            eyeColors: [{ value: 'Brown', weight: 40 }, { value: 'Blue', weight: 30 }, { value: 'Green', weight: 30 }],
            hairColors: [{ value: 'Brown', weight: 40 }, { value: 'Blonde', weight: 30 }, { value: 'Black', weight: 30 }],
            hairTypes: [{ value: 'Straight', weight: 40 }, { value: 'Wavy', weight: 30 }, { value: 'Curly', weight: 30 }],
            buildTypes: [{ value: 'Slim', weight: 30 }, { value: 'Average', weight: 40 }, { value: 'Athletic', weight: 30 }],
            height: { male: { min: 155, max: 200 }, female: { min: 145, max: 185 } },
            commonFeatures: [{ value: 'High cheekbones', weight: 50 }, { value: 'Strong jawline', weight: 50 }]
        };
    }

    function _getDefaultMythology() {
        return {
            creation: '',
            afterlife: '',
            keyDeities: [],
            keyEvents: [],
            cosmology: '',
            symbols: [],
            themes: []
        };
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. CULTURE CREATION
    // =========================================================================

    function createCulture(data) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            data = data || {};

            // Ensure cultures array exists
            _ensureCulturesArray();

            var newCulture = {
                id: _generateId('culture'),
                name: data.name || 'New Culture',
                displayName: data.displayName || data.name || 'New Culture',
                description: data.description || '',
                icon: data.icon || 'STAR_4',

                // Appearance (weighted probabilities)
                appearance: data.appearance || _getDefaultAppearance(),

                // Mythology (flavor text only)
                mythology: data.mythology || _getDefaultMythology(),

                // Associations
                locations: data.locations || [],
                religions: data.religions || [],

                // Metadata
                createdAt: Date.now(),
                updatedAt: Date.now(),
                notes: data.notes || ''
            };

            // Validate required fields
            if (!newCulture.name || newCulture.name.trim() === '') {
                return { success: false, reason: 'Culture name is required' };
            }

            var state = _getState();
            if (state) {
                var cultures = state.getAllCultures();
                cultures.push(newCulture);
                state._setCultures(cultures);
                state._emitCultureChange('create', newCulture);
            } else {
                // Fallback: directly update masterData
                var masterCultures = _ensureCulturesArray();
                masterCultures.push(newCulture);
                _saveMasterData();
            }

            _invalidateCaches();
            _logEvent('culture', 'Culture Created', 'Created: ' + newCulture.name, []);

            return { success: true, data: newCulture };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. CULTURE UPDATE
    // =========================================================================

    function updateCulture(id, updates) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var culture = state ? state.getCulture(id) : null;

            if (!culture) {
                return { success: false, reason: 'Culture not found' };
            }

            // Allowed fields for update
            var allowedFields = [
                'name', 'displayName', 'description', 'icon',
                'appearance', 'mythology', 'locations', 'religions', 'notes'
            ];

            var changed = false;
            for (var i = 0; i < allowedFields.length; i++) {
                var key = allowedFields[i];
                if (updates[key] !== undefined) {
                    if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
                        // Deep merge for objects
                        if (typeof culture[key] === 'object' && culture[key] !== null && !Array.isArray(culture[key])) {
                            culture[key] = _deepMerge(culture[key], updates[key]);
                        } else {
                            culture[key] = updates[key];
                        }
                    } else {
                        culture[key] = updates[key];
                    }
                    changed = true;
                }
            }

            if (!changed) {
                return { success: true, data: culture, message: 'No changes' };
            }

            culture.updatedAt = Date.now();

            if (state) {
                var cultures = state.getAllCultures();
                var index = -1;
                for (var j = 0; j < cultures.length; j++) {
                    if (cultures[j].id === id) {
                        index = j;
                        break;
                    }
                }
                if (index !== -1) {
                    cultures[index] = culture;
                    state._setCultures(cultures);
                    state._emitCultureChange('update', culture);
                } else {
                    // If not found in state, add it
                    cultures.push(culture);
                    state._setCultures(cultures);
                    state._emitCultureChange('update', culture);
                }
            } else {
                // Fallback: directly update masterData
                var masterCultures = _ensureCulturesArray();
                var idx = -1;
                for (var j = 0; j < masterCultures.length; j++) {
                    if (masterCultures[j].id === id) {
                        idx = j;
                        break;
                    }
                }
                if (idx !== -1) {
                    masterCultures[idx] = culture;
                } else {
                    masterCultures.push(culture);
                }
                _saveMasterData();
            }

            _invalidateCaches();
            _logEvent('culture', 'Culture Updated', 'Updated: ' + culture.name, []);

            return { success: true, data: culture };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. CULTURE DELETION
    // =========================================================================

    function deleteCulture(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var culture = state ? state.getCulture(id) : null;

            if (!culture) {
                return { success: false, reason: 'Culture not found' };
            }

            if (state) {
                var cultures = state.getAllCultures();
                var newCultures = [];
                var removed = null;
                for (var i = 0; i < cultures.length; i++) {
                    if (cultures[i].id === id) {
                        removed = cultures[i];
                    } else {
                        newCultures.push(cultures[i]);
                    }
                }
                if (!removed) {
                    return { success: false, reason: 'Culture not found' };
                }
                state._setCultures(newCultures);
                state._emitCultureChange('delete', removed);
            } else {
                // Fallback: directly update masterData
                var masterCultures = _ensureCulturesArray();
                var newCultures = [];
                var removed = null;
                for (var i = 0; i < masterCultures.length; i++) {
                    if (masterCultures[i].id === id) {
                        removed = masterCultures[i];
                    } else {
                        newCultures.push(masterCultures[i]);
                    }
                }
                if (!removed) {
                    return { success: false, reason: 'Culture not found' };
                }
                if (window.masterData && window.masterData.data) {
                    window.masterData.data.cultures = newCultures;
                    _saveMasterData();
                }
            }

            _invalidateCaches();
            _logEvent('culture', 'Culture Deleted', 'Deleted: ' + culture.name, []);

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. HELPER - DEEP MERGE
    // =========================================================================

    function _deepMerge(target, source) {
        var result = {};
        for (var key in target) {
            if (target.hasOwnProperty(key)) {
                result[key] = target[key];
            }
        }
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                        result[key] = _deepMerge(result[key], source[key]);
                    } else {
                        result[key] = _deepMerge({}, source[key]);
                    }
                } else {
                    result[key] = source[key];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CultureCommands = {
        createCulture: createCulture,
        updateCulture: updateCulture,
        deleteCulture: deleteCulture
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureCommands;
    }

})();