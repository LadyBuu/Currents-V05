/**
 * =============================================================================
 * STILL WATERS - INDUSTRY BOOTSTRAP (industry-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-bootstrap.js
 *
 * Single entry point for industry system initialization.
 *
 * Lifecycle:
 *   1. Migration: strip derived fields from legacy records
 *   2. Type initialization: seed defaults if registry is empty
 *   3. Index rebuild: ensure State indexes are current
 *
 * Call this once, after masterData is loaded, before any Industry queries.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    function _requireMigration() {
        if (typeof window.IndustryMigration === 'undefined') {
            throw new Error('IndustryBootstrap: IndustryMigration dependency missing');
        }
        return window.IndustryMigration;
    }

    function _requireTypeInit() {
        if (typeof window.IndustryTypeInitialization === 'undefined') {
            throw new Error('IndustryBootstrap: IndustryTypeInitialization dependency missing');
        }
        return window.IndustryTypeInitialization;
    }

    function _requireState() {
        if (typeof window.IndustryState === 'undefined') {
            throw new Error('IndustryBootstrap: IndustryState dependency missing');
        }
        return window.IndustryState;
    }

    /**
     * Runs the full industry initialization sequence.
     *
     * @returns {Object} { migration, typeInit }
     */
    function initializeIndustry() {
        var migration = _requireMigration();
        var typeInit = _requireTypeInit();
        var state = _requireState();

        // Step 1: migrate enterprises to canonical shape
        var migrationResult = migration.migrateEnterprisesToCanonicalShape();
        if (!migrationResult.ok) {
            throw new Error(
                'IndustryBootstrap: migration failed with ' +
                migrationResult.errors.length + ' validation error(s). ' +
                'First error: enterprise ' +
                (migrationResult.errors[0].id || '(no id)') + ': ' +
                migrationResult.errors[0].errors.join(', ')
            );
        }

        // Step 2: seed type registry if empty
        var typeInitResult = typeInit.ensureEnterpriseTypesInitialized();

        // Step 3: ensure indexes are current
        state.rebuildIndexes();

        return {
            migration: migrationResult,
            typeInit: typeInitResult
        };
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.IndustryBootstrap = {
        initializeIndustry: initializeIndustry
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryBootstrap;
    }

})();
