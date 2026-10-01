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
 *     getAncestorFirstName             NameQueries.getAncestorData(.firstName)
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
 *   - return hardcoded policies (e.g. a fixed marriage rule)
 *   - return empty results to hide a missing dependency
 *   - cache, persist, or mutate anything itself
 *   - reconstruct domain facts the canonical API no longer provides
 *
 * RETURN SHAPE:
 *   Commands in this wrapper return the canonical `{ success, reason,
 *   ... }` shape, not the old `null`-on-failure shape. Callers that
 *   inspected the return value must migrate to checking `result.success`.
 *   Command results are the only shape this file deliberately changed;
 *   reads preserve their legacy null-vs-empty semantics.
 *
 * DEPENDENCY POLICY:
 *   Required dependencies are checked once at load. If a canonical
 *   module is missing, the wrapper throws immediately. It does not fall
 *   through to "return ''" or "return []". A missing dependency is an
 *   application wiring failure, not a legitimate data state.
 *
 *   The eager check is intentional. This file is a global compatibility
 *   shim; it is loaded as part of the name-system bootstrap. A partial
 *   load is always a wiring bug.
 *
 * REMOVED FUNCTIONS:
 *   Functions that have no canonical equivalent are retained only as
 *   throwing stubs, so any surviving caller gets a clear, actionable
 *   error rather than a fabricated value. See section 8.
 *
 * REMOVAL PLAN:
 *   This file exists to give old callers a migration path. Each export
 *   carries a @deprecated note. The intended lifecycle is:
 *     1. Grep for callers, definitions, and aliases.
 *     2. Migrate them to the canonical API.
 *     3. Delete the corresponding wrapper.
 *   Nothing here should become a permanent API.
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
    //
    // The old API exposed separate functions for family / patronymic /
    // chain generation. The canonical API has one entry point
    // (NameRules.generateSurnameFromRules) that dispatches on rule type.
    //
    // These adapters reconstruct the appropriate outer rule shell and
    // delegate. They do NOT fill in missing sub-fields; validation of
    // the constructed rule is NameRules' job.

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a FAMILY
     * rule instead.
     *
     * Legacy signature: (father, mother, rules)
     * rules is the family sub-object:
     *   { source, order, count, position, connector, customConnector }
     *
     * If `rules` is missing or invalid, NameRules.validateRules rejects
     * it and generateSurnameFromRules throws. The adapter does not
     * substitute a default.
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
     * rules is the patronymic sub-object.
     *
     * If `rules.source` is missing or invalid, validation rejects it.
     * The adapter does not default to 'father'.
     */
    function generatePatronymicSurnameFromRules(parent, childGender, rules) {
        var rule = {
            type: window.NameRules.RULE_TYPES.PATRONYMIC,
            patronymic: rules
        };
        // The canonical signature is (mother, father, childGender, rule).
        // The legacy signature carried a single `parent`; place it in
        // the slot the rule's `source` names. If source is invalid or
        // missing, validation fails before the slot matters.
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
     * rules is the chain sub-object:
     *   { order, source, connector, customConnector }
     * `order` is a complete, ordered list of absolute ancestor slots.
     * There is no `depth`; `order.length` is the depth.
     *
     * The canonical chain rule walks from the father when present,
     * otherwise the mother. The legacy adapter passes the given
     * character as the father slot so the walk begins from it.
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
     * legacy and canonical signatures are compatible; this alias exists
     * only so the old global name still resolves.
     */
    function generateSurnameFromRules(mother, father, childGender, rules) {
        return window.NameRules.generateSurnameFromRules(mother, father, childGender, rules);
    }

    /**
     * @deprecated Use NameRules.determineNewbornSurname instead. The
     * legacy and canonical signatures are compatible.
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
     * @deprecated Use NameQueries.getAncestorData(character, slot)
     * .firstName instead. The two-argument signature is unchanged.
     */
    function getAncestorFirstName(character, slot) {
        var data = window.NameQueries.getAncestorData(character, slot);
        return data ? data.firstName : '';
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
    //
    // These preserve the old signature (a character object) by delegating
    // to the canonical ID-based query. `getBirthSurname` preserves the
    // old empty-string-on-missing contract; the canonical query returns
    // null and that distinction is meaningful, so the coercion is
    // documented here rather than silently applied.

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
    // old signature and return the new result shape.

    /**
     * @deprecated Use NameCommands.recordSurnameChange(characterId,
     * newSurname, year, reason, options) instead. Return shape is
     * { success, reason, change }.
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
     * birthSurname) instead. Return shape is
     * { success, reason, history }.
     */
    function recordBirthSurname(character, birthSurname) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        return window.NameCommands.recordBirthSurname(character.id, birthSurname);
    }

    /**
     * @deprecated Use NameCommands.revertLastSurnameChange(characterId)
     * instead. Return shape is
     * { success, reason, revertedChange, restoredSurname }.
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
     * rule) instead. This is policy, not orchestration; it lives in
     * NameRules now.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 7. REMOVED FUNCTIONS
    // =========================================================================
    //
    // These functions existed in the old wrapper but have no canonical
    // replacement, either because the canonical module stopped exposing
    // the information or because the function was never domain-correct.
    // Each throws a clear, actionable error. None returns a fabricated
    // value.

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * The old implementation returned a hardcoded 'wife_takes_husband'
     * for every country, ignoring its countryId argument. Country-
     * specific marriage rules, if they exist, belong in a marriage or
     * relationship policy module, not in the name system.
     *
     * Callers must decide the rule explicitly and pass it to
     * NameCommands.applyMarriageSurnames.
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
     * The old implementation returned [] unconditionally, which made a
     * "no ancestors found" result indistinguishable from a broken call.
     * Callers should use NameQueries.getAncestorNames(character, order,
     * source), which does real traversal and returns [] only when there
     * genuinely are no resolvable ancestors.
     *
     * Note: the canonical signature dropped the `depth` parameter. The
     * length of `order` is the depth.
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
     * The old implementation returned the raw connector value for a
     * connector type, with a ' ' fallback for unknown types. Invalid
     * connector types are now rejected during rule validation, and
     * valid connector resolution is internal to NameRules.
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
     * The old implementation split a surname string. That operation is
     * now a private helper inside NameRules, exercised through the
     * FAMILY rule's `position` option. Callers who need to split a
     * surname should do so directly or use NameRules via
     * generateSurnameFromRules.
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
     * The old implementation extracted a surname part. Same reasoning
     * as _splitSurname.
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
     * fields (surname: '', gender: 'unknown', characterId: null) to
     * reconstruct a shape the canonical query no longer produces.
     * Reconstructing domain facts from a names array is not possible in
     * the general case.
     *
     * Use NameQueries.getAncestorData(character, slot) for one slot's
     * record, or NameQueries.getAncestorNames(character, order, source)
     * for a resolved list of names.
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
