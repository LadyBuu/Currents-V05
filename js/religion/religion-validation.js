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
 * LAW ENUM SOURCE
 * ---------------
 *   The prior revision of validateLawInput read flat window globals
 *   (window.LAW_TYPES, window.LAW_CATEGORIES, window.LAW_DOMAINS,
 *   window.LAW_SEVERITY, window.CRIME_TYPES). None of those exist in
 *   the current tree; the enums live on namespaced modules:
 *
 *     window.SettlementLawDefinitions.LAW_TYPES
 *     window.SettlementLawDefinitions.LAW_CATEGORIES
 *     window.SettlementLawDefinitions.LAW_DOMAINS
 *     window.SettlementLawDefinitions.LAW_SEVERITIES
 *     window.CrimeConstants.CRIME_TYPES
 *
 *   Because the flat globals were missing, _isValidEnum received {} as
 *   the enum, Object.values({}) returned [], and indexOf(value) returned
 *   -1 for EVERY value. Every religion law failed validation. That is
 *   the same bug class settlement-review #8 flagged (RELATIONSHIP_STATUS
 *   hardcoded fallback used even when canonical was present). The current
 *   revision resolves the canonical source and only treats a value as
 *   invalid when the enum is populated but the value is not in it.
 *
 *   When the canonical source is not loaded at all, validation FAILS
 *   LOUDLY (returns an error naming the missing enum) rather than
 *   silently rejecting every value. This matches religion-commands.js's
 *   _readLawEnums() contract: the enum is either populated (validate
 *   against it) or null (report "not available" as an error).
 *
 * DEPENDENCIES:
 *   - religion-constants.js: ReligionConstants
 *
 * DEPENDENCIES (checked at call time, for law validation only):
 *   - settlement-law-definitions.js: SettlementLawDefinitions
 *   - crime-constants.js:            CrimeConstants
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - validateLawInput accepts an options.enums argument. religion-
 *       commands.js::addLaw and ::updateLaw pass the resolved enum map
 *       (from _readLawEnums()) so validation does not have to re-resolve
 *       the globals. Callers that do not pass options.enums get the
 *       canonical resolution applied here (same namespaced source).
 *     - _readLawEnums() added. Reads canonical namespaced source
 *       (SettlementLawDefinitions.*, CrimeConstants.CRIME_TYPES). Returns
 *       null per missing enum, not {}.
 *     - _isValidEnumAgainst(enumObj, value) added. Semantics: if the
 *       enum is null (source unavailable), the check is skipped (caller
 *       reports the missing source separately); if the enum is populated
 *       but value not present, the value is rejected. Prior revisions
 *       treated a null enum as "everything invalid," which is
 *       indistinguishable from a missing source.
 *     - validateLawInput now reports "enum not loaded: X" errors when the
 *       canonical source is missing, so the failure is actionable rather
 *       than "Invalid law domain: behavior" (a message that lied about
 *       which input was wrong).
 *     - _isValidYear renamed to isValidYear (not exported before; still
 *       internal — validateYear remains the public surface).
 *     - No behavioral change to validateReligionCreate /
 *       validateReligionUpdate / validateYear / validateNonEmptyString.
 *   Previous revisions:
 *     - Phase 5: extracted from religion-commands.js and religion-laws.js.
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

    /**
     * True if value is in enumObject.values(), OR the enum is missing.
     *
     * Missing enum (null / undefined / not object) means the source is
     * not loaded. That is NOT the caller's fault and NOT a value the
     * caller could have avoided. The check is skipped; the caller
     * reports the missing source separately.
     *
     * Populated enum means the value must be in it. Absence from the
     * populated enum rejects the value.
     *
     * @private
     */
    function _isValidEnumAgainst(enumObj, value) {
        if (value === undefined || value === null) return true;
        if (!enumObj || typeof enumObj !== 'object') return true;
        var values = Object.values(enumObj);
        return values.indexOf(value) !== -1;
    }

    function _enumIsAvailable(enumObj) {
        if (!enumObj || typeof enumObj !== 'object') return false;
        for (var k in enumObj) {
            if (!Object.prototype.hasOwnProperty.call(enumObj, k)) continue;
            if (typeof enumObj[k] === 'string' && enumObj[k].length > 0) {
                return true;
            }
        }
        return false;
    }

    function _isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function _isValidYear(value) {
        return typeof value === 'number'
            && !Number.isNaN(value)
            && Number.isFinite(value)
            && Math.floor(value) === value;
    }

    // =========================================================================
    // 3. LAW ENUM RESOLUTION
    // =========================================================================
    //
    // Resolves law vocabulary from canonical namespaced modules. Each
    // enum is returned as the module's object, or null if the module
    // (or its field) is not loaded.
    //
    // Prior revisions read flat window.LAW_* globals. Those globals do
    // not exist in the current tree; the code was validating against {}
    // and rejecting every value.

    function _readLawEnums() {
        var out = {
            types: null,
            categories: null,
            domains: null,
            severities: null,
            crimeTypes: null
        };

        if (typeof window.SettlementLawDefinitions !== 'undefined'
            && window.SettlementLawDefinitions) {
            var sld = window.SettlementLawDefinitions;
            if (sld.LAW_TYPES && typeof sld.LAW_TYPES === 'object') {
                out.types = sld.LAW_TYPES;
            }
            if (sld.LAW_CATEGORIES && typeof sld.LAW_CATEGORIES === 'object') {
                out.categories = sld.LAW_CATEGORIES;
            }
            if (sld.LAW_DOMAINS && typeof sld.LAW_DOMAINS === 'object') {
                out.domains = sld.LAW_DOMAINS;
            }
            if (sld.LAW_SEVERITIES && typeof sld.LAW_SEVERITIES === 'object') {
                out.severities = sld.LAW_SEVERITIES;
            }
        }

        if (typeof window.CrimeConstants !== 'undefined'
            && window.CrimeConstants
            && window.CrimeConstants.CRIME_TYPES
            && typeof window.CrimeConstants.CRIME_TYPES === 'object') {
            out.crimeTypes = window.CrimeConstants.CRIME_TYPES;
        }

        return out;
    }

    /**
     * Merge caller-provided enums (from religion-commands.js::_readLawEnums)
     * over the locally-resolved ones. Caller-provided wins, so commands
     * that already resolved the source do not double-resolve.
     */
    function _resolveEnums(options) {
        var local = _readLawEnums();
        if (!options || !options.enums || typeof options.enums !== 'object') {
            return local;
        }
        var merged = {
            types:      options.enums.types      !== undefined ? options.enums.types      : local.types,
            categories: options.enums.categories !== undefined ? options.enums.categories : local.categories,
            domains:    options.enums.domains    !== undefined ? options.enums.domains    : local.domains,
            severities: options.enums.severities !== undefined ? options.enums.severities : local.severities,
            crimeTypes: options.enums.crimeTypes !== undefined ? options.enums.crimeTypes : local.crimeTypes
        };
        return merged;
    }

    // =========================================================================
    // 4. RELIGION VALIDATION
    // =========================================================================

    function validateReligionCreate(data) {
        var errors = [];
        var constants = _constants();

        if (!data || typeof data !== 'object') {
            return _fail(['Religion data is required']);
        }

        if (!_isNonEmptyString(data.name)) {
            errors.push('Religion name is required');
        } else if (data.name.length > 100) {
            errors.push('Religion name cannot exceed 100 characters');
        }

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

        if (data.isOrganized !== undefined && typeof data.isOrganized !== 'boolean') {
            errors.push('isOrganized must be a boolean');
        }
        if (data.allowsConversion !== undefined && typeof data.allowsConversion !== 'boolean') {
            errors.push('allowsConversion must be a boolean');
        }
        if (data.proselytizes !== undefined && typeof data.proselytizes !== 'boolean') {
            errors.push('proselytizes must be a boolean');
        }

        if (data.trait !== undefined && !_isValidEnumAgainst(constants.RELIGIOUS_TRAITS, data.trait)) {
            errors.push('Invalid religious trait: ' + data.trait);
        }

        if (data.inheritanceRule !== undefined) {
            if (typeof data.inheritanceRule !== 'object' || data.inheritanceRule === null) {
                errors.push('Inheritance rule must be an object');
            } else {
                if (data.inheritanceRule.type !== undefined &&
                    !_isValidEnumAgainst(constants.INHERITANCE_RULES, data.inheritanceRule.type)) {
                    errors.push('Invalid inheritance rule type: ' + data.inheritanceRule.type);
                }
                if (data.inheritanceRule.priority !== undefined &&
                    data.inheritanceRule.priority !== null) {
                    if (data.inheritanceRule.priority !== constants.INHERITANCE_RULES.MOTHER &&
                        data.inheritanceRule.priority !== constants.INHERITANCE_RULES.FATHER) {
                        errors.push('Inheritance priority must be mother or father');
                    }
                }
            }
        }

        return errors.length === 0 ? _ok() : _fail(errors);
    }

    function validateReligionUpdate(data) {
        if (!data || typeof data !== 'object') {
            return _fail(['Update payload is required']);
        }

        var result = validateReligionCreate(data);

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
    // 5. LAW VALIDATION
    // =========================================================================
    //
    // Enum resolution: uses options.enums when provided (from
    // religion-commands.js), otherwise resolves locally via the canonical
    // namespaced source.
    //
    // Semantic difference from prior revisions: an enum that is null
    // (source not loaded) is reported as "enum not loaded" and does NOT
    // reject the value. Only a populated enum rejects a value absent
    // from it.

    function validateLawInput(data, options) {
        options = options || {};
        var requireName = options.requireName === true;
        var errors = [];

        if (!data || typeof data !== 'object') {
            return _fail(['Law data is required']);
        }

        if (requireName) {
            if (!_isNonEmptyString(data.name)) {
                errors.push('Law name is required');
            }
        } else if (data.name !== undefined) {
            if (!_isNonEmptyString(data.name)) {
                errors.push('Law name cannot be empty');
            }
        }

        var enums = _resolveEnums(options);

        // --- type ---
        if (data.type !== undefined && data.type !== null) {
            if (!_enumIsAvailable(enums.types)) {
                errors.push('Law type enum not loaded: SettlementLawDefinitions.LAW_TYPES');
            } else if (!_isValidEnumAgainst(enums.types, data.type)) {
                errors.push('Invalid law type: ' + data.type);
            }
        }

        // --- category ---
        if (data.lawCategory !== undefined && data.lawCategory !== null) {
            if (!_enumIsAvailable(enums.categories)) {
                errors.push('Law category enum not loaded: SettlementLawDefinitions.LAW_CATEGORIES');
            } else if (!_isValidEnumAgainst(enums.categories, data.lawCategory)) {
                errors.push('Invalid law category: ' + data.lawCategory);
            }
        }

        // --- domain ---
        if (data.domain !== undefined && data.domain !== null) {
            if (!_enumIsAvailable(enums.domains)) {
                errors.push('Law domain enum not loaded: SettlementLawDefinitions.LAW_DOMAINS');
            } else if (!_isValidEnumAgainst(enums.domains, data.domain)) {
                errors.push('Invalid law domain: ' + data.domain);
            }
        }

        // --- severity ---
        if (data.severity !== undefined && data.severity !== null) {
            if (!_enumIsAvailable(enums.severities)) {
                errors.push('Law severity enum not loaded: SettlementLawDefinitions.LAW_SEVERITIES');
            } else if (!_isValidEnumAgainst(enums.severities, data.severity)) {
                errors.push('Invalid law severity: ' + data.severity);
            }
        }

        // --- crimeType ---
        // crimeType is optional: null / '' means "no crime mapping".
        // Only validate when the caller supplies a real value.
        if (data.crimeType !== undefined && data.crimeType !== null && data.crimeType !== '') {
            if (!_enumIsAvailable(enums.crimeTypes)) {
                errors.push('Crime type enum not loaded: CrimeConstants.CRIME_TYPES');
            } else if (!_isValidEnumAgainst(enums.crimeTypes, data.crimeType)) {
                errors.push('Invalid crime type: ' + data.crimeType);
            }
        }

        // --- isEnforced ---
        if (data.isEnforced !== undefined && typeof data.isEnforced !== 'boolean') {
            errors.push('isEnforced must be a boolean');
        }

        // --- optional strings ---
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
    // 6. FIELD VALIDATION
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
    // 7. EXPORTS
    // =========================================================================

    window.ReligionValidation = {
        // Religion
        validateReligionCreate: validateReligionCreate,
        validateReligionUpdate: validateReligionUpdate,

        // Law
        validateLawInput: validateLawInput,

        // Field-level
        validateYear: validateYear,
        validateNonEmptyString: validateNonEmptyString,

        // Enum introspection (for callers that need to know which enums
        // are currently resolvable, e.g. a modal building dropdowns)
        getLawEnums: _readLawEnums
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionValidation: window.ReligionValidation };
    }

})();
