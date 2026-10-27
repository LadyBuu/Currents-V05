/**
 * =============================================================================
 * STILL WATERS - RELIGION VALIDATION (religion-validation.js)
 * =============================================================================
 * 
 * LOCATION: js/religion/religion-validation.js
 * 
 * Structural and legalistic validation for religion inputs.
 * 
 * Scope:
 *   - Enum membership (trait, inheritance rule, law type, etc.)
 *   - Required fields
 *   - Field length limits
 *   - Year integer-ness and range
 *   - Legal combinations of values
 * 
 * Out of scope (belongs in ReligionRules):
 *   - "Can this religion be deprecated now?"
 *   - "Can this character convert?"
 *   - "Can this leader be appointed at this year?"
 * 
 * Out of scope (belongs in Commands):
 *   - Performing the mutation
 *   - Reading current state to decide eligibility
 * 
 * Validation is pure: input in, verdict out. No mutation, no save, no notify.
 * 
 * DEPENDENCIES:
 *   - religion-constants.js: ReligionConstants
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 5 DOMAIN RULES AND VALIDATION EXTRACTION (2026):
 *   - New module. Extracted from religion-commands.js (_validateReligionData)
 *     and religion-laws.js (_validateLawInput).
 *   - Single source of truth for every religion/law input validation rule.
 *   - Returns { valid, errors } rather than { success, reason }. This is
 *     structural verification, not a transaction outcome.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _constants() {
        if (typeof window.ReligionConstants === 'undefined') {
            throw new Error('ReligionValidation requires ReligionConstants.');
        }
        return window.ReligionConstants;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _ok() {
        return { valid: true, errors: [] };
    }

    function _fail(errors) {
        return { valid: false, errors: errors };
    }

    function _isValidEnum(value, enumObject) {
        if (value === undefined || value === null) return true; // optional
        var values = Object.values(enumObject);
        return values.indexOf(value) !== -1;
    }

    function _isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function _isValidYear(value) {
        // Years must be integers. Non-integer, NaN, Infinity all rejected.
        // Year 0 is valid. Negative years are permitted (world chronology
        // decides whether they mean anything).
        return typeof value === 'number'
            && !Number.isNaN(value)
            && Number.isFinite(value)
            && Math.floor(value) === value;
    }

    // =========================================================================
    // 3. RELIGION VALIDATION
    // =========================================================================

    /**
     * Validate a religion creation payload.
     * 
     * Required:
     *   - name (non-empty string, ≤100 chars)
     * 
     * Optional (validated if present):
     *   - displayName (string)
     *   - icon (string, no length limit currently)
     *   - description (string)
     *   - trait (enum: monotheistic, polytheistic, syncretic, evangelical, animist)
     *   - isOrganized (boolean)
     *   - allowsConversion (boolean)
     *   - proselytizes (boolean)
     *   - inheritanceRule.type (enum: mother, father, both, dominant, none)
     *   - inheritanceRule.priority (enum: mother, father — only meaningful for 'both')
     *   - notes (string)
     */
    function validateReligionCreate(data) {
        var errors = [];
        var constants = _constants();

        if (!data || typeof data !== 'object') {
            return _fail(['Religion data is required']);
        }

        // Required
        if (!_isNonEmptyString(data.name)) {
            errors.push('Religion name is required');
        } else if (data.name.length > 100) {
            errors.push('Religion name cannot exceed 100 characters');
        }

        // Optional strings
        if (data.displayName !== undefined && typeof data.displayName !== 'string') {
            errors.push('Display name must be a string');
        }
        if (data.icon !== undefined && typeof data.icon !== 'string') {
            errors.push('Icon must be a string');
        }
        if (data.description !== undefined && typeof data.description !== 'string') {
            errors.push('Description must be a string');
        }
        if (data.notes !== undefined && typeof data.notes !== 'string') {
            errors.push('Notes must be a string');
        }

        // Optional booleans
        if (data.isOrganized !== undefined && typeof data.isOrganized !== 'boolean') {
            errors.push('isOrganized must be a boolean');
        }
        if (data.allowsConversion !== undefined && typeof data.allowsConversion !== 'boolean') {
            errors.push('allowsConversion must be a boolean');
        }
        if (data.proselytizes !== undefined && typeof data.proselytizes !== 'boolean') {
            errors.push('proselytizes must be a boolean');
        }

        // Trait
        if (data.trait !== undefined && !_isValidEnum(data.trait, constants.RELIGIOUS_TRAITS)) {
            errors.push('Invalid religious trait: ' + data.trait);
        }

        // Inheritance rule
        if (data.inheritanceRule !== undefined) {
            if (typeof data.inheritanceRule !== 'object' || data.inheritanceRule === null) {
                errors.push('Inheritance rule must be an object');
            } else {
                if (data.inheritanceRule.type !== undefined &&
                    !_isValidEnum(data.inheritanceRule.type, constants.INHERITANCE_RULES)) {
                    errors.push('Invalid inheritance rule type: ' + data.inheritanceRule.type);
                }
                if (data.inheritanceRule.priority !== undefined &&
                    data.inheritanceRule.priority !== null) {
                    // Priority only makes sense as mother or father.
                    if (data.inheritanceRule.priority !== constants.INHERITANCE_RULES.MOTHER &&
                        data.inheritanceRule.priority !== constants.INHERITANCE_RULES.FATHER) {
                        errors.push('Inheritance priority must be mother or father');
                    }
                }
            }
        }

        return errors.length === 0 ? _ok() : _fail(errors);
    }

    /**
     * Validate a religion update payload.
     * 
     * Same rules as create, but name is optional. If name is present, it must
     * still be non-empty and within length limits.
     * 
     * isDeprecated and deprecatedYear are NOT accepted here — those go through
     * deprecateReligion / reactivateReligion, which have their own semantics.
     * Passing them in an update payload is not an error; they are simply
     * ignored by the command allowlist.
     */
    function validateReligionUpdate(data) {
        if (!data || typeof data !== 'object') {
            return _fail(['Update payload is required']);
        }

        // Reuse create validation, then relax the name requirement.
        var result = validateReligionCreate(data);

        // If the only error was about a missing name, and name wasn't provided,
        // that's fine for update — the caller is not changing the name.
        if (!result.valid && data.name === undefined) {
            var filtered = [];
            for (var i = 0; i < result.errors.length; i++) {
                if (result.errors[i] !== 'Religion name is required') {
                    filtered.push(result.errors[i]);
                }
            }
            return filtered.length === 0 ? _ok() : _fail(filtered);
        }

        return result;
    }

    // =========================================================================
    // 4. LAW VALIDATION
    // =========================================================================

    /**
     * Validate a law creation or update payload.
     * 
     * Options:
     *   - requireName: true for create, false for update
     * 
     * Required (create): name (non-empty string)
     * Optional: type, lawCategory, domain, severity, description, notes,
     *           crimeType, crimeSeverity, isEnforced, punishment, crimeNotes
     */
    function validateLawInput(data, options) {
        options = options || {};
        var requireName = options.requireName === true;
        var errors = [];

        if (!data || typeof data !== 'object') {
            return _fail(['Law data is required']);
        }

        // Name
        if (requireName) {
            if (!_isNonEmptyString(data.name)) {
                errors.push('Law name is required');
            }
        } else if (data.name !== undefined) {
            if (!_isNonEmptyString(data.name)) {
                errors.push('Law name cannot be empty');
            }
        }

        // Enum membership. The law enums currently live on window globals.
        // Phase 3 will decide their canonical home; until then we read them
        // from where they live.
        var lawTypes = window.LAW_TYPES || {};
        var lawCategories = window.LAW_CATEGORIES || {};
        var lawDomains = window.LAW_DOMAINS || {};
        var lawSeverities = window.LAW_SEVERITY || {};
        var crimeTypes = window.CRIME_TYPES || {};

        if (data.type !== undefined && !_isValidEnum(data.type, lawTypes)) {
            errors.push('Invalid law type: ' + data.type);
        }
        if (data.lawCategory !== undefined && !_isValidEnum(data.lawCategory, lawCategories)) {
            errors.push('Invalid law category: ' + data.lawCategory);
        }
        if (data.domain !== undefined && !_isValidEnum(data.domain, lawDomains)) {
            errors.push('Invalid law domain: ' + data.domain);
        }
        if (data.severity !== undefined && !_isValidEnum(data.severity, lawSeverities)) {
            errors.push('Invalid law severity: ' + data.severity);
        }
        if (data.crimeType !== undefined && data.crimeType !== null && data.crimeType !== '') {
            if (!_isValidEnum(data.crimeType, crimeTypes)) {
                errors.push('Invalid crime type: ' + data.crimeType);
            }
        }

        // Booleans
        if (data.isEnforced !== undefined && typeof data.isEnforced !== 'boolean') {
            errors.push('isEnforced must be a boolean');
        }

        // Optional strings
        if (data.description !== undefined && typeof data.description !== 'string') {
            errors.push('Description must be a string');
        }
        if (data.notes !== undefined && typeof data.notes !== 'string') {
            errors.push('Notes must be a string');
        }
        if (data.punishment !== undefined && data.punishment !== null &&
            typeof data.punishment !== 'string') {
            errors.push('Punishment must be a string');
        }

        return errors.length === 0 ? _ok() : _fail(errors);
    }

    // =========================================================================
    // 5. FIELD VALIDATION (for direct use by commands)
    // =========================================================================

    function validateYear(value, options) {
        options = options || {};
        var errors = [];

        if (!_isValidYear(value)) {
            errors.push('Year must be a finite integer');
            return _fail(errors);
        }

        if (options.min !== undefined && value < options.min) {
            errors.push('Year must be at least ' + options.min);
        }
        if (options.max !== undefined && value > options.max) {
            errors.push('Year must be at most ' + options.max);
        }

        return errors.length === 0 ? _ok() : _fail(errors);
    }

    function validateNonEmptyString(value, fieldName) {
        if (!_isNonEmptyString(value)) {
            return _fail([fieldName + ' is required']);
        }
        return _ok();
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.ReligionValidation = {
        // Religion
        validateReligionCreate: validateReligionCreate,
        validateReligionUpdate: validateReligionUpdate,

        // Law
        validateLawInput: validateLawInput,

        // Field-level
        validateYear: validateYear,
        validateNonEmptyString: validateNonEmptyString
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionValidation: window.ReligionValidation };
    }

})();
