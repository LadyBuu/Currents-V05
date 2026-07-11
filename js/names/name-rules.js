/**
 * =============================================================================
 * NAME RULES - Business logic for name generation rules
 * =============================================================================
 * 
 * Responsibilities:
 * - Define rule types and validation
 * - Apply rules to generate names
 * - Rule composition (combine multiple rules)
 * - Country-specific rule resolution
 * 
 * DEPENDENCIES:
 *   - name-queries.js (NameQueries)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingRules = false;

    // =========================================================================
    // 2. RULE TYPES CONSTANTS
    // =========================================================================

    var RULE_TYPES = {
        RANDOM: 'random',
        FAMILY: 'family',
        PATRONYMIC: 'patronymic',
        CHAIN: 'chain',
        HYPHENATED: 'hyphenated',
        CUSTOM: 'custom'
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 4. RULE VALIDATION
    // =========================================================================

    function validateRules(rules) {
        if (!rules) {
            return { valid: false, reason: 'Rules object is required' };
        }
        if (!rules.type) {
            return { valid: false, reason: 'Rule type is required' };
        }

        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                return { valid: true };

            case RULE_TYPES.FAMILY:
                if (!rules.family) {
                    return { valid: false, reason: 'Missing family rules' };
                }
                if (!rules.family.source) {
                    return { valid: false, reason: 'Family source is required (father, mother, or both)' };
                }
                return { valid: true };

            case RULE_TYPES.PATRONYMIC:
                if (!rules.patronymic) {
                    return { valid: false, reason: 'Missing patronymic rules' };
                }
                if (!rules.patronymic.source) {
                    return { valid: false, reason: 'Patronymic source is required (father or mother)' };
                }
                return { valid: true };

            case RULE_TYPES.CHAIN:
                if (!rules.chain) {
                    return { valid: false, reason: 'Missing chain rules' };
                }
                if (!rules.chain.order || rules.chain.order.length === 0) {
                    return { valid: false, reason: 'Chain order is required' };
                }
                if (!rules.chain.depth || rules.chain.depth < 1) {
                    return { valid: false, reason: 'Chain depth must be at least 1' };
                }
                return { valid: true };

            default:
                return { valid: false, reason: 'Unknown rule type: ' + rules.type };
        }
    }

    // =========================================================================
    // 5. RULE APPLICATION
    // =========================================================================

    function generateSurnameFromRules(mother, father, childGender, rules) {
        // RECURSION GUARD
        if (_processingRules) {
            console.warn('Rules processing already running, skipping');
            return '';
        }
        _processingRules = true;

        try {
            // Validate rules
            var validation = validateRules(rules);
            if (!validation.valid) {
                console.warn('Invalid rules:', validation.reason);
                return '';
            }

            // Use NameQueries to generate
            if (typeof NameQueries.generateSurnameFromRules === 'function') {
                return NameQueries.generateSurnameFromRules(mother, father, childGender, rules);
            }

            // Fallback: direct generation
            return _generateSurnameFromRulesDirect(mother, father, childGender, rules);

        } finally {
            _processingRules = false;
        }
    }

    function _generateSurnameFromRulesDirect(mother, father, childGender, rules) {
        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                // Get a random surname from the character's country
                var countryId = null;
                if (mother) {
                    countryId = typeof NameQueries.getCharacterCountryId === 'function' ?
                        NameQueries.getCharacterCountryId(mother) : null;
                }
                if (!countryId && father) {
                    countryId = typeof NameQueries.getCharacterCountryId === 'function' ?
                        NameQueries.getCharacterCountryId(father) : null;
                }
                if (countryId && typeof NameQueries.getRandomSurname === 'function') {
                    return NameQueries.getRandomSurname(countryId);
                }
                return '';

            case RULE_TYPES.FAMILY:
                if (typeof NameQueries.generateFamilySurname === 'function') {
                    return NameQueries.generateFamilySurname(father, mother, rules.family);
                }
                return '';

            case RULE_TYPES.PATRONYMIC:
                if (typeof NameQueries.generatePatronymicSurname === 'function') {
                    var parent = rules.patronymic.source === 'father' ? father : mother;
                    return NameQueries.generatePatronymicSurname(parent, childGender, rules.patronymic);
                }
                return '';

            case RULE_TYPES.CHAIN:
                if (typeof NameQueries.generateChainSurname === 'function') {
                    var childChar = {
                        fatherId: father ? father.id : null,
                        motherId: mother ? mother.id : null,
                        name: 'Child'
                    };
                    return NameQueries.generateChainSurname(childChar, rules.chain);
                }
                return '';

            default:
                return '';
        }
    }

    // =========================================================================
    // 6. RULE DESCRIPTION
    // =========================================================================

    function getRuleDescription(rules) {
        if (!rules || !rules.type) {
            return 'No rules defined';
        }

        var description = '';
        switch (rules.type) {
            case RULE_TYPES.RANDOM:
                description = 'Random name from cultural pool';
                break;

            case RULE_TYPES.FAMILY:
                var source = rules.family.source === 'father' ? 'father' :
                             rules.family.source === 'mother' ? 'mother' : 'both';
                var order = rules.family.order === 'father_first' ? 'father\'s first' : 'mother\'s first';
                var count = rules.family.count || 1;
                var position = rules.family.position || 'first';
                description = 'Family surname from ' + source + ' (' + order + '), ' + count + ' part(s) from ' + position;
                break;

            case RULE_TYPES.PATRONYMIC:
                var parent = rules.patronymic.source === 'father' ? 'father' : 'mother';
                var gender = rules.patronymic.malePrefix ? 'patronymic' : 'matronymic';
                description = gender + ' from ' + parent;
                if (rules.patronymic.malePrefix) {
                    description += ' (prefix: "' + rules.patronymic.malePrefix + '")';
                }
                if (rules.patronymic.maleSuffix) {
                    description += ' (suffix: "' + rules.patronymic.maleSuffix + '")';
                }
                break;

            case RULE_TYPES.CHAIN:
                var depth = rules.chain.depth || 1;
                var source = rules.chain.source || 'firstname';
                var order = (rules.chain.order || ['father', 'mother']).join(' > ');
                description = 'Chain from ' + depth + ' generation(s) of ' + source + ' (order: ' + order + ')';
                break;

            default:
                description = 'Custom rule';
        }

        return description;
    }

    // =========================================================================
    // 7. RULE PRESETS
    // =========================================================================

    var RULE_PRESETS = {
        // European-style: father's surname
        'european': {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'father',
                order: 'father_first',
                count: 1,
                position: 'first'
            }
        },

        // Spanish-style: both surnames (father + mother)
        'spanish': {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'both',
                order: 'father_first',
                count: 2,
                position: 'first'
            }
        },

        // Icelandic-style: patronymic
        'icelandic': {
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

        // Russian-style: patronymic with suffix
        'russian': {
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

        // Arabic-style: chain (ibn/bin/bint)
        'arabic': {
            type: RULE_TYPES.CHAIN,
            chain: {
                order: ['father', 'paternal_grandfather', 'paternal_great_grandfather'],
                depth: 2,
                source: 'firstname',
                connector: 'space'
            }
        },

        // Hyphenated: both surnames with hyphen
        'hyphenated': {
            type: RULE_TYPES.FAMILY,
            family: {
                source: 'both',
                order: 'father_first',
                count: 2,
                position: 'first',
                connector: 'hyphen'
            }
        }
    };

    function getRulePreset(presetName) {
        return RULE_PRESETS[presetName] || null;
    }

    function getRulePresetNames() {
        return Object.keys(RULE_PRESETS);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.NameRules = {
        RULE_TYPES: RULE_TYPES,
        RULE_PRESETS: RULE_PRESETS,

        validateRules: validateRules,
        generateSurnameFromRules: generateSurnameFromRules,
        getRuleDescription: getRuleDescription,

        getRulePreset: getRulePreset,
        getRulePresetNames: getRulePresetNames
    };


})();