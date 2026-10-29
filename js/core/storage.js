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
 *   - Debounced save scheduling via markDataDirty
 *
 * OUT OF SCOPE:
 *   - Schema shape and default data -> storage-schema.js
 *   - Migration between schema versions -> database.js (or the schema
 *     module if migration is co-located there)
 *   - Export/download -> exportUtils.js
 *   - Cache invalidation orchestration -> mutation boundaries (but
 *     storage.js performs the invalidation at the cross-tab boundary)
 *   - UI feedback -> caller
 *   - Cross-tab conflict prevention beyond "do not discard dirty state"
 *
 * SEMANTIC RULES:
 *   - markDataDirty() marks the data dirty AND schedules a debounced
 *     save. This is the single persistence trigger for every domain
 *     that writes to masterData.data.
 *
 *   - saveMasterData() is the canonical synchronous persistence
 *     operation. It returns true ONLY if the write actually succeeded.
 *     It clears any pending debounced save (the write just happened).
 *
 *   - saveMasterDataOrThrow() is a wrapper for callers that prefer
 *     throw-on-failure semantics.
 *
 *   - load: no entry -> defaults; valid entry -> load; corrupt entry ->
 *     signal failure without replacing window.masterData.
 *
 *   - import: does not report success if validation or save failed.
 *
 *   - reset: does not delete the storage key before attempting to save
 *     defaults.
 *
 *   - cross-tab: does not silently overwrite unsaved local changes, but
 *     also does not prevent a later overwrite.
 *
 * LEGACY SAVE MARKERS
 *
 *   The load path can produce three envelope-level markers:
 *
 *     _legacyEnvelopeLess
 *       Set when the persisted blob had no envelope wrapper (a save
 *       predating the current envelope format). The envelope is
 *       wrapped with the current STORAGE_SCHEMA_VERSION, but the label
 *       is synthetic — migration tooling (database.js) reads this
 *       marker to know the declared version is a guess.
 *
 *     _yearCoerced
 *       Set when the persisted currentYear was present but invalid and
 *       normalizeMasterData replaced it with TIME_CONSTANTS.DEFAULT_YEAR.
 *       Surfaced in loadMasterData's result.warnings; also preserved
 *       on window.masterData until the next save.
 *
 *     _preservedUnknownTopLevel
 *       Set when the caller of normalizeMasterData opts in via
 *       _preserveUnknownTopLevel on the input envelope. storage.js does
 *       not currently opt in (it does not want to enumerate unknown
 *       fields on every load); the marker exists for migration tooling.
 *
 *   _performSave strips all three markers from the serialized envelope.
 *   The in-memory window.masterData keeps them (so subsequent reads of
 *   window.masterData see the load-time state), but the persisted form
 *   does not. Without this stripping, a marker set on load would
 *   reappear on every subsequent load forever, even after the
 *   underlying issue (envelope-less save, coerced year) was resolved.
 *
 * WARNINGS ON LOAD
 *
 *   loadMasterData's result object carries a `warnings: string[]` field
 *   that summarizes any lossy normalization that occurred. Empty when
 *   nothing lossy happened. Populated from _yearCoerced. Callers that
 *   want to surface this to the user (e.g. "your current year was
 *   corrupt and got reset to the default") read result.warnings.
 *
 * DOMAIN PERSIST CONTRACT (IMPORTANT):
 *   Domain persist() functions (name-commands.js, rank-commands.js,
 *   education-commands.js, etc.) return { success, reason? }. They MUST
 *   use one of these two patterns:
 *
 *     Pattern A (recommended):
 *       var ok = window.saveMasterData();
 *       if (ok === true) return { success: true };
 *       var err = window.getLastSaveError();
 *       return { success: false, reason: err ? err.message : 'unknown' };
 *
 *     Pattern B:
 *       try {
 *           window.saveMasterDataOrThrow();
 *           return { success: true };
 *       } catch (e) {
 *           return { success: false, reason: e.message };
 *       }
 *
 *   Pattern C (BROKEN, was used by name-commands.js pre-fix):
 *       try {
 *           window.saveMasterData();   // return value discarded
 *           return { success: true };  // always success
 *       } catch (e) { ... }
 *
 *   Pattern C silently reports success on every failed save. Do not
 *   reintroduce it.
 *
 * CROSS-TAB CONFLICT:
 *   The policy is: "do not automatically discard unsaved local changes."
 *   It is NOT: "prevent two tabs from overwriting each other's data."
 *   If tab A has dirty state and tab B writes storage, tab A will not
 *   auto-reload, but when tab A later saves, it will overwrite tab B's
 *   changes. Preventing that requires a revision/compare-before-write
 *   strategy, which is out of scope for this module.
 *
 * CROSS-TAB CACHE INVALIDATION:
 *   When a cross-tab reload replaces window.masterData, the accessor
 *   cache (accessors.js) is stale. This module invalidates it via
 *   window.invalidateAccessorCaches() BEFORE dispatching
 *   masterDataUpdated, so every domain that hydrates from the event
 *   sees a fresh accessor cache. Domains that hydrate from the event
 *   do NOT need their own invalidation call; doing so is redundant but
 *   harmless.
 *
 * PERSISTENCE TRIGGER (IMPORTANT):
 *   Every domain that mutates canonical data calls window.markDataDirty().
 *   That call schedules a debounced save.
 *
 * SCHEMA OWNERSHIP:
 *   storage.js owns BYTES. It does not own schema meaning.
 *   The current schema version and default data factory come from
 *   storage-schema.js, which is a required dependency.
 *
 * MIGRATION:
 *   storage.js orchestrates the load -> migrate -> normalize -> install
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
 *   - accessors.js:      invalidateAccessorCaches (used at cross-tab reload)
 *   - validation.js:     validateImportData (used by import; if absent,
 *                        import rejects the file rather than installing
 *                        unvalidated data)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _isEnvelopeLessDataBlob path now sets _legacyEnvelopeLess: true
 *       on the synthetic envelope before calling normalizeMasterData.
 *       Prior revisions wrapped the blob with the current schemaVersion
 *       without any marker, so migration tooling could not distinguish
 *       "legacy save that was wrapped" from "save actually written at
 *       the current version". See LEGACY SAVE MARKERS.
 *     - _performSave now strips _legacyEnvelopeLess, _yearCoerced, and
 *       _preservedUnknownTopLevel from the serialized envelope before
 *       JSON.stringify. The in-memory window.masterData keeps them (so
 *       post-load inspection sees the load-time state), but the
 *       persisted form does not. See LEGACY SAVE MARKERS.
 *     - loadMasterData's result gains a warnings: string[] field
 *       surfacing _yearCoerced. Empty when nothing lossy happened.
 *       Existing callers reading { ok, source, error } are unaffected.
 *       See WARNINGS ON LOAD.
 *     - _handleMasterDataUpdated now clears _lastSaveError after a
 *       successful reload, so getLastSaveError() reflects the most
 *       recent storage-touching operation (which was the reload, not
 *       some prior failed save).
 *     - Header LEGACY SAVE MARKERS and WARNINGS ON LOAD sections added.
 *     - No behavioural change to the load path, save path, debounce
 *       timing, import pipeline, or cross-tab conflict policy.
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

    // Envelope-level markers that _performSave strips before serializing.
    // See LEGACY SAVE MARKERS in the header.
    var _MARKER_KEYS = [
        '_legacyEnvelopeLess',
        '_yearCoerced',
        '_preservedUnknownTopLevel'
    ];

    // =========================================================================
    // 2. MODULE STATE
    // =========================================================================

    var _isLoading = false;
    var _isSaving = false;
    var _saveTimeout = null;
    var _forceReloading = false;

    var _isDirty = false;
    var _lastSaveError = null;

    var _storageListenerAdded = false;
    var _syncTimeout = null;

    // =========================================================================
    // 3. DEFAULT FACTORY
    // =========================================================================

    function createDefaultMasterData() {
        _requireTime();
        _requireSchema();
        return window.createDefaultMasterDataOverride();
    }

    // =========================================================================
    // 4. VALIDATION HELPERS
    // =========================================================================

    function _isMasterDataEnvelope(value) {
        if (!value || typeof value !== 'object') return false;
        if (!value.data || typeof value.data !== 'object') return false;
        if (Array.isArray(value.data)) return false;
        return true;
    }

    function _isEnvelopeLessDataBlob(value) {
        if (!value || typeof value !== 'object') return false;
        return Array.isArray(value.characters) && Array.isArray(value.places);
    }

    /**
     * Extracts the load warnings from a normalized envelope. Reads
     * _yearCoerced (and any future lossy-normalization marker that the
     * load path decides to surface). See WARNINGS ON LOAD in the header.
     *
     * @private
     * @param {Object} envelope
     * @returns {string[]}
     */
    function _collectLoadWarnings(envelope) {
        var warnings = [];
        if (!envelope || typeof envelope !== 'object') return warnings;
        if (envelope._yearCoerced === true) {
            warnings.push(
                'currentYear was invalid and has been reset to the default.'
            );
        }
        if (Array.isArray(envelope._preservedUnknownTopLevel)
            && envelope._preservedUnknownTopLevel.length > 0) {
            warnings.push(
                'Save carries unknown top-level fields: ' +
                envelope._preservedUnknownTopLevel.join(', ') + '.'
            );
        }
        return warnings;
    }

    // =========================================================================
    // 5. LOAD
    // =========================================================================

    /**
     * Loads masterData from localStorage.
     *
     * Outcomes:
     *   { ok: true, source: 'defaults', warnings: [] }  — no storage entry;
     *                                                     defaults installed
     *   { ok: true, source: 'storage', warnings: [...] } — valid data loaded
     *   { ok: false, error: 'corrupt' }                 — parse failure
     *   { ok: false, error: 'schema' }                  — unrecognized shape
     *   { ok: false, error: 'version' }                 — persisted schema
     *                                                     newer than this build
     *   { ok: false, error: 'unknown' }                 — unexpected throw
     *
     * On failure, window.masterData is NOT replaced. The caller decides
     * how to recover.
     *
     * @returns {{ ok: boolean, source?: string, error?: string, warnings?: string[] }}
     */
    function loadMasterData() {
        if (_isLoading) return { ok: false, error: 'in-progress' };
        _isLoading = true;

        try {
            var stored = localStorage.getItem(STORAGE_CONFIG.STORAGE_KEY);

            if (stored === null) {
                window.masterData = createDefaultMasterData();
                _isDirty = false;
                _lastSaveError = null;
                return { ok: true, source: 'defaults', warnings: [] };
            }

            var parsed;
            try {
                parsed = JSON.parse(stored);
            } catch (parseError) {
                console.error('storage.js: persisted data is not valid JSON:', parseError);
                return { ok: false, error: 'corrupt' };
            }

            // Identify the incoming shape.
            var envelope;
            var isLegacyEnvelopeLess = false;
            if (_isMasterDataEnvelope(parsed)) {
                envelope = parsed;
            } else if (_isEnvelopeLessDataBlob(parsed)) {
                // Envelope-less blob. Assume current schema for the
                // synthetic label, but MARK it so migration tooling knows
                // the label is a guess. See LEGACY SAVE MARKERS.
                isLegacyEnvelopeLess = true;
                envelope = {
                    schemaVersion: window.STORAGE_SCHEMA_VERSION,
                    data: parsed
                };
            } else if (_isMasterDataEnvelope({ data: parsed })) {
                isLegacyEnvelopeLess = true;
                envelope = {
                    schemaVersion: window.STORAGE_SCHEMA_VERSION,
                    data: parsed
                };
            } else {
                console.error('storage.js: persisted data has unrecognized shape');
                return { ok: false, error: 'schema' };
            }

            // Reject data from a newer schema than this build understands.
            if (typeof envelope.schemaVersion === 'number'
                && envelope.schemaVersion > window.STORAGE_SCHEMA_VERSION) {
                console.error(
                    'storage.js: persisted schema version ' +
                    envelope.schemaVersion + ' is newer than this build ' +
                    '(' + window.STORAGE_SCHEMA_VERSION + ')'
                );
                return { ok: false, error: 'version' };
            }

            if (isLegacyEnvelopeLess) {
                envelope._legacyEnvelopeLess = true;
            }

            // Normalize via the schema layer.
            envelope = window.normalizeMasterData(envelope);

            window.masterData = envelope;
            _isDirty = false;
            _lastSaveError = null;

            return {
                ok: true,
                source: 'storage',
                warnings: _collectLoadWarnings(envelope)
            };
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
     * Serializes the envelope without its load-time markers. Returns the
     * JSON string. Does not mutate the input.
     *
     * See LEGACY SAVE MARKERS in the header.
     *
     * @private
     * @param {Object} envelope
     * @returns {string}
     */
    function _serializeWithoutMarkers(envelope) {
        // Shallow clone the envelope. We do NOT clone the data object;
        // JSON.stringify will handle it. The clone is only to avoid
        // mutating window.masterData when we delete the marker keys.
        var clone = {};
        for (var k in envelope) {
            if (!Object.prototype.hasOwnProperty.call(envelope, k)) continue;
            clone[k] = envelope[k];
        }
        for (var i = 0; i < _MARKER_KEYS.length; i++) {
            delete clone[_MARKER_KEYS[i]];
        }
        return JSON.stringify(clone);
    }

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

            // Write savedAt onto the live object so subsequent reads of
            // window.masterData see the timestamp. The serialized form
            // includes savedAt (it is not a marker) but strips the
            // load-time markers.
            window.masterData.savedAt = new Date().toISOString();

            var serialized = _serializeWithoutMarkers(window.masterData);

            localStorage.setItem(STORAGE_CONFIG.STORAGE_KEY, serialized);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e };
        }
    }

    /**
     * Saves masterData to localStorage immediately.
     *
     * Returns true ONLY if the write to localStorage actually succeeded.
     * Cancels any pending debounced save.
     *
     * Does NOT throw on write failure. Returns false and records the
     * failure in _lastSaveError.
     *
     * @returns {boolean}
     */
    function saveMasterData() {
        if (_saveTimeout !== null) {
            clearTimeout(_saveTimeout);
            _saveTimeout = null;
        }

        if (_isSaving) {
            return false;
        }
        _isSaving = true;
        var result = _performSave();
        _isSaving = false;

        if (result.ok) {
            _isDirty = false;
            _lastSaveError = null;
            return true;
        }
        _lastSaveError = result.error || new Error('unknown save failure');
        console.error('storage.js: save failed:', _lastSaveError);
        return false;
    }

    function saveMasterDataOrThrow() {
        if (saveMasterData()) return true;
        throw _lastSaveError || new Error('saveMasterData failed');
    }

    function scheduleSave() {
        if (_saveTimeout !== null) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(function() {
            _saveTimeout = null;
            saveMasterData();
        }, STORAGE_CONFIG.SAVE_DEBOUNCE_MS);
    }

    function flushPendingSave() {
        if (_saveTimeout === null) {
            return !_isDirty;
        }
        return saveMasterData();
    }

    function markDataDirty() {
        _isDirty = true;
        scheduleSave();
    }

    function hasUnsavedChanges() {
        return _isDirty === true;
    }

    function getLastSaveError() {
        return _lastSaveError;
    }

    // =========================================================================
    // 7. RELOAD
    // =========================================================================

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

    function forceReloadData() {
        return reloadMasterData(true);
    }

    // =========================================================================
    // 8. IMPORT
    // =========================================================================

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

    function _processImport(text) {
        var parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            return { ok: false, error: 'invalid-json', message: err.message };
        }

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

        var envelope = {
            schemaVersion: window.STORAGE_SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            data: sourceData
        };
        envelope = window.normalizeMasterData(envelope);

        if (typeof window.validateImportData === 'function') {
            var validation;
            try {
                validation = window.validateImportData(envelope);
            } catch (validatorError) {
                return {
                    ok: false,
                    error: 'validation-failed',
                    message: 'Import validation threw: ' +
                        (validatorError && validatorError.message
                            ? validatorError.message
                            : String(validatorError))
                };
            }
            if (!validation || validation.isValid !== true) {
                var errors = validation && Array.isArray(validation.errors)
                    ? validation.errors
                    : [];
                return {
                    ok: false,
                    error: 'validation-failed',
                    message: 'Import validation failed: ' +
                        errors.slice(0, 5).join('; ') +
                        (errors.length > 5 ? ' (and more)' : '')
                };
            }
        } else {
            return {
                ok: false,
                error: 'validator-missing',
                message: 'validation.js must be loaded to import data'
            };
        }

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
                message: 'Imported data could not be saved to storage: ' +
                    (_lastSaveError && _lastSaveError.message
                        ? _lastSaveError.message
                        : 'unknown')
            };
        }

        _invalidateAccessorCaches();

        var charCount = Array.isArray(envelope.data.characters)
            ? envelope.data.characters.length
            : 0;

        return { ok: true, charCount: charCount };
    }

    // =========================================================================
    // 9. RESET
    // =========================================================================

    function resetMasterData() {
        var prior = window.masterData;

        try {
            window.masterData = createDefaultMasterData();
            _isDirty = true;

            var saved = saveMasterData();
            if (!saved) {
                window.masterData = prior;
                _isDirty = false;
                return {
                    ok: false,
                    error: _lastSaveError && _lastSaveError.message
                        ? _lastSaveError.message
                        : 'save-failed'
                };
            }

            _invalidateAccessorCaches();

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
                    _invalidateAccessorCaches();

                    // The reload touched storage and succeeded; the last
                    // storage-touching operation is a success, not a
                    // failure. Clear any stale error from a prior save.
                    _lastSaveError = null;

                    try {
                        window.dispatchEvent(new CustomEvent('masterDataUpdated', {
                            detail: {
                                source: 'cross-tab',
                                warnings: result.warnings || []
                            }
                        }));
                    } catch (evtErr) { /* ignore */ }
                } else {
                    console.warn('storage.js: cross-tab reload failed:', result.error);
                }
            }, STORAGE_CONFIG.CROSS_TAB_SYNC_MS);
        });
    }

    // =========================================================================
    // 11. CACHE INVALIDATION HELPER
    // =========================================================================

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 12. INITIALIZATION
    // =========================================================================

    function initialize() {
        _requireAll();
        loadMasterData();
        initCrossTabSync();
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.STORAGE_CONFIG = STORAGE_CONFIG;

    window.createDefaultMasterData = createDefaultMasterData;

    // Load / save
    window.loadMasterData = loadMasterData;
    window.reloadMasterData = reloadMasterData;
    window.forceReloadData = forceReloadData; // deprecated alias
    window.saveMasterData = saveMasterData;   // synchronous, returns boolean
    window.saveMasterDataOrThrow = saveMasterDataOrThrow; // synchronous, throws
    window.scheduleSave = scheduleSave;       // debounced, non-claiming
    window.flushPendingSave = flushPendingSave;

    // Dirty state
    window.markDataDirty = markDataDirty;
    window.hasUnsavedChanges = hasUnsavedChanges;
    window.getLastSaveError = getLastSaveError;

    // Import / reset
    window.importData = importData;
    window.resetMasterData = resetMasterData;

    // Explicit initialization entry point.
    window.initializeStorage = initialize;

})();
