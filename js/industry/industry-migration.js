/**
 * =============================================================================
 * STILL WATERS - INDUSTRY MIGRATION (industry-migration.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-migration.js
 *
 * One-time migration of enterprise records to the canonical Phase-3 shape.
 *
 * This file:
 *   - derives ownershipType from legacy isPublic when ownershipType is
 *     absent or invalid
 *   - strips derived fields (typeName, category, isPublic, ownerName,
 *     locationName, workerCount) from each record
 *   - validates each record against the canonical shape (via IndustryRules)
 *   - reports per-record validation failures without throwing
 *   - saves and marks dirty only when something actually changed
 *
 * This file does NOT:
 *   - fabricate missing relationships (a missing typeId is an error, not
 *     an invitation to invent "other")
 *   - touch the in-memory IndustryState catalogue (bootstrap hydrates
 *     after migration runs; if migration mutated the state and hydration
 *     ran before it, the state would need re-hydration — simpler to make
 *     migration a pure pre-hydration step)
 *   - publish events or notify subscribers
 *   - repair broken cross-record references (typeId → missing type is an
 *     integrity error, reported by IndustryState.validateIntegrity)
 *
 * IDEMPOTENT:
 *   Safe to call on every bootstrap. On a clean save (nothing to migrate)
 *   it returns { ok: true, migrated: N, changed: 0, errors: [] } with
 *   zero side effects. On a contaminated save it strips and derives,
 *   validates, and saves once.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-constants.js (IndustryConstants)
 *   - industry-rules.js     (IndustryRules)
 *   - storage.js            (saveMasterData, markDataDirty)
 *
 * DEPENDENCIES (OPTIONAL at load):
 *   - industry-state.js     (IndustryState) — if present, migration calls
 *                             hydrateFromMasterData() after a changed run
 *                             so any already-hydrated state stays current.
 *                             If absent, migration is purely a
 *                             pre-hydration step and the bootstrap will
 *                             hydrate after.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryConstants === 'undefined') {
        throw new Error(
            'industry-migration.js requires industry-constants.js to load first.'
        );
    }
    if (typeof window.IndustryRules === 'undefined') {
        throw new Error(
            'industry-migration.js requires industry-rules.js to load first.'
        );
    }
    if (typeof window.saveMasterData !== 'function') {
        throw new Error(
            'industry-migration.js requires storage.js (saveMasterData).'
        );
    }
    if (typeof window.markDataDirty !== 'function') {
        throw new Error(
            'industry-migration.js requires storage.js (markDataDirty).'
        );
    }

    var C = window.IndustryConstants;
    var RULES = window.IndustryRules;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (call-time)
    // =========================================================================

    function _requireMasterData() {
        if (typeof window.masterData === 'undefined'
            || !window.masterData
            || !window.masterData.data
            || typeof window.masterData.data !== 'object') {
            throw new Error(
                'industry-migration.js: window.masterData is not initialised. ' +
                'storage.js must load and run before migration.'
            );
        }
        return window.masterData;
    }

    function _requireEnterprisesArray() {
        var md = _requireMasterData();
        if (!Array.isArray(md.data.enterprises)) {
            md.data.enterprises = [];
        }
        return md.data.enterprises;
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    // =========================================================================
    // 4. PASS 1 — LEGACY isPublic → ownershipType
    // =========================================================================

    /**
     * Derives ownershipType from isPublic when ownershipType is missing or
     * invalid.
     *
     * The legacy shape stored a boolean isPublic and did not carry
     * ownershipType. This pass bridges the two.
     *
     * Only fires when ownershipType is absent or not one of the valid
     * strings — a modern record with a valid ownershipType is never
     * overridden.
     *
     * @param {Object} record
     * @returns {boolean} true if the record was changed
     */
    function _deriveOwnershipType(record) {
        var hasValidOwnershipType =
            record.ownershipType === C.OWNERSHIP_TYPE.PUBLIC
            || record.ownershipType === C.OWNERSHIP_TYPE.PRIVATE;

        if (hasValidOwnershipType) {
            return false;
        }

        if (typeof record.isPublic === 'boolean') {
            record.ownershipType = record.isPublic
                ? C.OWNERSHIP_TYPE.PUBLIC
                : C.OWNERSHIP_TYPE.PRIVATE;
            return true;
        }

        return false;
    }

    // =========================================================================
    // 5. PASS 2 — STRIP DERIVED FIELDS
    // =========================================================================

    /**
     * Removes derived fields from a record.
     *
     * @param {Object} record
     * @returns {boolean} true if anything was removed
     */
    function _stripDerivedFields(record) {
        var changed = false;
        for (var i = 0; i < C.DERIVED_FIELDS.length; i++) {
            var key = C.DERIVED_FIELDS[i];
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                delete record[key];
                changed = true;
            }
        }
        return changed;
    }

    // =========================================================================
    // 6. MAIN ENTRY POINT
    // =========================================================================

    /**
     * Migrates masterData.data.enterprises to the canonical shape.
     *
     * Runs three passes on every record:
     *   1. derive ownershipType from legacy isPublic
     *   2. strip derived fields
     *   3. validate against canonical shape
     *
     * Records that fail validation are collected into errors[] and left
     * in place (unmigrated). They remain in the canonical array so that
     * the bootstrap integrity diagnostic and any future repair tool can
     * see them. Migration does NOT delete failed records.
     *
     * Returns:
     *   { ok: true,  migrated: N, changed: C, errors: [] }
     *   { ok: false, migrated: N, changed: C, errors: [...] }
     *
     * ok is true when every record migrated cleanly (including zero
     * records). ok is false when at least one record failed validation.
     *
     * Side effects:
     *   - markDataDirty() is called when changed > 0
     *   - saveMasterData() is called when changed > 0
     *   - if IndustryState is loaded and changed > 0, its hydrateFromMasterData
     *     is invoked so already-hydrated state reflects the migrated records
     *
     * @returns {{ ok: boolean, migrated: number, changed: number, errors: Object[] }}
     */
    function migrateEnterprisesToCanonicalShape() {
        var md = _requireMasterData();
        var enterprises = _requireEnterprisesArray();

        var migrated = 0;
        var changed = 0;
        var errors = [];

        for (var i = 0; i < enterprises.length; i++) {
            var record = enterprises[i];

            if (!_isPlainObject(record)) {
                errors.push({
                    index: i,
                    id: '(not an object)',
                    name: '(not an object)',
                    errors: ['record is not a plain object']
                });
                continue;
            }

            var recordChanged = false;

            // Pass 1 — derive ownershipType from legacy isPublic.
            if (_deriveOwnershipType(record)) {
                recordChanged = true;
            }

            // Pass 2 — strip derived fields.
            if (_stripDerivedFields(record)) {
                recordChanged = true;
            }

            // Pass 3 — validate against the canonical shape.
            var validation = RULES.validateEnterprise(record);
            if (!validation.valid) {
                errors.push({
                    index: i,
                    id: record.id || '(no id)',
                    name: record.name || '(no name)',
                    errors: validation.errors
                });
                continue;
            }

            if (recordChanged) {
                changed++;
            }
            migrated++;
        }

        // Persist only when we actually changed something.
        if (changed > 0) {
            md.data.enterprises = enterprises;
            window.markDataDirty();

            // Re-hydrate state if it is already loaded. This keeps
            // subscribers, indexes, and any downstream consumer consistent
            // with the migrated records.
            if (typeof window.IndustryState !== 'undefined'
                && typeof window.IndustryState.hydrateFromMasterData === 'function') {
                try {
                    window.IndustryState.hydrateFromMasterData(
                        enterprises,
                        Array.isArray(md.data.enterpriseTypes)
                            ? md.data.enterpriseTypes
                            : []
                    );
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'industry-migration.js: re-hydration after ' +
                            'migration failed:', e
                        );
                    }
                }
            }

            try {
                window.saveMasterData();
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'industry-migration.js: saveMasterData threw after ' +
                        'migration:', e
                    );
                }
                return {
                    ok: false,
                    migrated: migrated,
                    changed: changed,
                    errors: errors.concat([{
                        index: -1,
                        id: '(storage)',
                        name: '(storage)',
                        errors: ['saveMasterData threw: ' +
                            (e && e.message ? e.message : String(e))]
                    }])
                };
            }
        }

        return {
            ok: errors.length === 0,
            migrated: migrated,
            changed: changed,
            errors: errors
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.IndustryMigration = Object.freeze({
        migrateEnterprisesToCanonicalShape: migrateEnterprisesToCanonicalShape
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryMigration;
    }
})();
