/**
 * =============================================================================
 * STILL WATERS - NAME SYSTEM LEGACY WRAPPER (name-system.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-system.js
 *
 * DEPRECATED COMPATIBILITY LAYER.
 *
 * Every exported global below is a thin adapter over the canonical Name
 * modules:
 *
 *     legacy global                    canonical owner
 *     ─────────────────────────────────────────────────
 *     getBaseNameForPatronymic         NameRules.getBaseFirstName
 *     generateFamilySurname            NameRules.generateSurnameFromRules
 *     generatePatronymicSurnameFromRules  NameRules.generateSurnameFromRules
 *     generateChainSurnameFromRules    NameRules.generateSurnameFromRules
 *     generateSurnameFromRules         NameRules.generateSurnameFromRules
 *     determineNewbornSurname          NameRules.determineNewbornSurname
 *     calculateMarriageSurnames        NameRules.calculateMarriageSurnames
 *
 *     getRandomNameFromCountry         NameQueries.getRandomName
 *     getRandomSurnameFromCountry      NameQueries.getRandomSurname
 *     getCountrySurnameRules           NameQueries.getCountrySurnameRules
 *     getAncestorFirstName             NameRules.getBaseFirstName(
 *                                          NameQueries.getAncestorData(...))
 *     getAncestorSurname               NameQueries.getAncestorData(.surname)
 *     getSurnameHistory                NameQueries.getSurnameHistory
 *     getBirthSurname                  NameQueries.getBirthSurname
 *     getCurrentSurname                NameQueries.getCurrentSurname
 *     getSurnameChanges                NameQueries.getSurnameChanges
 *
 *     recordSurnameChange              NameCommands.recordSurnameChange
 *     recordBirthSurname               NameCommands.recordBirthSurname
 *     revertLastSurnameChange          NameCommands.revertLastSurnameChange
 *     applyMarriageSurnames            NameCommands.applyMarriageSurnames
 *
 * The wrapper does NOT:
 *   - implement any name or surname logic
 *   - fabricate fake character objects to reach a query
 *   - return hardcoded policies
 *   - return empty results to hide a missing dependency
 *   - cache, persist, or mutate anything itself
 *   - reconstruct domain facts the canonical API no longer provides
 *
 * RETURN SHAPE:
 *   Commands in this wrapper return the canonical `{ success, reason,
 *   ... }` shape, not the old `null`-on-failure shape.
 *
 * DEPENDENCY POLICY:
 *   Required dependencies are checked once at load. A partial load is a
 *   wiring bug, not a data state.
 *
 * REMOVED FUNCTIONS:
 *   Functions with no canonical equivalent are retained only as
 *   throwing stubs. See section 7.
 *
 * REMOVAL PLAN:
 *   Grep for callers, definitions, and aliases. Migrate to the canonical
 *   API. Delete the wrapper.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js:  NameQueries
 *   - name-commands.js: NameCommands
 *   - name-rules.js:    NameRules
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
    }

    _requireDependencies();

    // =========================================================================
    // 1. BASE NAME ADAPTER
    // =========================================================================

    /**
     * @deprecated Use NameRules.getBaseFirstName(character) instead.
     */
    function getBaseNameForPatronymic(character) {
        return window.NameRules.getBaseFirstName(character);
    }

    // =========================================================================
    // 2. RULE APPLICATION ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a FAMILY
     * rule instead.
     *
     * Legacy signature: (father, mother, rules)
     */
    function generateFamilySurname(father, mother, rules) {
        var rule = {
            type: window.NameRules.RULE_TYPES.FAMILY,
            family: rules
        };
        return window.NameRules.generateSurnameFromRules(mother, father, 'unknown', rule);
    }

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a
     * PATRONYMIC rule instead.
     *
     * Legacy signature: (parent, childGender, rules)
     */
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

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a CHAIN
     * rule instead.
     *
     * Legacy signature: (character, rules)
     * rules.order is a complete, ordered list of absolute ancestor slots.
     * There is no `depth`; order.length is the depth.
     */
    function generateChainSurnameFromRules(character, rules) {
        if (!character) return null;
        var rule = {
            type: window.NameRules.RULE_TYPES.CHAIN,
            chain: rules
        };
        return window.NameRules.generateSurnameFromRules(null, character, 'unknown', rule);
    }

    /**
     * @deprecated Use NameRules.generateSurnameFromRules directly. The
     * legacy and canonical signatures are compatible.
     */
    function generateSurnameFromRules(mother, father, childGender, rules) {
        return window.NameRules.generateSurnameFromRules(mother, father, childGender, rules);
    }

    /**
     * @deprecated Use NameRules.determineNewbornSurname instead.
     */
    function determineNewbornSurname(mother, father, countryId) {
        return window.NameRules.determineNewbornSurname(mother, father, countryId);
    }

    // =========================================================================
    // 3. NAME / SURNAME SELECTION ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameQueries.getRandomName instead.
     */
    function getRandomNameFromCountry(countryId, gender) {
        return window.NameQueries.getRandomName(countryId, gender);
    }

    /**
     * @deprecated Use NameQueries.getRandomSurname instead.
     */
    function getRandomSurnameFromCountry(countryId) {
        return window.NameQueries.getRandomSurname(countryId);
    }

    /**
     * @deprecated Use NameQueries.getCountrySurnameRules instead.
     */
    function getCountrySurnameRules(countryId) {
        return window.NameQueries.getCountrySurnameRules(countryId);
    }

    // =========================================================================
    // 4. ANCESTOR ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameRules.getBaseFirstName(NameQueries
     * .getAncestorData(character, slot)) instead.
     *
     * The two-argument signature is unchanged, but the composition has
     * moved: NameQueries.getAncestorData now returns the ancestor's raw
     * `name` field, and the base-name transformation is owned by
     * NameRules. This adapter composes the two.
     */
    function getAncestorFirstName(character, slot) {
        var data = window.NameQueries.getAncestorData(character, slot);
        if (!data) return '';
        return window.NameRules.getBaseFirstName({ name: data.firstName });
    }

    /**
     * @deprecated Use NameQueries.getAncestorData(character, slot)
     * .surname instead.
     */
    function getAncestorSurname(character, slot) {
        var data = window.NameQueries.getAncestorData(character, slot);
        return data ? data.surname : '';
    }

    // =========================================================================
    // 5. SURNAME HISTORY READ ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameQueries.getSurnameHistory(characterId) instead.
     */
    function getSurnameHistory(character) {
        if (!character || typeof character.id !== 'string') return null;
        return window.NameQueries.getSurnameHistory(character.id);
    }

    /**
     * @deprecated Use NameQueries.getBirthSurname(characterId) instead.
     * The canonical function returns null on missing history; this
     * adapter preserves the old empty-string contract.
     */
    function getBirthSurname(character) {
        if (!character || typeof character.id !== 'string') return '';
        var result = window.NameQueries.getBirthSurname(character.id);
        return result === null ? '' : result;
    }

    /**
     * @deprecated Use NameQueries.getCurrentSurname(characterId) instead.
     */
    function getCurrentSurname(character) {
        if (!character || typeof character.id !== 'string') return '';
        var result = window.NameQueries.getCurrentSurname(character.id);
        return result === null ? '' : result;
    }

    /**
     * @deprecated Use NameQueries.getSurnameChanges(characterId) instead.
     */
    function getSurnameChanges(character) {
        if (!character || typeof character.id !== 'string') return [];
        return window.NameQueries.getSurnameChanges(character.id);
    }

    // =========================================================================
    // 6. SURNAME MUTATION ADAPTERS
    // =========================================================================
    //
    // The old commands took a character object. The new commands take an
    // ID and return { success, reason, ... }. These adapters preserve the
    // old signature and pass through the canonical result shape.

    /**
     * @deprecated Use NameCommands.recordSurnameChange(characterId,
     * newSurname, year, reason, options) instead.
     * Return shape: { success, reason, change }.
     */
    function recordSurnameChange(character, newSurname, year, reason, options) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        return window.NameCommands.recordSurnameChange(
            character.id,
            newSurname,
            year,
            reason,
            options
        );
    }

    /**
     * @deprecated Use NameCommands.recordBirthSurname(characterId,
     * birthSurname) instead.
     * Return shape: { success, reason, history }.
     */
    function recordBirthSurname(character, birthSurname) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        return window.NameCommands.recordBirthSurname(character.id, birthSurname);
    }

    /**
     * @deprecated Use NameCommands.revertLastSurnameChange(characterId)
     * instead.
     * Return shape: { success, reason, revertedChange, restoredSurname }.
     */
    function revertLastSurnameChange(character) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        return window.NameCommands.revertLastSurnameChange(character.id);
    }

    /**
     * @deprecated Use NameCommands.applyMarriageSurnames(personId,
     * spouseId, rule, year, notes) instead. `rule` is required; the
     * wrapper does not supply a default.
     */
    function applyMarriageSurnames(person, spouse, rule, year, notes) {
        if (!person || !spouse) {
            return { success: false, reason: 'Both person and spouse are required' };
        }
        if (typeof person.id !== 'string' || typeof spouse.id !== 'string') {
            return { success: false, reason: 'Both person and spouse must have valid IDs' };
        }
        return window.NameCommands.applyMarriageSurnames(
            person.id,
            spouse.id,
            rule,
            year,
            notes
        );
    }

    /**
     * @deprecated Use NameRules.calculateMarriageSurnames(person, spouse,
     * rule) instead. This is policy, not orchestration.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 7. REMOVED FUNCTIONS
    // =========================================================================
    //
    // These functions existed in the old wrapper but have no canonical
    // replacement. Each throws a clear error. None returns a fabricated
    // value.

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * The old implementation returned a hardcoded 'wife_takes_husband'
     * for every country. Callers must decide the rule explicitly.
     */
    function getMarriageSurnameRule(/* countryId */) {
        throw new Error(
            'name-system.js: getMarriageSurnameRule has been removed. ' +
            'Pass an explicit rule to NameCommands.applyMarriageSurnames ' +
            "('wife_takes_husband', 'husband_takes_wife', 'hyphenate', or 'keep')."
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * Use NameQueries.getAncestorNames(character, order, source). There
     * is no `depth` parameter; order.length is the depth.
     */
    function _getAncestorNamesForChain(/* character, order, depth, source */) {
        throw new Error(
            'name-system.js: _getAncestorNamesForChain has been removed. ' +
            'Use NameQueries.getAncestorNames(character, order, source). ' +
            'There is no `depth` parameter; order.length is the depth.'
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * Connector resolution is internal to NameRules; invalid connectors
     * are rejected during rule validation.
     */
    function _getConnectorValue(/* connectorType, customConnector */) {
        throw new Error(
            'name-system.js: _getConnectorValue has been removed. ' +
            'Connector resolution is internal to NameRules; invalid connectors ' +
            'are rejected during rule validation.'
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * Surname splitting is internal to NameRules; use the FAMILY rule's
     * 'position' option, or split the string directly.
     */
    function _splitSurname(/* surname */) {
        throw new Error(
            'name-system.js: _splitSurname has been removed. ' +
            'Surname splitting is internal to NameRules; use the FAMILY ' +
            "rule's 'position' option, or split the string directly."
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * Surname part extraction is internal to NameRules; use the FAMILY
     * rule's 'position' option instead.
     */
    function _getSurnamePart(/* character, position */) {
        throw new Error(
            'name-system.js: _getSurnamePart has been removed. ' +
            'Surname part extraction is internal to NameRules; use the ' +
            "FAMILY rule's 'position' option instead."
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * The old implementation fabricated ancestor records with placeholder
     * fields. Use NameQueries.getAncestorData(character, slot) for a
     * single slot's record, or NameQueries.getAncestorNames(character,
     * order, source) for a resolved list of names.
     */
    function getAncestorChain(/* character, maxDepth */) {
        throw new Error(
            'name-system.js: getAncestorChain has been removed. ' +
            'Use NameQueries.getAncestorData(character, slot) for a single ' +
            'ancestor record, or NameQueries.getAncestorNames(character, ' +
            'order, source) for a list of names. The canonical API does ' +
            'not expose the fabricated metadata shape this adapter used ' +
            'to return.'
        );
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    // Base name
    window.getBaseNameForPatronymic = getBaseNameForPatronymic;

    // Rule application
    window.generateFamilySurname = generateFamilySurname;
    window.generatePatronymicSurnameFromRules = generatePatronymicSurnameFromRules;
    window.generateChainSurnameFromRules = generateChainSurnameFromRules;
    window.generateSurnameFromRules = generateSurnameFromRules;
    window.determineNewbornSurname = determineNewbornSurname;

    // Selection
    window.getRandomNameFromCountry = getRandomNameFromCountry;
    window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
    window.getCountrySurnameRules = getCountrySurnameRules;

    // Ancestor accessors
    window.getAncestorFirstName = getAncestorFirstName;
    window.getAncestorSurname = getAncestorSurname;

    // Surname history reads
    window.getSurnameHistory = getSurnameHistory;
    window.getBirthSurname = getBirthSurname;
    window.getCurrentSurname = getCurrentSurname;
    window.getSurnameChanges = getSurnameChanges;

    // Surname mutations
    window.recordSurnameChange = recordSurnameChange;
    window.recordBirthSurname = recordBirthSurname;
    window.revertLastSurnameChange = revertLastSurnameChange;
    window.applyMarriageSurnames = applyMarriageSurnames;
    window.calculateMarriageSurnames = calculateMarriageSurnames;

    // Removed functions — retained only to throw clear errors
    window.getMarriageSurnameRule = getMarriageSurnameRule;
    window._getAncestorNamesForChain = _getAncestorNamesForChain;
    window._getConnectorValue = _getConnectorValue;
    window._splitSurname = _splitSurname;
    window._getSurnamePart = _getSurnamePart;
    window.getAncestorChain = getAncestorChain;

})();
