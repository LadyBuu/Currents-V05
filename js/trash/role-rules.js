/**
 * =============================================================================
 * STILL WATERS - ROLE RULES (role-rules.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/role-rules.js
 *
 * Pure policy for the role domain.
 *
 * SCOPE:
 *   - Specialization membership validation (a role's own catalogue)
 *   - Specialization add/remove eligibility
 *   - Role field validators (name, category, gender, salary, literacy)
 *
 * OUT OF SCOPE:
 *   - Role CRUD            -> role-commands.js
 *   - Role reads           -> role-queries.js
 *   - Skill taxonomy       -> skill-utils.js
 *   - Category vocabulary  -> role-constants.js
 *   - Presentation         -> role-ui-list.js, formatting.js
 *
 * SEMANTIC RULES:
 *   - Every validator returns { valid, code?, reason? }.
 *   - Missing/invalid input is rejected; nothing is fabricated.
 *   - Strings are trimmed only when the validator returns them (via
 *     trimString below); the caller is responsible for using the
 *     trimmed value.
 *   - Zero is preserved: a salary of 0 is legitimate, and a category
 *     with no roles is legitimate. `||` is never used to produce a
 *     default.
 *
 * WHY THIS MODULE EXISTS:
 *
 *   ApprenticeshipCommands.teachSpecialization needs to know whether a
 *   given specialization is registered on the role catalogue. That is a
 *   role-domain question, not an apprenticeship-domain question: the
 *   role owns its own specializations. Placing the check here keeps the
 *   authority where the data lives and lets the apprenticeship domain
 *   stay agnostic about how specializations are stored.
 *
 *   The validators that role-commands.js uses internally (name, salary,
 *   literacy level, etc.) live here too, so that role-commands can
 *   delegate rather than duplicate. This keeps a single source of truth
 *   for role-field policy. role-commands.js is the only caller.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - role-constants.js (RoleConstants)
 *
 * DEPENDENCIES (OPTIONAL): None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    if (typeof window.RoleConstants === 'undefined') {
        throw new Error(
            'role-rules.js requires role-constants.js first.'
        );
    }

    var RC = window.RoleConstants;

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var r = { valid: true };
        if (data && typeof data === 'object') {
            for (var k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) {
                    r[k] = data[k];
                }
            }
        }
        return r;
    }

    function _fail(code, reason) {
        return { valid: false, code: code, reason: reason };
    }

    // =========================================================================
    // 2. PRIMITIVE VALIDATORS
    // =========================================================================
    //
    // Small, reusable predicates. Each returns { valid, code?, reason? }.
    // None of them throws. None of them reads state.

    function _validNonEmptyString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _validSalary(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < RC.MIN_SALARY) return false;
        if (v > RC.MAX_SALARY) return false;
        return true;
    }

    function _validLiteracyLevel(v) {
        return RC.REQUIRABLE_LITERACY_LEVELS.indexOf(v) !== -1;
    }

    function _validGenderRestriction(v) {
        return v === 'both' || v === 'male' || v === 'female';
    }

    function _validCategory(v) {
        if (v === RC.UNCATEGORIZED_ID) return true;
        return Object.prototype.hasOwnProperty.call(RC.DEFAULT_ROLE_CATEGORIES, v);
    }

    function _validSkillLevel(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < 0 || v > 100) return false;
        return true;
    }

    // =========================================================================
    // 3. FIELD VALIDATORS (used by role-commands.js)
    // =========================================================================

    function validateRoleName(name) {
        if (!_validNonEmptyString(name)) {
            return _fail('INVALID_NAME', 'Role name must be a non-empty string.');
        }
        return _ok({ value: name.trim() });
    }

    function validateCategory(categoryId) {
        if (!_validCategory(categoryId)) {
            return _fail(
                'INVALID_CATEGORY',
                'Unknown category: ' + String(categoryId)
            );
        }
        return _ok({ value: categoryId });
    }

    function validateGenderRestriction(value) {
        if (!_validGenderRestriction(value)) {
            return _fail(
                'INVALID_GENDER',
                'Gender restriction must be "both", "male", or "female".'
            );
        }
        return _ok({ value: value });
    }

    function validateBaseSalary(value) {
        if (!_validSalary(value)) {
            return _fail(
                'INVALID_SALARY',
                'Base salary must be a number between ' +
                RC.MIN_SALARY + ' and ' + RC.MAX_SALARY + '.'
            );
        }
        return _ok({ value: value });
    }

    function validateSkillLevel(value) {
        if (!_validSkillLevel(value)) {
            return _fail(
                'INVALID_SKILL',
                'Skill level must be a number between 0 and 100.'
            );
        }
        return _ok({ value: value });
    }

    /**
     * facts: { requiresLiteracy, literacyLevel }
     * Returns { valid, code?, reason?, value: { requiresLiteracy, literacyLevel } }
     * where value is the canonical pair (literacyLevel is null when
     * requiresLiteracy is false).
     */
    function validateLiteracyRequirement(facts) {
        if (!facts || typeof facts !== 'object') {
            return _fail('MISSING_FACTS', 'Literacy facts are required.');
        }

        var requires = facts.requiresLiteracy === true;
        var level = facts.literacyLevel;

        if (!requires) {
            return _ok({ value: { requiresLiteracy: false, literacyLevel: null } });
        }

        if (!_validLiteracyLevel(level)) {
            return _fail(
                'INVALID_LITERACY_LEVEL',
                'A valid literacy level is required when literacy is required.'
            );
        }

        return _ok({ value: { requiresLiteracy: true, literacyLevel: level } });
    }

    // =========================================================================
    // 4. SPECIALIZATION VALIDATION
    // =========================================================================
    //
    // A specialization is only valid if the role's own catalogue declares it.
    // This is the check ApprenticeshipCommands.teachSpecialization uses to
    // reject the request before touching the profession record.

    /**
     * Validates that `specialization` is a member of `role.specializations`.
     *
     * @param {Object} role - role record with a specializations array.
     * @param {string} specialization
     * @returns {{ valid: boolean, code?: string, reason?: string }}
     */
    function validateSpecialization(role, specialization) {
        if (!role || typeof role !== 'object') {
            return _fail('MISSING_ROLE', 'Role is required.');
        }
        if (typeof specialization !== 'string' || specialization.trim() === '') {
            return _fail(
                'MISSING_SPECIALIZATION',
                'Specialization must be a non-empty string.'
            );
        }
        if (!Array.isArray(role.specializations)) {
            return _fail(
                'ROLE_HAS_NO_SPECIALIZATIONS',
                'Role "' + (role.name || role.id) + '" has no specialization catalogue.'
            );
        }

        var target = specialization.trim();
        var found = false;
        for (var i = 0; i < role.specializations.length; i++) {
            var s = role.specializations[i];
            if (typeof s !== 'string') continue;
            if (s === target) { found = true; break; }
        }

        if (!found) {
            return _fail(
                'UNKNOWN_SPECIALIZATION',
                'Specialization "' + target + '" is not registered on role "' +
                (role.name || role.id) + '".'
            );
        }

        return _ok({ value: target });
    }

    /**
     * Validates that a specialization can be added to a role's catalogue.
     * Rejects additions that already exist (case-insensitive uniqueness).
     *
     * @param {Object} role
     * @param {string} specialization
     * @returns {{ valid: boolean, code?: string, reason?: string, value?: string }}
     */
    function validateSpecializationAdd(role, specialization) {
        if (!role || typeof role !== 'object') {
            return _fail('MISSING_ROLE', 'Role is required.');
        }
        if (typeof specialization !== 'string' || specialization.trim() === '') {
            return _fail(
                'MISSING_SPECIALIZATION',
                'Specialization must be a non-empty string.'
            );
        }

        var target = specialization.trim();
        var current = Array.isArray(role.specializations) ? role.specializations : [];
        var lowerTarget = target.toLowerCase();

        for (var i = 0; i < current.length; i++) {
            if (typeof current[i] !== 'string') continue;
            if (current[i].toLowerCase() === lowerTarget) {
                return _fail(
                    'DUPLICATE_SPECIALIZATION',
                    'Specialization "' + target + '" already exists on this role.'
                );
            }
        }

        return _ok({ value: target });
    }

    /**
     * Validates that a specialization can be removed from a role's
     * catalogue. Requires the specialization to be present.
     *
     * @param {Object} role
     * @param {string} specialization
     * @returns {{ valid: boolean, code?: string, reason?: string, value?: string }}
     */
    function validateSpecializationRemove(role, specialization) {
        if (!role || typeof role !== 'object') {
            return _fail('MISSING_ROLE', 'Role is required.');
        }
        if (typeof specialization !== 'string' || specialization.trim() === '') {
            return _fail(
                'MISSING_SPECIALIZATION',
                'Specialization must be a non-empty string.'
            );
        }

        var target = specialization.trim();
        var current = Array.isArray(role.specializations) ? role.specializations : [];

        for (var i = 0; i < current.length; i++) {
            if (typeof current[i] !== 'string') continue;
            if (current[i] === target) {
                return _ok({ value: target });
            }
        }

        return _fail(
            'SPECIALIZATION_NOT_PRESENT',
            'Specialization "' + target + '" is not present on this role.'
        );
    }

    // =========================================================================
    // 5. ROLE-SPECIFIC COMPOSITE VALIDATORS
    // =========================================================================
    //
    // Composite validators that role-commands.js can use as a single
    // pre-flight gate before writing.

    /**
     * Validates a complete new-role payload. Does not check uniqueness
     * against existing roles (that is a query concern, see
     * RoleQueries.findRoleByName). Does not mutate.
     *
     * facts: {
     *   name, category, genderRestriction, baseSalary,
     *   requiresLiteracy, literacyLevel, specializations
     * }
     *
     * @returns {{ valid: boolean, code?: string, reason?: string, value?: Object }}
     */
    function validateNewRole(facts) {
        if (!facts || typeof facts !== 'object') {
            return _fail('MISSING_FACTS', 'Role facts are required.');
        }

        var nameCheck = validateRoleName(facts.name);
        if (!nameCheck.valid) return nameCheck;

        var categoryCheck = validateCategory(facts.category);
        if (!categoryCheck.valid) return categoryCheck;

        var genderCheck = validateGenderRestriction(facts.genderRestriction || 'both');
        if (!genderCheck.valid) return genderCheck;

        var salaryCheck = validateBaseSalary(facts.baseSalary);
        if (!salaryCheck.valid) return salaryCheck;

        var literacyCheck = validateLiteracyRequirement({
            requiresLiteracy: facts.requiresLiteracy,
            literacyLevel: facts.literacyLevel
        });
        if (!literacyCheck.valid) return literacyCheck;

        var specs = Array.isArray(facts.specializations)
            ? facts.specializations
            : [];
        var cleanedSpecs = [];
        for (var i = 0; i < specs.length; i++) {
            var s = specs[i];
            if (!_validNonEmptyString(s)) continue;
            var trimmed = s.trim();
            if (cleanedSpecs.indexOf(trimmed) === -1) cleanedSpecs.push(trimmed);
        }

        return _ok({
            value: {
                name: nameCheck.value,
                category: categoryCheck.value,
                genderRestriction: genderCheck.value,
                baseSalary: salaryCheck.value,
                requiresLiteracy: literacyCheck.value.requiresLiteracy,
                literacyLevel: literacyCheck.value.literacyLevel,
                specializations: cleanedSpecs
            }
        });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.RoleRules = {
        // Field validators
        validateRoleName: validateRoleName,
        validateCategory: validateCategory,
        validateGenderRestriction: validateGenderRestriction,
        validateBaseSalary: validateBaseSalary,
        validateSkillLevel: validateSkillLevel,
        validateLiteracyRequirement: validateLiteracyRequirement,

        // Specialization validation
        validateSpecialization: validateSpecialization,
        validateSpecializationAdd: validateSpecializationAdd,
        validateSpecializationRemove: validateSpecializationRemove,

        // Composite
        validateNewRole: validateNewRole
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleRules;
    }

})();
