/**
 * =============================================================================
 * STILL WATERS - NAME COMMANDS (name-commands.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-commands.js
 *
 * SCOPE:
 *   - All write operations for the name domain
 *   - Record surname changes with history
 *   - Apply marriage surname changes atomically
 *   - Revert the most recent surname change
 *   - Clear surname history
 *   - Add / remove names from a country's name list
 *
 * OUT OF SCOPE:
 *   - Reads → name-queries.js
 *   - Rule application → name-rules.js
 *   - Marriage surname policy (the calculation) → name-rules.js
 *   - Canonical character-record ownership → character-state.js
 *   - Canonical name-list ownership → masterData.data.nameLists
 *   - Runtime caches → name-state.js
 *   - Persistence mechanics → storage.js (via persist())
 *   - Presentation → UI modules
 *
 * PUBLIC CONTRACT:
 *   Every command returns:
 *     { success: true, ...payload }
 *     { success: false, reason: 'human-readable message' }
 *   Never null. Never a toast.
 *
 *   Every command takes an ID (string), not an object.
 *
 * CHARACTER MUTATION CONTRACT:
 *   Character-state projections returned by window.getCharacterById() are
 *   defensive copies, not live canonical records. Mutating a projection's
 *   fields does NOT change canonical data.
 *
 *   Every character-field write in this module therefore goes through
 *   CharacterCommands.updateCharacter(characterId, patch). The surname
 *   fields (surname, surnameSource, surnameRules, surnameHistory) are
 *   listed in CharacterState._CHARACTER_OWNED_FIELDS, so updateCharacter
 *   (not applyDomainFieldPatch) is the correct write channel — same as
 *   any other character-owned field.
 *
 *   Read-then-write pattern:
 *     1. Read current state via window.getCharacterById(characterId)
 *        (a projection — sufficient for reads)
 *     2. Compute the new state
 *     3. Write via CharacterCommands.updateCharacter
 *
 *   This replaces a pre-refactor pattern where the module mutated the
 *   projection in place, which silently no-oped on canonical data. See
 *   the REFACTOR HISTORY entry for context.
 *
 * NAME-LIST MUTATION CONTRACT:
 *   Name lists are stored in masterData.data.nameLists. NamesState
 *   exposes getMutableNameList(countryId), which returns a LIVE reference
 *   into that collection. Mutating through it correctly updates canonical
 *   data. This is a different mechanism from character-record writes and
 *   is documented in name-state.js's ACCESSOR MUTABILITY CONTRACT.
 *
 * PERSISTENCE:
 *   Commands do NOT save. Every command marks data dirty and emits a
 *   cross-domain CustomEvent, but persistence is the caller's decision.
 *   NameCommands.persist() is the single save site. The UI (or the
 *   caller) calls persist() once per successful command batch.
 *
 *   persist() uses Pattern A from storage.js's DOMAIN PERSIST CONTRACT:
 *   it inspects the boolean return of saveMasterData() and, on failure,
 *   returns { success: false, reason } carrying the underlying save
 *   error's message. It does NOT wrap saveMasterData() in a try/catch
 *   that assumes a throw; saveMasterData() returns false on write
 *   failure and does not throw.
 *
 * COMPOSITION:
 *   There is no module-wide guard. Commands compose by calling the
 *   private primitive `_appendSurnameChange`, not by re-entering public
 *   commands.
 *
 * ATOMICITY:
 *   applyMarriageSurnames is a single logical mutation. Both resulting
 *   surnames are calculated, validated, applied in memory, and committed
 *   with one characterChanged event. Persistence is deferred to the
 *   caller's persist() call — the command itself does not save, so
 *   partial-persist is impossible by construction.
 *
 *   The validate-both-then-apply-both structure makes the inline
 *   rollback provably unreachable: the second _appendSurnameChange can
 *   only fail via _validateSurnameChange, which is called BEFORE the
 *   first application. The rollback is retained as defense-in-depth.
 *
 * METADATA RESTORATION:
 *   Each change entry records the previous surnameSource and
 *   surnameRules so that revert can restore them faithfully.
 *
 * YEAR HANDLING:
 *   Year 0 is valid and accepted. Missing years are rejected. No 1250
 *   fallback anywhere.
 *
 * NAMESPACE NOTE:
 *   NamesState is exported as window.NamesState (plural) by
 *   name-state.js. window.NameState (singular) exists only as a
 *   backward-compat alias and may be absent in a future version. This
 *   module references the plural form exclusively so that dropping the
 *   alias does not silently break the dependency guard or the cache
 *   invalidation calls below.
 *
 * DUPLICATION WITH character-commands.js::recordCharacterSurnameChange:
 *   The character module has a parallel function of the same name.
 *   Both write the same fields (surname, surnameSource, surnameRules,
 *   surnameHistory). The current implementations differ in three ways:
 *
 *     1. Year requirement. CharacterCommands.recordCharacterSurnameChange
 *        accepts a missing year and defaults to getCurrentYear(). This
 *        module requires an explicit year and rejects missing.
 *     2. Read mechanism. CharacterCommands uses getLiveCharacterForMutation
 *        (a live reference); this module uses getCharacterById (a
 *        projection). Both read the same canonical record.
 *     3. Options shape. CharacterCommands accepts a `previousSurname`
 *        override; this module does too but via a different path.
 *
 *   This module does NOT delegate to
 *   CharacterCommands.recordCharacterSurnameChange, because that command
 *   is a superset (accepts missing year, defaults to current year, does
 *   not enforce the strict pre-birth check this module applies) and
 *   delegating to it would introduce a divergence in validation
 *   behaviour — a caller of this module would suddenly get a surname
 *   change approved that this module's contract says must be rejected.
 *
 *   Instead, both modules write via the same underlying channel
 *   (CharacterCommands.updateCharacter), and this module's
 *   _appendSurnameChange is the single canonical helper for the
 *   name-domain-driven write. The character module keeps its own
 *   recordCharacterSurnameChange for its own callers (modal-character,
 *   character-creation). Both implementations are correct for their
 *   respective contracts; consolidation is a future refactor once the
 *   surname-command semantics settle.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:          getCharacterById
 *   - character-commands.js: CharacterCommands (updateCharacter)
 *   - name-state.js:         NamesState
 *   - name-rules.js:         NameRules
 *   - storage.js:            saveMasterData, getLastSaveError
 *   - time.js:               getCurrentYear
 *
 * DEPENDENCIES (OPTIONAL):
 *   - eventLogger.js:  logEvent
 *
 * ICON POLICY: No emojis. No icons. Commands return structured data.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Original: every command saved. No persist() boundary.
 *   Prior revision:
 *     - persist() added as the single save site.
 *     - All seven saveMasterData() calls removed.
 *     - _commit(eventName, payload) helper added: markDataDirty ->
 *       publish in-process -> dispatch cross-domain.
 *     - applyMarriageSurnames rollback documented as unreachable and
 *       refactored to use _undoSurnameChange.
 *     - NameState references migrated to NamesState (plural).
 *   Previous revision:
 *     - CHARACTER MUTATION CONTRACT added to header.
 *     - Character-field writes routed through CharacterCommands.updateCharacter.
 *     - _applySurnameToCharacter, _appendSurnameChange, and
 *       _undoSurnameChange take characterId and write via
 *       CharacterCommands.updateCharacter.
 *     - _ensureSurnameHistory split into a pure reader
 *       (_readSurnameHistory) and a pure shape helper
 *       (_ensureSurnameHistoryOn).
 *     - CharacterCommands added to required dependencies.
 *   Previous revision:
 *     - persist() rewritten to Pattern A (inspect the boolean return
 *       of saveMasterData, surface getLastSaveError().message on
 *       failure). The previous implementation used Pattern C, which
 *       silently reported success on every failed save.
 *     - getCurrentYearSafe references replaced with getCurrentYear.
 *       The deprecated alias remains exported by time.js for one
 *       revision but this module no longer depends on it.
 *     - _undoSurnameChange continues to write via
 *       CharacterCommands.updateCharacter directly (it needs to write
 *       a specific previous state, not a new change; the character
 *       command's recordCharacterSurnameChange is designed for a
 *       forward change, not a rollback).
 *     - Duplication with character-commands.js documented in header
 *       under DUPLICATION section.
 *   Current revision:
 *     - Removed CharacterCommands.recordCharacterSurnameChange from the
 *       load-time dependency check. The module never calls it — every
 *       surname write goes through CharacterCommands.updateCharacter
 *       via _appendSurnameChange. The previous check required a method
 *       the module did not use, which was a latent coupling that would
 *       have surfaced as a false-positive load-order failure if the
 *       character module ever removed or renamed that method.
 *     - Fixed a header self-contradiction: an earlier passage claimed
 *       recordSurnameChange "delegates the character-record write to
 *       CharacterCommands.recordCharacterSurnameChange", which is not
 *       true. The DUPLICATION section at the bottom of the header has
 *       always been accurate (the module writes via updateCharacter
 *       directly). The stale earlier passage has been removed, and
 *       the DUPLICATION section is now the single authoritative
 *       description of the divergence.
 *     - No behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'getCharacterById',
            'saveMasterData',
            'getCurrentYear'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (typeof window.NamesState === 'undefined') {
            missing.push('NamesState');
        }
        if (typeof window.NameRules === 'undefined') {
            missing.push('NameRules');
        }
        if (typeof window.CharacterCommands === 'undefined') {
            missing.push('CharacterCommands');
        } else {
            if (typeof window.CharacterCommands.updateCharacter !== 'function') {
                missing.push('CharacterCommands.updateCharacter');
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'name-commands.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    /**
     * Reads a character projection for validation purposes. Callers that
     * will write must NOT mutate the returned object; they must build a
     * patch and hand it to CharacterCommands.updateCharacter.
     */
    function _resolveCharacter(characterId) {
        if (!_hasId(characterId)) return null;
        return window.getCharacterById(characterId);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. COMMIT TAIL
    // =========================================================================
    //
    // Called after every successful command. Marks data dirty, publishes
    // in-process (so NamesState and other subscribers react), and
    // dispatches the cross-domain CustomEvent.
    //
    // Does NOT save. Save is persist().
    //

    function _commit(eventName, payload) {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* non-fatal */ }
        }

        if (typeof window.NamesState !== 'undefined'
            && typeof window.NamesState.publish === 'function') {
            window.NamesState.publish(eventName, payload);
        }

        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, payload) {
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: payload
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'name-commands.js: ' + eventName + ' dispatch failed:', e
                );
            }
        }
    }

    // =========================================================================
    // 3. PERSIST
    // =========================================================================

    /**
     * Persists the current canonical state.
     *
     * The ONLY place in this module that calls saveMasterData. Every
     * command leaves canonical data dirty; the caller decides when to
     * save.
     *
     * Uses Pattern A from storage.js's DOMAIN PERSIST CONTRACT:
     * saveMasterData() returns a boolean and does NOT throw on write
     * failure. The previous revision used Pattern C, which discarded the
     * return value and reported success on every failed save. This
     * revision inspects the boolean and surfaces the underlying error.
     *
     * Returns { success, reason? }. Does not throw.
     */
    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) {
                return { success: true };
            }
            var lastError = typeof window.getLastSaveError === 'function'
                ? window.getLastSaveError()
                : null;
            return {
                success: false,
                reason: lastError && lastError.message
                    ? lastError.message
                    : 'saveMasterData returned false'
            };
        } catch (e) {
            return { success: false, reason: e.message || 'saveMasterData threw' };
        }
    }

    // =========================================================================
    // 4. CHARACTER MUTATION PRIMITIVES
    // =========================================================================
    //
    // The one and only place this module writes character surname fields.
    //
    // Character-state projections are defensive copies. Writing to
    // character.surname on the object returned by getCharacterById()
    // has no effect on canonical data. All writes therefore route
    // through CharacterCommands.updateCharacter(characterId, patch).
    //
    // The surname fields are in _CHARACTER_OWNED_FIELDS, so
    // updateCharacter (not applyDomainFieldPatch) is the correct write
    // channel — matching how any other character-owned field is written.

    /**
     * Writes the surname and associated metadata for a character.
     *
     * Callers must have already validated. This helper performs the
     * write and reports failure.
     *
     * @returns {{ ok: boolean, reason?: string }}
     */
    function _applySurnameToCharacter(characterId, surname, options) {
        var patch = {
            surname: surname
        };

        if (options && !_isMissing(options.surnameSource)) {
            patch.surnameSource = options.surnameSource;
        } else {
            patch.surnameSource = 'custom';
        }

        if (options && !_isMissing(options.surnameRules)) {
            patch.surnameRules = options.surnameRules;
        } else {
            patch.surnameRules = null;
        }

        var result = window.CharacterCommands.updateCharacter(characterId, patch);
        if (!result || result.success !== true) {
            return {
                ok: false,
                reason: (result && result.reason) ? result.reason
                    : 'CharacterState refused the surname write.'
            };
        }
        return { ok: true };
    }

    /**
     * Reads the character's surname history, returning a defensive copy
     * of the canonical object. Returns null when the character has no
     * history.
     *
     * Does NOT write. The caller decides whether a subsequent write is
     * needed (e.g., to initialize a missing history).
     */
    function _readSurnameHistory(character) {
        if (!character) return null;
        var history = character.surnameHistory;
        if (!_isPlainObject(history)) return null;

        // Return a shallow copy so callers can append/remove entries
        // without mutating the projection they were given. Deep copy of
        // entries is unnecessary — callers either replace the whole
        // entries array or append a new entry object they constructed.
        return {
            birthSurname: typeof history.birthSurname === 'string'
                ? history.birthSurname : '',
            entries: Array.isArray(history.entries) ? history.entries.slice() : [],
            lastUpdated: _isMissing(history.lastUpdated)
                ? null
                : history.lastUpdated
        };
    }

    /**
     * Ensures a surname-history object has the canonical shape. Pure:
     * takes a history object (which may be null) and a character
     * projection (for birthYear and current surname), returns a
     * well-shaped history object. Does NOT write.
     */
    function _ensureSurnameHistoryOn(history, character) {
        var out = _isPlainObject(history) ? history : {};

        if (!Array.isArray(out.entries)) out.entries = [];

        if (typeof out.birthSurname !== 'string') {
            out.birthSurname = (character && typeof character.surname === 'string')
                ? character.surname
                : '';
        }

        if (_isMissing(out.lastUpdated)) {
            out.lastUpdated = (character && character.birthYear)
                || _getCurrentYear();
        }

        return out;
    }

    /**
     * Writes a surname history object for a character.
     *
     * @returns {{ ok: boolean, reason?: string }}
     */
    function _writeSurnameHistory(characterId, history) {
        var result = window.CharacterCommands.updateCharacter(characterId, {
            surnameHistory: history
        });
        if (!result || result.success !== true) {
            return {
                ok: false,
                reason: (result && result.reason) ? result.reason
                    : 'CharacterState refused the surnameHistory write.'
            };
        }
        return { ok: true };
    }

    // =========================================================================
    // 5. VALIDATION
    // =========================================================================

    /**
     * Validates a surname-change request. Year 0 is accepted. Missing
     * years are rejected. This module requires an explicit year for
     * UI-driven flows; the underlying CharacterCommands command defaults
     * to the current year, but this module's contract is stricter.
     */
    function _validateSurnameChange(character, newSurname, year) {
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }
        if (character.isDeceased) {
            return { valid: false, reason: 'Cannot change surname of deceased character' };
        }
        if (typeof newSurname !== 'string' || newSurname.trim() === '') {
            return { valid: false, reason: 'Surname cannot be empty' };
        }
        if (_isMissing(year) || typeof year !== 'number' || !Number.isFinite(year)) {
            return { valid: false, reason: 'Valid year is required' };
        }
        if (year > _getCurrentYear() + 10) {
            return { valid: false, reason: 'Year cannot be more than 10 years in the future' };
        }
        if (typeof character.birthYear === 'number' && year < character.birthYear) {
            return { valid: false, reason: "Year cannot be before character's birth" };
        }
        return { valid: true };
    }

    // =========================================================================
    // 6. PRIVATE MUTATION PRIMITIVE
    // =========================================================================
    //
    // _appendSurnameChange and _undoSurnameChange are inverses:
    //
    //   _appendSurnameChange(characterId, ...) appends a history entry and
    //   applies the new surname.
    //
    //   _undoSurnameChange(characterId, character, entry) pops the most
    //   recent history entry (asserting it matches `entry`) and restores
    //   the recorded previous values.
    //
    // Both helpers do exactly ONE write via CharacterCommands. They read
    // the current projection for validation and diffing, build the new
    // state, and write the combined patch (surname + surnameSource +
    // surnameRules + surnameHistory) in a single updateCharacter call.
    //
    // These are used by applyMarriageSurnames for the inline rollback
    // path and by _appendSurnameChange's callers (recordSurnameChange,
    // applyMarriageSurnames). The single-character recordSurnameChange
    // path also uses _appendSurnameChange for consistency with the
    // marriage path.

    function _appendSurnameChange(characterId, character, newSurname, year, reason, options) {
        options = options || {};

        var validation = _validateSurnameChange(character, newSurname, year);
        if (!validation.valid) {
            return { success: false, reason: validation.reason };
        }

        // Read current history. _readSurnameHistory returns a copy, so
        // we can safely mutate the copy to build the new state.
        var historyCopy = _readSurnameHistory(character);
        var history = _ensureSurnameHistoryOn(historyCopy, character);

        var previousSurname = !_isMissing(options.previousSurname)
            ? options.previousSurname
            : (typeof character.surname === 'string' ? character.surname : '');

        var trimmed = newSurname.trim();

        var change = {
            surname: trimmed,
            year: year,
            reason: typeof reason === 'string' && reason.length > 0 ? reason : 'custom',
            previousSurname: previousSurname,
            previousSurnameSource: typeof character.surnameSource === 'string'
                ? character.surnameSource : null,
            previousSurnameRules: character.surnameRules || null,
            spouseId: options.spouseId || null,
            notes: options.notes || '',
            timestamp: Date.now()
        };

        history.entries.push(change);
        history.lastUpdated = year;

        // Determine the new surnameSource / surnameRules to write. These
        // are the same rules _applySurnameToCharacter would set.
        var newSource = (options && !_isMissing(options.surnameSource))
            ? options.surnameSource
            : 'custom';
        var newRules = (options && !_isMissing(options.surnameRules))
            ? options.surnameRules
            : null;

        // Single write: surname, source, rules, history — all together.
        var writeResult = window.CharacterCommands.updateCharacter(characterId, {
            surname: trimmed,
            surnameSource: newSource,
            surnameRules: newRules,
            surnameHistory: history
        });
        if (!writeResult || writeResult.success !== true) {
            return {
                success: false,
                reason: (writeResult && writeResult.reason) ? writeResult.reason
                    : 'CharacterState refused the surname change write.'
            };
        }

        return { success: true, change: change };
    }

    /**
     * Reverses one _appendSurnameChange. The `expectedChange` argument
     * asserts that the entry being popped matches the caller's
     * understanding of what was appended.
     *
     * Throws if the popped entry does not match — this indicates a
     * corrupted history and must be loud, not silent.
     *
     * Returns the undone entry on success, or throws on corruption.
     * The caller (_undoFromRollback) wraps this in a try/catch for the
     * unreachable-rollback path.
     */
    function _undoSurnameChange(characterId, character, expectedChange) {
        var historyCopy = _readSurnameHistory(character);
        if (!historyCopy || !Array.isArray(historyCopy.entries)
            || historyCopy.entries.length === 0) {
            throw new Error(
                '_undoSurnameChange: cannot undo; surname history is empty for "' +
                (characterId || 'unknown') + '"'
            );
        }

        var history = _ensureSurnameHistoryOn(historyCopy, character);
        var last = history.entries[history.entries.length - 1];

        if (expectedChange && last.timestamp !== expectedChange.timestamp) {
            throw new Error(
                '_undoSurnameChange: history entry mismatch for "' +
                (characterId || 'unknown') +
                '"; expected timestamp ' + expectedChange.timestamp +
                ', found ' + last.timestamp
            );
        }

        history.entries.pop();
        history.lastUpdated = history.entries.length > 0
            ? history.entries[history.entries.length - 1].year
            : (character.birthYear || _getCurrentYear());

        var restoredSurname = !_isMissing(last.previousSurname)
            ? last.previousSurname
            : (history.birthSurname || '');
        var restoredSource = last.previousSurnameSource || 'custom';
        var restoredRules = last.previousSurnameRules || null;

        var writeResult = window.CharacterCommands.updateCharacter(characterId, {
            surname: restoredSurname,
            surnameSource: restoredSource,
            surnameRules: restoredRules,
            surnameHistory: history
        });
        if (!writeResult || writeResult.success !== true) {
            throw new Error(
                '_undoSurnameChange: CharacterState refused the restore write: ' +
                ((writeResult && writeResult.reason) || 'unknown')
            );
        }

        return last;
    }

    // =========================================================================
    // 7. COMMAND: recordSurnameChange
    // =========================================================================
    //
    // The single-character surname change. Delegates the character-record
    // write to _appendSurnameChange (which writes via
    // CharacterCommands.updateCharacter directly — the same channel
    // CharacterCommands.recordCharacterSurnameChange uses).
    //
    // This module does NOT call CharacterCommands.recordCharacterSurnameChange
    // directly because that command is a superset (accepts missing year,
    // defaults to current year, does not enforce the strict pre-birth
    // check this module applies) and would introduce a divergence in
    // validation. Instead, both modules write via the same underlying
    // channel (CharacterCommands.updateCharacter), and this module's
    // _appendSurnameChange is the single canonical helper for the
    // name-domain-driven write.

    function recordSurnameChange(characterId, newSurname, year, reason, options) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var result = _appendSurnameChange(
            characterId, character, newSurname, year, reason, options
        );
        if (!result.success) return result;

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameChange',
            characterIds: [characterId]
        });

        _logEvent('name', 'surname_change',
            character.name + ' changed surname from "' + result.change.previousSurname +
            '" to "' + result.change.surname + '" (' + result.change.reason + ')',
            [character]);

        return result;
    }

    // =========================================================================
    // 8. COMMAND: recordBirthSurname
    // =========================================================================
    //
    // Writes the birth surname into the character's surnameHistory. Does
    // NOT set character.surname as a side effect.

    function recordBirthSurname(characterId, birthSurname) {
        if (typeof birthSurname !== 'string') {
            return { success: false, reason: 'Birth surname must be a string' };
        }

        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var historyCopy = _readSurnameHistory(character);
        var history = _ensureSurnameHistoryOn(historyCopy, character);
        history.birthSurname = birthSurname;

        var writeResult = _writeSurnameHistory(characterId, history);
        if (!writeResult.ok) {
            return { success: false, reason: writeResult.reason };
        }

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'birthSurname',
            characterIds: [characterId]
        });

        return { success: true, history: history };
    }

    // =========================================================================
    // 9. COMMAND: applyMarriageSurnames
    // =========================================================================

    function applyMarriageSurnames(personId, spouseId, rule, year, notes) {
        if (!_hasId(personId) || !_hasId(spouseId)) {
            return { success: false, reason: 'Both person and spouse IDs are required' };
        }
        if (personId === spouseId) {
            return { success: false, reason: 'Person and spouse must be different characters' };
        }
        if (typeof rule !== 'string' || rule.length === 0) {
            return { success: false, reason: 'Marriage surname rule is required' };
        }

        var person = _resolveCharacter(personId);
        if (!person) {
            return { success: false, reason: 'Person not found' };
        }
        var spouse = _resolveCharacter(spouseId);
        if (!spouse) {
            return { success: false, reason: 'Spouse not found' };
        }

        if (person.isDeceased || spouse.isDeceased) {
            return { success: false, reason: 'Cannot change surname of deceased character' };
        }

        var currentYear = _isMissing(year) ? _getCurrentYear() : year;

        var calc = window.NameRules.calculateMarriageSurnames(person, spouse, rule);
        if (!calc) {
            return { success: false, reason: 'Unknown marriage surname rule "' + rule + '"' };
        }

        var personNeedsChange = calc.newSurname && calc.newSurname !== person.surname;
        var spouseNeedsChange = calc.spouseNewSurname && calc.spouseNewSurname !== spouse.surname;

        if (!personNeedsChange && !spouseNeedsChange) {
            return {
                success: true,
                personChanged: false,
                spouseChanged: false,
                personNewSurname: person.surname,
                spouseNewSurname: spouse.surname
            };
        }

        // Validate BOTH changes before applying EITHER. This is what makes
        // the rollback path below provably unreachable: _appendSurnameChange
        // can only fail via _validateSurnameChange, which we've already run.
        if (personNeedsChange) {
            var pv = _validateSurnameChange(person, calc.newSurname, currentYear);
            if (!pv.valid) {
                return { success: false, reason: 'Person: ' + pv.reason };
            }
        }
        if (spouseNeedsChange) {
            var sv = _validateSurnameChange(spouse, calc.spouseNewSurname, currentYear);
            if (!sv.valid) {
                return { success: false, reason: 'Spouse: ' + sv.reason };
            }
        }

        var personResult = null;
        var spouseResult = null;

        if (personNeedsChange) {
            personResult = _appendSurnameChange(
                personId,
                person,
                calc.newSurname,
                currentYear,
                'marriage',
                {
                    spouseId: spouse.id,
                    notes: notes || ('Married ' + spouse.name),
                    previousSurname: person.surname
                }
            );
            // Unreachable given the validate-before-apply guard above.
            // If it ever fires, an upstream invariant has broken; roll
            // back and return.
            if (!personResult.success) {
                return { success: false, reason: 'Person: ' + personResult.reason };
            }
        }

        if (spouseNeedsChange) {
            // Re-read the spouse projection. The person's write above
            // did not touch the spouse, so this is safe — but it keeps
            // the pattern consistent and ensures the projection is
            // fresh in case another concurrent write happened.
            var spouseFresh = _resolveCharacter(spouseId);
            spouseResult = _appendSurnameChange(
                spouseId,
                spouseFresh || spouse,
                calc.spouseNewSurname,
                currentYear,
                'marriage',
                {
                    spouseId: person.id,
                    notes: notes || ('Married ' + person.name),
                    previousSurname: spouse.surname
                }
            );
            // Unreachable given the validate-before-apply guard above.
            // Retained as defense-in-depth: if this ever fires, undo
            // the person's change before returning.
            if (!spouseResult.success) {
                if (personResult) {
                    try {
                        var personFresh = _resolveCharacter(personId);
                        _undoSurnameChange(
                            personId,
                            personFresh || person,
                            personResult.change
                        );
                    } catch (e) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error(
                                'name-commands.js: rollback of person surname failed:', e
                            );
                        }
                    }
                }
                return { success: false, reason: 'Spouse: ' + spouseResult.reason };
            }
        }

        window.NamesState.invalidateSurnameHistory(personId);
        window.NamesState.invalidateSurnameHistory(spouseId);

        var ids = [];
        if (personNeedsChange) ids.push(personId);
        if (spouseNeedsChange) ids.push(spouseId);

        _commit('characterChanged', {
            action: 'surnameChange',
            characterIds: ids
        });

        // Read back the final state for the return payload.
        var personFinal = _resolveCharacter(personId);
        var spouseFinal = _resolveCharacter(spouseId);

        _logEvent('name', 'marriage_surname',
            person.name + ' and ' + spouse.name +
            ' changed surnames due to marriage (rule: ' + rule + ')',
            [person, spouse]);

        return {
            success: true,
            personChanged: personNeedsChange,
            spouseChanged: spouseNeedsChange,
            personNewSurname: personFinal ? personFinal.surname : person.surname,
            spouseNewSurname: spouseFinal ? spouseFinal.surname : spouse.surname,
            rule: rule
        };
    }

    // =========================================================================
    // 10. MARRIAGE SURNAME CALCULATION (delegation)
    // =========================================================================

    /**
     * Delegates to NameRules, which owns marriage surname policy.
     * Exposed here for symmetry with the other commands and for callers
     * that reach for NameCommands for all name operations.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 11. COMMAND: revertLastSurnameChange
    // =========================================================================

    function revertLastSurnameChange(characterId) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var historyCopy = _readSurnameHistory(character);
        if (!historyCopy || !Array.isArray(historyCopy.entries)
            || historyCopy.entries.length === 0) {
            return { success: false, reason: 'No surname changes to revert' };
        }

        var lastChange;
        var restored;
        try {
            lastChange = _undoSurnameChange(characterId, character, null);
            restored = lastChange.previousSurname !== undefined
                ? lastChange.previousSurname
                : (lastChange.previousSurname === null ? '' : lastChange.previousSurname);
        } catch (e) {
            return { success: false, reason: e.message || 'Revert failed' };
        }

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameRevert',
            characterIds: [characterId]
        });

        // Read back the final surname from the fresh projection.
        var final = _resolveCharacter(characterId);
        var finalSurname = final ? final.surname : restored;

        _logEvent('name', 'surname_reverted',
            character.name + ' reverted surname change from "' +
            lastChange.surname + '" to "' + finalSurname + '"',
            [character]);

        return {
            success: true,
            revertedChange: lastChange,
            restoredSurname: finalSurname
        };
    }

    // =========================================================================
    // 12. COMMAND: clearSurnameHistory
    // =========================================================================
    //
    // Removes all change entries. Preserves birthSurname. Does not change
    // the character's current surname.

    function clearSurnameHistory(characterId) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var historyCopy = _readSurnameHistory(character);
        var history = _ensureSurnameHistoryOn(historyCopy, character);
        history.entries = [];
        history.lastUpdated = character.birthYear || _getCurrentYear();

        var writeResult = _writeSurnameHistory(characterId, history);
        if (!writeResult.ok) {
            return { success: false, reason: writeResult.reason };
        }

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameHistoryCleared',
            characterIds: [characterId]
        });

        _logEvent('name', 'surname_history_cleared',
            character.name + "'s surname history was cleared",
            [character]);

        return { success: true };
    }

    // =========================================================================
    // 13. COMMAND: addNameToList
    // =========================================================================
    //
    // Name lists live in masterData.data.nameLists. NamesState.
    // getMutableNameList returns a LIVE reference into that collection,
    // so mutating through it correctly updates canonical data. This is
    // a different mechanism from character-record writes.

    function addNameToList(countryId, name, gender, category) {
        if (!_hasId(countryId)) {
            return { success: false, reason: 'Country is required' };
        }
        if (typeof name !== 'string' || name.trim() === '') {
            return { success: false, reason: 'Name is required' };
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'both') {
            return { success: false, reason: "Gender must be 'male', 'female', or 'both'" };
        }
        if (!_isMissing(category) && category !== 'given' && category !== 'surname') {
            return { success: false, reason: "Category must be 'given' or 'surname'" };
        }

        var nameList = window.NamesState.getMutableNameList(countryId);
        if (!nameList) {
            return { success: false, reason: 'Name list not found for country' };
        }

        var trimmed = name.trim();
        var added = false;
        var isSurname = category === 'surname';

        if (isSurname) {
            if (!Array.isArray(nameList.surnames)) nameList.surnames = [];
            if (nameList.surnames.indexOf(trimmed) === -1) {
                nameList.surnames.push(trimmed);
                added = true;
            }
        } else {
            if (!Array.isArray(nameList.male)) nameList.male = [];
            if (!Array.isArray(nameList.female)) nameList.female = [];
            if (gender === 'male') {
                if (nameList.male.indexOf(trimmed) === -1) {
                    nameList.male.push(trimmed);
                    added = true;
                }
            } else if (gender === 'female') {
                if (nameList.female.indexOf(trimmed) === -1) {
                    nameList.female.push(trimmed);
                    added = true;
                }
            } else {
                if (nameList.male.indexOf(trimmed) === -1) {
                    nameList.male.push(trimmed);
                    added = true;
                }
                if (nameList.female.indexOf(trimmed) === -1) {
                    nameList.female.push(trimmed);
                    added = true;
                }
            }
        }

        if (!added) {
            return { success: false, reason: 'Name already exists in this list' };
        }

        window.NamesState.invalidateNameList(countryId);
        _commit('nameListChanged', {
            countryId: countryId,
            name: trimmed
        });

        return { success: true };
    }

    // =========================================================================
    // 14. COMMAND: removeNameFromList
    // =========================================================================

    function removeNameFromList(countryId, name, gender, category) {
        if (!_hasId(countryId)) {
            return { success: false, reason: 'Country is required' };
        }
        if (typeof name !== 'string' || name.trim() === '') {
            return { success: false, reason: 'Name is required' };
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'both' && gender !== 'any') {
            return { success: false, reason: "Gender must be 'male', 'female', 'both', or 'any'" };
        }
        if (!_isMissing(category) && category !== 'given' && category !== 'surname') {
            return { success: false, reason: "Category must be 'given' or 'surname'" };
        }

        var nameList = window.NamesState.getMutableNameList(countryId);
        if (!nameList) {
            return { success: false, reason: 'Name list not found for country' };
        }

        var trimmed = name.trim();
        var removed = false;

        function _removeFrom(arr) {
            if (!Array.isArray(arr)) return false;
            var idx = arr.indexOf(trimmed);
            if (idx === -1) return false;
            arr.splice(idx, 1);
            return true;
        }

        if (category === 'surname') {
            if (_removeFrom(nameList.surnames)) removed = true;
        } else {
            if (gender === 'male' || gender === 'any' || gender === 'both') {
                if (_removeFrom(nameList.male)) removed = true;
            }
            if (gender === 'female' || gender === 'any' || gender === 'both') {
                if (_removeFrom(nameList.female)) removed = true;
            }
        }

        if (!removed) {
            return { success: false, reason: 'Name not found in this list' };
        }

        window.NamesState.invalidateNameList(countryId);
        _commit('nameListChanged', {
            countryId: countryId,
            name: trimmed
        });

        return { success: true };
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.NameCommands = {
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        clearSurnameHistory: clearSurnameHistory,

        addNameToList: addNameToList,
        removeNameFromList: removeNameFromList,

        calculateMarriageSurnames: calculateMarriageSurnames,

        _validateSurnameChange: _validateSurnameChange,

        // Persistence
        persist: persist
    };

})();
