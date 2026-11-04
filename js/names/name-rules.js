/**
 * =============================================================================
 * STILL WATERS - NAME RULES (name-rules.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-rules.js
 *
 * Rule type vocabulary, validation, presets, application, newborn policy,
 * marriage policy, base first-name extraction.
 *
 * CULTURE KEY
 * -----------
 * This module is culture-keyed. Every rule lookup resolves the
 * character's culture through NameQueries.getCharacterCultureId, which
 * delegates to CultureQueries.getCultureForCharacter. The country
 * concept is absent. see name-queries.js's header.
 *
 * MARRIAGE POLICY
 * ---------------
 * calculateMarriageSurnames is unchanged. It takes two character objects
 * and a rule ID and returns the resulting surnames. No culture lookup.
 *
 * NEWBORN POLICY
 * --------------
 * determineNewbornSurname walks:
 *   1. Mother's culture rules
 *   2. Father's culture rules
 *   3. Random surname from the explicit cultureId pool
 *   4. Father's surname
 *   5. Mother's surname
 *   6. null
 *
 * A rule present but invalid throws. A rule present and valid but
 * unable to produce a result falls through.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js: NameQueries
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (culture-keyed):
 *     - _applyRandomRule reads mother's culture id, then father's.
 *     - _tryParentCountryRules renamed to _tryParentCultureRules.
 *       determineNewbornSurname's cascade is culture → culture → pool
 *       → father → mother → null.
 *     - No other behavioral change. Marriage, validation, presets, chain,
 *       patronymic, family rules all unchanged.
 *   Previous revision:
 *     - Header documents transitive dependency on world.js through
 *       NameQueries. (Removed — no world dependency.)
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
            'getCultureSurnameRules',
            'getCharacterCultureId'
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

    function _applyPatronymicMorphology(baseName, prefix, suffix) {
        if (!_isNonEmptyString(baseName)) return '';
        var head = baseName.charAt(0).toUpperCase();
        var tail = baseName.slice(1);
        return (prefix || '') + head + tail + (suffix || '');
    }

    // =========================================================================
    // 3. BASE FIRST NAME
    // =========================================================================

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
        var seen = new Set();
        for (var i = 0; i < chain.order.length; i++) {
            var slot = chain.order[i];
            if (VALID_ANCESTOR_TYPES.indexOf(slot) === -1) {
                return {
                    valid: false,
                    reason: 'chain.order[' + i + '] must be one of: ' + VALID_ANCESTOR_TYPES.join(', ')
                };
            }
            if (seen.has(slot)) {
                return {
                    valid: false,
                    reason: 'chain.order[' + i + '] duplicates slot "' + slot + '"'
                };
            }
            seen.add(slot);
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
        var cultureId = null;
        if (mother && _isNonEmptyString(mother.id)) {
            cultureId = window.NameQueries.getCharacterCultureId(mother.id);
        }
        if (!cultureId && father && _isNonEmptyString(father.id)) {
            cultureId = window.NameQueries.getCharacterCultureId(father.id);
        }
        if (!cultureId) return null;

        var surname = window.NameQueries.getRandomSurname(cultureId);
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
            return null;
        }

        var result = _applyPatronymicMorphology(baseName, prefix, suffix);
        if (!result) return null;
        return result;
    }

    function _applyChainRule(mother, father, chain) {
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
     *   1. Mother's culture rules
     *   2. Father's culture rules
     *   3. Random surname from the explicit `cultureId` pool
     *   4. Father's surname
     *   5. Mother's surname
     *   6. null
     *
     * @param {Object|null} mother
     * @param {Object|null} father
     * @param {string|null} cultureId - fallback culture
     */
    function determineNewbornSurname(mother, father, cultureId) {
        var parentRuleResult = _tryParentCultureRules(mother, 'mother');
        if (parentRuleResult) return parentRuleResult;

        parentRuleResult = _tryParentCultureRules(father, 'father');
        if (parentRuleResult) return parentRuleResult;

        if (_isNonEmptyString(cultureId)) {
            var randomSurname = window.NameQueries.getRandomSurname(cultureId);
            if (randomSurname) {
                return {
                    surname: randomSurname,
                    surnameSource: 'culture',
                    surnameRules: null,
                    cultureId: cultureId
                };
            }
        }

        if (father && _isNonEmptyString(father.surname)) {
            return {
                surname: father.surname,
                surnameSource: 'father',
                surnameRules: null,
                cultureId: _isNonEmptyString(cultureId) ? cultureId : null
            };
        }

        if (mother && _isNonEmptyString(mother.surname)) {
            return {
                surname: mother.surname,
                surnameSource: 'mother',
                surnameRules: null,
                cultureId: _isNonEmptyString(cultureId) ? cultureId : null
            };
        }

        return null;
    }

    /**
     * Tries to apply the parent's culture rules to the newborn.
     *
     * The `parentRole` parameter ('mother' or 'father') determines which
     * of the two positional arguments to `generateSurnameFromRules` is
     * populated. The other is null. This matters for rules that consult
     * a specific parent (e.g. a patronymic rule with source='father'
     * returns null when only the mother is provided, which is correct —
     * we don't fall back to a matronymic form silently).
     */
    function _tryParentCultureRules(parent, parentRole) {
        if (!parent || !_isNonEmptyString(parent.id)) return null;

        var parentCultureId = window.NameQueries.getCharacterCultureId(parent.id);
        if (!parentCultureId) return null;

        var rules = window.NameQueries.getCultureSurnameRules(parentCultureId);
        if (!rules || !rules.type) return null;

        var mother = parentRole === 'mother' ? parent : null;
        var father = parentRole === 'father' ? parent : null;

        var generated = generateSurnameFromRules(mother, father, 'unknown', rules);
        if (!generated) return null;

        return {
            surname: generated,
            surnameSource: 'culture_rules',
            surnameRules: rules,
            cultureId: parentCultureId
        };
    }

    // =========================================================================
    // 7. MARRIAGE SURNAME POLICY
    // =========================================================================

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
        patrilineal: {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'father',
                order: 'father_first',
                count: 1,
                position: 'first'
            }
        },

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

        chain_two_generation: {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather'],
                source: 'firstname',
                connector: 'space'
            }
        },

        chain_three_generation: {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather', 'paternal_great_grandfather'],
                source: 'firstname',
                connector: 'space'
            }
        }
    });

    function getRulePreset(presetName) {
        if (!_isNonEmptyString(presetName)) return null;
        var preset = RULE_PRESETS[presetName];
        if (!preset) return null;
        return _cloneRule(preset);
    }

    function getRulePresetNames() {
        return Object.keys(RULE_PRESETS).sort();
    }

    // =========================================================================
    // 9. RULE DESCRIPTION
    // =========================================================================

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
        RULE_TYPES: RULE_TYPES,
        MARRIAGE_RULES: MARRIAGE_RULES,
        VALID_ANCESTOR_TYPES: VALID_ANCESTOR_TYPES,

        validateRules: validateRules,

        generateSurnameFromRules: generateSurnameFromRules,
        determineNewbornSurname: determineNewbornSurname,
        calculateMarriageSurnames: calculateMarriageSurnames,

        getBaseFirstName: getBaseFirstName,

        getRulePreset: getRulePreset,
        getRulePresetNames: getRulePresetNames,

        describeRule: describeRule
    };

})();
