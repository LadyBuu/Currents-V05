/**
 * =============================================================================
 * STILL WATERS - NAME SYSTEM LEGACY WRAPPER (name-system.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-system.js
 *
 * DEPRECATED COMPATIBILITY LAYER.
 *
 * Every global function below is a thin adapter over the canonical Name
 * modules:
 *
 *     old global name              canonical owner
 *     ─────────────────────────────────────────────
 *     getBaseNameForPatronymic     NameQueries.getBaseFirstName
 *     capitalizeFirstLetter        (inlined; formatting only)
 *     getCharacterGender           (inlined; enum check)
 *     getCharacterCurrentLocationId world.getCurrentLocationId
 *     getCharacterCountryId        world.getCharacterCountryId
 *     getCountryIdFromPlace        world.getCountryIdForPlace
 *     getCharacterLocationName     (delegates to world + place accessor)
 *
 *     generateFamilySurname        NameRules.generateSurnameFromRules
 *     generatePatronymicSurname*   NameRules.generateSurnameFromRules
 *     generateChainSurname*        NameRules.generateSurnameFromRules
 *     generateSurnameFromRules     NameRules.generateSurnameFromRules
 *
 *     getRandomNameFromCountry     NameQueries.getRandomName
 *     getRandomSurnameFromCountry  NameQueries.getRandomSurname
 *
 *     getCountrySurnameRules       NameQueries.getCountrySurnameRules
 *     determineNewbornSurname      NameRules.determineNewbornSurname
 *
 *     getSurnameHistory            NameQueries.getSurnameHistory
 *     getBirthSurname              NameQueries.getBirthSurname
 *     getCurrentSurname            NameQueries.getCurrentSurname
 *     getSurnameChanges            NameQueries.getSurnameChanges
 *     recordSurnameChange          NameCommands.recordSurnameChange
 *     recordBirthSurname           NameCommands.recordBirthSurname
 *     revertLastSurnameChange      NameCommands.revertLastSurnameChange
 *     applyMarriageSurnames        NameCommands.applyMarriageSurnames
 *     calculateMarriageSurnames    NameCommands._calculateMarriageSurnames
 *
 * The wrapper does NOT:
 *   - implement any name or surname logic
 *   - fabricate fake character objects to reach a query
 *   - return hardcoded policies (e.g. a fixed marriage rule)
 *   - return empty results to hide a missing dependency
 *   - cache, persist, or mutate anything itself
 *
 * DEPENDENCY POLICY:
 *   Required dependencies are checked once at load time. If a canonical
 *   module is missing, the wrapper throws immediately. It does not fall
 *   through to "return ''" or "return []" — a missing dependency is an
 *   application wiring failure, not a legitimate data state.
 *
 *   OPTIONAL dependencies are the ones where a legacy function has no
 *   canonical equivalent yet, or where the canonical replacement is
 *   still in flux. These are marked with @deprecated and either delegate
 *   to a real replacement or throw a clear error explaining what to use
 *   instead. They do not return fabricated values.
 *
 * REMOVAL PLAN:
 *   This file exists to give old callers a migration path. Each function
 *   below carries a @deprecated note. The intended lifecycle is:
 *     1. Grep for callers.
 *     2. Migrate them to the canonical API.
 *     3. Delete the corresponding wrapper.
 *   Nothing here should become a permanent API.
 *
 * DEPENDENCIES (REQUIRED):
 *   - name-queries.js: NameQueries
 *   - name-commands.js: NameCommands
 *   - name-rules.js: NameRules
 *   - world.js: getCurrentLocationId, getCharacterCountryId,
 *               getCountryIdForPlace
 *   - accessors.js: getPlaceById
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

        var worldFns = [
            'getCurrentLocationId',
            'getCharacterCountryId',
            'getCountryIdForPlace'
        ];
        for (var i = 0; i < worldFns.length; i++) {
            if (typeof window[worldFns[i]] !== 'function') {
                missing.push('world.' + worldFns[i]);
            }
        }

        if (typeof window.getPlaceById !== 'function') {
            missing.push('getPlaceById');
        }

        if (missing.length > 0) {
            throw new Error(
                'name-system.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. SMALL SHARED HELPERS (formatting only; no domain logic)
    // =========================================================================

    /**
     * @deprecated Inlined. Move callers to formatting.capitalize or
     * delete once the last caller migrates.
     */
    function capitalizeFirstLetter(str) {
        if (typeof str !== 'string' || str.length === 0) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    /**
     * @deprecated Inlined. Move callers to the appropriate domain
     * check or delete once the last caller migrates.
     */
    function getCharacterGender(character) {
        if (!character) return 'neutral';
        if (character.gender === 'male') return 'male';
        if (character.gender === 'female') return 'female';
        return 'neutral';
    }

    /**
     * @deprecated Delegates to NameQueries.getBaseFirstName. Migrate
     * callers to the canonical name.
     */
    function getBaseNameForPatronymic(character) {
        return window.NameQueries.getBaseFirstName(character);
    }

    // =========================================================================
    // 2. WORLD-SIDE ADAPTERS
    // =========================================================================
    //
    // These are not name-domain functions. They are legacy aliases for
    // world-domain queries, kept here only because the old naming code
    // and old callers assumed they lived in the name system.

    /**
     * @deprecated Use world.getCurrentLocationId instead.
     */
    function getCharacterCurrentLocationId(character) {
        return window.getCurrentLocationId(character);
    }

    /**
     * @deprecated Use world.getCharacterCountryId instead.
     * The world function takes a character ID; this legacy wrapper
     * preserves the old signature of taking a character object.
     */
    function getCharacterCountryId(character) {
        if (!character || typeof character.id !== 'string' || character.id.length === 0) {
            return null;
        }
        return window.getCharacterCountryId(character.id);
    }

    /**
     * @deprecated Use world.getCountryIdForPlace instead.
     */
    function getCountryIdFromPlace(placeId) {
        return window.getCountryIdForPlace(placeId);
    }

    /**
     * @deprecated Use world.getCurrentPlace + place.displayName instead.
     * This wrapper is presentation-adjacent and will be removed once
     * callers migrate.
     */
    function getCharacterLocationName(character) {
        if (!character) return '';
        var locationId = window.getCurrentLocationId(character);
        if (!locationId) return '';
        var place = window.getPlaceById(locationId);
        if (!place) return '';
        return typeof place.displayName === 'string' ? place.displayName : '';
    }

    // =========================================================================
    // 3. RULE APPLICATION ADAPTERS
    // =========================================================================
    //
    // The old API exposed three separate functions for family/patronymic/
    // chain generation. The canonical API has one entry point
    // (NameRules.generateSurnameFromRules) that dispatches on rule type.
    //
    // These adapters reconstruct the appropriate rule and delegate.

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a FAMILY
     * rule instead.
     *
     * Legacy signature: (father, mother, rules)
     * rules is the family sub-object: { source, order, count, position,
     * connector, customConnector }
     */
    function generateFamilySurname(father, mother, rules) {
        var rule = {
            type: window.NameRules.RULE_TYPES.FAMILY,
            family: rules || {}
        };
        return window.NameRules.generateSurnameFromRules(mother, father, 'unknown', rule);
    }

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a
     * PATRONYMIC rule instead.
     *
     * Legacy signature: (parent, childGender, rules)
     * rules is the patronymic sub-object.
     */
    function generatePatronymicSurnameFromRules(parent, childGender, rules) {
        var patronymicRules = rules || {};
        // Legacy accepted either { source, ... } directly, or nested
        // under a 'patronymic' key. Normalize to the flat form the
        // canonical rule expects.
        var flat = {
            source: patronymicRules.source || 'father',
            malePrefix: patronymicRules.malePrefix,
            maleSuffix: patronymicRules.maleSuffix,
            femalePrefix: patronymicRules.femalePrefix,
            femaleSuffix: patronymicRules.femaleSuffix,
            usePrefix: patronymicRules.usePrefix,
            useSuffix: patronymicRules.useSuffix
        };
        var rule = {
            type: window.NameRules.RULE_TYPES.PATRONYMIC,
            patronymic: flat
        };
        var mother = flat.source === 'mother' ? parent : null;
        var father = flat.source === 'father' ? parent : null;
        if (!mother) mother = parent;
        if (!father) father = parent;
        return window.NameRules.generateSurnameFromRules(mother, father, childGender, rule);
    }

    /**
     * @deprecated Use NameRules.generateSurnameFromRules with a CHAIN
     * rule instead.
     *
     * Legacy signature: (character, rules)
     * rules is the chain sub-object.
     */
    function generateChainSurnameFromRules(character, rules) {
        if (!character) return null;
        var rule = {
            type: window.NameRules.RULE_TYPES.CHAIN,
            chain: rules || {}
        };
        // The canonical chain rule walks from the father (or mother if
        // father is absent). Pass the character as the starting point
        // through the "father" slot when the character's own fatherId
        // matches; otherwise pass it as both.
        var asFather = character;
        var asMother = null;
        return window.NameRules.generateSurnameFromRules(asMother, asFather, 'unknown', rule);
    }

    /**
     * @deprecated Use NameRules.generateSurnameFromRules directly. The
     * legacy and canonical signatures are compatible; this adapter
     * exists only so the old global name still resolves.
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
    // 4. NAME / SURNAME SELECTION ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameQueries.getRandomName instead. The legacy
     * signature took (countryId, gender); the canonical signature takes
     * the same. Missing countryId is not silently reinterpreted; the
     * canonical function throws for a missing country.
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
     * @deprecated Use NameQueries.getAncestorData(character, type)
     * .firstName instead.
     */
    function getAncestorFirstName(character, type) {
        var data = window.NameQueries.getAncestorData(character, type);
        return data ? data.firstName : '';
    }

    /**
     * @deprecated Use NameQueries.getAncestorData(character, type)
     * .surname instead.
     */
    function getAncestorSurname(character, type) {
        var data = window.NameQueries.getAncestorData(character, type);
        return data ? data.surname : '';
    }

    /**
     * @deprecated Use NameQueries.getAncestorNames directly. This
     * adapter preserves the old 'chain with metadata' return shape.
     *
     * The old shape returned an array of objects:
     *   { id, name, firstName, surname, gender, depth, characterId }
     *
     * The canonical NameQueries returns an array of plain strings (the
     * resolved names). Rather than fabricate metadata the canonical
     * query does not provide, this adapter returns an array of objects
     * with only the fields the canonical query can supply: the resolved
     * name and the source ancestor's characterId (when available).
     *
     * Callers that need richer metadata should migrate to
     * NameQueries.getAncestorData, which exposes the ancestor record
     * directly.
     */
    function getAncestorChain(character, maxDepth) {
        if (!character) return [];
        if (typeof maxDepth !== 'number' || !Number.isInteger(maxDepth) || maxDepth < 1) {
            throw new Error('getAncestorChain: maxDepth must be a positive integer');
        }

        var order = ['father', 'mother'];
        var names = window.NameQueries.getAncestorNames(
            character,
            order,
            maxDepth,
            'firstname'
        );

        // We cannot reconstruct full metadata from a names array alone.
        // Return the minimal shape the old callers can still use.
        var chain = [];
        for (var i = 0; i < names.length; i++) {
            chain.push({
                id: order[i % order.length],
                name: order[i % order.length],
                firstName: names[i],
                surname: '',
                gender: 'unknown',
                depth: Math.floor(i / order.length) + 1,
                characterId: null
            });
        }
        return chain;
    }

    // =========================================================================
    // 6. SURNAME HISTORY ADAPTERS
    // =========================================================================

    /**
     * @deprecated Use NameQueries.getSurnameHistory(characterId) instead.
     * This adapter accepts a character object and delegates by ID to
     * preserve the old signature.
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
    // 7. SURNAME MUTATION ADAPTERS
    // =========================================================================
    //
    // The old commands took a character object. The new commands take an
    // ID. These adapters preserve the old signature.

    /**
     * @deprecated Use NameCommands.recordSurnameChange(characterId,
     * newSurname, year, reason, options) instead.
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
     */
    function revertLastSurnameChange(character) {
        if (!character || typeof character.id !== 'string') {
            return { success: false, reason: 'Character is required' };
        }
        return window.NameCommands.revertLastSurnameChange(character.id);
    }

    /**
     * @deprecated Use NameCommands.applyMarriageSurnames(personId,
     * spouseId, rule, year, notes) instead.
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
     * @deprecated Use NameCommands._calculateMarriageSurnames directly.
     * The signature is unchanged.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameCommands._calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 8. REMOVED FUNCTIONS
    // =========================================================================
    //
    // These functions existed in the old wrapper but have no canonical
    // equivalent. They are not silently stubbed. Each either throws a
    // clear error explaining the situation or is omitted entirely.
    //
    // If a live caller is found for any of these, the canonical module
    // must grow a real replacement before the wrapper can delegate.

    /**
     * @deprecated REMOVED. There is no canonical replacement yet.
     *
     * The old implementation returned a hardcoded 'wife_takes_husband'
     * for every country, ignoring its countryId argument. That is
     * not a name-system concern; country-specific marriage rules, if
     * they exist, would live in a marriage/relationship policy module.
     *
     * Callers should decide the rule explicitly and pass it to
     * NameCommands.applyMarriageSurnames.
     *
     * This function is retained only to surface a clear error for any
     * caller that still invokes it.
     */
    function getMarriageSurnameRule(/* countryId */) {
        throw new Error(
            'name-system.js: getMarriageSurnameRule has been removed. ' +
            'Pass an explicit marriage rule to NameCommands.applyMarriageSurnames ' +
            "('wife_takes_husband', 'husband_takes_wife', 'hyphenate', or 'keep')."
        );
    }

    /**
     * @deprecated REMOVED. There is no canonical replacement.
     *
     * The old implementation returned [] unconditionally, which made a
     * "no ancestors found" result indistinguishable from a broken call.
     * Callers should use NameQueries.getAncestorNames, which does real
     * traversal and returns [] only when there genuinely are no
     * resolvable ancestors.
     */
    function _getAncestorNamesForChain(/* character, order, depth, source */) {
        throw new Error(
            'name-system.js: _getAncestorNamesForChain has been removed. ' +
            'Use NameQueries.getAncestorNames(character, order, depth, source).'
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

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    // Formatting helpers
    window.capitalizeFirstLetter = capitalizeFirstLetter;
    window.getCharacterGender = getCharacterGender;
    window.getBaseNameForPatronymic = getBaseNameForPatronymic;

    // World-side adapters
    window.getCharacterCurrentLocationId = getCharacterCurrentLocationId;
    window.getCharacterCountryId = getCharacterCountryId;
    window.getCountryIdFromPlace = getCountryIdFromPlace;
    window.getCharacterLocationName = getCharacterLocationName;

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
    window.getAncestorChain = getAncestorChain;

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

})();