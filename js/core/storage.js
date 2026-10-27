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
 *     that writes to masterData.data. Domains do not need to call
 *     scheduleSave() themselves; they call markDataDirty() and the
 *     debounce fires automatically.
 *
 *   - saveMasterData() is the canonical synchronous persistence
 *     operation. It returns true ONLY if the write actually succeeded.
 *     It clears any pending debounced save (the write just happened).
 *
 *   - saveMasterDataOrThrow() is a wrapper for callers that prefer
 *     throw-on-failure semantics. The underlying saveMasterData() does
 *     NOT throw on write failure; it returns false. Domain persist()
 *     implementations that return { success, reason } MUST inspect the
 *     boolean return value; they must not assume that a caught
 *     exception means "save failed." See DOMAIN PERSIST CONTRACT below.
 *
 *   - scheduleSave() is exposed for callers that want to schedule a
 *     save without marking dirty (rare; the debounce is normally
 *     driven by markDataDirty). It does not claim the save succeeded.
 *
 *   - flushPendingSave() flushes any pending debounced save
 *     synchronously and reports whether the resulting state is
 *     persisted. It returns true if no pending save existed AND the
 *     current state is clean, or if a pending save was flushed
 *     successfully. It returns false if the flush failed OR unsaved
 *     changes remain.
 *
 *   - getLastSaveError() returns the Error from the most recent failed
 *     save, or null if the last save succeeded (or no save has been
 *     attempted). Callers that want to report a save failure reason
 *     read this after saveMasterData() returns false.
 *
 *   - load: no entry -> defaults; valid entry -> load; corrupt entry ->
 *     signal failure without replacing window.masterData.
 *
 *   - import: does not report success if validation or save failed.
 *
 *   - reset: does not delete the storage key before attempting to save
 *     defaults. A failed save leaves the previously persisted value intact.
 *
 *   - cross-tab: does not silently overwrite unsaved local changes, but
 *     also does not prevent a later overwrite. See CROSS-TAB CONFLICT.
 *
 * DOMAIN PERSIST CONTRACT (IMPORTANT):
 *   Domain persist() functions (name-commands.js, rank-commands.js,
 *   education-commands.js, etc.) return { success, reason? }. They MUST
 *   use one of these two patterns:
 *
 *     Pattern A (recommended, used by rank-commands.js):
 *       var ok = window.saveMasterData();
 *       if (ok === true) return { success: true };
 *       var err = window.getLastSaveError();
 *       return { success: false, reason: err ? err.message : 'unknown' };
 *
 *     Pattern B (used by nothing today, but supported):
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
 *   reintroduce it. The name-commands.js bug was exactly this pattern.
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
 *   This invalidation is the storage module's responsibility, not the
 *   domain's, because storage owns the "reload" operation. It is the
 *   only place where a reload can originate (cross-tab, import, reset
 *   with force), and every reload path must go through it.
 *
 * PERSISTENCE TRIGGER (IMPORTANT):
 *   Every domain that mutates canonical data calls window.markDataDirty().
 *   That call schedules a debounced save. The result:
 *
 *     - CharacterState._emitChange  -> markDataDirty -> scheduled save
 *     - FamilyCommands._commit      -> markDataDirty -> scheduled save
 *     - ChildrenCommands._commit    -> markDataDirty -> scheduled save
 *     - RelationshipState._markDirty -> markDataDirty -> scheduled save
 *     - RoleState._syncToMasterData -> markDataDirty -> scheduled save
 *
 *   The role domain additionally calls RoleCommands.persist(), which
 *   invokes saveMasterData() synchronously after user actions (modal
 *   confirms). That is an immediate-flush override, not a replacement
 *   for the debounce.
 *
 *   Callers who need synchronous durability should call saveMasterData()
 *   directly (or flushPendingSave() to flush a pending debounced save).
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
 *   Current revision (P1 + P2 from the rank module plan):
 *     - saveMasterDataOrThrow() wrapper added. saveMasterData() continues
 *       to return a boolean and NOT throw on write failure. The DOMAIN
 *       PERSIST CONTRACT section documents the correct and incorrect
 *       patterns for domain persist() implementations.
 *     - Cross-tab reload now calls window.invalidateAccessorCaches()
 *       before dispatching masterDataUpdated. This fixes the stale
 *       accessor cache that every hydrating domain was inheriting.
 *     - _processImport now wraps validateImportData() in try/catch.
 *       A validator that throws is now treated as a validation failure,
 *       not as an uncaught exception that leaves masterData half-swapped.
 *     - _processImport now calls invalidateAccessorCaches() after a
 *       successful save, matching the cross-tab reload path.
 *     - resetMasterData() now calls invalidateAccessorCaches() after a
 *       successful save, matching the cross-tab reload path.
 *     - Header documentation expanded with DOMAIN PERSIST CONTRACT and
 *       CROSS-TAB CACHE INVALIDATION sections.
 *     - No other behavioural change. The load path, save path, debounce
 *       timing, and import pipeline are unchanged except for the added
 *       cache invalidation and try/catch.
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
    // Set true by markDataDirty(); cleared after a successful save.
    var _isDirty = false;

    // The Error from the most recent failed save, or null.
    // Read via getLastSaveError() after saveMasterData() returns false.
    var _lastSaveError = null;

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
                _lastSaveError = null;
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
            _lastSaveError = null;
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
     * Called by saveMasterData() and by the debounce flush. Sets savedAt
     * metadata; does NOT modify schemaVersion (that is schema layer's
     * concern).
     *
     * Records the failure reason in _lastSaveError so callers can read it
     * via getLastSaveError() after saveMasterData() returns false.
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
     * This is the canonical persistence operation. If a debounced save
     * was pending, it is cancelled (the write just happened synchronously).
     *
     * Does NOT throw on write failure. Returns false and records the
     * failure in _lastSaveError. See DOMAIN PERSIST CONTRACT in the header
     * for the correct and incorrect patterns for domain persist() wrappers.
     *
     * On failure, getLastSaveError() returns the underlying Error.
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
            _lastSaveError = null;
            return true;
        }
        _lastSaveError = result.error || new Error('unknown save failure');
        console.error('storage.js: save failed:', _lastSaveError);
        return false;
    }

    /**
     * Saves masterData to localStorage immediately, throwing on failure.
     *
     * Wrapper around saveMasterData() for callers that prefer
     * throw-on-failure semantics. Use this when the caller's error
     * handling is try/catch-based. Do NOT use this as a substitute for
     * saveMasterData() in a domain persist() that must inspect the boolean
     * return — both patterns work, but the boolean pattern is preferred
     * for its explicitness.
     *
     * @throws {Error} if the save fails
     * @returns {true}
     */
    function saveMasterDataOrThrow() {
        if (saveMasterData()) return true;
        throw _lastSaveError || new Error('saveMasterData failed');
    }

    /**
     * Schedules a debounced save. Does NOT claim the save succeeded.
     * The eventual result is observable via hasUnsavedChanges() and
     * getLastSaveError().
     *
     * Callers normally do not need to call this directly — markDataDirty()
     * calls it. It is exposed for callers that need to defer a save
     * without marking dirty (rare; usually for re-scheduling after a
     * cross-tab merge).
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
     * the state is now persisted.
     *
     * Returns true if:
     *   - a pending save was flushed successfully, OR
     *   - no pending save existed AND the state is clean.
     *
     * Returns false if:
     *   - a pending save existed and its flush failed, OR
     *   - no pending save existed AND unsaved changes remain (dirty but
     *     not scheduled — should not happen, but guarded).
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
     * Marks the current in-memory data as having unsaved changes AND
     * schedules a debounced save. This is the single persistence trigger
     * for every domain that mutates masterData.data.
     *
     * The debounce is intentional: rapid mutations (e.g. a bulk character
     * update that touches 100 records) do not trigger 100 localStorage
     * writes. The 100ms debounce coalesces them into a single write.
     *
     * Callers that need immediate durability call saveMasterData()
     * directly (or flushPendingSave()).
     */
    function markDataDirty() {
        _isDirty = true;
        scheduleSave();
    }

    /**
     * Returns true if there are unsaved changes.
     * @returns {boolean}
     */
    function hasUnsavedChanges() {
        return _isDirty === true;
    }

    /**
     * Returns the Error from the most recent failed save, or null.
     * Use this after saveMasterData() returns false to surface the
     * actual failure reason (e.g. quota exceeded, JSON serialization
     * failure, localStorage disabled).
     *
     * @returns {Error|null}
     */
    function getLastSaveError() {
        return _lastSaveError;
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
     *   parse -> recognize format -> normalize -> validate -> install -> save
     *
     * Does NOT report success if validation or save failed. On save
     * failure, the prior in-memory state is restored.
     *
     * A validator that throws is treated as a validation failure (not an
     * uncaught exception). This prevents a broken validation.js from
     * leaving masterData half-swapped between the old and new payload.
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
            var validation;
            try {
                validation = window.validateImportData(envelope);
            } catch (validatorError) {
                // A throwing validator is a validation failure, not an
                // uncaught exception. Do not let it escape the pipeline
                // and leave masterData half-swapped.
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
                message: 'Imported data could not be saved to storage: ' +
                    (_lastSaveError && _lastSaveError.message
                        ? _lastSaveError.message
                        : 'unknown')
            };
        }

        // Successful import: the accessor cache is stale because
        // masterData.data was replaced wholesale. Invalidate it so every
        // domain reads fresh data. Domains that subscribe to
        // masterDataUpdated will also rehydrate; the invalidate is
        // performed here so the cache is consistent even before the
        // event fires.
        _invalidateAccessorCaches();

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
                return {
                    ok: false,
                    error: _lastSaveError && _lastSaveError.message
                        ? _lastSaveError.message
                        : 'save-failed'
                };
            }

            // Successful reset: masterData.data was replaced wholesale.
            // Invalidate the accessor cache so every domain reads fresh
            // data.
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
                    // The in-memory masterData is now the freshly-loaded
                    // payload. The accessor cache still holds records
                    // from the pre-reload payload, so it is stale.
                    //
                    // Invalidate BEFORE dispatching masterDataUpdated so
                    // that every domain that hydrates from the event
                    // (character-state, family-state, children-state,
                    // rank-state, etc.) sees a fresh accessor cache.
                    //
                    // Domains do NOT need their own invalidation call.
                    // Doing so is redundant but harmless.
                    _invalidateAccessorCaches();

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
    // 11. CACHE INVALIDATION HELPER
    // =========================================================================

    /**
     * Invalidates the accessor cache (accessors.js), if present.
     *
     * Called at every reload boundary:
     *   - successful cross-tab reload
     *   - successful import
     *   - successful reset
     *
     * Failure to invalidate means accessors.getCharacterById (and every
     * other getXById) returns records from the pre-reload payload.
     * Downstream consumers read stale data.
     *
     * Defensive: if accessors.js is not loaded, the call is a no-op. In
     * that case there is no cache to invalidate.
     *
     * @private
     */
    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 12. INITIALIZATION
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
    window.markDataDirty = markDataDirty;     // marks dirty + schedules
    window.hasUnsavedChanges = hasUnsavedChanges;
    window.getLastSaveError = getLastSaveError;

    // Import / reset
    window.importData = importData;
    window.resetMasterData = resetMasterData;

    // Explicit initialization entry point. Callers (bootstrap) should
    // invoke this after all dependencies are loaded.
    window.initializeStorage = initialize;

})();
