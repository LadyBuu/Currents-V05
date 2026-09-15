/**
 * =============================================================================
 * STILL WATERS - NAME RULES (name-rules.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-rules.js
 *
 * SCOPE:
 *   - Rule type constants
 *   - Rule validation (strict)
 *   - Rule presets (deep-frozen)
 *   - Rule application: the canonical dispatcher for surname generation
 *     from declarative rules
 *   - Newborn surname policy
 *
 * OUT OF SCOPE:
 *   - Data retrieval (name lists, ancestor records) → name-queries.js
 *   - Mutations (recording surname changes) → name-commands.js
 *   - Persistence → storage.js
 *   - Presentation → UI
 *
 * SEMANTIC RULES:
 *   - This module is the ONLY owner of rule application. NameQueries
 *     supplies data; NameRules decides what that data means.
 *   - Rule types are RANDOM, FAMILY, PATRONYMIC, CHAIN. There is no
 *     HYPHENATED (hyphenation is a connector option on FAMILY) and no
 *     CUSTOM (user-defined executable rules are a persistence hazard).
 *   - Rule presets are deeply frozen. getRulePreset returns a clone.
 *   - Validation is strict: missing and invalid are distinct. Missing
 *     optional fields receive documented defaults; invalid explicit
 *     values throw.
 *   - No module-wide recursion guards. Composition between rule types is
 *     normal, not recursion.
 *   - No silent fallback implementation. If a required dependency is
 *     missing, we throw at load. If a required query returns null, the
 *     caller sees null, not a fabricated value.
 *   - Random selection goes through randomness.js. No direct Math.random.
 *   - Surname generation returns null when it cannot produce a result.
 *     It never returns a sentinel string ("Unknown", "Unnamed").
 *
 * OWNERSHIP OF RULE APPLICATION:
 *   generateSurnameFromRules() is the canonical dispatcher. It is called
 *   from:
 *     - NameCommands during character creation
 *     - NameQueries.determineNewbornSurname callers
 *     - Legacy wrapper callers
 *   Nothing else should reimplement the family/patronymic/chain logic.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js: getAncestorNames, getAncestorData, getRandomSurname,
 *                      getCountrySurnameRules
 *   - randomness.js:   pickRandom (used for the RANDOM rule type)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        if (typeof window.NameQueries === 'undefined') {
            throw new Error(
                'name-rules.js: name-queries.js must load first.'
            );
        }
        var requiredQueries = [
            'getAncestorNames',
            'getAncestorData',
            'getRandomSurname',
            'getCountrySurnameRules'
        ];
        var missing = [];
        for (var i = 0; i < requiredQueries.length; i++) {
            if (typeof window.NameQueries[requiredQueries[i]] !== 'function') {
                missing.push('NameQueries.' + requiredQueries[i]);
            }
        }
        if (typeof window.pickRandom !== 'function') {
            missing.push('pickRandom');
        }
        if (missing.length > 0) {
            throw new Error(
                'name-rules.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var RULE_TYPES = Object.freeze({
        RANDOM: 'random',
        FAMILY: 'family',
        PATRONYMIC: 'patronymic',
        CHAIN: 'chain'
    });

    var FAMILY_SOURCES = Object.freeze(['father', 'mother', 'both']);
    var FAMILY_ORDERS = Object.freeze(['father_first', 'mother_first']);
    var FAMILY_POSITIONS = Object.freeze(['first', 'last']);
    var PATRONYMIC_SOURCES = Object.freeze(['father', 'mother']);
    var CONNECTOR_TYPES = Object.freeze([
        'space', 'hyphen', 'custom', 'none'
    ]);
    var CHAIN_SOURCES = Object.freeze(['firstname', 'surname']);
    var VALID_ANCESTOR_TYPES = Object.freeze([
        'father',
        'mother',
        'paternal_grandfather',
        'paternal_grandmother',
        'maternal_grandfather',
        'maternal_grandmother'
    ]);

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isPositiveInteger(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && Number.isInteger(v)
            && v > 0;
    }

    function _capitalizeFirstLetter(str) {
        if (!str || typeof str !== 'string') return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function _splitSurname(surname) {
        if (!surname || typeof surname !== 'string') return [];
        return surname.trim().split(/\s+/).filter(function(p) { return p.length > 0; });
    }

    function _getSurnamePart(surname, position) {
        var parts = _splitSurname(surname);
        if (parts.length === 0) return '';
        if (position === 'last') return parts[parts.length - 1];
        return parts[0];
    }

    /**
     * Resolves a connector string for a given connector type.
     * Missing connectorType defaults to 'space'. Invalid explicit values
     * throw during validation; this function only resolves valid ones.
     */
    function _resolveConnector(connectorType, customConnector) {
        if (_isMissing(connectorType)) return ' ';
        switch (connectorType) {
            case 'space': return ' ';
            case 'hyphen': return '-';
            case 'none': return '';
            case 'custom':
                return typeof customConnector === 'string' ? customConnector : '';
            default:
                return ' ';
        }
    }

    /**
     * Deep-freezes an object recursively. Arrays and plain objects are
     * frozen; primitives pass through.
     */
    function _deepFreeze(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Object.isFrozen(obj)) return obj;
        Object.freeze(obj);
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            _deepFreeze(obj[keys[i]]);
        }
        return obj;
    }

    /**
     * Deep-clones a rule object. Used by getRulePreset so callers cannot
     * mutate the frozen preset.
     */
    function _cloneRule(rule) {
        if (rule === null || typeof rule !== 'object') return rule;
        if (Array.isArray(rule)) {
            var arr = [];
            for (var i = 0; i < rule.length; i++) arr.push(_cloneRule(rule[i]));
            return arr;
        }
        var out = {};
        var keys = Object.keys(rule);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            out[k] = _cloneRule(rule[k]);
        }
        return out;
    }

    // =========================================================================
    // 3. VALIDATION
    // =========================================================================

    /**
     * Validates a rule object. Returns:
     *   { valid: true }
     *   { valid: false, reason: '...' }
     *
     * Strict semantics:
     *   - Missing required fields invalid.
     *   - Explicit invalid values invalid.
     *   - Unknown fields tolerated (forward-compatible).
     */
    function validateRules(rules) {
        if (!_isPlainObject(rules)) {
            return { valid: false, reason: 'Rules must be an object' };
        }
        if (!_isNonEmptyString(rules.type)) {
            return { valid: false, reason: 'Rule type is required' };
        }

        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                return { valid: true };

            case RULE_TYPES.FAMILY:
                return _validateFamilyRules(rules.family);

            case RULE_TYPES.PATRONYMIC:
                return _validatePatronymicRules(rules.patronymic);

            case RULE_TYPES.CHAIN:
                return _validateChainRules(rules.chain);

            default:
                return {
                    valid: false,
                    reason: 'Unknown rule type "' + rules.type + '"'
                };
        }
    }

    function _validateFamilyRules(family) {
        if (!_isPlainObject(family)) {
            return { valid: false, reason: 'Family rule requires a "family" object' };
        }
        if (FAMILY_SOURCES.indexOf(family.source) === -1) {
            return {
                valid: false,
                reason: 'family.source must be one of: ' + FAMILY_SOURCES.join(', ')
            };
        }
        if (!_isMissing(family.order) && FAMILY_ORDERS.indexOf(family.order) === -1) {
            return {
                valid: false,
                reason: 'family.order must be one of: ' + FAMILY_ORDERS.join(', ')
            };
        }
        if (!_isMissing(family.count) && !_isPositiveInteger(family.count)) {
            return { valid: false, reason: 'family.count must be a positive integer' };
        }
        if (!_isMissing(family.position) && FAMILY_POSITIONS.indexOf(family.position) === -1) {
            return {
                valid: false,
                reason: 'family.position must be one of: ' + FAMILY_POSITIONS.join(', ')
            };
        }
        if (!_isMissing(family.connector) && CONNECTOR_TYPES.indexOf(family.connector) === -1) {
            return {
                valid: false,
                reason: 'family.connector must be one of: ' + CONNECTOR_TYPES.join(', ')
            };
        }
        if (family.connector === 'custom' && typeof family.customConnector !== 'string') {
            return {
                valid: false,
                reason: 'family.customConnector is required when family.connector is "custom"'
            };
        }
        return { valid: true };
    }

    function _validatePatronymicRules(patronymic) {
        if (!_isPlainObject(patronymic)) {
            return { valid: false, reason: 'Patronymic rule requires a "patronymic" object' };
        }
        if (PATRONYMIC_SOURCES.indexOf(patronymic.source) === -1) {
            return {
                valid: false,
                reason: 'patronymic.source must be one of: ' + PATRONYMIC_SOURCES.join(', ')
            };
        }
        // Optional fields: malePrefix, maleSuffix, femalePrefix, femaleSuffix,
        // usePrefix, useSuffix. Validate types if present.
        var stringFields = ['malePrefix', 'maleSuffix', 'femalePrefix', 'femaleSuffix'];
        for (var i = 0; i < stringFields.length; i++) {
            var f = stringFields[i];
            if (!_isMissing(patronymic[f]) && typeof patronymic[f] !== 'string') {
                return { valid: false, reason: 'patronymic.' + f + ' must be a string' };
            }
        }
        if (!_isMissing(patronymic.usePrefix) && typeof patronymic.usePrefix !== 'boolean') {
            return { valid: false, reason: 'patronymic.usePrefix must be a boolean' };
        }
        if (!_isMissing(patronymic.useSuffix) && typeof patronymic.useSuffix !== 'boolean') {
            return { valid: false, reason: 'patronymic.useSuffix must be a boolean' };
        }
        return { valid: true };
    }

    function _validateChainRules(chain) {
        if (!_isPlainObject(chain)) {
            return { valid: false, reason: 'Chain rule requires a "chain" object' };
        }
        if (!Array.isArray(chain.order) || chain.order.length === 0) {
            return { valid: false, reason: 'chain.order must be a non-empty array' };
        }
        for (var i = 0; i < chain.order.length; i++) {
            if (VALID_ANCESTOR_TYPES.indexOf(chain.order[i]) === -1) {
                return {
                    valid: false,
                    reason: 'chain.order[' + i + '] must be one of: ' + VALID_ANCESTOR_TYPES.join(', ')
                };
            }
        }
        if (!_isPositiveInteger(chain.depth)) {
            return { valid: false, reason: 'chain.depth must be a positive integer' };
        }
        if (!_isMissing(chain.source) && CHAIN_SOURCES.indexOf(chain.source) === -1) {
            return {
                valid: false,
                reason: 'chain.source must be one of: ' + CHAIN_SOURCES.join(', ')
            };
        }
        if (!_isMissing(chain.connector) && CONNECTOR_TYPES.indexOf(chain.connector) === -1) {
            return {
                valid: false,
                reason: 'chain.connector must be one of: ' + CONNECTOR_TYPES.join(', ')
            };
        }
        return { valid: true };
    }

    // =========================================================================
    // 4. RULE APPLICATION
    // =========================================================================

    /**
     * Applies a rule to generate a surname.
     *
     * @param {Object|null} mother
     * @param {Object|null} father
     * @param {string} childGender - 'male' | 'female' | 'unknown' | 'other'
     * @param {Object} rules
     * @returns {string|null} the generated surname, or null when the rule
     *   cannot produce one (missing inputs, empty pools, etc.)
     *
     * @throws {Error} when `rules` fails validation
     */
    function generateSurnameFromRules(mother, father, childGender, rules) {
        var validation = validateRules(rules);
        if (!validation.valid) {
            throw new Error('generateSurnameFromRules: ' + validation.reason);
        }

        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                return _applyRandomRule(mother, father, rules);
            case RULE_TYPES.FAMILY:
                return _applyFamilyRule(mother, father, rules.family);
            case RULE_TYPES.PATRONYMIC:
                return _applyPatronymicRule(mother, father, childGender, rules.patronymic);
            case RULE_TYPES.CHAIN:
                return _applyChainRule(mother, father, rules.chain);
            default:
                // Unreachable: validation rejects unknown types.
                throw new Error(
                    'generateSurnameFromRules: unhandled rule type "' + rules.type + '"'
                );
        }
    }

    function _applyRandomRule(mother, father) {
        // Resolve the country from either parent.
        var countryId = null;
        if (mother && _isNonEmptyString(mother.id)) {
            countryId = window.NameQueries.getCharacterCountryId(mother.id);
        }
        if (!countryId && father && _isNonEmptyString(father.id)) {
            countryId = window.NameQueries.getCharacterCountryId(father.id);
        }
        if (!countryId) return null;

        var surname = window.NameQueries.getRandomSurname(countryId);
        return surname || null;
    }

    function _applyFamilyRule(mother, father, family) {
        var source = family.source;
        var order = _isMissing(family.order) ? 'father_first' : family.order;
        var count = _isMissing(family.count) ? 1 : family.count;
        var position = _isMissing(family.position) ? 'first' : family.position;
        var connector = _resolveConnector(family.connector, family.customConnector);

        var fatherPart = father && _isNonEmptyString(father.surname)
            ? _getSurnamePart(father.surname, position)
            : '';
        var motherPart = mother && _isNonEmptyString(mother.surname)
            ? _getSurnamePart(mother.surname, position)
            : '';

        var parts = [];
        if (source === 'father') {
            if (fatherPart) parts.push(fatherPart);
        } else if (source === 'mother') {
            if (motherPart) parts.push(motherPart);
        } else {
            // both
            if (order === 'father_first') {
                if (fatherPart) parts.push(fatherPart);
                if (motherPart) parts.push(motherPart);
            } else {
                if (motherPart) parts.push(motherPart);
                if (fatherPart) parts.push(fatherPart);
            }
        }

        if (parts.length > count) parts = parts.slice(0, count);
        if (parts.length === 0) return null;

        return _capitalizeFirstLetter(parts.join(connector));
    }

    function _applyPatronymicRule(mother, father, childGender, patronymic) {
        var parent = patronymic.source === 'father' ? father : mother;
        if (!parent) return null;

        var baseName = window.NameQueries.getBaseFirstName(parent);
        if (!baseName) return null;

        var prefix = '';
        var suffix = '';

        if (childGender === 'male') {
            if (patronymic.usePrefix !== false && _isNonEmptyString(patronymic.malePrefix)) {
                prefix = patronymic.malePrefix;
            }
            if (patronymic.useSuffix !== false && _isNonEmptyString(patronymic.maleSuffix)) {
                suffix = patronymic.maleSuffix;
            }
        } else if (childGender === 'female') {
            if (patronymic.usePrefix !== false && _isNonEmptyString(patronymic.femalePrefix)) {
                prefix = patronymic.femalePrefix;
            }
            if (patronymic.useSuffix !== false && _isNonEmptyString(patronymic.femaleSuffix)) {
                suffix = patronymic.femaleSuffix;
            }
        } else {
            // Default to male form for unknown/other genders.
            if (patronymic.usePrefix !== false && _isNonEmptyString(patronymic.malePrefix)) {
                prefix = patronymic.malePrefix;
            }
            if (patronymic.useSuffix !== false && _isNonEmptyString(patronymic.maleSuffix)) {
                suffix = patronymic.maleSuffix;
            }
        }

        var result = prefix + baseName + suffix;
        if (!result) return null;
        return _capitalizeFirstLetter(result);
    }

    function _applyChainRule(mother, father, chain) {
        // Resolve a starting character to walk from.
        // Prefer father; the chain rule does not currently distinguish
        // which parent to begin from, so this is a documented policy.
        var start = father || mother;
        if (!start) return null;

        var source = _isMissing(chain.source) ? 'firstname' : chain.source;
        var names = window.NameQueries.getAncestorNames(
            start,
            chain.order,
            chain.depth,
            source
        );

        if (!Array.isArray(names) || names.length === 0) return null;

        var connector = _resolveConnector(chain.connector, chain.customConnector);
        return _capitalizeFirstLetter(names.join(connector));
    }

    // =========================================================================
    // 5. NEWBORN SURNAME POLICY
    // =========================================================================

    /**
     * Determines the surname for a newborn.
     *
     * Resolution order:
     *   1. Mother's country rules (if any)
     *   2. Father's country rules (if any)
     *   3. Cultural surname pool from the explicit countryId
     *   4. Father's surname
     *   5. Mother's surname
     *
     * This is a POLICY function, not a pure query. It selects a source
     * according to the order above.
     *
     * @param {Object|null} mother
     * @param {Object|null} father
     * @param {string|null} countryId - fallback country
     * @returns {{
     *   surname: string,
     *   surnameSource: 'country_rules'|'country'|'father'|'mother',
     *   surnameRules: Object|null,
     *   countryId: string|null
     * }|null}
     */
    function determineNewbornSurname(mother, father, countryId) {
        // Priority 1 & 2: rules from parent's countries
        var parentRuleResult = _tryParentCountryRules(mother, 'mother');
        if (!parentRuleResult) {
            parentRuleResult = _tryParentCountryRules(father, 'father');
        }
        if (parentRuleResult) return parentRuleResult;

        // Priority 3: cultural surname from the explicit country
        if (_isNonEmptyString(countryId)) {
            var randomSurname = window.NameQueries.getRandomSurname(countryId);
            if (randomSurname) {
                return {
                    surname: randomSurname,
                    surnameSource: 'country',
                    surnameRules: null,
                    countryId: countryId
                };
            }
        }

        // Priority 4: father's surname
        if (father && _isNonEmptyString(father.surname)) {
            return {
                surname: father.surname,
                surnameSource: 'father',
                surnameRules: null,
                countryId: _isNonEmptyString(countryId) ? countryId : null
            };
        }

        // Priority 5: mother's surname
        if (mother && _isNonEmptyString(mother.surname)) {
            return {
                surname: mother.surname,
                surnameSource: 'mother',
                surnameRules: null,
                countryId: _isNonEmptyString(countryId) ? countryId : null
            };
        }

        return null;
    }

    function _tryParentCountryRules(parent, parentRole) {
        if (!parent || !_isNonEmptyString(parent.id)) return null;

        var parentCountryId = window.NameQueries.getCharacterCountryId(parent.id);
        if (!parentCountryId) return null;

        var rules = window.NameQueries.getCountrySurnameRules(parentCountryId);
        if (!rules || !rules.type) return null;

        var otherParent = parentRole === 'mother' ? null : null;
        // Apply the rules with the parent pair swapped appropriately.
        // mother parameter is always the female parent, father always the male.
        var mother = parentRole === 'mother' ? parent : null;
        var father = parentRole === 'father' ? parent : null;

        // If we only have one parent, both slots receive that parent so
        // single-parent rules can still resolve.
        if (!mother) mother = father;
        if (!father) father = mother;

        var generated;
        try {
            generated = generateSurnameFromRules(mother, father, 'unknown', rules);
        } catch (e) {
            // Rule validation failure on a persisted rule is not
            // recoverable here; treat as no rule.
            generated = null;
        }

        if (!generated) return null;

        return {
            surname: generated,
            surnameSource: 'country_rules',
            surnameRules: rules,
            countryId: parentCountryId
        };
    }

    // =========================================================================
    // 6. RULE PRESETS
    // =========================================================================
    //
    // Presets are deeply frozen. getRulePreset returns a clone so callers
    // can safely mutate the returned object.

    var RULE_PRESETS = _deepFreeze({
        // Patrilineal: father's surname passed to children.
        patrilineal: {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'father',
                order: 'father_first',
                count: 1,
                position: 'first'
            }
        },

        // Dual family: father's + mother's surname.
        dual_family: {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'both',
                order: 'father_first',
                count: 2,
                position: 'first',
                connector: 'space'
            }
        },

        // Hyphenated: father's + mother's surname with hyphen.
        hyphenated: {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'both',
                order: 'father_first',
                count: 2,
                position: 'first',
                connector: 'hyphen'
            }
        },

        // Patronymic son/dottir.
        patronymic_son_dottir: {
            type: RULE_TYPES.PATRONYMIC,
            patronymic: {
                source: 'father',
                malePrefix: '',
                maleSuffix: 'son',
                femalePrefix: '',
                femaleSuffix: 'dottir',
                usePrefix: false,
                useSuffix: true
            }
        },

        // Patronymic -ovich/-ovna.
        patronymic_ovich_ovna: {
            type: RULE_TYPES.PATRONYMIC,
            patronymic: {
                source: 'father',
                malePrefix: '',
                maleSuffix: 'ovich',
                femalePrefix: '',
                femaleSuffix: 'ovna',
                usePrefix: false,
                useSuffix: true
            }
        },

        // Chain: father → paternal grandfather.
        chain_two_generation: {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather'],
                depth: 2,
                source: 'firstname',
                connector: 'space'
            }
        },

        // Chain: father → paternal grandfather → paternal great-grandfather.
        chain_three_generation: {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather'],
                depth: 3,
                source: 'firstname',
                connector: 'space'
            }
        }
    });

    /**
     * Returns a clone of a preset, or null if the preset name is unknown.
     * The clone is safe to mutate; the original preset is frozen.
     */
    function getRulePreset(presetName) {
        if (!_isNonEmptyString(presetName)) return null;
        var preset = RULE_PRESETS[presetName];
        if (!preset) return null;
        return _cloneRule(preset);
    }

    /**
     * Returns the names of all available presets.
     */
    function getRulePresetNames() {
        return Object.keys(RULE_PRESETS);
    }

    // =========================================================================
    // 7. RULE DESCRIPTION
    // =========================================================================

    /**
     * Returns a human-readable description of a rule.
     *
     * Throws when the rule is invalid. Does not silently repair malformed
     * rules.
     *
     * @param {Object} rules
     * @returns {string}
     */
    function describeRule(rules) {
        var validation = validateRules(rules);
        if (!validation.valid) {
            throw new Error('describeRule: ' + validation.reason);
        }

        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                return 'Random surname from the cultural pool';

            case RULE_TYPES.FAMILY:
                return _describeFamilyRule(rules.family);

            case RULE_TYPES.PATRONYMIC:
                return _describePatronymicRule(rules.patronymic);

            case RULE_TYPES.CHAIN:
                return _describeChainRule(rules.chain);

            default:
                throw new Error('describeRule: unhandled rule type');
        }
    }

    function _describeFamilyRule(family) {
        var source = family.source;
        var order = _isMissing(family.order) ? 'father_first' : family.order;
        var count = _isMissing(family.count) ? 1 : family.count;
        var position = _isMissing(family.position) ? 'first' : family.position;
        var connector = _isMissing(family.connector) ? 'space' : family.connector;

        var parts = [];
        parts.push('Family surname from ' + source);
        parts.push(order === 'father_first' ? 'father first' : 'mother first');
        parts.push(count + ' part' + (count === 1 ? '' : 's'));
        parts.push('from ' + position);
        if (connector !== 'space') parts.push('joined with ' + connector);
        return parts.join(', ');
    }

    function _describePatronymicRule(patronymic) {
        var source = patronymic.source;
        // The rule's semantic identity (patronymic vs matronymic) is
        // determined by its source, not by which prefix happens to be set.
        var type = source === 'mother' ? 'matronymic' : 'patronymic';
        var parts = [type + ' from ' + source];
        if (_isNonEmptyString(patronymic.maleSuffix)) {
            parts.push('male suffix "' + patronymic.maleSuffix + '"');
        }
        if (_isNonEmptyString(patronymic.femaleSuffix)) {
            parts.push('female suffix "' + patronymic.femaleSuffix + '"');
        }
        if (_isNonEmptyString(patronymic.malePrefix)) {
            parts.push('male prefix "' + patronymic.malePrefix + '"');
        }
        if (_isNonEmptyString(patronymic.femalePrefix)) {
            parts.push('female prefix "' + patronymic.femalePrefix + '"');
        }
        return parts.join(', ');
    }

    function _describeChainRule(chain) {
        var depth = chain.depth;
        var source = _isMissing(chain.source) ? 'firstname' : chain.source;
        var order = chain.order.join(' > ');
        return 'Chain of ' + depth + ' generation(s) of ' + source + ' (' + order + ')';
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.NameRules = {
        // Constants
        RULE_TYPES: RULE_TYPES,

        // Validation
        validateRules: validateRules,

        // Application
        generateSurnameFromRules: generateSurnameFromRules,
        determineNewbornSurname: determineNewbornSurname,

        // Presets
        getRulePreset: getRulePreset,
        getRulePresetNames: getRulePresetNames,

        // Description
        describeRule: describeRule
    };

})();