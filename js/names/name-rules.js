/**
 * =============================================================================
 * STILL WATERS - NAME RULES (name-rules.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-rules.js
 *
 * SCOPE:
 *   - Rule type vocabulary
 *   - Rule validation (strict)
 *   - Rule presets (deep-frozen; getRulePreset returns a clone)
 *   - Rule application: the canonical dispatcher for surname generation
 *     from declarative rules
 *   - Newborn surname policy
 *   - Marriage surname calculation policy
 *   - Base first-name extraction (canonical owner; see migration note)
 *
 * OUT OF SCOPE:
 *   - Data retrieval (name lists, ancestor records) → name-queries.js
 *   - Mutations (recording surname changes) → name-commands.js
 *   - Persistence → storage.js
 *   - Presentation → UI
 *   - Randomness implementation → randomness.js
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
 *     values are rejected.
 *   - No module-wide recursion guards. Composition between rule types
 *     is normal, not recursion.
 *   - No silent fallback implementation. Required dependencies throw at
 *     load. A rule that cannot produce a result returns null; it does
 *     not return a sentinel string.
 *   - Random selection goes through NameQueries, which owns the
 *     randomness contract. This module does not call pickRandom.
 *   - Surname generation NEVER invents capitalization. Source data is
 *     preserved as given. The only casing transformation is the one
 *     required by patronymic morphology (john + son → Johnson), and it
 *     is a dedicated function, not a generic capitalize() pass.
 *
 * CHAIN MODEL:
 *   A CHAIN rule's `order` is the COMPLETE, ORDERED list of absolute
 *   ancestor slots to resolve. `order.length` is the depth. There is no
 *   separate `depth` field. The slots are the same six (plus two
 *   great-grandparent slots) used by NameQueries.getAncestorData:
 *
 *     father, mother,
 *     paternal_grandfather, paternal_grandmother,
 *     maternal_grandfather, maternal_grandmother,
 *     paternal_great_grandfather, maternal_great_grandfather
 *
 *   A slot that cannot be resolved is skipped. A chain that resolves to
 *   zero names returns null.
 *
 *   NOTE: the great-grandparent slots are declared here but are not yet
 *   resolvable by name-queries.js. `chain_three_generation` therefore
 *   degrades to two generations until that follow-up lands. The preset
 *   is honest about what it contains; the query layer catches up.
 *
 * NEWBORN POLICY:
 *   determineNewbornSurname walks this cascade:
 *     1. Mother's country rules (if resolvable and valid)
 *     2. Father's country rules (if resolvable and valid)
 *     3. Random surname from the explicit `countryId` pool
 *     4. Father's surname
 *     5. Mother's surname
 *     6. null (no surname)
 *
 *   A rule that is PRESENT but INVALID throws. A rule that is present
 *   and valid but cannot produce a result falls through to the next
 *   step. "Not configured" and "configured badly" are different states.
 *
 *   The cascade is a named policy. It lives in one place. Changing it
 *   changes the culture of every newborn in the world; it should not be
 *   an accidental edit.
 *
 * PATRONYMIC GENDER:
 *   A gendered patronymic rule requires a resolvable child gender. If
 *   the child's gender is 'unknown' or 'other', _applyPatronymicRule
 *   returns null. The caller decides whether to fall back. Silent
 *   male-form default is not applied; that is a policy decision that
 *   belongs to whoever configures the rule.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js: NameQueries
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. Randomness is owned by NameQueries.
 *
 * MIGRATION NOTES:
 *   - getBaseFirstName (canonical owner) now lives here. name-queries.js
 *     still has a private copy for getAncestorData's resolved firstName;
 *     that duplication is temporary and will be removed when Queries
 *     depends on Rules for the transformation.
 *   - calculateMarriageSurnames (canonical owner) now lives here.
 *     name-commands.js still has its own copy under a migration note and
 *     needs a follow-up patch to delegate.
 *   - The great-grandparent ancestor slots are declared here but not yet
 *     resolvable in name-queries.js. chain_three_generation degrades
 *     gracefully until the follow-up lands.
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
            'getRandomSurname',
            'getCountrySurnameRules',
            'getCharacterCountryId'
        ];
        var missing = [];
        for (var i = 0; i < requiredQueries.length; i++) {
            if (typeof window.NameQueries[requiredQueries[i]] !== 'function') {
                missing.push('NameQueries.' + requiredQueries[i]);
            }
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
        'maternal_grandmother',
        'paternal_great_grandfather',
        'maternal_great_grandfather'
    ]);

    var MARRIAGE_RULES = Object.freeze([
        'wife_takes_husband',
        'husband_takes_wife',
        'hyphenate',
        'keep'
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
     * Validation has already rejected invalid explicit values; this
     * function only resolves values that passed validation.
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

    /**
     * Patronymic morphology. Given a base given name and a suffix/prefix
     * pair, produce the derived surname form.
     *
     * The transformation is deliberately narrow:
     *   - The base name's first character is uppercased.
     *   - The rest of the base name is preserved as given.
     *   - Prefix and suffix are appended/prepended as configured.
     *
     * This is NOT a generic capitalize() pass. It assumes the base name
     * is a given name in normal orthography (`John`, `Mary`) and the
     * affixes are morphology (`son`, `dottir`, `ovich`, `ovna`). For any
     * other input, the caller is responsible for the result. Rules are
     * declarative; this function does not try to guess.
     */
    function _applyPatronymicMorphology(baseName, prefix, suffix) {
        if (!_isNonEmptyString(baseName)) return '';
        var head = baseName.charAt(0).toUpperCase();
        var tail = baseName.slice(1);
        return (prefix || '') + head + tail + (suffix || '');
    }

    // =========================================================================
    // 3. BASE FIRST NAME
    // =========================================================================
    //
    // The canonical owner of base-first-name extraction. Queries has a
    // private copy that will be removed when Queries can depend on Rules
    // for this transformation. See the module header migration notes.

    /**
     * Extracts the "base" first name from a character: the given name
     * with any trailing epithet or "of Place" suffix stripped.
     *
     * Note: this strips exactly one trailing token after "the" and one
     * after "of". It is not a general-purpose parser. If your naming
     * grammar grows multi-token epithets, this needs to grow with it.
     */
    function getBaseFirstName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        if (name.length === 0) return '';
        name = name.replace(/\s+the\s+\S+$/, '');
        name = name.replace(/\s+of\s+\S+$/, '');
        return name.trim();
    }

    // =========================================================================
    // 4. VALIDATION
    // =========================================================================

    /**
     * Validates a rule object. Returns:
     *   { valid: true }
     *   { valid: false, reason: '...' }
     *
     * Strict semantics:
     *   - Missing required fields are invalid.
     *   - Explicit invalid values are invalid.
     *   - Unknown fields are tolerated (forward-compatible).
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
        if (family.connector === 'custom') {
            if (typeof family.customConnector !== 'string' || family.customConnector.length === 0) {
                return {
                    valid: false,
                    reason: 'family.customConnector must be a non-empty string when connector is "custom"'
                };
            }
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
        if (chain.connector === 'custom') {
            if (typeof chain.customConnector !== 'string' || chain.customConnector.length === 0) {
                return {
                    valid: false,
                    reason: 'chain.customConnector must be a non-empty string when connector is "custom"'
                };
            }
        }
        return { valid: true };
    }

    // =========================================================================
    // 5. RULE APPLICATION
    // =========================================================================

    /**
     * Applies a rule to generate a surname.
     *
     * @param {Object|null} mother
     * @param {Object|null} father
     * @param {string} childGender - 'male' | 'female' | 'unknown' | 'other'
     * @param {Object} rules
     * @returns {string|null} the generated surname, or null when the rule
     *   cannot produce one (missing inputs, empty pools, unresolvable
     *   chain, etc.)
     * @throws {Error} when `rules` fails validation
     */
    function generateSurnameFromRules(mother, father, childGender, rules) {
        var validation = validateRules(rules);
        if (!validation.valid) {
            throw new Error('generateSurnameFromRules: ' + validation.reason);
        }

        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                return _applyRandomRule(mother, father);
            case RULE_TYPES.FAMILY:
                return _applyFamilyRule(mother, father, rules.family);
            case RULE_TYPES.PATRONYMIC:
                return _applyPatronymicRule(mother, father, childGender, rules.patronymic);
            case RULE_TYPES.CHAIN:
                return _applyChainRule(mother, father, rules.chain);
            default:
                throw new Error(
                    'generateSurnameFromRules: unhandled rule type "' + rules.type + '"'
                );
        }
    }

    function _applyRandomRule(mother, father) {
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
            // both. Require both. Single-parent fallback is a policy
            // decision that belongs in determineNewbornSurname, not here.
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

        // Preserve source casing. Do not capitalize.
        return parts.join(connector);
    }

    function _applyPatronymicRule(mother, father, childGender, patronymic) {
        var parent = patronymic.source === 'father' ? father : mother;
        if (!parent) return null;

        var baseName = getBaseFirstName(parent);
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
            // Unknown or other gender. A gendered patronymic rule cannot
            // resolve a morphology for it. Return null; do not default
            // to the male form silently. Callers who want a fallback can
            // add an explicit policy step.
            return null;
        }

        var result = _applyPatronymicMorphology(baseName, prefix, suffix);
        if (!result) return null;
        return result;
    }

    function _applyChainRule(mother, father, chain) {
        // Chain rule starts from the father when present, otherwise the
        // mother. This is a documented policy, not an accident.
        var start = father || mother;
        if (!start) return null;

        var source = _isMissing(chain.source) ? 'firstname' : chain.source;
        var names = window.NameQueries.getAncestorNames(start, chain.order, source);

        if (!Array.isArray(names) || names.length === 0) return null;

        var connector = _resolveConnector(chain.connector, chain.customConnector);
        return names.join(connector);
    }

    // =========================================================================
    // 6. NEWBORN SURNAME POLICY
    // =========================================================================

    /**
     * Determines the surname for a newborn.
     *
     * Cascade:
     *   1. Mother's country rules
     *   2. Father's country rules
     *   3. Random surname from the explicit `countryId` pool
     *   4. Father's surname
     *   5. Mother's surname
     *   6. null
     *
     * A rule that is present but INVALID throws. A rule that is present
     * and valid but cannot produce a result falls through.
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
        // Policy step 1: mother's country rules
        var parentRuleResult = _tryParentCountryRules(mother, 'mother');
        if (parentRuleResult) return parentRuleResult;

        // Policy step 2: father's country rules
        parentRuleResult = _tryParentCountryRules(father, 'father');
        if (parentRuleResult) return parentRuleResult;

        // Policy step 3: cultural surname from the explicit country
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

        // Policy step 4: father's surname
        if (father && _isNonEmptyString(father.surname)) {
            return {
                surname: father.surname,
                surnameSource: 'father',
                surnameRules: null,
                countryId: _isNonEmptyString(countryId) ? countryId : null
            };
        }

        // Policy step 5: mother's surname
        if (mother && _isNonEmptyString(mother.surname)) {
            return {
                surname: mother.surname,
                surnameSource: 'mother',
                surnameRules: null,
                countryId: _isNonEmptyString(countryId) ? countryId : null
            };
        }

        // Policy step 6: no surname
        return null;
    }

    function _tryParentCountryRules(parent, parentRole) {
        if (!parent || !_isNonEmptyString(parent.id)) return null;

        var parentCountryId = window.NameQueries.getCharacterCountryId(parent.id);
        if (!parentCountryId) return null;

        var rules = window.NameQueries.getCountrySurnameRules(parentCountryId);
        if (!rules || !rules.type) return null;

        // Resolve the parent into the correct slot. Do not synthesize the
        // other parent. A FAMILY rule with source 'both' will not produce
        // a result if the other parent is absent, which is correct.
        var mother = parentRole === 'mother' ? parent : null;
        var father = parentRole === 'father' ? parent : null;

        // A persisted rule that fails validation is a data-integrity
        // problem, not a "no rule" state. Let it throw.
        var generated = generateSurnameFromRules(mother, father, 'unknown', rules);
        if (!generated) return null;

        return {
            surname: generated,
            surnameSource: 'country_rules',
            surnameRules: rules,
            countryId: parentCountryId
        };
    }

    // =========================================================================
    // 7. MARRIAGE SURNAME POLICY
    // =========================================================================
    //
    // The canonical owner of marriage surname calculation. Commands
    // orchestrate the application; the calculation is policy and lives
    // here. Returns null for an unknown rule; it does not silently
    // default.

    /**
     * @param {Object} person
     * @param {Object} spouse
     * @param {string} rule - one of MARRIAGE_RULES
     * @returns {{ newSurname: string, spouseNewSurname: string }|null}
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        if (!person || !spouse) return null;
        if (MARRIAGE_RULES.indexOf(rule) === -1) return null;

        var personSurname = typeof person.surname === 'string' ? person.surname : '';
        var spouseSurname = typeof spouse.surname === 'string' ? spouse.surname : '';

        var result = {
            newSurname: personSurname,
            spouseNewSurname: spouseSurname
        };

        switch (rule) {
            case 'wife_takes_husband':
                if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                }
                return result;

            case 'husband_takes_wife':
                if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                }
                return result;

            case 'hyphenate':
                var combined = personSurname + '-' + spouseSurname;
                result.newSurname = combined;
                result.spouseNewSurname = combined;
                return result;

            case 'keep':
                return result;

            default:
                return null;
        }
    }

    // =========================================================================
    // 8. RULE PRESETS
    // =========================================================================

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
                source: 'firstname',
                connector: 'space'
            }
        },

        // Chain: father → paternal grandfather → paternal great-grandfather.
        //
        // NOTE: 'paternal_great_grandfather' is declared in
        // VALID_ANCESTOR_TYPES but is not yet resolvable in
        // name-queries.js. Until the follow-up patch lands, this preset
        // degrades to the first two generations, because
        // getAncestorNames skips slots it cannot resolve. Once the query
        // layer supports the slot, the third generation is included
        // without further changes to this preset.
        chain_three_generation: {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather', 'paternal_great_grandfather'],
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
     * Returns the names of all available presets, sorted.
     */
    function getRulePresetNames() {
        return Object.keys(RULE_PRESETS).sort();
    }

    // =========================================================================
    // 9. RULE DESCRIPTION
    // =========================================================================

    /**
     * Returns a human-readable description of a rule.
     *
     * Throws when the rule is invalid. Does not silently repair.
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
        var source = _isMissing(chain.source) ? 'firstname' : chain.source;
        var slotList = chain.order.join(' > ');
        return 'Chain of ' + chain.order.length + ' ancestor slot(s) of ' +
            source + ' (' + slotList + ')';
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.NameRules = {
        // Constants
        RULE_TYPES: RULE_TYPES,
        MARRIAGE_RULES: MARRIAGE_RULES,
        VALID_ANCESTOR_TYPES: VALID_ANCESTOR_TYPES,

        // Validation
        validateRules: validateRules,

        // Application
        generateSurnameFromRules: generateSurnameFromRules,
        determineNewbornSurname: determineNewbornSurname,
        calculateMarriageSurnames: calculateMarriageSurnames,

        // Base first name (canonical owner)
        getBaseFirstName: getBaseFirstName,

        // Presets
        getRulePreset: getRulePreset,
        getRulePresetNames: getRulePresetNames,

        // Description
        describeRule: describeRule
    };

})();
