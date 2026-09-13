/**
 * =============================================================================
 * STILL WATERS - PERSISTENCE / STORAGE MANAGEMENT (storage.js)
 * =============================================================================
 * 
 * LOCATION: js/core/storage.js
 * 
 * SCOPE:
 *   - localStorage persistence (load, save, export, import, reset)
 *   - Cross-tab synchronization
 *   - Default master data factory
 * 
 * OUT OF SCOPE:
 *   - Cache invalidation → mutation boundaries (see below)
 *   - Domain statistics → their domain modules
 *   - UI toasts → caller decides
 *   - Schema normalization → integrity.js (ensureDataIntegrity)
 * 
 * SEMANTIC RULES:
 *   - Year 0 is valid. Never coerce falsy years to a default.
 *   - Save operations queue: if a save is in progress and another is
 *     requested, the second save runs after the first completes.
 *   - Persistence does NOT invalidate caches. Mutation boundaries do that.
 *   - Errors are returned, not swallowed. Callers decide how to surface them.
 * 
 * DEPENDENCIES:
 *   - time.js (TIME_CONSTANTS.DEFAULT_YEAR) — optional; falls back to 1250
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. CONFIG
// =============================================================================

var STORAGE_CONFIG = {
    STORAGE_KEY: 'stillwaters_master',
    DEFAULT_YEAR: 1250,
    SAVE_DEBOUNCE_MS: 100,
    CROSS_TAB_SYNC_MS: 100
};

// =============================================================================
// 1. MASTER DATA DEFAULT FACTORY
// =============================================================================

/**
 * The single canonical factory for a fresh masterData object.
 * Used by initialization, load failure, reset, and import.
 * 
 * All modules that need "an empty masterData" must call this.
 * Do NOT duplicate the shape anywhere else.
 */
function createDefaultMasterData() {
    var defaultYear = 1250;
    if (typeof window.TIME_CONSTANTS !== 'undefined'
        && typeof window.TIME_CONSTANTS.DEFAULT_YEAR === 'number') {
        defaultYear = window.TIME_CONSTANTS.DEFAULT_YEAR;
    }

    return {
        version: "2.0",
        lastUpdated: new Date().toISOString(),
        data: {
            characters: [],
            places: [],
            ranks: [],
            roles: [],
            locationTypes: [],
            governmentTypes: [],
            nameLists: {},
            cityNameParts: {},
            governments: [],
            households: [],
            residences: [],
            rankInheritanceRules: {},
            disasters: [],
            eventLog: [],
            currentYear: defaultYear,
            educationalInstitutions: [],
            educationalSubjects: {},
            subjectProgress: {}
        }
    };
}

// =============================================================================
// 2. INITIALIZE GLOBAL
// =============================================================================

if (typeof window.masterData === 'undefined') {
    window.masterData = createDefaultMasterData();
}

// =============================================================================
// 3. MODULE STATE
// =============================================================================

var _isLoading = false;
var _isSaving = false;
var _savePending = false;
var _saveTimeout = null;
var _storageListenerAdded = false;
var _syncTimeout = null;
var _syncing = false;
var _forceReloading = false;

// =============================================================================
// 4. VALIDATION HELPERS
// =============================================================================

/**
 * Returns true if `year` is a plausible integer world year.
 * @private
 */
function _isValidYear(year) {
    return typeof year === 'number'
        && Number.isFinite(year)
        && Number.isInteger(year);
}

/**
 * Normalizes an imported data object to the canonical shape.
 * Missing top-level collections are filled with empty defaults.
 * Existing values (including year 0) are preserved.
 * @private
 */
function _normalizeDataShape(input) {
    var defaults = createDefaultMasterData().data;
    var source = input || {};
    var out = {};

    var arrayKeys = [
        'characters', 'places', 'ranks', 'roles', 'locationTypes',
        'governmentTypes', 'governments', 'households', 'residences',
        'disasters', 'eventLog', 'educationalInstitutions'
    ];
    for (var i = 0; i < arrayKeys.length; i++) {
        var k = arrayKeys[i];
        out[k] = Array.isArray(source[k]) ? source[k] : defaults[k];
    }

    var objectKeys = [
        'nameLists', 'cityNameParts', 'rankInheritanceRules',
        'educationalSubjects', 'subjectProgress'
    ];
    for (var j = 0; j < objectKeys.length; j++) {
        var ok = objectKeys[j];
        out[ok] = (source[ok] && typeof source[ok] === 'object' && !Array.isArray(source[ok]))
            ? source[ok]
            : defaults[ok];
    }

    // Year: preserve explicit integers, including 0. Reject invalid.
    out.currentYear = _isValidYear(source.currentYear)
        ? source.currentYear
        : defaults.currentYear;

    return out;
}

// =============================================================================
// 5. LOAD
// =============================================================================

/**
 * Loads masterData from localStorage.
 * Replaces window.masterData with the normalized shape.
 * Does NOT invalidate caches — the caller decides that.
 * 
 * @returns {boolean} true if data was loaded (or defaults applied)
 */
function loadMasterData() {
    if (_isLoading) return false;
    _isLoading = true;

    try {
        var stored = localStorage.getItem(STORAGE_CONFIG.STORAGE_KEY);
        if (!stored) {
            window.masterData = createDefaultMasterData();
            _isLoading = false;
            return true;
        }

        var parsed = JSON.parse(stored);
        var sourceData = (parsed && parsed.data) ? parsed.data : parsed;

        window.masterData = {
            version: (parsed && parsed.version) || "2.0",
            lastUpdated: (parsed && parsed.lastUpdated) || new Date().toISOString(),
            data: _normalizeDataShape(sourceData)
        };

        _isLoading = false;
        return true;
    } catch (e) {
        console.error('storage.js: loadMasterData failed:', e);
        window.masterData = createDefaultMasterData();
        _isLoading = false;
        return false;
    }
}

// =============================================================================
// 6. SAVE (with queueing)
// =============================================================================

/**
 * Performs the actual write to localStorage.
 * @private
 * @returns {{ ok: boolean, error?: Error }}
 */
function _performSave() {
    try {
        // Ensure the currentYear default exists without overwriting 0
        if (window.masterData && window.masterData.data) {
            if (!_isValidYear(window.masterData.data.currentYear)) {
                var defaultYear = 1250;
                if (typeof window.TIME_CONSTANTS !== 'undefined'
                    && typeof window.TIME_CONSTANTS.DEFAULT_YEAR === 'number') {
                    defaultYear = window.TIME_CONSTANTS.DEFAULT_YEAR;
                }
                window.masterData.data.currentYear = defaultYear;
            }
        }

        window.masterData.lastUpdated = new Date().toISOString();
        localStorage.setItem(STORAGE_CONFIG.STORAGE_KEY, JSON.stringify(window.masterData));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

/**
 * Saves masterData to localStorage.
 * 
 * Queueing: if a save is in progress, subsequent calls mark the state dirty
 * and re-save when the current save finishes. No save is dropped.
 * 
 * @param {boolean} immediate - if true, bypass debounce (still respects queue)
 * @returns {boolean} true if save was scheduled or completed; false on error
 */
function saveMasterData(immediate) {
    immediate = immediate === true;

    // Clear any pending debounce
    if (_saveTimeout) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
    }

    if (immediate) {
        if (_isSaving) {
            // A save is already running; mark and return
            _savePending = true;
            return true;
        }
        _isSaving = true;
        var result = _performSave();
        _isSaving = false;

        if (_savePending) {
            _savePending = false;
            // Run again to capture changes made during the save
            return saveMasterData(true) && result.ok;
        }

        if (!result.ok) {
            console.error('storage.js: saveMasterData failed:', result.error);
            return false;
        }
        return true;
    }

    // Debounced path
    _saveTimeout = setTimeout(function() {
        _saveTimeout = null;
        saveMasterData(true);
    }, STORAGE_CONFIG.SAVE_DEBOUNCE_MS);

    return true;
}

// =============================================================================
// 7. EXPORT
// =============================================================================

/**
 * Downloads the current masterData as a JSON file.
 * @returns {boolean} true on success, false on failure
 */
function exportData() {
    if (!window.masterData || !window.masterData.data) {
        return false;
    }

    try {
        var exportObj = {
            type: "master",
            version: "2.0",
            exportDate: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(window.masterData.data))
        };

        var dataStr = JSON.stringify(exportObj, null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        var dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = 'stillwaters_master_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (e) {
        console.error('storage.js: exportData failed:', e);
        return false;
    }
}

// =============================================================================
// 8. IMPORT
// =============================================================================

/**
 * Opens a file picker, reads the file, normalizes the shape, replaces
 * window.masterData, and saves.
 * 
 * @param {Function} [onComplete] - callback(success, error) after import
 */
function importData(onComplete) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.onchange = function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) {
            if (typeof onComplete === 'function') onComplete(false, new Error('No file selected'));
            return;
        }

        var reader = new FileReader();

        reader.onload = function(ev) {
            try {
                var imported = JSON.parse(ev.target.result);
                var sourceData;

                if (imported && imported.type === "master" && imported.data) {
                    sourceData = imported.data;
                } else if (imported && imported.data && imported.data.characters) {
                    sourceData = imported.data;
                } else if (imported && imported.characters) {
                    sourceData = imported;
                } else {
                    throw new Error('Unrecognized file format');
                }

                window.masterData = {
                    version: "2.0",
                    lastUpdated: new Date().toISOString(),
                    data: _normalizeDataShape(sourceData)
                };

                saveMasterData(true);

                if (typeof onComplete === 'function') {
                    onComplete(true, null, window.masterData.data.characters.length);
                }
            } catch (err) {
                if (typeof onComplete === 'function') {
                    onComplete(false, err);
                } else {
                    console.error('storage.js: importData failed:', err);
                }
            }
        };

        reader.onerror = function() {
            if (typeof onComplete === 'function') {
                onComplete(false, new Error('Error reading file'));
            }
        };

        reader.readAsText(file);
    };

    input.click();
}

// =============================================================================
// 9. RESET
// =============================================================================

/**
 * Resets all data to defaults and removes the localStorage entry.
 * @param {boolean} [confirmed] - if false, does nothing (safety)
 * @returns {boolean} true on success
 */
function resetMasterData(confirmed) {
    if (confirmed !== true) return false;

    try {
        window.masterData = createDefaultMasterData();
        localStorage.removeItem(STORAGE_CONFIG.STORAGE_KEY);
        saveMasterData(true);
        return true;
    } catch (e) {
        console.error('storage.js: resetMasterData failed:', e);
        return false;
    }
}

// =============================================================================
// 10. FORCE RELOAD
// =============================================================================

/**
 * Reloads data from localStorage, discarding in-memory changes.
 * @returns {boolean} true on success
 */
function forceReloadData() {
    if (_forceReloading) return false;
    _forceReloading = true;
    try {
        return loadMasterData();
    } finally {
        _forceReloading = false;
    }
}

// =============================================================================
// 11. CROSS-TAB SYNC
// =============================================================================

function initCrossTabSync() {
    if (_storageListenerAdded) return;
    _storageListenerAdded = true;

    window.addEventListener('storage', function(e) {
        if (e.key !== STORAGE_CONFIG.STORAGE_KEY) return;
        if (_syncing) return;

        _syncing = true;
        if (_syncTimeout) clearTimeout(_syncTimeout);
        _syncTimeout = setTimeout(function() {
            try {
                loadMasterData();
                try {
                    if (typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('masterDataUpdated', {
                            detail: { source: 'cross-tab' }
                        }));
                    }
                } catch (evtErr) { /* ignore */ }
            } finally {
                _syncing = false;
            }
        }, STORAGE_CONFIG.CROSS_TAB_SYNC_MS);
    });
}

if (typeof window._crossTabSyncInitialized === 'undefined') {
    window._crossTabSyncInitialized = true;
    initCrossTabSync();
}

// =============================================================================
// 12. AUTO-LOAD
// =============================================================================

if (typeof window._storageInitialized === 'undefined') {
    window._storageInitialized = true;
    // Load synchronously so downstream modules find data ready.
    loadMasterData();
}

// =============================================================================
// 13. EXPORTS
// =============================================================================

window.createDefaultMasterData = createDefaultMasterData;
window.loadMasterData = loadMasterData;
window.saveMasterData = saveMasterData;
window.exportData = exportData;
window.importData = importData;
window.resetMasterData = resetMasterData;
window.forceReloadData = forceReloadData;

window.STORAGE_CONFIG = STORAGE_CONFIG;
// Backward-compat alias
window.CONFIG = STORAGE_CONFIG;