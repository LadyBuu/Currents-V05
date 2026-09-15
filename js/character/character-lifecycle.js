/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE (js/character/character-lifecycle.js)
 * =============================================================================
 *
 * Lifecycle semantics for characters: aging, mortality, death transition,
 * and the domain consequences of death.
 *
 * SCOPE:
 *   - Age and life stage queries (getLifeStage, getAgeGroup, isElderly)
 *   - Death cause selection
 *   - The canonical death transition (killCharacter)
 *   - Age-based mortality rolls (applyAgingMortality)
 *   - Death event wrappers (triggerNaturalDeath, triggerAccidentalDeath)
 *   - Orchestration of death consequences:
 *       · relationship termination (delegated)
 *       · rank deprecation (delegated)
 *       · household succession (delegated)
 *   - Pending-succession detection (delegated)
 *
 * OUT OF SCOPE:
 *   - Character CRUD → CharacterCommands
 *   - Random character generation → character-generator.js
 *   - Family graph reads → FamilyAccessors
 *   - Family graph mutations → FamilyCommands
 *   - Sucession policy → succession-queries.js / succession-commands.js
 *   - Relationship semantics → relationship-queries.js / relationship-commands.js
 *   - Rank deprecation policy → rank-commands.js
 *   - Constants → constants.js
 *   - Persistence → storage.js
 *   - UI → caller
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) optional arguments use documented defaults.
 *   - Invalid explicit arguments are rejected. No silent clamping.
 *   - Year 0 is preserved.
 *   - Invalid ages return null for queries; they never become 'Ancient'
 *     or '91+'.
 *   - All randomness flows through randomness.js. No direct Math.random.
 *   - killCharacter is the SINGLE canonical death transition. All death
 *     paths (natural, accidental, aging mortality) funnel through it.
 *   - killCharacter commits once: one markDataDirty, one characterChanged
 *     event, one death event log entry.
 *   - killCharacter emits exactly one event describing the death.
 *   - Lifecycle does not mutate relationship, rank, or household state
 *     directly. It dispatches to the domains that own those mutations.
 *
 * CALLBACK CONTRACT:
 *   killCharacter calls into:
 *     - RelationshipCommands (optional) to end active relationships
 *     - RankCommands (optional) to deprecate death-sensitive rank
 *       assignments
 *     - SuccessionCommands (optional) to transfer households
 *   Each is called only if the module exists. Their absence is not a
 *   failure; it means that domain is not participating in lifecycle.
 *
 * DEPENDENCIES (REQUIRED):
 *   - time.js:                 getCurrentYear, isValidYear, calculateAge
 *   - randomness.js:           random, chance, pickRandom, pickWeighted
 *   - accessors.js:            getCharacterById, getCharacters, getRankById,
 *                              getRoles
 *   - storage.js:              markDataDirty, masterData
 *   - constants.js:            AGE_GROUPS, LIFE_STAGES, DEATH_CAUSES
 *
 * DEPENDENCIES (OPTIONAL, called only if present):
 *   - relationship-commands.js (RelationshipCommands)
 *   - rank-commands.js         (RankCommands)
 *   - succession-commands.js   (SuccessionCommands)
 *   - succession-queries.js    (SuccessionQueries)
 *   - event-log.js             (logEvent)
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
        var required = [
            'getCurrentYear',
            'isValidYear',
            'calculateAge',
            'random',
            'chance',
            'pickRandom',
            'getCharacterById',
            'getCharacters',
            'getRankById',
            'markDataDirty',
            'masterData'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-lifecycle.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }

        // Constants
        if (typeof window.AGE_GROUPS === 'undefined') {
            throw new Error('character-lifecycle.js: constants.js must define AGE_GROUPS');
        }
        if (typeof window.LIFE_STAGES === 'undefined') {
            throw new Error('character-lifecycle.js: constants.js must define LIFE_STAGES');
        }
        if (typeof window.DEATH_CAUSES === 'undefined') {
            throw new Error('character-lifecycle.js: constants.js must define DEATH_CAUSES');
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    var _mutationLocked = false;

    function _acquireLock() {
        if (_mutationLocked) return false;
        _mutationLocked = true;
        return true;
    }

    function _releaseLock() {
        _mutationLocked = false;
    }

    function _alreadyProcessing() {
        return { success: false, reason: 'Another lifecycle mutation is in progress' };
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * Resolves a year argument, falling back to the current year when
     * missing. Year 0 is preserved.
     */
    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    /**
     * Validates a year argument. Returns { ok, value?, reason? }.
     */
    function _validateYear(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!window.isValidYear(value)) {
            return { ok: false, reason: name + ' must be a valid world year' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates a non-negative integer argument.
     */
    function _validateNonNegativeInteger(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'number' || !Number.isFinite(value)
            || !Number.isInteger(value) || value < 0) {
            return { ok: false, reason: name + ' must be a non-negative integer' };
        }
        return { ok: true, value: value };
    }

    /**
     * Emits one characterChanged event.
     */
    function _emitCharacterChanged(action, characterIds) {
        window.markDataDirty();
        window.dispatchEvent(new CustomEvent('characterChanged', {
            detail: { action: action, characterIds: characterIds || [] }
        }));
    }

    /**
     * Emits one lifecycle event. Callers use this for death notifications.
     */
    function _emitLifecycleEvent(type, payload) {
        window.dispatchEvent(new CustomEvent('lifecycleEvent', {
            detail: { type: type, payload: payload || {} }
        }));
    }

    /**
     * Logs an event via event-log.js if loaded. No-op otherwise.
     */
    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 3. AGE AND LIFE STAGE QUERIES
    // =========================================================================

    /**
     * Resolves an age from a character object or a numeric age.
     * Returns null for missing or invalid input.
     */
    function _resolveAge(charOrAge) {
        if (charOrAge === null || charOrAge === undefined) return null;

        if (typeof charOrAge === 'object') {
            if (!window.isValidYear(charOrAge.birthYear)) return null;

            if (charOrAge.isDeceased === true && window.isValidYear(charOrAge.deathYear)) {
                return charOrAge.deathYear - charOrAge.birthYear;
            }
            var currentYear = window.getCurrentYear();
            var age = currentYear - charOrAge.birthYear;
            return age >= 0 ? age : null;
        }

        if (typeof charOrAge === 'number' && Number.isFinite(charOrAge)
            && Number.isInteger(charOrAge) && charOrAge >= 0) {
            return charOrAge;
        }

        return null;
    }

    /**
     * Returns the life stage for a character or age.
     *
     * Invalid age or character returns null. Never falls back to ANCIENT.
     *
     * @param {Object|number} charOrAge
     * @returns {{ key, name, min, max, group }|null}
     */
    function getLifeStage(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var stages = window.LIFE_STAGES;
        var keys = Object.keys(stages);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var stage = stages[key];
            if (age >= stage.min && age <= stage.max) {
                return {
                    key: key,
                    name: stage.name,
                    min: stage.min,
                    max: stage.max,
                    group: stage.group
                };
            }
        }
        return null;
    }

    /**
     * Returns the life stage name for a character or age, or null.
     */
    function getLifeStageName(charOrAge) {
        var stage = getLifeStage(charOrAge);
        return stage ? stage.name : null;
    }

    /**
     * Returns the age group string for a character or age, or null.
     *
     * @param {Object|number} charOrAge
     * @returns {string|null}
     */
    function getAgeGroup(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var groups = window.AGE_GROUPS;
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0], 10);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1], 10);
            if (age >= min && age <= max) {
                return groups[i];
            }
        }
        return null;
    }

    /**
     * Returns all age groups in order.
     */
    function getAllAgeGroups() {
        return window.AGE_GROUPS.slice();
    }

    /**
     * Returns the index of an age group within the canonical list, or -1.
     */
    function getAgeGroupIndex(group) {
        if (typeof group !== 'string') return -1;
        return window.AGE_GROUPS.indexOf(group);
    }

    /**
     * True if a character or age is elderly (60 or above).
     *
     * @returns {boolean|null} null for invalid input.
     */
    function isElderly(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;
        return age >= 60;
    }

    /**
     * Groups characters by age group.
     *
     * @param {Array} characters
     * @param {boolean} [excludeDeceased] - default true
     * @returns {Object<string, Array>}
     */
    function groupCharactersByAgeGroup(characters, excludeDeceased) {
        if (!Array.isArray(characters)) return {};
        excludeDeceased = excludeDeceased !== false;

        var groups = {};
        var ageGroups = window.AGE_GROUPS;
        for (var i = 0; i < ageGroups.length; i++) {
            groups[ageGroups[i]] = [];
        }

        for (var j = 0; j < characters.length; j++) {
            var char = characters[j];
            if (!char) continue;
            if (excludeDeceased && char.isDeceased === true) continue;

            // Use the character's own age: current age for living, age at
            // death for deceased (when they are included).
            var age = _resolveAge(char);
            if (age === null) continue;

            var group = getAgeGroup(age);
            if (group && groups[group]) {
                groups[group].push(char);
            }
        }

        // Sort each group by age ascending.
        for (var k = 0; k < ageGroups.length; k++) {
            var g = ageGroups[k];
            groups[g].sort(function(a, b) {
                var ageA = _resolveAge(a);
                var ageB = _resolveAge(b);
                var aValid = ageA !== null;
                var bValid = ageB !== null;
                if (!aValid && !bValid) return 0;
                if (!aValid) return 1;
                if (!bValid) return -1;
                return ageA - ageB;
            });
        }

        return groups;
    }

    // =========================================================================
    // 4. DEATH CAUSE SELECTION
    // =========================================================================

    /**
     * Returns an eligible death cause entry, or null.
     *
     * Age and gender are used to filter causes. Weighted selection uses
     * randomness.js.
     */
    function getRandomDeathCause(age, gender) {
        if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
            return null;
        }

        var allCauses = window.DEATH_CAUSES;
        var eligible = [];

        for (var i = 0; i < allCauses.length; i++) {
            var cause = allCauses[i];
            if (!cause) continue;

            if (!_isMissing(cause.minAge) && age < cause.minAge) continue;
            if (!_isMissing(cause.maxAge) && age > cause.maxAge) continue;
            if (cause.text === 'Childbed fever' && gender !== 'female') continue;

            if (typeof cause.weight !== 'number' || !Number.isFinite(cause.weight)
                || cause.weight <= 0) {
                continue;
            }

            eligible.push(cause);
        }

        if (eligible.length === 0) {
            return 'Natural causes';
        }

        // Weighted selection through randomness.js.
        var chosen;
        if (typeof window.pickWeighted === 'function') {
            chosen = window.pickWeighted(eligible, function(c) { return c.weight; });
        } else {
            // Fallback within randomness.js: still uses window.random().
            var total = 0;
            for (var j = 0; j < eligible.length; j++) total += eligible[j].weight;
            var roll = window.random() * total;
            var accumulated = 0;
            for (var k = 0; k < eligible.length; k++) {
                accumulated += eligible[k].weight;
                if (roll <= accumulated) { chosen = eligible[k]; break; }
            }
            if (!chosen) chosen = eligible[eligible.length - 1];
        }

        return chosen ? chosen.text : 'Natural causes';
    }

    // =========================================================================
    // 5. DEATH TRANSITION (CANONICAL)
    // =========================================================================
    //
    // killCharacter is the single canonical death transition. Every death
    // path funnels through it. It is the only function that writes
    // isDeceased, deathYear, and deathCause.

    /**
     * Marks a character as deceased and processes all domain consequences.
     *
     * Consequences are dispatched to their owning domains. Each domain
     * mutation is optional; if a domain module isn't loaded, that
     * consequence is skipped.
     *
     * @param {string|Object} characterOrId
     * @param {number} [deathYear]
     * @param {string} [deathCause]
     * @param {Object} [options]
     * @returns {{
     *   success: boolean,
     *   character?: Object,
     *   deathYear?: number,
     *   deathCause?: string,
     *   consequences?: Object,
     *   reason?: string
     * }}
     */
    function killCharacter(characterOrId, deathYear, deathCause, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            // Resolve character
            var character;
            if (typeof characterOrId === 'string') {
                character = window.getCharacterById(characterOrId);
            } else if (characterOrId && typeof characterOrId === 'object') {
                character = window.getCharacterById(characterOrId.id);
            }
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            if (character.isDeceased === true) {
                return { success: false, reason: 'Character is already deceased' };
            }

            // Validate year and cause
            var yearResult = _validateYear(deathYear, 'deathYear');
            if (!yearResult.ok) return { success: false, reason: yearResult.reason };

            var finalDeathYear = _resolveYear(yearResult.value);
            var finalDeathCause = _isMissing(deathCause) || typeof deathCause !== 'string'
                ? 'Unknown'
                : deathCause;

            // Apply the canonical death transition.
            character.isDeceased = true;
            character.deathYear = finalDeathYear;
            character.deathCause = finalDeathCause;
            character.updatedAt = Date.now();

            if (!_isMissing(options.notes)) {
                character.deathNotes = options.notes;
            }

            // Dispatch domain consequences. Each domain owns its own
            // mutation. If a domain module isn't loaded, that consequence
            // is skipped.
            var consequences = {
                relationships: _dispatchRelationshipTermination(character, finalDeathYear),
                ranks: _dispatchRankDeprecation(character),
                succession: options.skipSuccession === true
                    ? { applied: false, reason: 'skipped by caller' }
                    : _dispatchSuccession(character)
            };

            // Commit once.
            _emitCharacterChanged('death', [character.id]);

            // Emit the lifecycle event describing the death.
            _emitLifecycleEvent('characterDied', {
                characterId: character.id,
                deathYear: finalDeathYear,
                deathCause: finalDeathCause
            });

            // Log once.
            _logEvent('death', 'Death',
                character.name + ' died of ' + finalDeathCause.toLowerCase()
                    + ' in ' + finalDeathYear,
                [character]);

            return {
                success: true,
                character: character,
                deathYear: finalDeathYear,
                deathCause: finalDeathCause,
                consequences: consequences
            };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Kills a character, selecting a random cause appropriate to their age
     * and gender.
     */
    function killCharacterRandomCause(characterOrId, deathYear) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var character;
            if (typeof characterOrId === 'string') {
                character = window.getCharacterById(characterOrId);
            } else if (characterOrId && typeof characterOrId === 'object') {
                character = window.getCharacterById(characterOrId.id);
            }
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            var age = _resolveAge(character);
            if (age === null) {
                return { success: false, reason: 'Character has no determinable age' };
            }

            var cause = getRandomDeathCause(age, character.gender);
            if (!cause) {
                return { success: false, reason: 'No eligible death cause' };
            }

            // Release the lock before calling killCharacter, since
            // killCharacter acquires it itself.
            _releaseLock();
            return killCharacter(character.id, deathYear, cause);
        } catch (e) {
            _releaseLock();
            throw e;
        }
    }

    // =========================================================================
    // 6. CONSEQUENCE DISPATCH
    // =========================================================================

    /**
     * Asks RelationshipCommands to end a character's active relationships.
     * Returns a result summary. Does not fail the death transition if the
     * module is absent.
     */
    function _dispatchRelationshipTermination(character, deathYear) {
        if (typeof window.RelationshipCommands === 'undefined') {
            return { applied: false, reason: 'relationship-commands.js not loaded' };
        }
        if (typeof window.RelationshipCommands.endAllActiveForCharacter !== 'function') {
            return { applied: false, reason: 'endAllActiveForCharacter not available' };
        }

        var result = window.RelationshipCommands.endAllActiveForCharacter(
            character.id,
            { year: deathYear, reason: 'death' }
        );
        if (result && result.success) {
            return { applied: true, affected: result.affected || 0 };
        }
        return { applied: false, reason: result ? result.reason : 'unknown failure' };
    }

    /**
     * Asks RankCommands to deprecate a character's death-sensitive rank
     * assignments.
     */
    function _dispatchRankDeprecation(character) {
        if (typeof window.RankCommands === 'undefined') {
            return { applied: false, reason: 'rank-commands.js not loaded' };
        }
        if (typeof window.RankCommands.deprecateOnDeath !== 'function') {
            return { applied: false, reason: 'deprecateOnDeath not available' };
        }

        var result = window.RankCommands.deprecateOnDeath(character.id);
        if (result && result.success) {
            return { applied: true, affected: result.affected || 0 };
        }
        return { applied: false, reason: result ? result.reason : 'unknown failure' };
    }

    /**
     * Asks SuccessionCommands to transfer households headed by the
     * deceased character.
     */
    function _dispatchSuccession(character) {
        if (typeof window.SuccessionCommands === 'undefined') {
            return { applied: false, reason: 'succession-commands.js not loaded' };
        }
        if (typeof window.SuccessionCommands.processOnDeath !== 'function') {
            return { applied: false, reason: 'processOnDeath not available' };
        }

        var result = window.SuccessionCommands.processOnDeath(character.id);
        if (result && result.success) {
            return { applied: true, transfers: result.transfers || [] };
        }
        return { applied: false, reason: result ? result.reason : 'unknown failure' };
    }

    // =========================================================================
    // 7. AGING MORTALITY
    // =========================================================================

    /**
     * Annual mortality risk by age band. These are simulation policy, not
     * generic randomness.
     *
     * The model is: annualRisk * yearsAdvanced, clamped to [0, 0.95].
     * This treats the risk as additive over the interval, which is a
     * deliberate simplification. If independent-event compounding is
     * desired, replace this model.
     */
    function _annualMortalityRisk(age) {
        if (age < 1) return 0.02;
        if (age < 5) return 0.01;
        if (age < 18) return 0.005;
        if (age < 45) return 0.01;
        if (age < 60) return 0.02;
        if (age < 75) return 0.05;
        return 0.10;
    }

    /**
     * Applies age-based mortality to a character over a given number of
     * years.
     *
     * @param {string|Object} characterOrId
     * @param {number} [yearsAdvanced] - default 1
     * @returns {{
     *   success: boolean,
     *   died?: boolean,
     *   reason?: string
     * }}
     */
    function applyAgingMortality(characterOrId, yearsAdvanced) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var char;
            if (typeof characterOrId === 'string') {
                char = window.getCharacterById(characterOrId);
            } else if (characterOrId && typeof characterOrId === 'object') {
                char = window.getCharacterById(characterOrId.id);
            }
            if (!char) {
                return { success: false, reason: 'Character not found' };
            }
            if (char.isDeceased === true) {
                return { success: false, reason: 'Character is already deceased' };
            }

            var yearsResult = _validateNonNegativeInteger(yearsAdvanced, 'yearsAdvanced');
            if (!yearsResult.ok) return { success: false, reason: yearsResult.reason };

            var years = _isMissing(yearsResult.value) ? 1 : yearsResult.value;
            if (years === 0) {
                return { success: true, died: false, reason: 'Zero years advanced' };
            }

            var age = _resolveAge(char);
            if (age === null) {
                return { success: false, reason: 'Character has no determinable age' };
            }

            var annualRisk = _annualMortalityRisk(age);
            var totalRisk = annualRisk * years;
            if (totalRisk > 0.95) totalRisk = 0.95;

            if (!window.chance(totalRisk)) {
                return { success: true, died: false };
            }

            // Character dies. Select a cause and run the transition.
            var cause = getRandomDeathCause(age, char.gender);
            var year = _resolveYear(_isMissing(char.deathYear) ? null : char.deathYear);

            // Release lock and call the canonical death transition.
            _releaseLock();
            try {
                var result = killCharacter(char.id, year, cause);
                return { success: result.success, died: result.success, reason: result.reason };
            } finally {
                _acquireLock();
            }
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 8. DEATH WRAPPERS
    // =========================================================================

    /**
     * Triggers a natural death for a character. Selects a cause from the
     * canonical DEATH_CAUSES list.
     */
    function triggerNaturalDeath(characterOrId, deathYear, options) {
        if (_isMissing(options)) options = {};

        var char;
        if (typeof characterOrId === 'string') {
            char = window.getCharacterById(characterOrId);
        } else if (characterOrId && typeof characterOrId === 'object') {
            char = window.getCharacterById(characterOrId.id);
        }
        if (!char) return { success: false, reason: 'Character not found' };

        var age = _resolveAge(char);
        if (age === null) {
            return { success: false, reason: 'Character has no determinable age' };
        }

        var cause = getRandomDeathCause(age, char.gender);
        return killCharacter(char.id, deathYear, cause, options);
    }

    /**
     * Triggers an accidental death for a character.
     */
    function triggerAccidentalDeath(characterOrId, deathYear, accidentType, options) {
        if (_isMissing(options)) options = {};

        var accidentTypes = [
            'Fell from a height', 'Drowning', 'Fire', 'Hunting accident',
            'Crushed by falling object', 'Animal attack', 'Cart accident',
            'Building collapse', 'Tools accident', 'Poisoning accident'
        ];

        var type = _isMissing(accidentType)
            ? window.pickRandom(accidentTypes)
            : accidentType;
        if (typeof type !== 'string') {
            return { success: false, reason: 'accidentType must be a string' };
        }

        var merged = Object.assign({}, options);
        merged.notes = _isMissing(options.notes)
            ? 'Accidental death: ' + type.toLowerCase()
            : options.notes;

        return killCharacter(characterOrId, deathYear, type, merged);
    }

    // =========================================================================
    // 9. LIFESPAN ESTIMATION (DETERMINISTIC)
    // =========================================================================
    //
    // predictLifespan is a DETERMINISTIC query. It does not consume RNG.
    // Two calls for the same character return the same number. This makes
    // it safe to call from UI rendering paths.
    //
    // If you need stochastic per-character lifespans that vary, use
    // generateLifespan() (which consumes RNG and is intended for
    // simulation).

    /**
     * Estimates a character's expected lifespan from their attributes.
     * Deterministic. Does NOT consume RNG.
     *
     * @param {Object} character
     * @returns {number|null}
     */
    function predictLifespan(character) {
        if (!character || typeof character !== 'object') return null;

        var base = character.gender === 'female' ? 45 : 40;

        // Rank modifier: high-priority ranks receive a small uplift.
        if (_hasId(character.activeRankId)) {
            var rank = window.getRankById(character.activeRankId);
            if (rank) {
                if (typeof rank.priority === 'number') {
                    if (rank.priority <= 2) base += 10;
                    else if (rank.priority <= 3) base += 5;
                }
            }
        }

        // Deterministic adjustment based on character identity. This
        // spreads predictions across characters without consuming RNG.
        if (_hasId(character.id)) {
            var hash = 0;
            for (var i = 0; i < character.id.length; i++) {
                hash = (hash * 31 + character.id.charCodeAt(i)) | 0;
            }
            var offset = (hash % 21) - 10; // -10..+10
            base += offset;
        }

        if (base < 1) base = 1;
        if (base > 95) base = 95;
        return base;
    }

    /**
     * Returns a character's expected remaining years.
     * Deterministic.
     *
     * @param {Object} character
     * @returns {number|null}
     */
    function getExpectedRemainingYears(character) {
        if (!character || character.isDeceased === true) return null;
        var age = _resolveAge(character);
        if (age === null) return null;
        var predicted = predictLifespan(character);
        if (predicted === null) return null;
        return Math.max(0, predicted - age);
    }

    // =========================================================================
    // 10. SUCCESSION QUERIES (DELEGATION)
    // =========================================================================

    /**
     * Returns whether a character has pending household succession.
     * Delegates to SuccessionQueries if loaded.
     *
     * @param {string} characterId
     * @returns {boolean}
     */
    function hasPendingInheritance(characterId) {
        if (typeof window.SuccessionQueries === 'undefined') return false;
        if (typeof window.SuccessionQueries.hasPending !== 'function') return false;
        return window.SuccessionQueries.hasPending(characterId) === true;
    }

    /**
     * Processes succession for a single deceased character.
     * Delegates to SuccessionCommands if loaded.
     */
    function processHouseholdInheritance(characterId) {
        if (typeof window.SuccessionCommands === 'undefined') {
            return { success: false, reason: 'succession-commands.js not loaded' };
        }
        if (typeof window.SuccessionCommands.processOnDeath !== 'function') {
            return { success: false, reason: 'processOnDeath not available' };
        }
        return window.SuccessionCommands.processOnDeath(characterId);
    }

    /**
     * Processes succession for all households with deceased heads.
     * Delegates to SuccessionCommands if loaded.
     */
    function processAllPendingInheritance() {
        if (typeof window.SuccessionCommands === 'undefined') {
            return { success: false, reason: 'succession-commands.js not loaded' };
        }
        if (typeof window.SuccessionCommands.processAllPending !== 'function') {
            return { success: false, reason: 'processAllPending not available' };
        }
        return window.SuccessionCommands.processAllPending();
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        // Age and life stage
        getLifeStage: getLifeStage,
        getLifeStageName: getLifeStageName,
        getAgeGroup: getAgeGroup,
        getAllAgeGroups: getAllAgeGroups,
        getAgeGroupIndex: getAgeGroupIndex,
        isElderly: isElderly,
        groupCharactersByAgeGroup: groupCharactersByAgeGroup,

        // Death causes
        getRandomDeathCause: getRandomDeathCause,

        // Death transition (canonical)
        killCharacter: killCharacter,
        killCharacterRandomCause: killCharacterRandomCause,

        // Mortality
        applyAgingMortality: applyAgingMortality,

        // Death wrappers
        triggerNaturalDeath: triggerNaturalDeath,
        triggerAccidentalDeath: triggerAccidentalDeath,

        // Lifespan estimation (deterministic)
        predictLifespan: predictLifespan,
        getExpectedRemainingYears: getExpectedRemainingYears,

        // Succession delegation
        hasPendingInheritance: hasPendingInheritance,
        processHouseholdInheritance: processHouseholdInheritance,
        processAllPendingInheritance: processAllPendingInheritance
    };

})();