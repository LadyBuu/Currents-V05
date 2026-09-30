/**
 * =============================================================================
 * STILL WATERS - INDUSTRY MIGRATION (industry-migration.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-migration.js
 *
 * One-time migration of enterprise records to the canonical shape.
 *
 * Removes denormalized fields:
 *   - typeName
 *   - category
 *   - isPublic
 *   - ownerName
 *   - locationName
 *   - workerCount
 *
 * Preserves relationships (typeId, ownerType, ownerId, locationId, workerList)
 * and all irreducible facts.
 *
 * ARCHITECTURAL RULES:
 *   - Idempotent. Safe to call multiple times.
 *   - Only writes if something actually changed.
 *   - Does NOT fabricate missing relationships. A missing typeId is a
 *     migration error, not an invitation to invent "other".
 *   - Does NOT save or notify unless it changed something.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    var DERIVED_FIELDS = [
        'typeName',
        'category',
        'isPublic',
        'ownerName',
        'locationName',
        'workerCount'
    ];

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireMasterData() {
        var md = window.masterData;
        if (!md) {
            throw new Error('IndustryMigration: masterData dependency missing');
        }
        if (!md.data) {
            md.data = {};
        }
        return md;
    }

    function _requireEnterprisesArray() {
        var md = _requireMasterData();
        if (!md.data.enterprises) {
            md.data.enterprises = [];
        }
        return md.data.enterprises;
    }

    function _requireSaveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('IndustryMigration: saveMasterData dependency missing');
        }
        return window.saveMasterData;
    }

    function _requireState() {
        // State is optional during migration. If it exists, we refresh it
        // after changing canonical data so the app sees the new shape.
        return window.IndustryState || null;
    }

    // =========================================================================
    // 2. VALIDATION
    // =========================================================================

    function _validateCanonicalRelationships(enterprise, index) {
        var errors = [];

        if (!enterprise.id) {
            errors.push('missing id');
        }
        if (!enterprise.name || typeof enterprise.name !== 'string' || enterprise.name.trim() === '') {
            errors.push('missing or empty name');
        }
        if (!enterprise.typeId) {
            errors.push('missing typeId (cannot infer intended type)');
        }
        if (enterprise.ownershipType !== 'public' && enterprise.ownershipType !== 'private') {
            errors.push('invalid ownershipType: ' + enterprise.ownershipType);
        }
        if (enterprise.ownerType !== 'none' &&
            enterprise.ownerType !== 'character' &&
            enterprise.ownerType !== 'household' &&
            enterprise.ownerType !== 'settlement' &&
            enterprise.ownerType !== 'state') {
            errors.push('invalid ownerType: ' + enterprise.ownerType);
        }
        if (enterprise.ownerType === 'none' && enterprise.ownerId) {
            errors.push('ownerType "none" cannot have an ownerId');
        }
        if (enterprise.ownerType !== 'none' && !enterprise.ownerId) {
            errors.push('ownerType requires an ownerId');
        }
        if (!Array.isArray(enterprise.workerList)) {
            errors.push('workerList is not an array');
        }
        if (enterprise.workerWages === null || typeof enterprise.workerWages !== 'object') {
            errors.push('workerWages is not an object');
        }
        if (!Array.isArray(enterprise.history)) {
            errors.push('history is not an array');
        }

        return errors;
    }

    // =========================================================================
    // 3. MIGRATION
    // =========================================================================

    /**
     * Strips derived fields from a single enterprise record.
     * Returns true if anything was removed.
     *
     * @param {Object} enterprise
     * @returns {boolean} changed
     */
    function _stripDerivedFields(enterprise) {
        var changed = false;
        for (var i = 0; i < DERIVED_FIELDS.length; i++) {
            var key = DERIVED_FIELDS[i];
            if (Object.prototype.hasOwnProperty.call(enterprise, key)) {
                delete enterprise[key];
                changed = true;
            }
        }
        return changed;
    }

    /**
     * Migrates all enterprises to the canonical shape.
     *
     * @returns {Object} { ok, migrated, changed, errors }
     */
    function migrateEnterprisesToCanonicalShape() {
        var enterprises = _requireEnterprisesArray();
        var migrated = 0;
        var changed = 0;
        var errors = [];

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];

            var validationErrors = _validateCanonicalRelationships(e, i);
            if (validationErrors.length > 0) {
                errors.push({
                    index: i,
                    id: e.id || '(no id)',
                    name: e.name || '(no name)',
                    errors: validationErrors
                });
                continue;
            }

            var recordChanged = _stripDerivedFields(e);
            if (recordChanged) {
                changed++;
            }
            migrated++;
        }

        if (errors.length > 0) {
            return {
                ok: false,
                migrated: migrated,
                changed: changed,
                errors: errors
            };
        }

        if (changed > 0) {
            _requireSaveMasterData()();

            var state = _requireState();
            if (state && typeof state.rebuildIndexes === 'function') {
                state.rebuildIndexes();
            }
            if (state && typeof state.notify === 'function') {
                state.notify('enterprises_migrated', { changed: changed });
            }
        }

        return {
            ok: true,
            migrated: migrated,
            changed: changed,
            errors: []
        };
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.IndustryMigration = {
        migrateEnterprisesToCanonicalShape: migrateEnterprisesToCanonicalShape
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryMigration;
    }

})();
