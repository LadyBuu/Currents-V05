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
 *   - Load/save/reload/reset orchestration
 *   - Import (with validation before install)
 *
 * OUT OF SCOPE:
 *   - Schema shape and default data → storage-schema.js
 *   - Migration between schema versions → database.js (or the schema module
 *     if migration is co-located there)
 *   - Export/download → exportUtils.js
 *   - Cache invalidation → mutation boundaries
 *   - UI feedback → caller
 *   - Cross-tab conflict prevention beyond "do not discard dirty state"
 *
 * SEMANTIC RULES:
 *   - saveMasterData() returns true only if localStorage.setItem succeeded.
 *     There is no debounced variant of this function; the debounced path is
 *     scheduleSave(), which does not claim persistence.
 *   - load: no entry → defaults; valid entry → load; corrupt entry → signal
 *     failure without replacing window.masterData.
 *   - import: does not report success if validation or save failed.
 *   - reset: does not delete the storage key before attempting to save
 *     defaults. A failed save leaves the previously persisted value intact.
 *   - cross-tab: does not silently overwrite unsaved local changes, but
 *     also does not prevent a later overwrite. See CROSS-TAB CONFLICT.
 *
 * CROSS-TAB CONFLICT:
 *   The policy is: "do not automatically discard unsaved local changes."
 *   It is NOT: "prevent two tabs from overwriting each other's data."
 *   If tab A has dirty state and tab B writes storage, tab A will not
 *   auto-reload, but when tab A later saves, it will overwrite tab B's
 *   changes. Preventing that requires a revision/compare-before-write
 *   strategy, which is out of scope for this module.
 *
 * SCHEMA OWNERSHIP:
 *   storage.js owns BYTES. It does not own schema meaning.
 *   The current schema version and default data factory come from
 *   storage-schema.js, which is a required dependency.
 *
 * MIGRATION:
 *   storage.js orchestrates the load → migrate → normalize → install
 *   pipeline. Actual migration transformations live with the schema.
 *   Assigning the current version label to a legacy envelope is NOT
 *   migration; if the persisted data is at an older schema version,
 *   storage.js must not pretend it is current.
 *
 * DEPENDENCIES (REQUIRED):
 *   - time.js:          TIME_CONSTANTS (for schema defaults via storage-schema)
 *   - storage-schema.js: createDefaultMasterDataOverride, normalizeMasterData,
 *                        STORAGE_SCHEMA_VERSION
 *
 * OPTIONAL:
 *   - validation.js: validateImportData (used by import; if absent, import
 *                    rejects the file rather than installing unvalidated data)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireTime() {
        if (typeof window.TIME_CONSTANTS === 'undefined'
            || typeof window.TIME_CONSTANTS.DEFAULT_YEAR !== 'number') {
            throw new Error('storage.js: time.js must load first (TIME_CONSTANTS missing).');
        }
    }

    function _requireSchema() {
        if (typeof window.createDefaultMasterDataOverride !== 'function') {
            throw new Error(
                'storage.js: storage-schema.js must load first ' +
                '(createDefaultMasterDataOverride missing).'
            );
        }
        if (typeof window.normalizeMasterData !== 'function') {
            throw new Error(
                'storage.js: storage-schema.js must load first ' +
                '(normalizeMasterData missing).'
            );
        }
        if (typeof window.STORAGE_SCHEMA_VERSION !== 'number') {
            throw new Error(
                'storage.js: storage-schema.js must load first ' +
                '(STORAGE_SCHEMA_VERSION missing).'
            );
        }
    }

    function _requireAll() {
        _requireTime();
        _requireSchema();
    }

    // =========================================================================
    // 1. CONFIG
    // =========================================================================

    var STORAGE_CONFIG = Object.freeze({
        STORAGE_KEY: 'stillwaters_master',
        SAVE_DEBOUNCE_MS: 100,
        CROSS_TAB_SYNC_MS: 100
    });

    // =========================================================================
    // 2. MODULE STATE
    // =========================================================================

    var _isLoading = false;
    var _isSaving = false;
    var _saveTimeout = null;
    var _forceReloading = false;

    // Tracks whether the current in-memory data has unsaved changes.
    // Set true by mutation boundaries via markDataDirty(); cleared after a
    // successful save.
    var _isDirty = false;

    // Cross-tab coordination
    var _storageListenerAdded = false;
    var _syncTimeout = null;

    // =========================================================================
    // 3. DEFAULT FACTORY
    // =========================================================================

    /**
     * Creates a fresh default masterData structure via the schema layer.
     * storage.js does NOT define the shape itself.
     *
     * @returns {Object}
     */
    function createDefaultMasterData() {
        _requireTime();
        _requireSchema();
        return window.createDefaultMasterDataOverride();
    }

    // =========================================================================
    // 4. VALIDATION HELPERS
    // =========================================================================

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
     * Returns true if the given value looks like a bare data blob (no
     * envelope wrapper). This is the historical "legacy" form: current
     * shape, missing outer wrapper. It is NOT an older schema version.
     * @private
     */
    function _isEnvelopeLessDataBlob(value) {
        if (!value || typeof value !== 'object') return false;
        return Array.isArray(value.characters) && Array.isArray(value.places);
    }

    // =========================================================================
    // 5. LOAD
    // =========================================================================

    /**
     * Loads masterData from localStorage.
     *
     * Outcomes:
     *   { ok: true, source: 'defaults' }  — no storage entry; defaults installed
     *   { ok: true, source: 'storage' }   — valid data loaded
     *   { ok: false, error: 'corrupt' }   — persisted data could not be parsed
     *   { ok: false, error: 'schema' }    — persisted data shape was not recognized
     *   { ok: false, error: 'version' }   — persisted schema version is newer
     *                                        than this build supports (migration
     *                                        cannot safely go backwards)
     *
     * On failure, window.masterData is NOT replaced. The caller decides how
     * to recover.
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

            // Identify the incoming shape. The schemaVersion we record is
            // whatever the envelope declares (or SCHEMA_VERSION for bare
            // blobs that predate envelope wrapping at the current schema).
            // We do NOT relabel data whose declared version differs from
            // the current version; that is migration's job.
            var envelope;
            if (_isMasterDataEnvelope(parsed)) {
                envelope = parsed;
            } else if (_isEnvelopeLessDataBlob(parsed)) {
                // Envelope-less blob. Assume current schema (no way to know
                // otherwise); the schema layer will validate fields during
                // normalization. If your persisted data ever went through a
                // versioned schema, the version belongs in the envelope.
                envelope = {
                    schemaVersion: window.STORAGE_SCHEMA_VERSION,
                    data: parsed
                };
            } else if (_isMasterDataEnvelope({ data: parsed })) {
                envelope = {
                    schemaVersion: window.STORAGE_SCHEMA_VERSION,
                    data: parsed
                };
            } else {
                console.error('storage.js: persisted data has unrecognized shape');
                return { ok: false, error: 'schema' };
            }

            // Reject data from a newer schema than this build understands.
            // Migration to an older build is a downgrade, which storage does
            // not attempt.
            if (typeof envelope.schemaVersion === 'number'
                && envelope.schemaVersion > window.STORAGE_SCHEMA_VERSION) {
                console.error(
                    'storage.js: persisted schema version ' +
                    envelope.schemaVersion + ' is newer than this build ' +
                    '(' + window.STORAGE_SCHEMA_VERSION + ')'
                );
                return { ok: false, error: 'version' };
            }

            // Normalize via the schema layer.
            envelope = window.normalizeMasterData(envelope);

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

    // =========================================================================
    // 6. SAVE — SYNCHRONOUS, TRUTHFUL
    // =========================================================================

    /**
     * Performs the synchronous write to localStorage.
     *
     * Called by saveMasterData() and by the flush path. Sets savedAt
     * metadata; does NOT modify schemaVersion (that is schema layer's
     * concern).
     *
     * @private
     * @returns {{ ok: boolean, error?: Error }}
     */
    function _performSave() {
        try {
            if (!window.masterData || !window.masterData.data) {
                return { ok: false, error: new Error('masterData not initialized') };
            }

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
     * Saves masterData to localStorage immediately.
     *
     * Returns true ONLY if the write to localStorage actually succeeded.
     * This is the canonical persistence operation. There is no debounced
     * variant of this function; if you want to defer, use scheduleSave()
     * and call flushPendingSave() when you need a truthful answer.
     *
     * @returns {boolean}
     */
    function saveMasterData() {
        if (_saveTimeout !== null) {
            clearTimeout(_saveTimeout);
            _saveTimeout = null;
        }

        if (_isSaving) {
            // localStorage.setItem is synchronous, so this should be
            // unreachable. Guard against reentrancy anyway.
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

    /**
     * Schedules a debounced save. Does NOT claim the save succeeded.
     * The eventual result is observable via hasUnsavedChanges().
     */
    function scheduleSave() {
        if (_saveTimeout !== null) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(function() {
            _saveTimeout = null;
            saveMasterData();
        }, STORAGE_CONFIG.SAVE_DEBOUNCE_MS);
    }

    /**
     * Flushes any pending debounced save synchronously and reports whether
     * it succeeded. If no save was pending, returns the current dirty
     * state (true = persisted, false = unsaved changes remain).
     *
     * @returns {boolean}
     */
    function flushPendingSave() {
        if (_saveTimeout === null) {
            return !_isDirty;
        }
        return saveMasterData();
    }

    /**
     * Marks the current in-memory data as having unsaved changes.
     * Called by mutation boundaries before scheduling a save.
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

    // =========================================================================
    // 7. RELOAD
    // =========================================================================

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
     * @deprecated Use reloadMasterData(true) instead.
     */
    function forceReloadData() {
        return reloadMasterData(true);
    }

    // =========================================================================
    // 8. IMPORT
    // =========================================================================

    /**
     * Opens a file picker, reads JSON, validates, replaces masterData,
     * saves.
     *
     * Pipeline:
     *   parse → recognize format → normalize → validate → install → save
     *
     * Does NOT report success if validation or save failed. On save
     * failure, the prior in-memory state is restored.
     *
     * @param {Function} [onComplete] - callback(result):
     *   { ok: true, charCount }
     *   { ok: false, error, message }
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
                // Wrap the whole pipeline in an error boundary so
                // onComplete is always called.
                var result;
                try {
                    result = _processImport(ev.target.result);
                } catch (err) {
                    console.error('storage.js: import pipeline threw:', err);
                    result = {
                        ok: false,
                        error: 'processing-failed',
                        message: err && err.message ? err.message : String(err)
                    };
                }
                onComplete(result);
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

    /**
     * @private
     * The import pipeline: parse, recognize, normalize, validate, install, save.
     * Returns a result object suitable for onComplete.
     */
    function _processImport(text) {
        var parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            return { ok: false, error: 'invalid-json', message: err.message };
        }

        // Recognize format.
        var sourceData = null;
        if (parsed && parsed.type === 'master' && parsed.data) {
            sourceData = parsed.data;
        } else if (_isMasterDataEnvelope(parsed)) {
            sourceData = parsed.data;
        } else if (_isEnvelopeLessDataBlob(parsed)) {
            sourceData = parsed;
        }

        if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
            return {
                ok: false,
                error: 'unknown-format',
                message: 'Unrecognized import format'
            };
        }

        // Build envelope and normalize.
        var envelope = {
            schemaVersion: window.STORAGE_SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            data: sourceData
        };
        envelope = window.normalizeMasterData(envelope);

        // Canonical validation before install.
        // If validation.js isn't loaded, reject rather than installing
        // unvalidated data.
        if (typeof window.validateImportData === 'function') {
            var validation = window.validateImportData(envelope);
            if (!validation.isValid) {
                return {
                    ok: false,
                    error: 'validation-failed',
                    message: 'Import validation failed: ' +
                        validation.errors.slice(0, 5).join('; ') +
                        (validation.errors.length > 5 ? ' (and more)' : '')
                };
            }
        } else {
            return {
                ok: false,
                error: 'validator-missing',
                message: 'validation.js must be loaded to import data'
            };
        }

        // Install candidate and attempt save.
        var prior = window.masterData;
        window.masterData = envelope;
        _isDirty = true;

        var saveOk = saveMasterData();

        if (!saveOk) {
            window.masterData = prior;
            _isDirty = false;
            return {
                ok: false,
                error: 'save-failed',
                message: 'Imported data could not be saved to storage'
            };
        }

        var charCount = Array.isArray(envelope.data.characters)
            ? envelope.data.characters.length
            : 0;

        return { ok: true, charCount: charCount };
    }

    // =========================================================================
    // 9. RESET
    // =========================================================================

    /**
     * Resets all data to defaults and persists.
     *
     * Does NOT delete the storage key before saving. A successful setItem
     * of the default envelope replaces the existing value atomically. If
     * the save fails, the previously persisted value remains intact and
     * the prior in-memory state is restored.
     *
     * @returns {{ ok: boolean, error?: string }}
     */
    function resetMasterData() {
        var prior = window.masterData;

        try {
            window.masterData = createDefaultMasterData();
            _isDirty = true;

            var saved = saveMasterData();
            if (!saved) {
                window.masterData = prior;
                _isDirty = false;
                return { ok: false, error: 'save-failed' };
            }
            return { ok: true };
        } catch (e) {
            console.error('storage.js: reset failed:', e);
            window.masterData = prior;
            _isDirty = false;
            return { ok: false, error: 'unknown' };
        }
    }

    // =========================================================================
    // 10. CROSS-TAB SYNC
    // =========================================================================

    function initCrossTabSync() {
        if (_storageListenerAdded) return;
        _storageListenerAdded = true;

        window.addEventListener('storage', function(e) {
            if (e.key !== STORAGE_CONFIG.STORAGE_KEY) return;

            if (_syncTimeout !== null) clearTimeout(_syncTimeout);

            _syncTimeout = setTimeout(function() {
                _syncTimeout = null;

                // Do not clobber unsaved local changes.
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
            }, STORAGE_CONFIG.CROSS_TAB_SYNC_MS);
        });
    }

    // =========================================================================
    // 11. INITIALIZATION
    // =========================================================================
    //
    // Dependencies are required. If they aren't loaded, we throw. The
    // bootstrap layer is responsible for ensuring script order; a missing
    // dependency here is a load-order bug, not a recoverable condition.

    function initialize() {
        _requireAll();
        loadMasterData();
        initCrossTabSync();
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.STORAGE_CONFIG = STORAGE_CONFIG;

    window.createDefaultMasterData = createDefaultMasterData;

    // Load / save
    window.loadMasterData = loadMasterData;
    window.reloadMasterData = reloadMasterData;
    window.forceReloadData = forceReloadData; // deprecated alias
    window.saveMasterData = saveMasterData;   // synchronous, truthful
    window.scheduleSave = scheduleSave;       // debounced, non-claiming
    window.flushPendingSave = flushPendingSave;

    // Dirty state
    window.markDataDirty = markDataDirty;
    window.hasUnsavedChanges = hasUnsavedChanges;

    // Import / reset
    window.importData = importData;
    window.resetMasterData = resetMasterData;

    // Explicit initialization entry point. Callers (bootstrap) should
    // invoke this after all dependencies are loaded.
    window.initializeStorage = initialize;

})();