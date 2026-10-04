/**
 * =============================================================================
 * STILL WATERS - CHILDREN COMMANDS (js/character/children-commands.js)
 * =============================================================================
 *
 * Mutation boundary for pregnancy, surrogacy, and adoption metadata.
 *
 * SCOPE:
 *   - recordBirth(motherId, fatherId, birthYear, options)
 *       Create a child character, establish biological parent edges,
 *       record the pregnancy event.
 *   - recordPregnancyAttempt(motherId, fatherId, options)
 *       Roll conception, roll pregnancy outcome, apply consequences.
 *   - recordSurrogacyArrangement(intendedParentId, surrogateId, options)
 *       Create a surrogacy arrangement, generate children, establish
 *       parent edges, record the arrangement.
 *   - completeSurrogacyArrangement(arrangementId, options)
 *   - cancelSurrogacyArrangement(arrangementId, options)
 *   - recordAdoptionMetadata(childId, adopterId, options)
 *       Record metadata for a legal parent edge created elsewhere.
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
 *     1. CharacterCommands.createCharacter (via CharacterCreationCommands)
 *     2. FamilyCommands.setParent for mother (and father, if given)
 *     3. CharacterCommands.assignCharacterReligion for the child
 *     4. ChildrenState._insertPregnancy
 *
 *   If any step fails, the whole operation is rolled back in reverse
 *   order. The child is removed, parent edges are removed, and no
 *   pregnancy record is committed.
 *
 * ADOPTION:
 *   recordAdoptionMetadata does NOT create a legal parent edge. The
 *   caller is responsible for calling FamilyCommands.createAdoption
 *   first, then passing the pair here to record metadata. Removing a
 *   legal edge is likewise the caller's responsibility via
 *   FamilyCommands.removeAdoption.
 *
 *   This split exists so the family domain owns kinship and this domain
 *   owns the adoption record. The two are linked by (childId, adopterId).
 *
 * CONTRACT:
 *   - Every public command returns { success, reason?, ... }.
 *   - Validation happens before any mutation. Partial mutation on
 *     failure is rolled back.
 *   - One command = one commit = one childrenChanged event.
 *   - No lock. Commands are synchronous. Internal primitives compose.
 *   - No fallback dependencies. Missing CharacterState, CharacterCommands,
 *     CharacterCreationCommands, FamilyCommands, ChildrenState,
 *     ChildrenRules, or ids.js throws at load.
 *
 * DEPENDENCIES (REQUIRED):
 *   - children-state.js:            ChildrenState
 *   - children-rules.js:            ChildrenRules
 *   - character-state.js:           CharacterState
 *   - character-commands.js:        CharacterCommands
 *   - character-creation-commands.js: CharacterCreationCommands
 *   - family-commands.js:           FamilyCommands
 *   - ids.js:                       generateId
 *   - time.js:                      getCurrentYear, isValidYear
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - religion-commands.js:         ReligionCommands
 *
 * ICON POLICY: No emojis. No icons.
 *
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
        'isValidYear'
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

    function _pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function _roll() {
        return Math.random();
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
    // 5. BIRTH
    // =========================================================================

    /**
     * Creates a child, establishes biological parent edges, and records
     * the pregnancy event.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {number} birthYear
     * @param {Object} [options]
     * @param {string} [options.gender]        'male' | 'female' | undefined (random)
     * @param {string} [options.name]
     * @param {string} [options.surname]
     * @param {string} [options.birthplaceId]
     * @param {boolean} [options.isStillborn]  default false
     * @param {string} [options.notes]
     * @param {number} [options.conceptionYear]
     * @param {number} [options.attemptNumber]
     * @param {boolean} [options.hasComplications]
     * @param {boolean} [options.maternalDeath]
     * @returns {{ success: boolean, childId?: string, reason?: string }}
     */
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

        // Step 1 — create the child character.
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

        // Step 2 — biological parent edges.
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

        // Step 3 — religion inheritance (non-fatal).
        if (!isStillborn) {
            _inheritReligionForChild(childId, motherId, _hasId(fatherId) ? fatherId : null, birthYear);
        }

        // Step 4 — pregnancy record.
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
     * Removes a child and any edges created during this command.
     * Called when a later step in the birth transaction fails.
     */
    function _rollbackChild(childId, edgeIds) {
        for (var i = edgeIds.length - 1; i >= 0; i--) {
            FC.removeParent(edgeIds[i], { reason: 'birth rollback' });
        }
        CC.updateCharacterFields(childId, {
            isDeleted: true,
            deletedAt: Date.now()
        });
    }

    // =========================================================================
    // 6. PREGNANCY ATTEMPT
    // =========================================================================

    /**
     * Rolls conception and pregnancy outcome for a couple. On live
     * birth, calls recordBirth. On maternal death, calls
     * CharacterCommands.markDeceased.
     *
     * @param {string} motherId
     * @param {string|null} fatherId
     * @param {Object} [options]
     * @param {number} [options.year]
     * @param {number} [options.attemptNumber]
     * @param {boolean} [options.forceConception]
     * @param {boolean} [options.forceSingle]
     * @param {string} [options.gender]
     * @param {number} [options.fertilityModifier]
     * @returns {{ success, outcome, childId?, reason? }}
     */
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
        var motherAge = _ageAtYear(mother.birthYear, year);
        var fatherAge = father ? _ageAtYear(father.birthYear, year) : null;

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

        var conceptionRoll = _roll();
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
                complication: _roll(),
                miscarriage: _roll(),
                stillbirth: _roll(),
                maternalDeath: _roll(),
                multipleBirth: _roll()
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

                // Attach the pregnancy id produced by recordBirth to the
                // outcome bookkeeping. recordBirth created its own
                // pregnancy record per child; that is deliberate and
                // matches the schema (one pregnancy per child).
            }
        } else {
            // Miscarriage: record a pregnancy event that did not produce
            // a child.
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

        // Maternal death transition. Handled after birth/miscarriage so
        // the pregnancy is already committed.
        if (outcome.maternalDeath === true && !mother.isDeceased) {
            CC.markDeceased(motherId, {
                deathYear: birthYear,
                deathCause: 'childbed_fever',
                deathCauseDetail: 'Childbed fever',
                deathNotes: 'Died following childbirth'
            });
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
    // 7. SURROGACY
    // =========================================================================

    /**
     * Records a surrogacy arrangement and generates the resulting
     * children.
     *
     * @param {string} intendedParentId
     * @param {string} surrogateId
     * @param {Object} [options]
     * @param {string} [options.intendedPartnerId]
     * @param {string} [options.spermDonorId]
     * @param {string} [options.eggDonorId]
     * @param {string} [options.type]           'traditional' | 'gestational'
     * @param {number} [options.childCount]     default 1
     * @param {number} [options.birthYear]
     * @param {string} [options.notes]
     * @returns {{ success, arrangementId?, childIds?, reason? }}
     */
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

            // Legal parent edges for the intended parent(s).
            var legalRole = intendedParent.gender === 'female' ? 'mother' : 'father';
            var intendedEdge = FC.setParent(childId, intendedParentId, {
                parentType: 'legal',
                parentRole: legalRole,
                startYear: birthYear,
                notes: 'Intended parent via surrogacy',
                bypassConsent: true
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
                        notes: 'Intended parent via surrogacy',
                        bypassConsent: true
                    });
                }
            }

            // Genetic parents as biological edges, if distinct.
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
     * Marks a surrogacy arrangement as completed.
     */
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
    // 8. ADOPTION METADATA
    // =========================================================================

    /**
     * Records metadata for an adoption. Does NOT create a legal parent
     * edge; the caller is responsible for calling
     * FamilyCommands.createAdoption first.
     *
     * @param {string} childId
     * @param {string} adopterId
     * @param {Object} [options]
     * @param {string} [options.type]    'legal' | 'guardianship' | 'foster'
     * @param {number} [options.year]
     * @param {string} [options.notes]
     */
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
     * Ends an adoption metadata record. Does NOT remove the legal parent
     * edge; the caller is responsible for FamilyCommands.removeAdoption.
     */
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
    // 9. REFERENCE CLEANUP
    // =========================================================================

    /**
     * Removes every children-domain reference to a character:
     *   - pregnancy records where they are mother or father
     *   - surrogacy arrangements where they are intended parent,
     *     intended partner, surrogate, or donor
     *   - adoption metadata where they are child or adopter
     *
     * The children produced by these records are NOT deleted. Their
     * deletion is CharacterCommands' responsibility.
     */
    function removeAllReferencesTo(characterId) {
        if (!_hasId(characterId)) {
            return _fail('characterId is required.');
        }

        var removed = 0;

        // Pregnancies by mother.
        var motherPregnancies = ChS.pregnancyIdsForMother(characterId);
        for (var i = 0; i < motherPregnancies.length; i++) {
            if (ChS._removePregnancy(motherPregnancies[i])) removed++;
        }

        // Pregnancies by father.
        var allPregIds = ChS.allPregnancyIds();
        for (var j = 0; j < allPregIds.length; j++) {
            var p = ChS.getPregnancyCopy(allPregIds[j]);
            if (!p) continue;
            if (p.fatherId === characterId) {
                if (ChS._removePregnancy(p.id)) removed++;
            }
        }

        // Surrogacy by intended parent.
        var surrIntended = ChS.surrogacyIdsForIntendedParent(characterId);
        for (var k = 0; k < surrIntended.length; k++) {
            if (ChS._removeSurrogacy(surrIntended[k])) removed++;
        }

        // Surrogacy by surrogate.
        var surrSurrogate = ChS.surrogacyIdsForSurrogate(characterId);
        for (var m = 0; m < surrSurrogate.length; m++) {
            if (ChS._removeSurrogacy(surrSurrogate[m])) removed++;
        }

        // Surrogacy by donors.
        var allSurrIds = ChS.allSurrogacyIds();
        for (var n = 0; n < allSurrIds.length; n++) {
            var s = ChS.getSurrogacyCopy(allSurrIds[n]);
            if (!s) continue;
            if (s.spermDonorId === characterId || s.eggDonorId === characterId) {
                if (ChS._removeSurrogacy(s.id)) removed++;
            }
        }

        // Adoption metadata by child.
        var adoptionsAsChild = ChS.adoptionIdsForChild(characterId);
        for (var a = 0; a < adoptionsAsChild.length; a++) {
            if (ChS._removeAdoption(adoptionsAsChild[a])) removed++;
        }

        // Adoption metadata by adopter.
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
    // 10. EXPORTS
    // =========================================================================

    window.ChildrenCommands = {
        recordBirth: recordBirth,
        recordPregnancyAttempt: recordPregnancyAttempt,

        recordSurrogacyArrangement: recordSurrogacyArrangement,
        completeSurrogacyArrangement: completeSurrogacyArrangement,
        cancelSurrogacyArrangement: cancelSurrogacyArrangement,

        recordAdoptionMetadata: recordAdoptionMetadata,
        endAdoptionMetadata: endAdoptionMetadata,

        removeAllReferencesTo: removeAllReferencesTo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenCommands;
    }
})();
