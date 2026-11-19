/**
 * =============================================================================
 * STILL WATERS - FAMILY COMMANDS (js/character/family-commands.js)
 * =============================================================================
 *
 * Mutation boundary for the family domain.
 *
 * SCOPE:
 *   - setParent(childId, parentId, options)       create a parent_child edge
 *   - removeParent(childId, parentId, options)    end a parent_child edge
 *   - createAdoption(childId, adopterId, options) create a legal parent edge
 *   - removeAdoption(childId, adopterId, options) end a legal parent edge
 *   - changeParentType(edgeId, newType)           reclassify an edge
 *   - handleCharacterDeath(characterId, year)     end family edges for a deceased character
 *   - removeAllReferencesTo(characterId)          cleanup on hard delete
 *
 * OUT OF SCOPE:
 *   - Edge validity policy           → family-rules.js
 *   - Projections and traversal      → family-queries.js
 *   - Aggregation                    → family-statistics.js
 *   - Storage format                 → family-state.js + storage.js
 *   - Events beyond familyChanged    → caller
 *
 * CONTRACT:
 *   - Every command returns { success, reason?, ... }.
 *   - Validation happens before any mutation. Partial mutation on failure
 *     is not permitted.
 *   - One command = one commit = one familyChanged event.
 *   - No lock. Commands are synchronous. No public command calls another
 *     public command. Internal primitives compose.
 *   - No fallback dependencies. If FamilyState, FamilyRules, FamilyQueries,
 *     CharacterState, ids.js, or time.js is missing at load, throw.
 *
 * DEPENDENCIES (REQUIRED):
 *   - family-state.js:    FamilyState
 *   - family-rules.js:    FamilyRules
 *   - family-queries.js:  FamilyQueries
 *   - character-state.js: CharacterState (existence check + dirty marker)
 *   - ids.js:             generateId
 *   - time.js:            getCurrentYear
 *
 * DEPENDENCIES (OPTIONAL):
 *   - event-log.js (logEvent) — called if present, no fallback
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

    var _required = [
        'FamilyState',
        'FamilyRules',
        'FamilyQueries',
        'CharacterState',
        'generateId',
        'getCurrentYear'
    ];
    var _missing = [];
    for (var i = 0; i < _required.length; i++) {
        if (typeof window[_required[i]] === 'undefined') {
            _missing.push(_required[i]);
        }
    }
    if (_missing.length > 0) {
        throw new Error(
            'family-commands.js: missing required dependencies: ' +
            _missing.join(', ')
        );
    }

    var FS = window.FamilyState;
    var FR = window.FamilyRules;
    var FQ = window.FamilyQueries;
    var CS = window.CharacterState;

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
        if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
            return false;
        }
        if (typeof window.isValidYear === 'function') {
            return window.isValidYear(v) === true;
        }
        return true;
    }

    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    function _characterExists(id) {
        if (!_hasId(id)) return false;
        if (typeof CS.hasCharacter === 'function') return CS.hasCharacter(id);
        return CS.getCharacter(id) !== null;
    }

    /**
     * Projects a character to a minimal shape used only for age checks
     * inside canSetParent. CharacterState projections carry birthYear,
     * isDeceased, and deathYear.
     */
    function _getBirthYear(id) {
        if (!_hasId(id)) return null;
        var c = CS.getCharacter(id);
        if (!c) return null;
        return typeof c.birthYear === 'number' ? c.birthYear : null;
    }

    function _ageAtYear(birthYear, year) {
        if (typeof birthYear !== 'number') return null;
        if (typeof year !== 'number') return null;
        var age = year - birthYear;
        return age >= 0 ? age : 0;
    }

    // =========================================================================
    // 3. PERSISTENCE AND NOTIFICATION
    // =========================================================================

    /**
     * Writes the current edge snapshot to masterData and marks data dirty.
     *
     * CharacterState owns the dirty flag. This command does not call
     * saveMasterData directly; storage decides when to flush.
     */
    function _commit() {
        if (!window.masterData || !window.masterData.data) {
            return false;
        }
        window.masterData.data.parentChildEdges = FS.snapshot();
        if (typeof window.markDataDirty === 'function') {
            window.markDataDirty();
        }
        return true;
    }

    function _notify(action, characterIds) {
        try {
            window.dispatchEvent(new CustomEvent('familyChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('family-commands.js: familyChanged dispatch failed:', e);
            }
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _commitAndNotify(action, characterIds) {
        _commit();
        _notify(action, characterIds);
    }

    // =========================================================================
    // 4. BIOLOGICAL CYCLE CHECK
    // =========================================================================

    /**
     * FamilyRules.wouldCreateBiologicalCycle needs a provider. The provider
     * must NOT be the live graph while we are testing whether the graph
     * with the proposed edge would cycle. We construct a provider that
     * already includes the proposed edge.
     */
    function _providerWithProposedBiologicalEdge(childId, parentId) {
        return function (characterId) {
            if (!_hasId(characterId)) return null;
            var parents = FQ.getBiologicalParentIds(characterId);
            if (characterId === childId && parents.indexOf(parentId) === -1) {
                parents = parents.slice();
                parents.push(parentId);
            }
            return { id: characterId, parents: parents };
        };
    }

    // =========================================================================
    // 5. SET PARENT
    // =========================================================================

    /**
     * Creates a parent_child edge.
     *
     * @param {string} childId
     * @param {string} parentId
     * @param {Object} options
     * @param {string} options.parentType  'biological' | 'legal' | 'social'
     * @param {string} options.parentRole  'father' | 'mother' | 'parent'
     * @param {number} [options.startYear]
     * @param {string} [options.notes]
     * @param {boolean} [options.allowReplace]  permit replacing an existing
     *                                          biological parent at the same role
     * @returns {{ success: boolean, edgeId?: string, reason?: string }}
     */
    function setParent(childId, parentId, options) {
        if (!_hasId(childId)) return _fail('childId is required.');
        if (!_hasId(parentId)) return _fail('parentId is required.');
        if (childId === parentId) return _fail('A character cannot be their own parent.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) return _fail('options must be a plain object.');

        if (!_characterExists(childId)) return _fail('Child not found.');
        if (!_characterExists(parentId)) return _fail('Parent not found.');

        var parentType = options.parentType;
        if (!FR.isValidParentType(parentType)) {
            return _fail('parentType must be biological, legal, or social.');
        }

        var roleResult = FR.normalizeParentRole(options.parentRole, options.parentGender);
        if (!roleResult.ok) return _fail(roleResult.reason);
        var parentRole = roleResult.value;

        if (!_isMissing(options.startYear) && !_isValidYear(options.startYear)) {
            return _fail('startYear must be a valid world year.');
        }
        var startYear = _resolveYear(options.startYear);

        // Idempotency: if an active edge already exists with the same
        // (child, parent, type, role), return it.
        var existing = FQ.getEdgesForChild(childId, { status: 'ongoing' });
        for (var i = 0; i < existing.length; i++) {
            var e = existing[i];
            if (e.parentId !== parentId) continue;
            if (e.parentType !== parentType) continue;
            if (e.parentRole !== parentRole) continue;
            return _ok({ edgeId: e.id, unchanged: true });
        }

        // Collect existing biological parents at this role, excluding the
        // proposed parent.
        var existingBioAtRole = [];
        if (parentType === FR.PARENT_TYPE.BIOLOGICAL) {
            for (var j = 0; j < existing.length; j++) {
                var cur = existing[j];
                if (cur.parentType !== FR.PARENT_TYPE.BIOLOGICAL) continue;
                if (cur.parentRole !== parentRole) continue;
                if (cur.parentId === parentId) continue;
                existingBioAtRole.push(cur.parentId);
            }
        }

        var childBirthYear = _getBirthYear(childId);
        var parentBirthYear = _getBirthYear(parentId);
        var yearForAge = startYear;

        var validation = FR.canSetParent({
            childId: childId,
            parentId: parentId,
            parentType: parentType,
            parentRole: parentRole,
            childAgeAtStart: _ageAtYear(childBirthYear, yearForAge),
            parentAgeAtStart: _ageAtYear(parentBirthYear, yearForAge),
            existingBiologicalParentsAtSameRole: existingBioAtRole,
            allowReplace: options.allowReplace === true
        });
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        // Biological cycle prevention (unbounded traversal).
        if (parentType === FR.PARENT_TYPE.BIOLOGICAL) {
            var provider = _providerWithProposedBiologicalEdge(childId, parentId);
            var cycle = FR.wouldCreateBiologicalCycle(childId, parentId, provider);
            if (cycle) return _fail('Setting this parent would create a genealogy cycle.');
        }

        // If replacing a biological parent at the same role, end the old edge.
        if (parentType === FR.PARENT_TYPE.BIOLOGICAL
            && options.allowReplace === true
            && existingBioAtRole.length > 0) {
            for (var k = 0; k < existing.length; k++) {
                var old = existing[k];
                if (old.parentType !== FR.PARENT_TYPE.BIOLOGICAL) continue;
                if (old.parentRole !== parentRole) continue;
                if (existingBioAtRole.indexOf(old.parentId) === -1) continue;
                FS._update(old.id, {
                    status: 'ended',
                    endYear: startYear
                });
            }
        }

        var edgeId = window.generateId('fedge');
        if (!_hasId(edgeId)) return _fail('Edge id generation failed.');

        var now = Date.now();
        var edge = {
            id: edgeId,
            parentId: parentId,
            childId: childId,
            parentType: parentType,
            parentRole: parentRole,
            startYear: startYear,
            endYear: null,
            status: 'ongoing',
            notes: typeof options.notes === 'string' ? options.notes : '',
            createdAt: now,
            updatedAt: now
        };

        FS._insert(edge);
        _commitAndNotify('setParent', [childId, parentId]);

        _logEvent('family', 'Parent Set',
            'Parent edge set: ' + parentId + ' -> ' + childId + ' (' + parentType + ', ' + parentRole + ')',
            [childId, parentId]);

        return _ok({ edgeId: edgeId });
    }

    // =========================================================================
    // 6. REMOVE PARENT
    // =========================================================================

    /**
     * Ends a specific parent edge.
     *
     * @param {string} edgeId
     * @param {Object} [options]
     * @param {number} [options.endYear]
     * @param {string} [options.reason]
     * @returns {{ success: boolean, reason?: string }}
     */
    function removeParent(edgeId, options) {
        if (!_hasId(edgeId)) return _fail('edgeId is required.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) return _fail('options must be a plain object.');

        var edge = FS.getEdgeCopy(edgeId);
        if (!edge) return _fail('Parent edge not found.');
        if (edge.status !== 'ongoing') {
            return _fail('Parent edge is not active.');
        }

        if (!_isMissing(options.endYear) && !_isValidYear(options.endYear)) {
            return _fail('endYear must be a valid world year.');
        }
        var endYear = _resolveYear(options.endYear);

        FS._update(edgeId, {
            status: 'ended',
            endYear: endYear,
            notes: (typeof options.reason === 'string' && options.reason.length > 0)
                ? (edge.notes ? edge.notes + ' | ' + options.reason : options.reason)
                : edge.notes
        });

        _commitAndNotify('removeParent', [edge.childId, edge.parentId]);
        return _ok();
    }

    /**
     * Ends the active biological parent edge for a child and role, if any.
     * Convenience wrapper used by role-based callers.
     */
    function removeBiologicalParentAtRole(childId, parentRole, options) {
        if (!_hasId(childId)) return _fail('childId is required.');
        if (!FR.isValidParentRole(parentRole)) {
            return _fail('parentRole must be father, mother, or parent.');
        }
        options = options || {};

        var edges = FQ.getEdgesForChild(childId, { status: 'ongoing' });
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (e.parentType !== FR.PARENT_TYPE.BIOLOGICAL) continue;
            if (e.parentRole !== parentRole) continue;
            return removeParent(e.id, options);
        }
        return _fail('No active biological parent at this role.');
    }

    // =========================================================================
    // 7. ADOPTION
    // =========================================================================

    /**
     * Creates a legal parent edge representing an adoption.
     *
     * @param {string} childId
     * @param {string} adopterId
     * @param {Object} options
     * @param {string} [options.parentRole]  'father' | 'mother' | 'parent'
     * @param {number} [options.startYear]
     * @param {string} [options.notes]
     * @param {boolean} [options.bypassConsent]  caller asserts consent
     * @param {boolean} [options.allowReplace]   permit replacing existing legal at role
     * @returns {{ success: boolean, edgeId?: string, reason?: string }}
     */
    function createAdoption(childId, adopterId, options) {
        if (!_hasId(childId)) return _fail('childId is required.');
        if (!_hasId(adopterId)) return _fail('adopterId is required.');
        if (childId === adopterId) return _fail('A character cannot adopt themselves.');
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) return _fail('options must be a plain object.');

        if (!_characterExists(childId)) return _fail('Child not found.');
        if (!_characterExists(adopterId)) return _fail('Adopter not found.');

        var roleResult = FR.normalizeParentRole(options.parentRole, options.parentGender);
        if (!roleResult.ok) return _fail(roleResult.reason);
        var parentRole = roleResult.value;

        if (!_isMissing(options.startYear) && !_isValidYear(options.startYear)) {
            return _fail('startYear must be a valid world year.');
        }
        var startYear = _resolveYear(options.startYear);

        // Consent facts.
        var livingBio = FQ.getBiologicalParentIds(childId);
        var childHasLivingBioParents = livingBio.length > 0;

        // Conflict: is there already an active legal parent at this role?
        var legalEdges = FQ.getEdgesForChild(childId, {
            status: 'ongoing',
            parentType: FR.PARENT_TYPE.LEGAL,
            parentRole: parentRole
        });
        var conflict = legalEdges.length > 0;

        var validation = FR.canCreateAdoption({
            childId: childId,
            adopterIds: [adopterId],
            childHasLivingBiologicalParents: childHasLivingBioParents,
            biologicalParentsConsent: options.biologicalParentsConsent === true,
            bypassConsent: options.bypassConsent === true,
            conflictWithExistingLegalParentAtRole: conflict,
            allowReplace: options.allowReplace === true
        });
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        // Idempotency: existing active legal edge at same role for same adopter.
        for (var i = 0; i < legalEdges.length; i++) {
            if (legalEdges[i].parentId === adopterId) {
                return _ok({ edgeId: legalEdges[i].id, unchanged: true });
            }
        }

        // End conflicting legal edges if allowReplace.
        if (conflict && options.allowReplace === true) {
            for (var j = 0; j < legalEdges.length; j++) {
                FS._update(legalEdges[j].id, {
                    status: 'ended',
                    endYear: startYear
                });
            }
        }

        var edgeId = window.generateId('fedge');
        if (!_hasId(edgeId)) return _fail('Edge id generation failed.');

        var now = Date.now();
        var edge = {
            id: edgeId,
            parentId: adopterId,
            childId: childId,
            parentType: FR.PARENT_TYPE.LEGAL,
            parentRole: parentRole,
            startYear: startYear,
            endYear: null,
            status: 'ongoing',
            notes: typeof options.notes === 'string' ? options.notes : 'adoption',
            createdAt: now,
            updatedAt: now
        };

        FS._insert(edge);
        _commitAndNotify('createAdoption', [childId, adopterId]);

        _logEvent('family', 'Adoption Created',
            'Adoption: ' + adopterId + ' -> ' + childId,
            [childId, adopterId]);

        return _ok({ edgeId: edgeId });
    }

    /**
     * Ends the active legal parent edge between adopter and child, if any.
     */
    function removeAdoption(childId, adopterId, options) {
        if (!_hasId(childId)) return _fail('childId is required.');
        if (!_hasId(adopterId)) return _fail('adopterId is required.');
        options = options || {};

        var edges = FQ.getEdgesForChild(childId, {
            status: 'ongoing',
            parentType: FR.PARENT_TYPE.LEGAL
        });
        for (var i = 0; i < edges.length; i++) {
            if (edges[i].parentId === adopterId) {
                return removeParent(edges[i].id, options);
            }
        }
        return _fail('No active adoption found.');
    }

    // =========================================================================
    // 8. RECLASSIFY
    // =========================================================================

    /**
     * Reclassifies an edge between biological and legal (rare; used for
     * legitimization, if your world later adds it).
     *
     * This command does not implement legitimization. It is the primitive
     * that legitimization would call.
     */
    function changeParentType(edgeId, newType, options) {
        if (!_hasId(edgeId)) return _fail('edgeId is required.');
        if (!FR.isValidParentType(newType)) {
            return _fail('newType must be biological, legal, or social.');
        }
        options = options || {};

        var edge = FS.getEdgeCopy(edgeId);
        if (!edge) return _fail('Parent edge not found.');
        if (edge.status !== 'ongoing') return _fail('Parent edge is not active.');
        if (edge.parentType === newType) return _ok({ unchanged: true });

        // If transitioning to biological, run cycle check against the
        // current graph with the edge already present.
        if (newType === FR.PARENT_TYPE.BIOLOGICAL) {
            var provider = FQ.getAncestorProvider();
            var cycle = FR.wouldCreateBiologicalCycle(edge.childId, edge.parentId, provider);
            if (cycle) return _fail('Reclassification would create a genealogy cycle.');
        }

        FS._update(edgeId, {
            parentType: newType,
            updatedAt: Date.now()
        });
        _commitAndNotify('changeParentType', [edge.childId, edge.parentId]);
        return _ok();
    }

    // =========================================================================
    // 9. DEATH HANDLING
    // =========================================================================

    /**
     * Ends every active edge in which the deceased character is either
     * parent or child. Called by character-lifecycle.js after a death
     * transition.
     *
     * @param {string} characterId
     * @param {number} [year]
     * @returns {{ success: boolean, endedCount: number, reason?: string }}
     */
    function handleCharacterDeath(characterId, year) {
        if (!_hasId(characterId)) {
            return _fail('characterId is required.');
        }
        if (!_isMissing(year) && !_isValidYear(year)) {
            return _fail('year must be a valid world year.');
        }
        var endYear = _resolveYear(year);

        var touched = 0;
        var affectedCharacters = {};

        var asParent = FQ.getEdgesForParent(characterId, { status: 'ongoing' });
        for (var i = 0; i < asParent.length; i++) {
            var e = asParent[i];
            FS._update(e.id, { status: 'ended', endYear: endYear });
            touched++;
            affectedCharacters[e.childId] = true;
        }

        var asChild = FQ.getEdgesForChild(characterId, { status: 'ongoing' });
        for (var j = 0; j < asChild.length; j++) {
            var c = asChild[j];
            FS._update(c.id, { status: 'ended', endYear: endYear });
            touched++;
            affectedCharacters[c.parentId] = true;
        }

        if (touched > 0) {
            var ids = Object.keys(affectedCharacters);
            ids.push(characterId);
            _commitAndNotify('handleCharacterDeath', ids);
        }

        return { success: true, endedCount: touched };
    }

    // =========================================================================
    // 10. REFERENCE CLEANUP
    // =========================================================================

    /**
     * Removes every edge in which characterId appears as parent or child.
     * Used by character-deletion-commands.js after hard delete.
     *
     * @param {string} characterId
     * @returns {{ success: boolean, removedCount: number }}
     */
    function removeAllReferencesTo(characterId) {
        if (!_hasId(characterId)) {
            return _fail('characterId is required.');
        }

        var allIds = FS.allIds();
        var removed = 0;
        var affected = {};

        for (var i = 0; i < allIds.length; i++) {
            var edge = FS.getEdgeCopy(allIds[i]);
            if (!edge) continue;
            if (edge.parentId !== characterId && edge.childId !== characterId) continue;
            if (edge.parentId !== characterId) affected[edge.parentId] = true;
            if (edge.childId !== characterId) affected[edge.childId] = true;
            FS._remove(edge.id);
            removed++;
        }

        if (removed > 0) {
            var ids = Object.keys(affected);
            _commitAndNotify('removeAllReferences', ids);
        }

        return { success: true, removedCount: removed };
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.FamilyCommands = {
        setParent: setParent,
        removeParent: removeParent,
        removeBiologicalParentAtRole: removeBiologicalParentAtRole,

        createAdoption: createAdoption,
        removeAdoption: removeAdoption,

        changeParentType: changeParentType,

        handleCharacterDeath: handleCharacterDeath,
        removeAllReferencesTo: removeAllReferencesTo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyCommands;
    }
})();
