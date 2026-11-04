/**
 * =============================================================================
 * STILL WATERS - NAME SYSTEM LEGACY WRAPPER (name-system.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-system.js
 *
 * DEPRECATED COMPATIBILITY LAYER. See the previous revision's header for
 * the full rationale. This revision tracks the culture-keyed migration:
 * legacy alias names that said "Country" now say "Culture" and delegate
 * to the culture-keyed canonical functions.
 *
 * Legacy aliases with "Country" in the name are kept for one release as
 * deprecated shims that delegate to the culture-keyed functions. New
 * callers must use the culture-keyed canonical API directly.
 *
 * PERSISTENCE CONTRACT: unchanged. The four command wrappers persist
 * after each successful command, preserving the old "saves immediately"
 * contract. Callers using the canonical API must call persist themselves.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (culture-keyed):
 *     - getRandomNameFromCountry → delegates to getRandomName(cultureId).
 *       Kept as a deprecated alias.
 *     - getRandomSurnameFromCountry → delegates to getRandomSurname.
 *     - getCountrySurnameRules → delegates to getCultureSurnameRules.
 *     - applyMarriageSurnames no longer touches MARRIAGE_RULES as an
 *       object; it is an array.
 *   Previous revision:
 *     - _persistAfter helper added.
 * =============================================================================
 */

(function() {
    'use strict';

    function _requireDependencies() {
        var missing = [];

        if (typeof window.NameQueries === 'undefined') missing.push('NameQueries');
        if (typeof window.NameCommands === 'undefined') missing.push('NameCommands');
        if (typeof window.NameRules === 'undefined') missing.push('NameRules');

        if (missing.length > 0) {
            throw new Error(
                'name-system.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }

        if (typeof window.NameCommands.persist !== 'function') {
            throw new Error(
                'name-system.js: NameCommands.persist is required. ' +
                'Legacy wrappers call it to preserve the old save contract.'
            );
        }
    }

    _requireDependencies();

    function _persistAfter(result) {
        if (!result || result.success !== true) return result;

        var saveResult = window.NameCommands.persist();
        if (saveResult && saveResult.success === false) {
            return {
                success: false,
                reason: 'Save failed: ' + (saveResult.reason || 'unknown error'),
                canonical: result
            };
        }

        return result;
    }

    // ---- Base name ----

    function getBaseNameForPatronymic(character) {
        return window.NameRules.getBaseFirstName(character);
    }

    // ---- Rule application ----

    function generateFamilySurname(father, mother, rules) {
        var rule = {
            type: window.NameRules.RULE_TYPES.FAMILY,
            family: rules
        };
        return window.NameRules.generateSurnameFromRules(mother, father, 'unknown', rule);
    }

    function generatePatronymicSurnameFromRules(parent, childGender, rules) {
        var rule = {
            type: window.NameRules.RULE_TYPES.PATRONYMIC,
            patronymic: rules
        };
        var source = rules && rules.source;
        var mother = source === 'mother' ? parent : null;
        var father = source === 'father' ? parent : null;
        return window.NameRules.generateSurnameFromRules(mother, father, childGender, rule);
    }

    function generateChainSurnameFromRules(character, rules) {
        if (!character) return null;
        var rule = {
            type: window.NameRules.RULE_TYPES.CHAIN,
            chain: rules
        };
        return window.NameRules.generateSurnameFromRules(null, character, 'unknown', rule);
    }

    function generateSurnameFromRules(mother, father, childGender, rules) {
        return window.NameRules.generateSurnameFromRules(mother, father, childGender, rules);
    }

    function determineNewbornSurname(mother, father, cultureId) {
        return window.NameRules.determineNewbornSurname(mother, father, cultureId);
    }

    // ---- Selection (deprecated "Country" aliases) ----

    /**
     * @deprecated Use NameQueries.getRandomName(cultureId, gender).
     */
    function getRandomNameFromCountry(cultureId, gender) {
        return window.NameQueries.getRandomName(cultureId, gender);
    }

    /**
     * @deprecated Use NameQueries.getRandomSurname(cultureId).
     */
    function getRandomSurnameFromCountry(cultureId) {
        return window.NameQueries.getRandomSurname(cultureId);
    }

    /**
     * @deprecated Use NameQueries.getCultureSurnameRules(cultureId).
     */
    function getCountrySurnameRules(cultureId) {
        return window.NameQueries.getCultureSurnameRules(cultureId);
    }

    // ---- Ancestor accessors ----

    function getAncestorFirstName(character, slot) {
        var data = window.NameQueries.getAncestorData(character, slot);
        if (!data) return '';
        return window.NameRules.getBaseFirstName({ name: data.firstName });
    }

    function getAncestorSurname(character, slot) {
        var data = window.NameQueries.getAncestorData(character, slot);
        return data ? data.surname : '';
    }

    // ---- Surname history reads ----

    function getSurnameHistory(character) {
        if (!character || typeof character.id !== 'string') return null;
        return window.NameQueries.getSurnameHistory(character.id);
    }

    function getBirthSurname(character) {
        if (!character || typeof character.id !== 'string') return '';
        var result = window.NameQueries.getBirthSurname(character.id);
        return result === null ? '' : result;
    }

    function getCurrentSurname(character) {
        if (!character || typeof character.id !== 'string') return '';
        var result = window.NameQueries.getCurrentSurname(character.id);
        return result === null ? '' : result;
    }

    function getSurnameChanges(character) {
        if (!character || typeof character.id !== 'string') return [];
        return window.NameQueries.getSurnameChanges(character.id);
    }

    // ---- Surname mutation adapters (with persist) ----

    function recordSurnameChange(character, newSurname, year, reason, options) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        var result = window.NameCommands.recordSurnameChange(
            character.id,
            newSurname,
            year,
            reason,
            options
        );
        return _persistAfter(result);
    }

    function recordBirthSurname(character, birthSurname) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        var result = window.NameCommands.recordBirthSurname(character.id, birthSurname);
        return _persistAfter(result);
    }

    function revertLastSurnameChange(character) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        var result = window.NameCommands.revertLastSurnameChange(character.id);
        return _persistAfter(result);
    }

    function applyMarriageSurnames(person, spouse, rule, year, notes) {
        if (!person || !spouse) {
            return { success: false, reason: 'Both person and spouse are required' };
        }
        if (typeof person.id !== 'string' || typeof spouse.id !== 'string') {
            return { success: false, reason: 'Both person and spouse must have valid IDs' };
        }
        var result = window.NameCommands.applyMarriageSurnames(
            person.id,
            spouse.id,
            rule,
            year,
            notes
        );
        return _persistAfter(result);
    }

    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // ---- Removed functions (throwing stubs) ----

    function getMarriageSurnameRule(/* countryId */) {
        throw new Error(
            'name-system.js: getMarriageSurnameRule has been removed. ' +
            'Pass an explicit rule to NameCommands.applyMarriageSurnames ' +
            "('wife_takes_husband', 'husband_takes_wife', 'hyphenate', or 'keep')."
        );
    }

    function _getAncestorNamesForChain(/* character, order, depth, source */) {
        throw new Error(
            'name-system.js: _getAncestorNamesForChain has been removed. ' +
            'Use NameQueries.getAncestorNames(character, order, source).'
        );
    }

    function _getConnectorValue(/* connectorType, customConnector */) {
        throw new Error(
            'name-system.js: _getConnectorValue has been removed.'
        );
    }

    function _splitSurname(/* surname */) {
        throw new Error(
            'name-system.js: _splitSurname has been removed.'
        );
    }

    function _getSurnamePart(/* character, position */) {
        throw new Error(
            'name-system.js: _getSurnamePart has been removed.'
        );
    }

    function getAncestorChain(/* character, maxDepth */) {
        throw new Error(
            'name-system.js: getAncestorChain has been removed. ' +
            'Use NameQueries.getAncestorData / getAncestorNames.'
        );
    }

    // ---- Exports ----

    window.getBaseNameForPatronymic = getBaseNameForPatronymic;

    window.generateFamilySurname = generateFamilySurname;
    window.generatePatronymicSurnameFromRules = generatePatronymicSurnameFromRules;
    window.generateChainSurnameFromRules = generateChainSurnameFromRules;
    window.generateSurnameFromRules = generateSurnameFromRules;
    window.determineNewbornSurname = determineNewbornSurname;

    window.getRandomNameFromCountry = getRandomNameFromCountry;
    window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
    window.getCountrySurnameRules = getCountrySurnameRules;

    window.getAncestorFirstName = getAncestorFirstName;
    window.getAncestorSurname = getAncestorSurname;

    window.getSurnameHistory = getSurnameHistory;
    window.getBirthSurname = getBirthSurname;
    window.getCurrentSurname = getCurrentSurname;
    window.getSurnameChanges = getSurnameChanges;

    window.recordSurnameChange = recordSurnameChange;
    window.recordBirthSurname = recordBirthSurname;
    window.revertLastSurnameChange = revertLastSurnameChange;
    window.applyMarriageSurnames = applyMarriageSurnames;
    window.calculateMarriageSurnames = calculateMarriageSurnames;

    window.getMarriageSurnameRule = getMarriageSurnameRule;
    window._getAncestorNamesForChain = _getAncestorNamesForChain;
    window._getConnectorValue = _getConnectorValue;
    window._splitSurname = _splitSurname;
    window._getSurnamePart = _getSurnamePart;
    window.getAncestorChain = getAncestorChain;

})();
