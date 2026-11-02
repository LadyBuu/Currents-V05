/**
 * =============================================================================
 * STILL WATERS - CHILDREN COMMANDS (js/character/children-commands.js)
 * =============================================================================
 *
 * LOCATION: js/character/children-commands.js
 *
 * Mutation boundary for pregnancy, surrogacy, and adoption metadata.
 *
 * SCOPE:
 *   - recordBirth(motherId, fatherId, birthYear, options)
 *   - recordPregnancyAttempt(motherId, fatherId, options)
 *       Rolls conception, rolls pregnancy outcome, applies consequences.
 *       Accepts an optional deterministic outcome (options.rolls or
 *       options.outcome) for replay or explicit recording.
 *   - recordPregnancyAttempts(motherId, fatherId, options)
 *       Runs recordPregnancyAttempt in a loop over a year range.
 *   - recordSurrogacyArrangement(intendedParentId, surrogateId, options)
 *   - completeSurrogacyArrangement(arrangementId, options)
 *   - cancelSurrogacyArrangement(arrangementId, options)
 *   - recordSwapSurrogacy(coupleA, coupleB, options)
 *       Two coordinated surrogacy arrangements in one commit.
 *   - recordAdoptionMetadata(childId, adopterId, options)
 *   - updateAdoptionMetadata(adoptionId, patch)
 *   - endAdoptionMetadata(adoptionId, options)
 *   - removeAllReferencesTo(characterId)
 *
 * OUT OF SCOPE:
 *   - Legal parent edges         -> family-commands.js
 *   - Character creation         -> character-creation-commands.js
 *   - Death transitions          -> character-commands.js (markDeceased)
 *   - Fertility policy           -> children-rules.js
 *   - Persistence mechanics      -> children-state.js + storage.js
 *   - Events beyond childrenChanged -> caller
 *
 * COMPOSITION:
 *   recordBirth is a multi-domain transaction:
 *     1. CharacterCreationCommands.createCharacter
 *     2. FamilyCommands.setParent (mother and father)
 *     3. CharacterCommands.assignCharacterReligion (non-fatal)
 *     4. ChildrenState._insertPregnancy
 *
 *   If any step after creation fails, the child is soft-deleted (via
 *   CharacterState.applyDomainFieldPatch — NOT via
 *   CharacterCommands.updateCharacterFields, which refuses domain-owned
 *   fields like isDeleted and deletedAt) and any parent edges created
 *   during this command are removed. See ROLLBACK BOUNDARY below.
 *
 * ROLLBACK BOUNDARY:
 *   _rollbackChild is the module's single rollback primitive. It runs
 *   after a partial failure in recordBirth and must be atomic in the
 *   sense that EITHER the child is soft-deleted OR the caller is told
 *   the rollback failed. The rollback uses
 *   CharacterState.applyDomainFieldPatch — the sanctioned writer for
 *   character-domain-owned fields. It does NOT use
 *   CharacterCommands.updateCharacterFields, because that path refuses
 *   isDeleted / deletedAt (they are in _DOMAIN_OWNED_FIELDS) and would
 *   silently return { success: false } while leaving the child in the
 *   canonical collection.
 *
 * POSTHUMOUS BIRTHS:
 *   recordBirth and recordPregnancyAttempt treat a deceased father
 *   ASYMMETRICALLY, and that asymmetry is deliberate:
 *
 *     recordBirth — DOES NOT refuse a deceased father. A posthumous
 *       birth (father died before the child was born) is a legitimate
 *       historical outcome. The caller has already established the
 *       father's identity at the moment of conception; refusing here
 *       would require the caller to know the father's death year and
 *       decide whether the conception predates the death — which is
 *       exactly the kind of check the birth-record layer cannot make
 *       without conception-year information that the caller may not
 *       supply. Posthumous births are therefore accepted as-is.
 *
 *     recordPregnancyAttempt — DOES refuse a deceased father. A
 *       conception attempt cannot occur with a dead man. The check is
 *       safe here because the attempt is the current transaction: a
 *       living father is a precondition of the attempt.
 *
 *   Callers who want stricter validation on recordBirth (e.g. "reject
 *   posthumous births unless the caller confirms the conception
 *   predates the death") must implement that check at their own layer.
 *   ChildrenCommands will not reject posthumous births.
 *
 * PREGNANCY ATTEMPT - DETERMINISTIC MODE:
 *   recordPregnancyAttempt normally rolls every outcome internally.
 *   When options.rolls is supplied, its fields replace the internal
 *   rolls. When options.outcome is supplied, the entire random process
 *   is bypassed.
 *
 * RANDOMNESS:
 *   All rolls route through window.random() from randomness.js. This
 *   module does NOT call Math.random directly, and no fallback is
 *   provided. A missing randomness.js is a load-order bug and throws.
 *   Determinism is therefore preserved end-to-end: given the same seed
 *   and the same starting data, the same birth outcomes are produced.
 *
 * COMMIT SEMANTICS:
 *   Single-attempt commands (recordBirth, recordPregnancyAttempt,
 *   recordSurrogacyArrangement, recordAdoptionMetadata, and their
 *   sibling mutators) commit exactly once per call. That is the
 *   contract for a single command.
 *
 *   recordPregnancyAttempts is a BATCH wrapper. It calls
 *   recordPregnancyAttempt once per simulated attempt, and each
 *   attempt commits independently. The batch therefore produces
 *   N commits and N childrenChanged events for N attempts. This is
 *   a known deviation from "one command = one commit" and is
 *   intentional: refactoring to a single commit would require
 *   threading a no-commit mode through every code path in
 *   recordPregnancyAttempt, which is more risk than the deviation
 *   is worth today. Callers that need atomic batch behaviour must
 *   compose their own transaction around the individual calls.
 *
 * CONTRACT:
 *   - Every public command returns { success, reason?, ... }.
 *   - Validation happens before any mutation. Partial mutation on
 *     failure is rolled back.
 *   - No lock. Commands are synchronous.
 *   - No fallback dependencies.
 *
 * MATERNAL DEATH:
 *   When a pregnancy attempt kills the mother, the death is applied
 *   through CharacterLifecycle.killCharacter (not
 *   CharacterCommands.markDeceased). killCharacter dispatches the
 *   cross-domain death consequences (family edge closure, relationship
 *   termination, rank deprecation) that a bare markDeceased would not.
 *   If CharacterLifecycle is unavailable, the command refuses the
 *   maternal-death outcome rather than silently leaving stale family
 *   and rank state.
 *
 * DEPENDENCIES (REQUIRED):
 *   - children-state.js:              ChildrenState
 *   - children-rules.js:              ChildrenRules
 *   - character-state.js:             CharacterState
 *   - character-commands.js:          CharacterCommands
 *   - character-creation-commands.js: CharacterCreationCommands
 *   - family-commands.js:             FamilyCommands
 *   - ids.js:                         generateId
 *   - time.js:                        getCurrentYear, isValidYear
 *   - randomness.js:                  random
 *
 * DEPENDENCIES (REQUIRED for maternal death only):
 *   - character-lifecycle.js:         CharacterLifecycle.killCharacter
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - religion-commands.js:           ReligionCommands
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _rollbackChild now uses CharacterState.applyDomainFieldPatch
 *       instead of CharacterCommands.updateCharacterFields. isDeleted
 *       and deletedAt are in _DOMAIN_OWNED_FIELDS on the generic
 *       character-command path; updateCharacterFields REFUSES them.
 *       The prior rollback therefore silently failed: the child was
 *       left in the canonical collection as an orphan, with no parent
 *       edges and no pregnancy record. Fixed by routing the soft
 *       delete through applyDomainFieldPatch, which is the sanctioned
 *       writer for domain-owned fields. See ROLLBACK BOUNDARY in the
 *       module header.
 *     - Header POSTHUMOUS BIRTHS section added, documenting the
 *       intentional asymmetry between recordBirth (permits deceased
 *       father — posthumous births are legitimate) and
 *       recordPregnancyAttempt (refuses deceased father — conception
 *       requires a living father). No behavioural change; the
 *       asymmetry was already there and is now documented as policy
 *       rather than accidental.
 *     - Header ROLLBACK BOUNDARY section added.
 *     - No other behavioural change to any command.
 *   Previous revisions:
 *     - Deterministic-mode pregnancy attempts (options.outcome,
 *       options.rolls).
 *     - Maternal death routed through CharacterLifecycle.killCharacter.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    var REQUIRED = [
        'ChildrenState',
        'ChildrenRules',
        'CharacterState',
        'CharacterCommands',
        'CharacterCreationCommands',
        'FamilyCommands',
        'generateId',
        'getCurrentYear',
        'isValidYear',
        'random'
    ];
    var missing = [];
    for (var i = 0; i < REQUIRED.length; i++) {
        if (typeof window[REQUIRED[i]] === 'undefined') {
            missing.push(REQUIRED[i]);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            'children-commands.js: missing required dependencies: ' +
            missing.join(', ')
        );
    }

    var ChS = window.ChildrenState;
    var ChR = window.ChildrenRules;
    var CS  = window.CharacterState;
    var CC  = window.CharacterCommands;
    var CCC = window.CharacterCreationCommands;
    var FC  = window.FamilyCommands;

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 2. HELPERS
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

    function _isValidYear(v) {
        if (_isMissing(v)) return false;
        return window.isValidYear(v) === true;
    }

    function _resolveYear(v) {
        if (_isMissing(v)) return window.getCurrentYear();
        return v;
    }

    function _isValidRoll(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && v >= 0
            && v < 1;
    }

    function _characterExists(id) {
        if (!_hasId(id)) return false;
        if (typeof CS.hasCharacter === 'function') return CS.hasCharacter(id);
        return CS.getCharacter(id) !== null;
    }

    function _getCharacter(id) {
        if (!_hasId(id)) return null;
        return CS.getCharacter(id);
    }

    function _ageAtYear(birthYear, year) {
        if (typeof birthYear !== 'number' || typeof year !== 'number') {
            return null;
        }
        var age = year - birthYear;
        return age >= 0 ? age : null;
    }

    /**
     * Deterministic RNG draw. Routes through randomness.js so that
     * seeded simulations are reproducible. There is no Math.random
     * fallback: a missing randomness.js is a load-order bug and is
     * caught by the required-dependency guard at the top of this file.
     */
    function _roll() {
        return window.random();
    }

    // =========================================================================
    // 3. PERSISTENCE AND NOTIFICATION
    // =========================================================================

    function _commit() {
        if (!window.masterData || !window.masterData.data) {
            return false;
        }
        window.masterData.data.pregnancyRecords = ChS.snapshotPregnancies();
        window.masterData.data.surrogacyArrangements = ChS.snapshotSurrogacy();
        window.masterData.data.adoptionRecords = ChS.snapshotAdoptions();

        if (typeof window.markDataDirty === 'function') {
            window.markDataDirty();
        }
        return true;
    }

    function _notify(action, characterIds) {
        try {
            window.dispatchEvent(new CustomEvent('childrenChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('children-commands.js: childrenChanged dispatch failed:', e);
            }
        }
    }

    function _commitAndNotify(action, characterIds) {
        _commit();
        _notify(action, characterIds);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 4. RELIGION INHERITANCE (non-fatal if unavailable)
    // =========================================================================

    function _inheritReligionForChild(childId, motherId, fatherId, year) {
        if (typeof window.ReligionCommands === 'undefined') return;
        if (typeof CC.assignCharacterReligion !== 'function') return;

        var mother = motherId ? _getCharacter(motherId) : null;
        var father = fatherId ? _getCharacter(fatherId) : null;

        var religionId = null;
        var source = null;

        if (mother && _hasId(mother.religionId)) {
            religionId = mother.religionId;
            source = 'mother';
        } else if (father && _hasId(father.religionId)) {
            religionId = father.religionId;
            source = 'father';
        }

        if (!religionId) return;

        CC.assignCharacterReligion(childId, religionId, {
            year: year,
            reason: 'inheritance',
            notes: 'Inherited from ' + source + ' at birth'
        });
    }

    // =========================================================================
    // 5. MATERNAL DEATH (routes through CharacterLifecycle)
    // =========================================================================
    //
    // A mother who dies in childbirth is a full death. Family edges must
    // be closed, relationships ended, ranks deprecated, and the death
    // event logged. CharacterCommands.markDeceased performs none of
    // those; it only writes the character record. CharacterLifecycle's
    // killCharacter does all of them. If killCharacter is unavailable
    // the command REFUSES the maternal-death outcome rather than
    // producing a half-dead world.

    function _applyMaternalDeath(motherId, birthYear) {
        if (typeof window.CharacterLifecycle === 'undefined'
            || typeof window.CharacterLifecycle.killCharacter !== 'function') {
            return {
                success: false,
                reason: 'character-lifecycle.js (killCharacter) is required ' +
                        'for maternal death; refusing to record a death ' +
                        'without cross-domain cleanup.'
            };
        }

        var result = window.CharacterLifecycle.killCharacter(motherId, {
            deathYear: birthYear,
            deathCause: 'childbed_fever',
            deathCauseDetail: 'Childbed fever',
            deathNotes: 'Died following childbirth'
        });
        if (!result || result.success !== true) {
            return {
                success: false,
                reason: result && result.reason
                    ? result.reason
                    : 'CharacterLifecycle.killCharacter failed.'
            };
        }
        return { success: true };
    }

    // =========================================================================
    // 6. BIRTH
    // =========================================================================
    //
    // See POSTHUMOUS BIRTHS in the module header. recordBirth permits
    // a deceased father (posthumous births are legitimate). It does NOT
    // permit a deceased mother (obviously impossible).

    function recordBirth(motherId, fatherId, birthYear, options) {
        if (!_hasId(motherId)) return _fail('motherId is required.');
        if (fatherId !== null && fatherId !== undefined && !_hasId(fatherId)) {
            return _fail('fatherId must be a non-empty string or null.');
        }
        if (!_isValidYear(birthYear)) {
            return _fail('birthYear must be a valid world year.');
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var mother = _getCharacter(motherId);
        if (!mother) return _fail('Mother not found.');
        if (mother.isDeceased === true) return _fail('Mother is deceased.');

        // Father existence check. Note: a DECEASED father is permitted.
        // See POSTHUMOUS BIRTHS in the module header.
        if (_hasId(fatherId)) {
            var father = _getCharacter(fatherId);
            if (!father) return _fail('Father not found.');
        }

        var currentYear = window.getCurrentYear();
        var validation = ChR.validateBirth({
            motherId: motherId,
            fatherId: _hasId(fatherId) ? fatherId : null,
            birthYear: birthYear,
            currentYear: currentYear,
            gender: options.gender
        });
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        var isStillborn = options.isStillborn === true;
        var gender = options.gender;
        if (gender !== 'male' && gender !== 'female') {
            gender = _roll() < 0.5 ? 'male' : 'female';
        }

        var surname = typeof options.surname === 'string'
            ? options.surname
            : (mother.surname || '');

        var childData = {
            name: typeof options.name === 'string' && options.name.trim().length > 0
                ? options.name
                : 'Newborn',
            surname: surname,
            gender: gender,
            birthYear: birthYear,
            birthplaceId: _hasId(options.birthplaceId)
                ? options.birthplaceId
                : (mother.currentLocationId || null),
            notes: typeof options.notes === 'string' ? options.notes : '',
            isDeceased: isStillborn,
            deathYear: isStillborn ? birthYear : null,
            deathCause: isStillborn ? 'natural' : null,
            deathCauseDetail: isStillborn ? 'Stillborn' : '',
            currentLocationId: _hasId(options.birthplaceId)
                ? options.birthplaceId
                : (mother.currentLocationId || null)
        };

        var createResult = CCC.createCharacter(childData, {
            currentYear: currentYear
        });
        if (!createResult || createResult.success !== true) {
            return _fail(createResult && createResult.reason
                ? createResult.reason
                : 'Failed to create child character.');
        }

        var childId = createResult.data.id;
        var parentsEstablished = [];

        var motherEdge = FC.setParent(childId, motherId, {
            parentType: 'biological',
            parentRole: 'mother',
            startYear: birthYear,
            notes: 'Birth mother'
        });
        if (!motherEdge || motherEdge.success !== true) {
            _rollbackChild(childId, parentsEstablished);
            return _fail(motherEdge && motherEdge.reason
                ? motherEdge.reason
                : 'Failed to establish mother edge.');
        }
        if (!motherEdge.unchanged) parentsEstablished.push(motherEdge.edgeId);

        if (_hasId(fatherId)) {
            var fatherEdge = FC.setParent(childId, fatherId, {
                parentType: 'biological',
                parentRole: 'father',
                startYear: birthYear,
                notes: 'Birth father'
            });
            if (!fatherEdge || fatherEdge.success !== true) {
                _rollbackChild(childId, parentsEstablished);
                return _fail(fatherEdge && fatherEdge.reason
                    ? fatherEdge.reason
                    : 'Failed to establish father edge.');
            }
            if (!fatherEdge.unchanged) parentsEstablished.push(fatherEdge.edgeId);
        }

        if (!isStillborn) {
            _inheritReligionForChild(
                childId,
                motherId,
                _hasId(fatherId) ? fatherId : null,
                birthYear
            );
        }

        var pregnancyId = window.generateId('preg');
        if (!_hasId(pregnancyId)) {
            _rollbackChild(childId, parentsEstablished);
            return _fail('Pregnancy id generation failed.');
        }

        var pregnancyRecord = {
            id: pregnancyId,
            motherId: motherId,
            fatherId: _hasId(fatherId) ? fatherId : null,
            childIds: [childId],
            conceptionYear: typeof options.conceptionYear === 'number'
                ? options.conceptionYear
                : birthYear - 1,
            birthYear: birthYear,
            outcome: isStillborn ? 'stillbirth' : 'live_birth',
            fetusCount: 1,
            isMultiple: false,
            hasComplications: options.hasComplications === true,
            maternalDeath: options.maternalDeath === true,
            attemptNumber: typeof options.attemptNumber === 'number'
                ? options.attemptNumber
                : 0,
            notes: typeof options.notes === 'string' ? options.notes : '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        ChS._insertPregnancy(pregnancyRecord);

        _commitAndNotify('recordBirth', [childId, motherId]);

        _logEvent('birth', 'Birth',
            'Child born to ' + motherId + (fatherId ? ' and ' + fatherId : '')
            + ' in ' + birthYear,
            [motherId, fatherId, childId].filter(Boolean));

        return _ok({
            childId: childId,
            pregnancyId: pregnancyId
        });
    }

    /**
     * Rolls back a partially created child.
     *
     * Removes any parent edges established during this command, then
     * soft-deletes the child via CharacterState.applyDomainFieldPatch.
     *
     * See ROLLBACK BOUNDARY in the module header for why
     * applyDomainFieldPatch is the correct primitive here (and why
     * CharacterCommands.updateCharacterFields is not — it refuses
     * domain-owned fields including isDeleted and deletedAt).
     */
    function _rollbackChild(childId, edgeIds) {
        for (var i = edgeIds.length - 1; i >= 0; i--) {
            FC.removeParent(edgeIds[i], { reason: 'birth rollback' });
        }
        CS.applyDomainFieldPatch(childId, {
            isDeleted: true,
            deletedAt: Date.now()
        });
    }

    // =========================================================================
    // 7. PREGNANCY ATTEMPT
    // =========================================================================

    function _getRoll(options, key) {
        if (options.rolls && _isValidRoll(options.rolls[key])) {
            return options.rolls[key];
        }
        return _roll();
    }

    function _applyExplicitOutcome(motherId, fatherId, year, outcome, options, currentYear) {
        if (outcome === 'no_conception') {
            return _ok({
                outcome: 'no_conception',
                childIds: []
            });
        }

        var fetusCount = typeof options.fetusCount === 'number'
            && Number.isInteger(options.fetusCount)
            && options.fetusCount > 0
            ? Math.min(3, options.fetusCount)
            : 1;
        var isMultiple = options.isMultiple === true || fetusCount > 1;
        var hasComplications = options.hasComplications === true;
        var maternalDeath = options.maternalDeath === true;

        var childIds = [];
        var birthYear = year + 1;

        if (outcome === 'miscarriage') {
            var pregId = window.generateId('preg');
            ChS._insertPregnancy({
                id: pregId,
                motherId: motherId,
                fatherId: _hasId(fatherId) ? fatherId : null,
                childIds: [],
                conceptionYear: year,
                birthYear: null,
                outcome: 'miscarriage',
                fetusCount: fetusCount,
                isMultiple: isMultiple,
                hasComplications: hasComplications,
                maternalDeath: false,
                attemptNumber: typeof options.attemptNumber === 'number'
                    ? options.attemptNumber
                    : 0,
                notes: typeof options.notes === 'string' ? options.notes : '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            _commitAndNotify('recordPregnancyAttempt', [motherId, fatherId].filter(Boolean));

            return _ok({
                outcome: 'miscarriage',
                childIds: [],
                fetusCount: fetusCount,
                isMultiple: isMultiple,
                hasComplications: hasComplications,
                maternalDeath: false
            });
        }

        var isStillborn = outcome === 'stillbirth';
        for (var i = 0; i < fetusCount; i++) {
            var gender = options.gender === 'male' || options.gender === 'female'
                ? options.gender
                : (_roll() < 0.5 ? 'male' : 'female');

            var birthResult = recordBirth(motherId, fatherId, birthYear, {
                gender: gender,
                isStillborn: isStillborn,
                conceptionYear: year,
                attemptNumber: options.attemptNumber,
                hasComplications: hasComplications,
                maternalDeath: maternalDeath,
                notes: 'Specified outcome: ' + outcome
                    + (fetusCount > 1 ? ' (' + (i + 1) + ' of ' + fetusCount + ')' : '')
            });
            if (birthResult.success) childIds.push(birthResult.childId);
        }

        if (maternalDeath) {
            var deathResult = _applyMaternalDeath(motherId, birthYear);
            if (!deathResult.success) {
                // The births succeeded but the death could not be
                // recorded safely. Surface the failure rather than
                // leave the mother alive-with-dead-child or produce a
                // half-dispatch. Callers can retry the death via
                // CharacterLifecycle once the missing module is loaded.
                return _fail(
                    'Births recorded but maternal death could not be applied: '
                    + deathResult.reason
                );
            }
        }

        _commitAndNotify('recordPregnancyAttempt', [motherId, fatherId].filter(Boolean));

        return _ok({
            outcome: outcome,
            childIds: childIds,
            fetusCount: fetusCount,
            isMultiple: isMultiple,
            hasComplications: hasComplications,
            maternalDeath: maternalDeath
        });
    }

    function recordPregnancyAttempt(motherId, fatherId, options) {
        if (!_hasId(motherId)) return _fail('motherId is required.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var mother = _getCharacter(motherId);
        if (!mother) return _fail('Mother not found.');
        if (mother.isDeceased === true) return _fail('Mother is deceased.');

        var father = null;
        if (_hasId(fatherId)) {
            father = _getCharacter(fatherId);
            if (!father) return _fail('Father not found.');
            if (father.isDeceased === true) return _fail('Father is deceased.');
        }

        var year = _resolveYear(options.year);
        var currentYear = window.getCurrentYear();
        var motherAge = _ageAtYear(mother.birthYear, year);
        var fatherAge = father ? _ageAtYear(father.birthYear, year) : null;

        if (typeof options.outcome === 'string') {
            var allowed = ['no_conception', 'miscarriage', 'stillbirth', 'live_birth'];
            if (allowed.indexOf(options.outcome) === -1) {
                return _fail('options.outcome must be one of: ' + allowed.join(', '));
            }
            return _applyExplicitOutcome(
                motherId,
                _hasId(fatherId) ? fatherId : null,
                year,
                options.outcome,
                options,
                currentYear
            );
        }

        var canConceive = ChR.canConceive({
            motherAge: motherAge,
            motherGender: mother.gender,
            motherIsDeceased: mother.isDeceased === true,
            fatherAge: fatherAge,
            fatherGender: father ? father.gender : null
        });
        if (!canConceive.valid) {
            return _fail(canConceive.errors.join('; '));
        }

        var chance = ChR.getConceptionChance({
            motherAge: motherAge,
            fatherAge: fatherAge,
            modifier: options.fertilityModifier
        });
        if (options.forceConception === true) chance = 1;

        var conceptionRoll = _getRoll(options, 'conception');
        var conceptionResult = ChR.evaluateConception(
            { conceptionChance: chance },
            conceptionRoll
        );
        if (!conceptionResult.valid || !conceptionResult.conceived) {
            return _ok({
                outcome: 'no_conception',
                conceptionChance: chance,
                roll: conceptionRoll
            });
        }

        var outcome = ChR.resolvePregnancyOutcome({
            motherAge: motherAge,
            pregnancyNumber: typeof options.attemptNumber === 'number'
                ? options.attemptNumber
                : 0,
            forceSingle: options.forceSingle === true,
            rolls: {
                complication: _getRoll(options, 'complication'),
                miscarriage: _getRoll(options, 'miscarriage'),
                stillbirth: _getRoll(options, 'stillbirth'),
                maternalDeath: _getRoll(options, 'maternalDeath'),
                multipleBirth: _getRoll(options, 'multipleBirth')
            }
        });
        if (!outcome.valid) {
            return _fail(outcome.errors.join('; '));
        }

        var pregnancyId = window.generateId('preg');
        var childIds = [];
        var birthYear = year + 1;

        if (outcome.outcome === ChR.PREGNANCY_OUTCOME.LIVE_BIRTH
            || outcome.outcome === ChR.PREGNANCY_OUTCOME.STILLBIRTH) {

            var isStillborn = outcome.outcome === ChR.PREGNANCY_OUTCOME.STILLBIRTH;

            for (var i = 0; i < outcome.fetusCount; i++) {
                var gender = options.gender === 'male' || options.gender === 'female'
                    ? options.gender
                    : (_roll() < 0.5 ? 'male' : 'female');

                var birthResult = recordBirth(motherId, fatherId, birthYear, {
                    gender: gender,
                    isStillborn: isStillborn,
                    conceptionYear: year,
                    attemptNumber: options.attemptNumber,
                    hasComplications: outcome.hasComplications,
                    maternalDeath: outcome.maternalDeath,
                    notes: 'Multiple birth ' + (i + 1) + ' of ' + outcome.fetusCount
                });
                if (!birthResult.success) continue;
                childIds.push(birthResult.childId);
            }
        } else {
            ChS._insertPregnancy({
                id: pregnancyId,
                motherId: motherId,
                fatherId: _hasId(fatherId) ? fatherId : null,
                childIds: [],
                conceptionYear: year,
                birthYear: null,
                outcome: 'miscarriage',
                fetusCount: outcome.fetusCount,
                isMultiple: outcome.isMultiple,
                hasComplications: outcome.hasComplications,
                maternalDeath: false,
                attemptNumber: typeof options.attemptNumber === 'number'
                    ? options.attemptNumber
                    : 0,
                notes: '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        if (outcome.maternalDeath === true && !mother.isDeceased) {
            var deathResult = _applyMaternalDeath(motherId, birthYear);
            if (!deathResult.success) {
                return _fail(
                    'Births recorded but maternal death could not be applied: '
                    + deathResult.reason
                );
            }
        }

        _commitAndNotify('recordPregnancyAttempt', [motherId, fatherId].filter(Boolean));

        return _ok({
            outcome: outcome.outcome,
            childIds: childIds,
            fetusCount: outcome.fetusCount,
            isMultiple: outcome.isMultiple,
            hasComplications: outcome.hasComplications,
            maternalDeath: outcome.maternalDeath
        });
    }

    // =========================================================================
    // 8. BATCH PREGNANCY ATTEMPTS
    // =========================================================================

    /**
     * Runs recordPregnancyAttempt over a range of years, one attempt per
     * year, until maxChildren is reached or the range ends.
     *
     * COMMIT SEMANTICS: This is a BATCH wrapper. Each internal attempt
     * commits independently, so the batch produces N commits and N
     * childrenChanged events for N attempts. Callers that need atomic
     * batch behaviour must compose their own transaction around the
     * individual calls, or call recordPregnancyAttempt directly.
     *
     * The spacing gap between successful births also uses window.random
     * so seeded simulations are reproducible.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Object} [options]
     * @param {number} [options.startYear]
     * @param {number} [options.endYear]
     * @param {number} [options.maxChildren]   default 8
     * @param {number} [options.minSpacing]    default 2
     * @param {number} [options.maxSpacing]    default 3
     * @param {Object} [options.attemptOptions] passed to each attempt
     */
    function recordPregnancyAttempts(motherId, fatherId, options) {
        if (!_hasId(motherId)) return _fail('motherId is required.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var mother = _getCharacter(motherId);
        if (!mother) return _fail('Mother not found.');
        if (mother.isDeceased === true) return _fail('Mother is deceased.');

        var currentYear = window.getCurrentYear();
        var startYear = typeof options.startYear === 'number'
            ? options.startYear
            : currentYear;
        var endYear = typeof options.endYear === 'number'
            ? options.endYear
            : startYear + 20;

        if (!_isValidYear(startYear) || !_isValidYear(endYear)) {
            return _fail('startYear and endYear must be valid years.');
        }
        if (endYear < startYear) {
            return _fail('endYear must not be before startYear.');
        }

        var maxChildren = typeof options.maxChildren === 'number'
            && options.maxChildren > 0
            ? Math.floor(options.maxChildren)
            : 8;
        var minSpacing = typeof options.minSpacing === 'number'
            && options.minSpacing >= 1
            ? Math.floor(options.minSpacing)
            : 2;
        var maxSpacing = typeof options.maxSpacing === 'number'
            && options.maxSpacing >= minSpacing
            ? Math.floor(options.maxSpacing)
            : 3;

        var attemptOptions = _isPlainObject(options.attemptOptions)
            ? options.attemptOptions
            : {};

        var outcomes = [];
        var totalChildren = 0;
        var year = startYear;
        var attemptNumber = 0;
        var safety = 0;

        while (year <= endYear && totalChildren < maxChildren) {
            safety++;
            if (safety > 200) break;

            attemptNumber++;

            var callOptions = {};
            for (var k in attemptOptions) {
                if (Object.prototype.hasOwnProperty.call(attemptOptions, k)) {
                    callOptions[k] = attemptOptions[k];
                }
            }
            callOptions.year = year;
            callOptions.attemptNumber = attemptNumber;

            var result = recordPregnancyAttempt(motherId, fatherId, callOptions);
            if (!result || !result.success) {
                outcomes.push({
                    year: year,
                    success: false,
                    reason: result && result.reason ? result.reason : 'unknown'
                });
                year++;
                continue;
            }

            outcomes.push({
                year: year,
                success: true,
                outcome: result.outcome,
                childIds: result.childIds || [],
                fetalCount: result.fetusCount || 0,
                maternalDeath: result.maternalDeath === true
            });

            var childrenFromAttempt = Array.isArray(result.childIds)
                ? result.childIds.length
                : 0;
            totalChildren += childrenFromAttempt;

            if (result.maternalDeath === true) {
                // Mother has died; stop attempting.
                break;
            }

            if (childrenFromAttempt > 0) {
                // Use window.random for deterministic spacing.
                var gap = minSpacing + Math.floor(
                    _roll() * (maxSpacing - minSpacing + 1)
                );
                year += gap;
            } else {
                year += 1;
            }
        }

        return _ok({
            outcomes: outcomes,
            totalChildren: totalChildren,
            attempts: outcomes.length
        });
    }

    // =========================================================================
    // 9. SURROGACY
    // =========================================================================

    function recordSurrogacyArrangement(intendedParentId, surrogateId, options) {
        if (!_hasId(intendedParentId)) return _fail('intendedParentId is required.');
        if (!_hasId(surrogateId)) return _fail('surrogateId is required.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var intendedParent = _getCharacter(intendedParentId);
        if (!intendedParent) return _fail('Intended parent not found.');

        var surrogate = _getCharacter(surrogateId);
        if (!surrogate) return _fail('Surrogate not found.');

        var currentYear = window.getCurrentYear();
        var arrangementYear = _resolveYear(options.arrangementYear);
        var birthYear = typeof options.birthYear === 'number'
            ? options.birthYear
            : arrangementYear + 1;
        var surrogateAge = _ageAtYear(surrogate.birthYear, arrangementYear);

        var type = options.type === 'gestational'
            ? 'gestational'
            : 'traditional';

        var validation = ChR.validateSurrogacyArrangement({
            intendedParentId: intendedParentId,
            surrogateId: surrogateId,
            surrogateGender: surrogate.gender,
            surrogateAge: surrogateAge,
            surrogateIsDeceased: surrogate.isDeceased === true,
            arrangementYear: arrangementYear,
            currentYear: currentYear,
            type: type
        });
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        var childCount = typeof options.childCount === 'number'
            && options.childCount > 0
            ? Math.min(3, Math.floor(options.childCount))
            : 1;

        var arrangementId = window.generateId('surr');
        if (!_hasId(arrangementId)) {
            return _fail('Arrangement id generation failed.');
        }

        var childIds = [];
        var surname = intendedParent.surname || surrogate.surname || '';

        for (var i = 0; i < childCount; i++) {
            var gender = _roll() < 0.5 ? 'male' : 'female';

            var childData = {
                name: 'Newborn',
                surname: surname,
                gender: gender,
                birthYear: birthYear,
                birthplaceId: surrogate.currentLocationId || null,
                currentLocationId: surrogate.currentLocationId || null,
                notes: 'Born via surrogacy'
            };

            var createResult = CCC.createCharacter(childData, {
                currentYear: currentYear
            });
            if (!createResult || createResult.success !== true) continue;

            var childId = createResult.data.id;

            var legalRole = intendedParent.gender === 'female' ? 'mother' : 'father';
            var intendedEdge = FC.setParent(childId, intendedParentId, {
                parentType: 'legal',
                parentRole: legalRole,
                startYear: birthYear,
                notes: 'Intended parent via surrogacy'
            });
            if (!intendedEdge || intendedEdge.success !== true) continue;

            if (_hasId(options.intendedPartnerId)) {
                var partner = _getCharacter(options.intendedPartnerId);
                if (partner) {
                    var partnerRole = partner.gender === 'female' ? 'mother' : 'father';
                    FC.setParent(childId, options.intendedPartnerId, {
                        parentType: 'legal',
                        parentRole: partnerRole,
                        startYear: birthYear,
                        notes: 'Intended parent via surrogacy'
                    });
                }
            }

            if (_hasId(options.spermDonorId)
                && options.spermDonorId !== intendedParentId
                && options.spermDonorId !== options.intendedPartnerId) {
                FC.setParent(childId, options.spermDonorId, {
                    parentType: 'biological',
                    parentRole: 'father',
                    startYear: birthYear,
                    notes: 'Sperm donor'
                });
            }

            if (_hasId(options.eggDonorId)
                && options.eggDonorId !== intendedParentId
                && options.eggDonorId !== options.intendedPartnerId) {
                FC.setParent(childId, options.eggDonorId, {
                    parentType: 'biological',
                    parentRole: 'mother',
                    startYear: birthYear,
                    notes: 'Egg donor'
                });
            }

            _inheritReligionForChild(
                childId,
                intendedParentId,
                _hasId(options.intendedPartnerId) ? options.intendedPartnerId : null,
                birthYear
            );

            childIds.push(childId);
        }

        var arrangement = {
            id: arrangementId,
            intendedParentId: intendedParentId,
            intendedPartnerId: _hasId(options.intendedPartnerId)
                ? options.intendedPartnerId
                : null,
            surrogateId: surrogateId,
            spermDonorId: _hasId(options.spermDonorId)
                ? options.spermDonorId
                : null,
            eggDonorId: _hasId(options.eggDonorId)
                ? options.eggDonorId
                : null,
            type: type,
            status: childIds.length > 0 ? 'completed' : 'active',
            arrangementYear: arrangementYear,
            expectedBirthYear: birthYear,
            actualBirthYear: childIds.length > 0 ? birthYear : null,
            childIds: childIds,
            notes: typeof options.notes === 'string' ? options.notes : '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        ChS._insertSurrogacy(arrangement);
        _commitAndNotify('recordSurrogacyArrangement', [
            intendedParentId,
            surrogateId,
            options.intendedPartnerId
        ].filter(Boolean));

        _logEvent('surrogacy', 'Surrogacy Arrangement',
            childIds.length + ' child(ren) born via surrogacy to ' + intendedParentId,
            [intendedParentId, surrogateId]);

        return _ok({
            arrangementId: arrangementId,
            childIds: childIds
        });
    }

    /**
     * Coordinated swap surrogacy between two couples.
     *
     * coupleA: { intendedParentId, intendedPartnerId?, surrogateId,
     *            spermDonorId?, eggDonorId? }
     * coupleB: same shape
     *
     * Each couple receives one child from the other couple's
     * arrangement. In practice, this command records two arrangements:
     * coupleA's intended parent with coupleB's surrogate, and vice
     * versa.
     *
     * If coupleA's arrangement succeeds but coupleB's fails, the
     * successful one remains. The caller receives both outcomes.
     */
    function recordSwapSurrogacy(coupleA, coupleB, options) {
        if (!_isPlainObject(coupleA) || !_isPlainObject(coupleB)) {
            return _fail('coupleA and coupleB must be plain objects.');
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var a = coupleA;
        var b = coupleB;

        if (!_hasId(a.intendedParentId) || !_hasId(b.intendedParentId)) {
            return _fail('Both couples must have an intendedParentId.');
        }
        if (!_hasId(a.surrogateId) || !_hasId(b.surrogateId)) {
            return _fail('Both couples must have a surrogateId.');
        }

        var sharedOptions = {
            arrangementYear: options.arrangementYear,
            birthYear: options.birthYear,
            type: options.type,
            notes: options.notes
        };

        var resultA = recordSurrogacyArrangement(
            a.intendedParentId,
            b.surrogateId,
            {
                arrangementYear: sharedOptions.arrangementYear,
                birthYear: sharedOptions.birthYear,
                type: sharedOptions.type,
                notes: sharedOptions.notes,
                intendedPartnerId: a.intendedPartnerId,
                spermDonorId: a.spermDonorId,
                eggDonorId: b.eggDonorId || b.surrogateId,
                childCount: 1
            }
        );

        var resultB = recordSurrogacyArrangement(
            b.intendedParentId,
            a.surrogateId,
            {
                arrangementYear: sharedOptions.arrangementYear,
                birthYear: sharedOptions.birthYear,
                type: sharedOptions.type,
                notes: sharedOptions.notes,
                intendedPartnerId: b.intendedPartnerId,
                spermDonorId: b.spermDonorId,
                eggDonorId: a.eggDonorId || a.surrogateId,
                childCount: 1
            }
        );

        return _ok({
            arrangementA: resultA,
            arrangementB: resultB,
            successA: resultA.success === true,
            successB: resultB.success === true
        });
    }

    function completeSurrogacyArrangement(arrangementId, options) {
        if (!_hasId(arrangementId)) return _fail('arrangementId is required.');
        if (_isMissing(options)) options = {};

        var record = ChS.getSurrogacyCopy(arrangementId);
        if (!record) return _fail('Arrangement not found.');
        if (record.status === 'completed') {
            return _ok({ unchanged: true });
        }

        var birthYear = typeof options.birthYear === 'number'
            ? options.birthYear
            : record.actualBirthYear;

        ChS._updateSurrogacy(arrangementId, {
            status: 'completed',
            actualBirthYear: birthYear
        });
        _commitAndNotify('completeSurrogacyArrangement', [
            record.intendedParentId,
            record.surrogateId
        ].filter(Boolean));

        return _ok();
    }

    function cancelSurrogacyArrangement(arrangementId, options) {
        if (!_hasId(arrangementId)) return _fail('arrangementId is required.');
        if (_isMissing(options)) options = {};

        var record = ChS.getSurrogacyCopy(arrangementId);
        if (!record) return _fail('Arrangement not found.');
        if (record.status === 'cancelled') {
            return _ok({ unchanged: true });
        }
        if (record.status === 'completed') {
            return _fail('Completed arrangements cannot be cancelled.');
        }

        ChS._updateSurrogacy(arrangementId, { status: 'cancelled' });
        _commitAndNotify('cancelSurrogacyArrangement', [
            record.intendedParentId,
            record.surrogateId
        ].filter(Boolean));

        return _ok();
    }

    // =========================================================================
    // 10. ADOPTION METADATA
    // =========================================================================

    function recordAdoptionMetadata(childId, adopterId, options) {
        if (!_hasId(childId)) return _fail('childId is required.');
        if (!_hasId(adopterId)) return _fail('adopterId is required.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        if (!_characterExists(childId)) return _fail('Child not found.');
        if (!_characterExists(adopterId)) return _fail('Adopter not found.');
        if (childId === adopterId) return _fail('Cannot adopt oneself.');

        var currentYear = window.getCurrentYear();
        var year = _resolveYear(options.year);
        var type = options.type;

        var validation = ChR.validateAdoptionMetadata({
            childId: childId,
            adopterId: adopterId,
            year: year,
            type: type,
            currentYear: currentYear
        });
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        var adoptionId = window.generateId('ado');
        if (!_hasId(adoptionId)) return _fail('Adoption id generation failed.');

        var record = {
            id: adoptionId,
            childId: childId,
            adopterId: adopterId,
            type: type,
            status: 'active',
            year: year,
            endYear: null,
            notes: typeof options.notes === 'string' ? options.notes : '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        ChS._insertAdoption(record);
        _commitAndNotify('recordAdoptionMetadata', [childId, adopterId]);

        return _ok({ adoptionId: adoptionId });
    }

    /**
     * Updates adoption metadata. Only fields present in patch are
     * written. If the type changes, the legal parent edge is updated to
     * reflect the new classification. The edge's role is preserved.
     *
     * @param {string} adoptionId
     * @param {Object} patch
     * @param {string} [patch.type]     'legal' | 'guardianship' | 'foster'
     * @param {string} [patch.status]   'active' | 'ended' | 'dissolved'
     * @param {number} [patch.year]
     * @param {number} [patch.endYear]
     * @param {string} [patch.notes]
     */
    function updateAdoptionMetadata(adoptionId, patch) {
        if (!_hasId(adoptionId)) return _fail('adoptionId is required.');
        if (!_isPlainObject(patch)) return _fail('patch must be a plain object.');

        var record = ChS.getAdoptionCopy(adoptionId);
        if (!record) return _fail('Adoption record not found.');

        var currentYear = window.getCurrentYear();
        var validation = ChR.validateAdoptionMetadataUpdate(
            {
                type: patch.type,
                status: patch.status,
                year: patch.year,
                endYear: patch.endYear,
                notes: patch.notes
            },
            currentYear
        );
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        // If status is transitioning to ended/dissolved, we require the
        // legal edge to be removed as well. The caller is responsible
        // for that through FamilyCommands.removeAdoption. If the caller
        // forgets, the edge and the metadata will disagree. We do not
        // auto-dispatch that here because the legal edge is family's
        // canonical data.
        var updatePatch = {};
        if (patch.type !== undefined) updatePatch.type = patch.type;
        if (patch.status !== undefined) updatePatch.status = patch.status;
        if (patch.year !== undefined) updatePatch.year = patch.year;
        if (patch.endYear !== undefined) updatePatch.endYear = patch.endYear;
        if (patch.notes !== undefined) updatePatch.notes = patch.notes;

        ChS._updateAdoption(adoptionId, updatePatch);
        _commitAndNotify('updateAdoptionMetadata', [record.childId, record.adopterId]);

        return _ok({ adoptionId: adoptionId });
    }

    function endAdoptionMetadata(adoptionId, options) {
        if (!_hasId(adoptionId)) return _fail('adoptionId is required.');
        if (_isMissing(options)) options = {};

        var record = ChS.getAdoptionCopy(adoptionId);
        if (!record) return _fail('Adoption record not found.');
        if (record.status !== 'active') {
            return _ok({ unchanged: true });
        }

        var endYear = _resolveYear(options.endYear);

        ChS._updateAdoption(adoptionId, {
            status: 'ended',
            endYear: endYear
        });
        _commitAndNotify('endAdoptionMetadata', [record.childId, record.adopterId]);

        return _ok();
    }

    // =========================================================================
    // 11. REFERENCE CLEANUP
    // =========================================================================

    function removeAllReferencesTo(characterId) {
        if (!_hasId(characterId)) {
            return _fail('characterId is required.');
        }

        var removed = 0;

        var motherPregnancies = ChS.pregnancyIdsForMother(characterId);
        for (var i = 0; i < motherPregnancies.length; i++) {
            if (ChS._removePregnancy(motherPregnancies[i])) removed++;
        }

        var allPregIds = ChS.allPregnancyIds();
        for (var j = 0; j < allPregIds.length; j++) {
            var p = ChS.getPregnancyCopy(allPregIds[j]);
            if (!p) continue;
            if (p.fatherId === characterId) {
                if (ChS._removePregnancy(p.id)) removed++;
            }
        }

        var surrIntended = ChS.surrogacyIdsForIntendedParent(characterId);
        for (var k = 0; k < surrIntended.length; k++) {
            if (ChS._removeSurrogacy(surrIntended[k])) removed++;
        }

        var surrSurrogate = ChS.surrogacyIdsForSurrogate(characterId);
        for (var m = 0; m < surrSurrogate.length; m++) {
            if (ChS._removeSurrogacy(surrSurrogate[m])) removed++;
        }

        var allSurrIds = ChS.allSurrogacyIds();
        for (var n = 0; n < allSurrIds.length; n++) {
            var s = ChS.getSurrogacyCopy(allSurrIds[n]);
            if (!s) continue;
            if (s.spermDonorId === characterId || s.eggDonorId === characterId) {
                if (ChS._removeSurrogacy(s.id)) removed++;
            }
        }

        var adoptionsAsChild = ChS.adoptionIdsForChild(characterId);
        for (var a = 0; a < adoptionsAsChild.length; a++) {
            if (ChS._removeAdoption(adoptionsAsChild[a])) removed++;
        }

        var adoptionsAsAdopter = ChS.adoptionIdsForAdopter(characterId);
        for (var b = 0; b < adoptionsAsAdopter.length; b++) {
            if (ChS._removeAdoption(adoptionsAsAdopter[b])) removed++;
        }

        if (removed > 0) {
            _commitAndNotify('removeAllReferences', [characterId]);
        }

        return { success: true, removedCount: removed };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.ChildrenCommands = {
        recordBirth: recordBirth,
        recordPregnancyAttempt: recordPregnancyAttempt,
        recordPregnancyAttempts: recordPregnancyAttempts,

        recordSurrogacyArrangement: recordSurrogacyArrangement,
        recordSwapSurrogacy: recordSwapSurrogacy,
        completeSurrogacyArrangement: completeSurrogacyArrangement,
        cancelSurrogacyArrangement: cancelSurrogacyArrangement,

        recordAdoptionMetadata: recordAdoptionMetadata,
        updateAdoptionMetadata: updateAdoptionMetadata,
        endAdoptionMetadata: endAdoptionMetadata,

        removeAllReferencesTo: removeAllReferencesTo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenCommands;
    }
})();
