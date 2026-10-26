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
 *   - cache or reconstruct domain facts the canonical API no longer provides
 *
 * PERSISTENCE CONTRACT (deliberate divergence from canonical commands):
 *   NameCommands no longer save. Callers are expected to call
 *   NameCommands.persist() once per successful command batch.
 *
 *   The legacy wrappers preserve the OLD contract: they save immediately
 *   after a successful command. This keeps existing callers working
 *   during the migration without requiring them to change their save
 *   behaviour. When every caller is migrated to the canonical API, this
 *   wrapper is deleted and the double-save concern goes away with it.
 *
 *   A persist failure is reported through the returned
 *   { success: false, reason } object. This is strictly better than the
 *   pre-refactor behaviour, where a save failure inside a command was
 *   invisible to the caller (the command returned success regardless).
 *
 * RETURN SHAPE:
 *   Commands in this wrapper return the canonical `{ success, reason,
 *   ... }` shape, not the old `null`-on-failure shape. Additional fields
 *   (change, history, revertedChange, restoredSurname, etc.) are passed
 *   through from the canonical command result.
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
 *   API. Delete the wrapper. When the wrapper is gone, the double-save
 *   concern (canonical persist + wrapper persist) is gone too.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js:  NameQueries
 *   - name-commands.js: NameCommands (including persist)
 *   - name-rules.js:    NameRules
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Original: thin adapters over the canonical modules; no save policy.
 *   Current:
 *     - _persistAfter helper added to preserve the old "saves immediately"
 *       contract on the four legacy command wrappers.
 *     - Persist failure is reported through the return value.
 *     - Header documents the deliberate divergence and the removal plan.
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

        if (typeof window.NameCommands.persist !== 'function') {
            throw new Error(
                'name-system.js: NameCommands.persist is required. ' +
                'Legacy wrappers call it to preserve the old save contract.'
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. PERSISTENCE HELPER
    // =========================================================================

    /**
     * Calls NameCommands.persist() and folds a persist failure into the
     * canonical result shape.
     *
     * If `result` is already a failure, returns it unchanged — do not
     * attempt a save after a failed command.
     *
     * If `result` is a success and the save fails, returns:
     *   { success: false, reason: 'Save failed: <reason>', canonical: result }
     * The `canonical` field carries the original success payload so a
     * caller that wants to inspect it can.
     *
     * If the save succeeds, returns `result` unchanged.
     */
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

    // =========================================================================
    // 2. BASE NAME ADAPTER
    // =========================================================================

    /**
     * @deprecated Use NameRules.getBaseFirstName(character) instead.
     */
    function getBaseNameForPatronymic(character) {
        return window.NameRules.getBaseFirstName(character);
    }

    // =========================================================================
    // 3. RULE APPLICATION ADAPTERS
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
    // 4. NAME / SURNAME SELECTION ADAPTERS
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
    // 5. ANCESTOR ADAPTERS
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
    // 6. SURNAME HISTORY READ ADAPTERS
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
    // 7. SURNAME MUTATION ADAPTERS (with persist)
    // =========================================================================
    //
    // The old commands took a character object and saved immediately.
    // The new commands take an ID and do not save. These adapters:
    //   - accept the old character-object signature
    //   - delegate to the canonical command
    //   - call NameCommands.persist() on success (preserving the old
    //     "saves immediately" contract)
    //   - return the canonical result shape
    //
    // When this wrapper is deleted, callers must call
    // NameCommands.persist() themselves.

    /**
     * @deprecated Use NameCommands.recordSurnameChange(characterId,
     * newSurname, year, reason, options) + NameCommands.persist() instead.
     * Return shape: { success, reason, change }.
     */
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

    /**
     * @deprecated Use NameCommands.recordBirthSurname(characterId,
     * birthSurname) + NameCommands.persist() instead.
     * Return shape: { success, reason, history }.
     */
    function recordBirthSurname(character, birthSurname) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        var result = window.NameCommands.recordBirthSurname(character.id, birthSurname);
        return _persistAfter(result);
    }

    /**
     * @deprecated Use NameCommands.revertLastSurnameChange(characterId)
     * + NameCommands.persist() instead.
     * Return shape: { success, reason, revertedChange, restoredSurname }.
     */
    function revertLastSurnameChange(character) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        var result = window.NameCommands.revertLastSurnameChange(character.id);
        return _persistAfter(result);
    }

    /**
     * @deprecated Use NameCommands.applyMarriageSurnames(personId,
     * spouseId, rule, year, notes) + NameCommands.persist() instead.
     * `rule` is required; the wrapper does not supply a default.
     */
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

    /**
     * @deprecated Use NameRules.calculateMarriageSurnames(person, spouse,
     * rule) instead. This is policy, not orchestration. No persist needed
     * — this function does not mutate.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 8. REMOVED FUNCTIONS
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
    // 9. EXPORTS
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

    // Surname mutations (preserve the old "saves immediately" contract)
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
