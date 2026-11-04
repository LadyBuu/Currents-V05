/**
 * =============================================================================
 * STILL WATERS - CULTURE VALIDATION
 * js/culture/culture-validation.js
 * =============================================================================
 *
 * Structural and value validation for culture data.
 *
 * This module owns the rules. It does not own:
 *   - the mutation transaction     (CultureCommands)
 *   - canonical data               (masterData.data.cultures)
 *   - persistence                  (application save mechanism)
 *   - presentation                 (CultureViewModels / UI)
 *   - defaults                     (CultureConstants)
 *
 * It is pure. Given the same candidate and context, it returns the same
 * result and never touches anything outside its arguments.
 *
 * Return shape (every validator):
 *
 *     { valid: boolean, errors: [{ field, message }] }
 *
 * Callers decide what to do with errors. Commands return them to the UI.
 * The UI decides whether to toast, highlight, or ignore.
 *
 * MYTHOLOGY FIELD VOCABULARY (public export)
 * ------------------------------------------
 * _validateMythology enforces a fixed set of allowed mythology fields.
 * That set is exported publicly as:
 *
 *     CultureValidation.MYTHOLOGY_TEXT_FIELDS  (string fields)
 *     CultureValidation.MYTHOLOGY_ARRAY_FIELDS (string-array fields)
 *
 * The exports are the same frozen arrays the validator reads; they
 * cannot drift from the validator because they are the same array
 * instances. Consumers (culture-mythology-tab.js's cross-check, future
 * docs generators, migration scripts) use these to know what fields
 * exist without parsing this file.
 *
 * Do NOT mutate the exported arrays. They are frozen; a mutation attempt
 * throws in strict mode and silently no-ops otherwise, and either way
 * does not affect the validator.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A5):
 *     - Hoisted the two mythology field lists from inline literals
 *       inside _validateMythology to module-scope frozen arrays
 *       (MYTHOLOGY_TEXT_FIELDS, MYTHOLOGY_ARRAY_FIELDS).
 *     - Exported both arrays on window.CultureValidation so consumers
 *       can read the authoritative field vocabulary. The mythology tab
 *       uses these to detect cross-file drift.
 *     - _validateMythology now reads from the hoisted arrays instead of
 *       its own local literals. Same behavior.
 *     - No change to any other validator. No change to return shapes.
 *   Previous revisions:
 *     - Initial implementation.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. MYTHOLOGY FIELD VOCABULARY
    // =========================================================================
    //
    // The canonical list of mythology fields _validateMythology enforces.
    // Exported publicly as CultureValidation.MYTHOLOGY_TEXT_FIELDS and
    // CultureValidation.MYTHOLOGY_ARRAY_FIELDS so consumers (the
    // mythology tab's drift check, future docs generators) can read the
    // vocabulary without parsing this file.
    //
    // Frozen so a consumer cannot mutate them via the public export.
    // A mutation attempt throws in strict mode and silently no-ops
    // otherwise; either way the validator's view is unaffected.

    var MYTHOLOGY_TEXT_FIELDS = Object.freeze(['creation', 'afterlife', 'cosmology']);
    var MYTHOLOGY_ARRAY_FIELDS = Object.freeze(['keyDeities', 'keyEvents', 'symbols', 'themes']);

    // =========================================================================
    // 2. PRIMITIVES
    // =========================================================================

    function _isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.trim().length > 0;
    }

    function _isStringArray(v) {
        if (!Array.isArray(v)) return false;
        for (var i = 0; i < v.length; i++) {
            if (typeof v[i] !== 'string') return false;
        }
        return true;
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function _isNonNegativeNumber(v) {
        return _isFiniteNumber(v) && v >= 0;
    }

    function _errors() {
        var list = [];
        return {
            push: function(field, message) {
                list.push({ field: field, message: message });
            },
            result: function() {
                return { valid: list.length === 0, errors: list };
            }
        };
    }

    // =========================================================================
    // 3. FIELD VALIDATORS
    // =========================================================================
    //
    // Each validator takes (value, errors, fieldPath). A value of undefined
    // means "field not supplied"; validators that accept absent fields
    // return early in that case. Callers of these helpers decide whether
    // absence is legal for the given operation.
    //

    function _validateName(value, errors) {
        if (!_isNonEmptyString(value)) {
            errors.push('name', 'Name is required and must be a non-empty string.');
        }
    }

    function _validateDisplayName(value, errors) {
        if (value === undefined) return;
        if (value === null) return; // treat null as "no display name"
        if (typeof value !== 'string') {
            errors.push('displayName', 'Display name must be a string when provided.');
        }
    }

    function _validateDescription(value, errors) {
        if (value === undefined) return;
        if (typeof value !== 'string') {
            errors.push('description', 'Description must be a string when provided.');
        }
    }

    function _validateNotes(value, errors) {
        if (value === undefined) return;
        if (typeof value !== 'string') {
            errors.push('notes', 'Notes must be a string when provided.');
        }
    }

    function _validateIcon(value, errors) {
        if (value === undefined) return;
        if (value === null) return; // null = deliberately no icon
        if (typeof value !== 'string') {
            errors.push('icon', 'Icon must be a string or null.');
        }
    }

    function _validateStringIdArray(value, field, errors) {
        if (value === undefined) return;
        if (!Array.isArray(value)) {
            errors.push(field, field + ' must be an array of strings.');
            return;
        }
        for (var i = 0; i < value.length; i++) {
            if (typeof value[i] !== 'string' || value[i].length === 0) {
                errors.push(
                    field,
                    field + ' must contain only non-empty strings (index ' + i + ').'
                );
                return;
            }
        }
    }

    // =========================================================================
    // 4. APPEARANCE
    // =========================================================================
    //
    // Appearance is a weighted-option map:
    //
    //     {
    //         skinTones: [ { value: 'Pale', weight: 20 }, ... ],
    //         eyeColors: [ ... ],
    //         ...
    //         height: { male: { min, max }, female: { min, max } },
    //         commonFeatures: [ ... ]
    //     }
    //
    // The validator checks the shape without dictating which categories
    // must exist. CultureConstants owns which categories are canonical.
    //

    function _validateWeightedOptionList(list, fieldPath, errors) {
        if (!Array.isArray(list)) {
            errors.push(fieldPath, fieldPath + ' must be an array.');
            return;
        }
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!_isPlainObject(item)) {
                errors.push(fieldPath, fieldPath + '[' + i + '] must be an object.');
                continue;
            }
            if (typeof item.value !== 'string' || item.value.length === 0) {
                errors.push(
                    fieldPath,
                    fieldPath + '[' + i + '].value must be a non-empty string.'
                );
            }
            if (item.weight !== undefined && !_isNonNegativeNumber(item.weight)) {
                errors.push(
                    fieldPath,
                    fieldPath + '[' + i + '].weight must be a non-negative number when provided.'
                );
            }
        }
    }

    function _validateHeightRange(range, fieldPath, errors) {
        if (!_isPlainObject(range)) {
            errors.push(fieldPath, fieldPath + ' must be an object with min and max.');
            return;
        }
        if (!_isFiniteNumber(range.min)) {
            errors.push(fieldPath, fieldPath + '.min must be a finite number.');
        }
        if (!_isFiniteNumber(range.max)) {
            errors.push(fieldPath, fieldPath + '.max must be a finite number.');
        }
        if (_isFiniteNumber(range.min) && _isFiniteNumber(range.max) && range.min > range.max) {
            errors.push(fieldPath, fieldPath + '.min must be <= max.');
        }
    }

    function _validateAppearance(value, errors) {
        if (value === undefined) return;
        if (value === null) return; // null = deliberately no appearance override
        if (!_isPlainObject(value)) {
            errors.push('appearance', 'Appearance must be an object.');
            return;
        }

        for (var key in value) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
            var fieldPath = 'appearance.' + key;
            var category = value[key];

            if (key === 'height') {
                if (!_isPlainObject(category)) {
                    errors.push(fieldPath, fieldPath + ' must be an object.');
                    continue;
                }
                for (var genderKey in category) {
                    if (!Object.prototype.hasOwnProperty.call(category, genderKey)) continue;
                    _validateHeightRange(
                        category[genderKey],
                        fieldPath + '.' + genderKey,
                        errors
                    );
                }
                continue;
            }

            if (Array.isArray(category)) {
                _validateWeightedOptionList(category, fieldPath, errors);
                continue;
            }

            errors.push(
                fieldPath,
                fieldPath + ' must be an array of weighted options or a height object.'
            );
        }
    }

    // =========================================================================
    // 5. MYTHOLOGY
    // =========================================================================
    //
    // Mythology is flavor text. Validation is deliberately permissive:
    // unknown fields are allowed, known fields are type-checked.
    //
    // The two field lists are hoisted to module scope (see §1) so they
    // can be exported. Do not inline them here; edit them in §1.

    function _validateMythology(value, errors) {
        if (value === undefined) return;
        if (value === null) return;
        if (!_isPlainObject(value)) {
            errors.push('mythology', 'Mythology must be an object.');
            return;
        }

        for (var i = 0; i < MYTHOLOGY_TEXT_FIELDS.length; i++) {
            var key = MYTHOLOGY_TEXT_FIELDS[i];
            if (value[key] === undefined || value[key] === null) continue;
            if (typeof value[key] !== 'string') {
                errors.push('mythology.' + key, 'mythology.' + key + ' must be a string.');
            }
        }

        for (var j = 0; j < MYTHOLOGY_ARRAY_FIELDS.length; j++) {
            var arrKey = MYTHOLOGY_ARRAY_FIELDS[j];
            if (value[arrKey] === undefined || value[arrKey] === null) continue;
            if (!_isStringArray(value[arrKey])) {
                errors.push('mythology.' + arrKey, 'mythology.' + arrKey + ' must be an array of strings.');
            }
        }
    }

    // =========================================================================
    // 6. ID
    // =========================================================================

    function _validateIdPresence(value, errors) {
        if (!_isNonEmptyString(value)) {
            errors.push('id', 'Culture id is required.');
        }
    }

    function _validateIdUnique(value, cultures, errors) {
        if (!_isNonEmptyString(value) || !Array.isArray(cultures)) return;
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === value) {
                errors.push('id', 'A culture with this id already exists.');
                return;
            }
        }
    }

    function _validateIdUnchanged(candidateId, originalId, errors) {
        if (candidateId !== originalId) {
            errors.push('id', 'Culture id cannot be changed.');
        }
    }

    // =========================================================================
    // 7. SHARED FIELD SWEEP
    // =========================================================================

    function _validateCommonFields(candidate, errors) {
        _validateName(candidate.name, errors);
        _validateDisplayName(candidate.displayName, errors);
        _validateDescription(candidate.description, errors);
        _validateNotes(candidate.notes, errors);
        _validateIcon(candidate.icon, errors);
        _validateStringIdArray(candidate.locations, 'locations', errors);
        _validateStringIdArray(candidate.religions, 'religions', errors);
        _validateAppearance(candidate.appearance, errors);
        _validateMythology(candidate.mythology, errors);
    }

    // =========================================================================
    // 8. CREATE
    // =========================================================================

    /**
     * Validates a culture candidate for creation.
     *
     * @param {Object} candidate
     * @param {Object} context
     * @param {Array} context.cultures - existing canonical cultures
     * @returns {{ valid: boolean, errors: Array }}
     */
    function validateCreate(candidate, context) {
        context = context || {};
        var cultures = Array.isArray(context.cultures) ? context.cultures : [];
        var errors = _errors();

        if (!_isPlainObject(candidate)) {
            errors.push('culture', 'Candidate must be an object.');
            return errors.result();
        }

        _validateIdPresence(candidate.id, errors);
        _validateIdUnique(candidate.id, cultures, errors);
        _validateCommonFields(candidate, errors);

        return errors.result();
    }

    // =========================================================================
    // 9. UPDATE
    // =========================================================================

    /**
     * Validates a culture candidate for update.
     *
     * @param {Object} candidate - the fully-patched culture
     * @param {Object} context
     * @param {Array}  context.cultures - existing canonical cultures
     * @param {number} context.index    - index of the culture being updated
     * @returns {{ valid: boolean, errors: Array }}
     */
    function validateUpdate(candidate, context) {
        context = context || {};
        var cultures = Array.isArray(context.cultures) ? context.cultures : [];
        var errors = _errors();

        if (!_isPlainObject(candidate)) {
            errors.push('culture', 'Candidate must be an object.');
            return errors.result();
        }

        _validateIdPresence(candidate.id, errors);
        _validateCommonFields(candidate, errors);

        // Confirm the id matches the record being replaced. A mismatch
        // indicates either a bug in the command layer or an attempt to
        // mutate identity, both of which must be rejected.
        if (typeof context.index === 'number' &&
            context.index >= 0 &&
            context.index < cultures.length) {
            var original = cultures[context.index];
            if (original && original.id !== undefined) {
                _validateIdUnchanged(candidate.id, original.id, errors);
            }
        }

        // Check id uniqueness against all other records.
        if (_isNonEmptyString(candidate.id)) {
            for (var i = 0; i < cultures.length; i++) {
                if (i === context.index) continue;
                if (cultures[i] && cultures[i].id === candidate.id) {
                    errors.push('id', 'Another culture already uses this id.');
                    break;
                }
            }
        }

        return errors.result();
    }

    // =========================================================================
    // 10. DELETE
    // =========================================================================

    /**
     * Validates that a culture is safe to delete.
     *
     * Currently: the culture must exist. Cross-domain rules (e.g. "cannot
     * delete a culture that characters depend on") belong to CultureCascade
     * or to the caller, not here, because CultureValidation does not know
     * about other domains.
     *
     * @param {string} id
     * @param {Object} context
     * @param {Array}  context.cultures
     * @returns {{ valid: boolean, errors: Array }}
     */
    function validateDelete(id, context) {
        context = context || {};
        var cultures = Array.isArray(context.cultures) ? context.cultures : [];
        var errors = _errors();

        if (!_isNonEmptyString(id)) {
            errors.push('id', 'Culture id is required.');
            return errors.result();
        }

        var found = false;
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === id) { found = true; break; }
        }
        if (!found) {
            errors.push('id', 'Culture not found.');
        }

        return errors.result();
    }

    // =========================================================================
    // 11. PUBLIC API
    // =========================================================================

    window.CultureValidation = {
        // Validators
        validateCreate: validateCreate,
        validateUpdate: validateUpdate,
        validateDelete: validateDelete,

        // Field vocabulary (read-only; frozen arrays)
        MYTHOLOGY_TEXT_FIELDS: MYTHOLOGY_TEXT_FIELDS,
        MYTHOLOGY_ARRAY_FIELDS: MYTHOLOGY_ARRAY_FIELDS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureValidation;
    }

})();
