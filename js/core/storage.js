/**
 * =============================================================================
 * STILL WATERS - PERSISTENCE / STORAGE MANAGEMENT (storage.js)
 * =============================================================================
 * 
 * LOCATION: js/core/storage.js
 * 
 * SINGLE SOURCE OF TRUTH for persistence.
 * 
 * SCOPE:
 *   - localStorage read/write
 *   - Cross-tab coordination
 *   - Default data factory (delegated to storage-schema.js if loaded)
 *   - Load/save/reload/reset
 * 
 * OUT OF SCOPE:
 *   - Schema normalization and migration → storage-schema.js
 *   - Export/download → exportUtils.js
 *   - Cache invalidation → mutation boundaries
 *   - UI feedback → caller
 * 
 * SEMANTIC RULES:
 *   - load: no entry → defaults; valid entry → load; corrupt entry → signal failure.
 *   - save: returns true only when localStorage.setItem succeeded.
 *   - import: does not report success if save failed.
 *   - reset: does not report success if save failed.
 *   - cross-tab: does not silently overwrite unsaved local changes.
 *   - TIME_CONSTANTS is a required dependency.
 * 
 * DEPENDENCIES:
 *   - time.js (TIME_CONSTANTS.DEFAULT_YEAR) — REQUIRED
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY GUARDS
// =============================================================================

function _requireTime() {
    if (typeof window.TIME_CONSTANTS === 'undefined'
        || typeof window.TIME_CONSTANTS.DEFAULT_YEAR !== 'number') {
        throw new Error('storage.js: time.js must load first (TIME_CONSTANTS missing).');
    }
}

// =============================================================================
// 1. CONFIG
// =============================================================================

var STORAGE_CONFIG = Object.freeze({
    STORAGE_KEY: 'stillwaters_master',
    SCHEMA_VERSION: 2,
    SAVE_DEBOUNCE_MS: 100,
    CROSS_TAB_SYNC_MS: 100
});

// =============================================================================
// 2. MODULE STATE
// =============================================================================

var _isLoading = false;
var _isSaving = false;
var _saveTimeout = null;
var _forceReloading = false;

// Tracks whether the current in-memory data has unsaved changes.
// Set true by mutation boundaries via markDirty(); cleared after save.
var _isDirty = false;

// Cross-tab coordination
var _storageListenerAdded = false;
var _syncTimeout = null;
var _syncing = false;

// =============================================================================
// 3. DEFAULT FACTORY
// =============================================================================

/**
 * Creates a fresh default masterData structure.
 * If storage-schema.js is loaded, delegates to it. Otherwise uses the
 * built-in fallback (which must match the schema).
 * 
 * @returns {Object}
 */
function createDefaultMasterData() {
    _requireTime();

    if (typeof window.createDefaultMasterDataOverride === 'function') {
        return window.createDefaultMasterDataOverride();
    }

    var defaultYear = window.TIME_CONSTANTS.DEFAULT_YEAR;

    return {
        schemaVersion: STORAGE_CONFIG.SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
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
// 4. VALIDATION
// =============================================================================

/**
 * Returns true if the given value looks like a masterData envelope.
 * @private
 */
function _isMasterDataEnvelope(value) {
    if (!value || typeof value !== 'object') return false;
    if (!value.data || typeof value.data !== 'object') return false;
    if (Array.isArray(value.data)) return false;
    return true;
}

/**
 * Returns true if the given value looks like a legacy masterData blob
 * (data envelope without schemaVersion / savedAt).
 * @private
 */
function _isLegacyDataBlob(value) {
    if (!value || typeof value !== 'object') return false;
    return Array.isArray(value.characters) && Array.isArray(value.places);
}

// =============================================================================
// 5. LOAD
// =============================================================================

/**
 * Loads masterData from localStorage.
 * 
 * Outcomes:
 *   { ok: true, source: 'defaults' }  — no storage entry; defaults installed
 *   { ok: true, source: 'storage' }   — valid data loaded
 *   { ok: false, error: 'corrupt' }   — persisted data could not be parsed
 *   { ok: false, error: 'schema' }    — persisted data shape was not recognized
 * 
 * On failure, window.masterData is NOT replaced. The caller decides how to
 * recover (e.g., offer to reset, or show a recovery UI).
 * 
 * @returns {{ ok: boolean, source?: string, error?: string }}
 */
function loadMasterData() {
    if (_isLoading) return { ok: false, error: 'in-progress' };
    _isLoading = true;

    try {
        var stored = localStorage.getItem(STORAGE_CONFIG.STORAGE_KEY);

        if (stored === null) {
            window.masterData = createDefaultMasterData();
            _isDirty = false;
            return { ok: true, source: 'defaults' };
        }

        var parsed;
        try {
            parsed = JSON.parse(stored);
        } catch (parseError) {
            console.error('storage.js: persisted data is not valid JSON:', parseError);
            return { ok: false, error: 'corrupt' };
        }

        // Accept both envelope and legacy blob forms
        var envelope;
        if (_isMasterDataEnvelope(parsed)) {
            envelope = parsed;
        } else if (_isLegacyDataBlob(parsed)) {
            envelope = {
                schemaVersion: STORAGE_CONFIG.SCHEMA_VERSION,
                savedAt: new Date().toISOString(),
                data: parsed
            };
        } else if (_isMasterDataEnvelope({ data: parsed })) {
            envelope = {
                schemaVersion: STORAGE_CONFIG.SCHEMA_VERSION,
                savedAt: new Date().toISOString(),
                data: parsed
            };
        } else {
            console.error('storage.js: persisted data has unrecognized shape');
            return { ok: false, error: 'schema' };
        }

        // Normalize via schema layer if available
        if (typeof window.normalizeMasterData === 'function') {
            envelope = window.normalizeMasterData(envelope);
        }

        window.masterData = envelope;
        _isDirty = false;
        return { ok: true, source: 'storage' };
    } catch (e) {
        console.error('storage.js: load failed:', e);
        return { ok: false, error: 'unknown' };
    } finally {
        _isLoading = false;
    }
}

// =============================================================================
// 6. SAVE
// =============================================================================

/**
 * Performs the synchronous write to localStorage.
 * @private
 * @returns {{ ok: boolean, error?: Error }}
 */
function _performSave() {
    try {
        if (!window.masterData || !window.masterData.data) {
            return { ok: false, error: new Error('masterData not initialized') };
        }

        window.masterData.schemaVersion = STORAGE_CONFIG.SCHEMA_VERSION;
        window.masterData.savedAt = new Date().toISOString();

        localStorage.setItem(
            STORAGE_CONFIG.STORAGE_KEY,
            JSON.stringify(window.masterData)
        );
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

/**
 * Saves masterData to localStorage.
 * 
 * @param {boolean} [immediate] - if true, bypass debounce
 * @returns {boolean} true only if the save actually succeeded
 */
function saveMasterData(immediate) {
    immediate = immediate === true;

    if (_saveTimeout !== null) {
        clearTimeout(_saveTimeout);
        _saveTimeout = null;
    }

    if (immediate) {
        if (_isSaving) {
            // Should not happen with localStorage (synchronous), but guard
            // against reentrancy.
            return false;
        }
        _isSaving = true;
        var result = _performSave();
        _isSaving = false;

        if (result.ok) {
            _isDirty = false;
            return true;
        }
        console.error('storage.js: save failed:', result.error);
        return false;
    }

    // Debounced path — schedule one save
    _saveTimeout = setTimeout(function() {
        _saveTimeout = null;
        saveMasterData(true);
    }, STORAGE_CONFIG.SAVE_DEBOUNCE_MS);

    return true;
}

/**
 * Marks the current in-memory data as having unsaved changes.
 * Called by mutation boundaries before scheduling a save.
 * 
 * Also useful for cross-tab conflict detection.
 */
function markDataDirty() {
    _isDirty = true;
}

/**
 * Returns true if there are unsaved changes.
 * @returns {boolean}
 */
function hasUnsavedChanges() {
    return _isDirty === true;
}

// =============================================================================
// 7. RELOAD
// =============================================================================

/**
 * Reloads data from localStorage, discarding in-memory changes.
 * 
 * @param {boolean} [force] - if true, ignores unsaved-changes guard
 * @returns {{ ok: boolean, source?: string, error?: string }}
 */
function reloadMasterData(force) {
    if (_forceReloading) return { ok: false, error: 'in-progress' };
    if (_isDirty && force !== true) {
        return { ok: false, error: 'unsaved-changes' };
    }

    _forceReloading = true;
    try {
        return loadMasterData();
    } finally {
        _forceReloading = false;
    }
}

/**
 * @deprecated Use reloadMasterData instead.
 */
function forceReloadData() {
    return reloadMasterData(true);
}

// =============================================================================
// 8. IMPORT
// =============================================================================

/**
 * Opens a file picker, reads JSON, replaces masterData, saves.
 * Does NOT report success if the save failed.
 * 
 * @param {Function} [onComplete] - callback(result) where result is:
 *   { ok: true, charCount: number }
 *   { ok: false, error: string, message: string }
 */
function importData(onComplete) {
    onComplete = (typeof onComplete === 'function') ? onComplete : function() {};

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.onchange = function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) {
            onComplete({ ok: false, error: 'no-file', message: 'No file selected' });
            return;
        }

        var reader = new FileReader();

        reader.onload = function(ev) {
            var parsed;
            try {
                parsed = JSON.parse(ev.target.result);
            } catch (err) {
                onComplete({ ok: false, error: 'invalid-json', message: err.message });
                return;
            }

            // Determine source data shape
            var sourceData = null;
            if (parsed && parsed.type === 'master' && parsed.data) {
                sourceData = parsed.data;
            } else if (_isMasterDataEnvelope(parsed)) {
                sourceData = parsed.data;
            } else if (_isLegacyDataBlob(parsed)) {
                sourceData = parsed;
            }

            if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
                onComplete({
                    ok: false,
                    error: 'unknown-format',
                    message: 'Unrecognized import format'
                });
                return;
            }

            // Build envelope
            var envelope = {
                schemaVersion: STORAGE_CONFIG.SCHEMA_VERSION,
                savedAt: new Date().toISOString(),
                data: sourceData
            };

            // Normalize via schema layer if available
            if (typeof window.normalizeMasterData === 'function') {
                envelope = window.normalizeMasterData(envelope);
            }

            // Capture prior state so we can restore on save failure
            var prior = window.masterData;

            // Install imported data, then attempt save
            window.masterData = envelope;
            _isDirty = true;

            var saveOk = saveMasterData(true);

            if (!saveOk) {
                // Save failed — restore prior in-memory state so we don't
                // claim success on data that won't persist.
                window.masterData = prior;
                _isDirty = false;
                onComplete({
                    ok: false,
                    error: 'save-failed',
                    message: 'Imported data could not be saved to storage'
                });
                return;
            }

            var charCount = Array.isArray(envelope.data.characters)
                ? envelope.data.characters.length
                : 0;

            onComplete({ ok: true, charCount: charCount });
        };

        reader.onerror = function() {
            onComplete({
                ok: false,
                error: 'read-failed',
                message: 'Error reading file'
            });
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
 * Returns false if the save failed; the caller can show the appropriate UI.
 * 
 * @returns {{ ok: boolean, error?: string }}
 */
function resetMasterData() {
    try {
        var prior = window.masterData;
        window.masterData = createDefaultMasterData();
        _isDirty = true;

        // Remove persisted entry first
        try {
            localStorage.removeItem(STORAGE_CONFIG.STORAGE_KEY);
        } catch (e) {
            // Ignore — save below will attempt to write defaults
        }

        var saved = saveMasterData(true);
        if (!saved) {
            // Restore prior in-memory state to keep consistency
            window.masterData = prior;
            _isDirty = false;
            return { ok: false, error: 'save-failed' };
        }
        return { ok: true };
    } catch (e) {
        console.error('storage.js: reset failed:', e);
        return { ok: false, error: 'unknown' };
    }
}

// =============================================================================
// 10. CROSS-TAB SYNC
// =============================================================================

function initCrossTabSync() {
    if (_storageListenerAdded) return;
    _storageListenerAdded = true;

    window.addEventListener('storage', function(e) {
        if (e.key !== STORAGE_CONFIG.STORAGE_KEY) return;
        if (_syncing) return;

        _syncing = true;
        if (_syncTimeout !== null) clearTimeout(_syncTimeout);

        _syncTimeout = setTimeout(function() {
            _syncTimeout = null;
            try {
                // Do not clobber unsaved local changes
                if (_isDirty) {
                    console.warn(
                        'storage.js: another tab updated storage while this tab ' +
                        'has unsaved changes. Skipping auto-reload to prevent ' +
                        'data loss. Call reloadMasterData(true) to force.'
                    );
                    return;
                }

                var result = loadMasterData();
                if (result.ok) {
                    try {
                        window.dispatchEvent(new CustomEvent('masterDataUpdated', {
                            detail: { source: 'cross-tab' }
                        }));
                    } catch (evtErr) { /* ignore */ }
                } else {
                    console.warn('storage.js: cross-tab reload failed:', result.error);
                }
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
// 11. AUTO-LOAD
// =============================================================================

if (typeof window._storageInitialized === 'undefined') {
    window._storageInitialized = true;
    try {
        loadMasterData();
    } catch (e) {
        console.error('storage.js: initial load failed:', e);
    }
}

// =============================================================================
// 12. EXPORTS
// =============================================================================

window.STORAGE_CONFIG = STORAGE_CONFIG;

window.createDefaultMasterData = createDefaultMasterData;

window.loadMasterData = loadMasterData;
window.reloadMasterData = reloadMasterData;
window.forceReloadData = forceReloadData; // deprecated alias
window.saveMasterData = saveMasterData;
window.markDataDirty = markDataDirty;
window.hasUnsavedChanges = hasUnsavedChanges;
window.importData = importData;
window.resetMasterData = resetMasterData;

// window.CONFIG was previously set as an alias. Removed.
// Callers should use window.STORAGE_CONFIG if they need storage config.