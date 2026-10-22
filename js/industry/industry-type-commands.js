/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPE COMMANDS (industry-type-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-type-commands.js
 *
 * Write boundary for the enterprise type registry.
 *
 * This file:
 *   - creates, updates, and deletes enterprise types
 *   - enforces a field allowlist on update
 *   - refuses to delete a type that is referenced by any enterprise
 *   - owns persist(), the only call site of saveMasterData in this file
 *
 * This file does NOT:
 *   - mutate enterprises (IndustryCommands does)
 *   - seed the registry on an empty masterData (IndustryTypeInit does)
 *   - read or write other domains
 *   - toast, render, or touch the DOM
 *
 * OWNERSHIP:
 *   Enterprise type records -> IndustryState (this file calls its
 *                              _-prefixed mutators)
 *   Type policy             -> IndustryRules
 *   Persistence             -> persist()
 *
 * PERSISTENCE:
 *   Commands do not save. Every command mutates in-memory state and returns.
 *   The caller calls IndustryTypeCommands.persist() once per batch, after
 *   every command in the batch has succeeded.
 *
 * CONTRACT:
 *   Every public command returns { success: true, ... } or
 *   { success: false, reason: string }.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-state.js       (IndustryState)
 *   - industry-rules.js       (IndustryRules)
 *   - ids.js                  (generateId)
 *   - storage.js              (saveMasterData)
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

    if (typeof window.IndustryState === 'undefined') {
        throw new Error(
            'industry-type-commands.js requires industry-state.js to load first.'
        );
    }
    if (typeof window.IndustryRules === 'undefined') {
        throw new Error(
            'industry-type-commands.js requires industry-rules.js to load first.'
        );
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('industry-type-commands.js requires ids.js (generateId).');
    }
    if (typeof window.saveMasterData !== 'function') {
        throw new Error(
            'industry-type-commands.js requires storage.js (saveMasterData).'
        );
    }

    var IS = window.IndustryState;
    var RULES = window.IndustryRules;

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    function _failWith(errors) {
        var list = Array.isArray(errors) ? errors : [String(errors)];
        return { success: false, reason: list.join('; ') };
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    // =========================================================================
    // 4. FIELD ALLOWLISTS
    // =========================================================================

    var _ALLOWED_TYPE_UPDATE_FIELDS = {
        name: true,
        category: true,
        baseIncome: true,
        baseExpenses: true,
        baseWages: true,
        baseWorkers: true,
        baseCost: true,
        maxWorkers: true,
        description: true
    };

    var _DOMAIN_OWNED_TYPE_FIELDS = {
        id: 'The type id cannot be changed. Create a new type and migrate.'
    };

    function _validateUpdateAllowlist(updates) {
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (_DOMAIN_OWNED_TYPE_FIELDS[key]) {
                return _fail(
                    'Field "' + key + '" cannot be updated. ' +
                    _DOMAIN_OWNED_TYPE_FIELDS[key]
                );
            }
            if (!_ALLOWED_TYPE_UPDATE_FIELDS[key]) {
                return _fail(
                    'Field "' + key + '" is not an allowed enterprise type field.'
                );
            }
        }
        return _ok();
    }

    // =========================================================================
    // 5. PERSISTENCE
    // =========================================================================

    /**
     * Forces a synchronous flush of masterData to storage.
     *
     * The only call site of saveMasterData in this domain. Callers call
     * persist() once per batch.
     */
    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) return _ok();
            return _fail('saveMasterData returned false');
        } catch (e) {
            return _fail(e && e.message ? e.message : 'saveMasterData threw');
        }
    }

    // =========================================================================
    // 6. TYPE CRUD
    // =========================================================================

    /**
     * Creates an enterprise type.
     *
     * Input shape (id is generated):
     *   {
     *     name, category, baseIncome, baseExpenses, baseWages,
     *     baseWorkers, baseCost, maxWorkers, description
     *   }
     */
    function createEnterpriseType(data) {
        if (!_isPlainObject(data)) {
            return _fail('Enterprise type data must be a plain object.');
        }

        var defaults = RULES.applyEnterpriseTypeDefaults(data);

        var candidate = Object.assign({}, defaults, {
            id: window.generateId('enttype')
        });

        var validation = RULES.validateEnterpriseType(candidate);
        if (!validation.valid) {
            return _failWith(validation.errors);
        }

        try {
            var stored = IS._addEnterpriseType(candidate);
            return _ok({ type: stored });
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }
    }

    /**
     * Updates an enterprise type.
     */
    function updateEnterpriseType(typeId, updates) {
        if (!_hasId(typeId)) return _fail('typeId is required.');
        if (!_isPlainObject(updates)) return _fail('updates must be a plain object.');

        var current = IS.getEnterpriseType(typeId);
        if (!current) return _fail('Enterprise type not found.');

        var allow = _validateUpdateAllowlist(updates);
        if (!allow.success) return allow;

        var coherence = RULES.validateEnterpriseTypePatch(current, updates);
        if (!coherence.valid) {
            return _failWith(coherence.errors);
        }

        try {
            var updated = IS._updateEnterpriseType(typeId, updates);
            if (!updated) return _fail('Enterprise type not found after update.');
            return _ok({ type: updated });
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }
    }

    /**
     * Deletes an enterprise type.
     *
     * Refuses if any enterprise references the type. Reference count is
     * computed from IndustryState.getEnterprisesByType; the caller can
     * inspect the rejection and reassign enterprises first.
     */
    function deleteEnterpriseType(typeId) {
        if (!_hasId(typeId)) return _fail('typeId is required.');

        var type = IS.getEnterpriseType(typeId);
        if (!type) return _fail('Enterprise type not found.');

        var referencing = IS.getEnterprisesByType(typeId);
        if (referencing.length > 0) {
            return _fail(
                'Cannot delete type: ' + referencing.length +
                ' enterprise(s) reference it. Reassign them first.'
            );
        }

        try {
            var deleted = IS._removeEnterpriseType(typeId);
            if (!deleted) return _fail('IndustryState refused the delete.');
            return _ok({ typeId: typeId });
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the delete.');
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.IndustryTypeCommands = Object.freeze({
        persist: persist,

        createEnterpriseType: createEnterpriseType,
        updateEnterpriseType: updateEnterpriseType,
        deleteEnterpriseType: deleteEnterpriseType
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypeCommands;
    }
})();
