/**
 * =============================================================================
 * STILL WATERS - FAMILY COMMANDS (js/character/family-commands.js)
 * =============================================================================
 *
 * Canonical mutation boundary for the family relationship graph.
 *
 * SCOPE:
 *   - Setting and clearing biological parent relationships
 *   - Setting and clearing adoptive parent relationships
 *   - Recording adoption metadata (type, year, status)
 *   - Removing all references to a character (used by character deletion)
 *
 * OUT OF SCOPE:
 *   - Reading the family graph → FamilyAccessors
 *   - Answering semantic family questions → family-statistics.js
 *   - Persistence mechanics → storage.js
 *   - UI notifications → caller
 *   - Character creation/lifecycle orchestration → CharacterCommands,
 *     CharacterLifecycle (which call into this module)
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) optional arguments use documented defaults.
 *   - Invalid explicit arguments are rejected. No silent coercion.
 *   - Year 0 is preserved wherever a year is stored.
 *   - All mutations are performed as a single commit: one markDataDirty,
 *     one familyChanged event.
 *   - This module mutates the canonical character objects owned by
 *     masterData.data.characters. It does not own the collection itself.
 *   - Mutation is idempotent: setting a parent that is already set is a
 *     no-op (returns success). Clearing a parent that is not set is a no-op.
 *   - Parent links are stored on the child. Removing the child's reference
 *     removes the graph edge. The parent's `children` array (if present in
 *     legacy data) is updated to stay consistent.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData, markDataDirty
 *   - accessors.js: getCharacterById, getCharacters
 *   - time.js:      getCurrentYear, isValidYear
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
            'masterData',
            'markDataDirty',
            'getCharacterById',
            'getCharacters',
            'getCurrentYear',
            'isValidYear'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'family-commands.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    // Mutation lock. Public commands acquire it; internal primitives assume
    // the lock is held. Public commands MUST NOT call other public commands.
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
        return { success: false, reason: 'Another family mutation is in progress' };
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
     * Commits a single mutation. Emits exactly one familyChanged event
     * carrying the affected character IDs.
     */
    function _commit(action, characterIds) {
        window.markDataDirty();
        window.dispatchEvent(new CustomEvent('familyChanged', {
            detail: {
                action: action,
                characterIds: characterIds || []
            }
        }));
    }

    function _resolveCharacter(id) {
        if (!_hasId(id)) return null;
        return window.getCharacterById(id);
    }

    /**
     * Validates that parentType is one of the accepted values.
     * Returns the canonical string, or null if invalid.
     */
    function _normalizeParentType(parentType) {
        if (parentType === 'mother') return 'mother';
        if (parentType === 'father') return 'father';
        return null;
    }

    /**
     * Returns the field name on the child that stores the biological
     * parent's ID, or null if the parent type is invalid.
     */
    function _biologicalFieldFor(parentType) {
        if (parentType === 'mother') return 'motherId';
        if (parentType === 'father') return 'fatherId';
        return null;
    }

    /**
     * Returns the opposite parent type.
     */
    function _oppositeParentType(parentType) {
        if (parentType === 'mother') return 'father';
        if (parentType === 'father') return 'mother';
        return null;
    }

    /**
     * Ensures parent.children exists as an array. Legacy data may not have
     * this field; the graph edge is authoritative on the child, but the
     * parent-side array is maintained for compatibility.
     */
    function _ensureParentChildrenArray(parent) {
        if (!Array.isArray(parent.children)) parent.children = [];
    }

    /**
     * Adds a child ID to the parent's children array if it is not already
     * present. Returns true if a change was made.
     */
    function _addChildToParentArray(parent, childId) {
        _ensureParentChildrenArray(parent);
        if (parent.children.indexOf(childId) === -1) {
            parent.children.push(childId);
            return true;
        }
        return false;
    }

    /**
     * Removes a child ID from the parent's children array if it is present.
     * Returns true if a change was made.
     */
    function _removeChildFromParentArray(parent, childId) {
        if (!Array.isArray(parent.children)) return false;
        var index = parent.children.indexOf(childId);
        if (index === -1) return false;
        parent.children.splice(index, 1);
        return true;
    }

    /**
     * Resolves a year argument, falling back to the current year when the
     * argument is missing. Year 0 is preserved.
     */
    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    /**
     * Validates a year argument.
     */
    function _validateYear(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!window.isValidYear(value)) {
            return { ok: false, reason: name + ' must be a valid world year' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates that a parentType is one of the accepted values, and returns
     * it normalized. Returns { ok: true, value } or { ok: false, reason }.
     */
    function _validateParentType(parentType) {
        var normalized = _normalizeParentType(parentType);
        if (normalized === null) {
            return {
                ok: false,
                reason: 'parentType must be "mother" or "father"'
            };
        }
        return { ok: true, value: normalized };
    }

    /**
     * Returns the index of an adoptive-parent record in a child's
     * adoptedParents array. Returns -1 if not found.
     */
    function _findAdoptiveIndex(adoptedParents, parentId) {
        if (!Array.isArray(adoptedParents)) return -1;
        for (var i = 0; i < adoptedParents.length; i++) {
            if (adoptedParents[i] && adoptedParents[i].parentId === parentId) {
                return i;
            }
        }
        return -1;
    }

    // =========================================================================
    // 3. INTERNAL PRIMITIVES
    // =========================================================================
    //
    // These assume the lock is held. They perform raw graph mutations and
    // return { ok: true, changed: boolean, reason? } or { ok: false, reason }.
    //
    // "changed: false" is a legitimate no-op result and does not indicate
    // failure. Public commands decide whether to emit an event based on
    // whether any primitive reported changed: true.

    /**
     * Sets a biological parent on a child.
     *
     * Idempotent: if the field is already set to the requested parent,
     * returns ok with changed: false.
     *
     * @private
     */
    function _setBiologicalParentInternal(childId, parentId, parentType) {
        var child = _resolveCharacter(childId);
        if (!child) return { ok: false, reason: 'Child not found' };

        var parent = _resolveCharacter(parentId);
        if (!parent) return { ok: false, reason: 'Parent not found' };

        if (childId === parentId) {
            return { ok: false, reason: 'A character cannot be their own parent' };
        }

        var field = _biologicalFieldFor(parentType);
        if (!field) return { ok: false, reason: 'Invalid parent type' };

        if (child[field] === parentId) {
            return { ok: true, changed: false };
        }

        // Cycle detection: refuse if parentId is a descendant of childId.
        if (_wouldCreateCycle(childId, parentId)) {
            return { ok: false, reason: 'Setting this parent would create a genealogy cycle' };
        }

        // If the previous parent reference existed, remove this child from
        // their children array.
        var previousParentId = child[field];
        if (_hasId(previousParentId)) {
            var previous = _resolveCharacter(previousParentId);
            if (previous) _removeChildFromParentArray(previous, childId);
        }

        child[field] = parentId;
        _addChildToParentArray(parent, childId);

        child.updatedAt = Date.now();
        parent.updatedAt = Date.now();
        return { ok: true, changed: true };
    }

    /**
     * Clears a biological parent reference on a child.
     *
     * Idempotent: if the field is already empty, returns ok with changed: false.
     *
     * @private
     */
    function _removeBiologicalParentInternal(childId, parentType) {
        var child = _resolveCharacter(childId);
        if (!child) return { ok: false, reason: 'Child not found' };

        var field = _biologicalFieldFor(parentType);
        if (!field) return { ok: false, reason: 'Invalid parent type' };

        var parentId = child[field];
        if (!_hasId(parentId)) {
            return { ok: true, changed: false };
        }

        var parent = _resolveCharacter(parentId);
        if (parent) _removeChildFromParentArray(parent, childId);

        child[field] = null;
        child.updatedAt = Date.now();
        if (parent) parent.updatedAt = Date.now();

        return { ok: true, changed: true };
    }

    /**
     * Sets an adoptive-parent record on a child.
     *
     * If an active record for this parent already exists, the call is a
     * no-op unless the caller explicitly updates the metadata.
     *
     * @private
     */
    function _setAdoptiveParentInternal(childId, parentId, options) {
        var child = _resolveCharacter(childId);
        if (!child) return { ok: false, reason: 'Child not found' };

        var parent = _resolveCharacter(parentId);
        if (!parent) return { ok: false, reason: 'Parent not found' };

        if (childId === parentId) {
            return { ok: false, reason: 'A character cannot be their own parent' };
        }

        if (_wouldCreateCycle(childId, parentId)) {
            return { ok: false, reason: 'Setting this adoptive parent would create a genealogy cycle' };
        }

        if (!Array.isArray(child.adoptedParents)) child.adoptedParents = [];

        var existing = _findAdoptiveIndex(child.adoptedParents, parentId);
        if (existing !== -1) {
            var record = child.adoptedParents[existing];
            // Update metadata if explicitly supplied.
            var updated = false;
            if (!_isMissing(options.parentType) && options.parentType !== record.parentType) {
                record.parentType = options.parentType;
                updated = true;
            }
            if (!_isMissing(options.type) && options.type !== record.type) {
                record.type = options.type;
                updated = true;
            }
            if (!_isMissing(options.year) && options.year !== record.year) {
                record.year = options.year;
                updated = true;
            }
            if (!_isMissing(options.notes) && options.notes !== record.notes) {
                record.notes = options.notes;
                updated = true;
            }
            if (record.status === 'ended' && options.reopen !== true) {
                return { ok: false, reason: 'Adoption record is ended; pass reopen: true to reactivate' };
            }
            if (record.status === 'ended') {
                record.status = 'ongoing';
                updated = true;
            }
            return { ok: true, changed: updated };
        }

        var newRecord = {
            parentId: parentId,
            status: 'ongoing',
            year: _resolveYear(options.year)
        };
        if (!_isMissing(options.parentType)) newRecord.parentType = options.parentType;
        if (!_isMissing(options.type)) newRecord.type = options.type;
        if (!_isMissing(options.notes)) newRecord.notes = options.notes;

        child.adoptedParents.push(newRecord);
        child.updatedAt = Date.now();
        parent.updatedAt = Date.now();

        return { ok: true, changed: true };
    }

    /**
     * Ends an adoptive-parent record on a child.
     *
     * Idempotent: if no matching active record exists, returns ok with
     * changed: false.
     *
     * @private
     */
    function _removeAdoptiveParentInternal(childId, parentId) {
        var child = _resolveCharacter(childId);
        if (!child) return { ok: false, reason: 'Child not found' };

        if (!Array.isArray(child.adoptedParents)) {
            return { ok: true, changed: false };
        }

        var index = _findAdoptiveIndex(child.adoptedParents, parentId);
        if (index === -1) {
            return { ok: true, changed: false };
        }

        // We remove the record entirely rather than marking it ended.
        // Historical adoption data is the domain of the adoption history,
        // not of the current graph. If you want ended records preserved,
        // change this to set status: 'ended' instead of splicing.
        child.adoptedParents.splice(index, 1);
        child.updatedAt = Date.now();

        var parent = _resolveCharacter(parentId);
        if (parent) parent.updatedAt = Date.now();

        return { ok: true, changed: true };
    }

    /**
     * Cycle check: returns true if setting `candidateAncestorId` as parent
     * of `childId` would create a cycle. Walks up from the candidate
     * ancestor; if the child is reachable, the edge would cycle.
     *
     * Bounded by a visited Set. No depth limit.
     *
     * @private
     */
    function _wouldCreateCycle(childId, candidateAncestorId) {
        var visited = new Set();
        var stack = [candidateAncestorId];

        while (stack.length > 0) {
            var currentId = stack.pop();
            if (currentId === childId) return true;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            var current = _resolveCharacter(currentId);
            if (!current) continue;

            if (_hasId(current.fatherId)) stack.push(current.fatherId);
            if (_hasId(current.motherId)) stack.push(current.motherId);

            // Adoptive parents participate in cycle detection as well.
            if (Array.isArray(current.adoptedParents)) {
                for (var i = 0; i < current.adoptedParents.length; i++) {
                    var ap = current.adoptedParents[i];
                    if (ap && ap.status !== 'ended' && _hasId(ap.parentId)) {
                        stack.push(ap.parentId);
                    }
                }
            }
        }

        return false;
    }

    // =========================================================================
    // 4. PUBLIC COMMANDS
    // =========================================================================

    /**
     * Sets a biological parent on a child.
     *
     * @param {string} childId
     * @param {string} parentId
     * @param {string} parentType - 'mother' | 'father'
     * @param {Object} [options]
     * @param {number} [options.startYear] - reserved for future use; recorded
     *   on the parent-child relationship if your schema supports it
     * @param {string} [options.notes]
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function setBiologicalParent(childId, parentId, parentType, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            if (!_hasId(childId)) {
                return { success: false, reason: 'childId must be a non-empty string' };
            }
            if (!_hasId(parentId)) {
                return { success: false, reason: 'parentId must be a non-empty string' };
            }

            var typeResult = _validateParentType(parentType);
            if (!typeResult.ok) return { success: false, reason: typeResult.reason };

            var yearResult = _validateYear(options.startYear, 'startYear');
            if (!yearResult.ok) return { success: false, reason: yearResult.reason };

            var result = _setBiologicalParentInternal(
                childId,
                parentId,
                typeResult.value
            );
            if (!result.ok) return { success: false, reason: result.reason };

            if (result.changed) {
                _commit('setBiologicalParent', [childId, parentId]);
            }
            return { success: true, changed: result.changed };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Clears a biological parent reference on a child.
     *
     * @param {string} childId
     * @param {string} parentType - 'mother' | 'father'
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function removeBiologicalParent(childId, parentType) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(childId)) {
                return { success: false, reason: 'childId must be a non-empty string' };
            }

            var typeResult = _validateParentType(parentType);
            if (!typeResult.ok) return { success: false, reason: typeResult.reason };

            var result = _removeBiologicalParentInternal(childId, typeResult.value);
            if (!result.ok) return { success: false, reason: result.reason };

            if (result.changed) {
                _commit('removeBiologicalParent', [childId]);
            }
            return { success: true, changed: result.changed };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Sets a biological parent, choosing the field based on parentType.
     * This is the primary entry point used by CharacterCommands during
     * character creation and updates.
     *
     * @param {string} childId
     * @param {string} parentId
     * @param {string} parentType - 'mother' | 'father'
     * @param {Object} [options]
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function setParent(childId, parentId, parentType, options) {
        return setBiologicalParent(childId, parentId, parentType, options);
    }

    /**
     * Removes a biological parent, choosing the field based on parentType.
     *
     * @param {string} childId
     * @param {string} parentType - 'mother' | 'father'
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function removeParent(childId, parentType) {
        return removeBiologicalParent(childId, parentType);
    }

    /**
     * Sets an adoptive-parent record on a child.
     *
     * @param {string} childId
     * @param {string} parentId
     * @param {Object} [options]
     * @param {string} [options.parentType] - 'mother' | 'father' | undefined
     * @param {string} [options.type] - 'legal' | 'guardianship' | 'foster'
     * @param {number} [options.year]
     * @param {string} [options.notes]
     * @param {boolean} [options.reopen] - reopen an ended record
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function setAdoptiveParent(childId, parentId, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            if (!_hasId(childId)) {
                return { success: false, reason: 'childId must be a non-empty string' };
            }
            if (!_hasId(parentId)) {
                return { success: false, reason: 'parentId must be a non-empty string' };
            }

            if (!_isMissing(options.parentType)
                && options.parentType !== 'mother'
                && options.parentType !== 'father') {
                return { success: false, reason: 'parentType must be "mother" or "father" if provided' };
            }

            var yearResult = _validateYear(options.year, 'year');
            if (!yearResult.ok) return { success: false, reason: yearResult.reason };

            var result = _setAdoptiveParentInternal(childId, parentId, {
                parentType: options.parentType,
                type: options.type,
                year: yearResult.value,
                notes: options.notes,
                reopen: options.reopen === true
            });
            if (!result.ok) return { success: false, reason: result.reason };

            if (result.changed) {
                _commit('setAdoptiveParent', [childId, parentId]);
            }
            return { success: true, changed: result.changed };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Ends an adoptive-parent record on a child.
     *
     * @param {string} childId
     * @param {string} parentId
     * @returns {{ success: boolean, changed?: boolean, reason?: string }}
     */
    function removeAdoptiveParent(childId, parentId) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(childId)) {
                return { success: false, reason: 'childId must be a non-empty string' };
            }
            if (!_hasId(parentId)) {
                return { success: false, reason: 'parentId must be a non-empty string' };
            }

            var result = _removeAdoptiveParentInternal(childId, parentId);
            if (!result.ok) return { success: false, reason: result.reason };

            if (result.changed) {
                _commit('removeAdoptiveParent', [childId, parentId]);
            }
            return { success: true, changed: result.changed };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Removes every family reference to a character.
     *
     * Called by CharacterCommands during character deletion. Walks the
     * canonical collection once and clears:
     *   - biological parent references on any child
     *   - adoptive parent records that name this character
     *   - this character's own parent references
     *   - the character's children array
     *
     * Does NOT remove the character from the collection; that is
     * CharacterCommands' responsibility.
     *
     * @param {string} characterId
     * @returns {{ success: boolean, changed: boolean, reason?: string }}
     */
    function removeAllReferencesTo(characterId) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(characterId)) {
                return { success: false, changed: false, reason: 'characterId must be a non-empty string' };
            }

            var characters = window.getCharacters();
            var changed = false;
            var affectedIds = [];

            for (var i = 0; i < characters.length; i++) {
                var c = characters[i];
                if (!c || !_hasId(c.id)) continue;

                var characterChanged = false;

                // Clear this character's biological parent refs to the target
                if (c.fatherId === characterId) {
                    c.fatherId = null;
                    characterChanged = true;
                }
                if (c.motherId === characterId) {
                    c.motherId = null;
                    characterChanged = true;
                }

                // Remove adoptive-parent records naming the target
                if (Array.isArray(c.adoptedParents)) {
                    var filtered = [];
                    for (var j = 0; j < c.adoptedParents.length; j++) {
                        var ap = c.adoptedParents[j];
                        if (ap && ap.parentId === characterId) {
                            characterChanged = true;
                            continue;
                        }
                        filtered.push(ap);
                    }
                    if (characterChanged) c.adoptedParents = filtered;
                }

                // Clear this character's own children array entries pointing
                // at the target
                if (Array.isArray(c.children) && c.children.indexOf(characterId) !== -1) {
                    c.children = c.children.filter(function(cid) {
                        return cid !== characterId;
                    });
                    characterChanged = true;
                }

                // Clear the target's own children array entries if this
                // character was the target (handled below via the target
                // lookup, but doing it here keeps the loop single-pass)
                if (c.id === characterId) {
                    if (Array.isArray(c.children) && c.children.length > 0) {
                        c.children = [];
                        characterChanged = true;
                    }
                    if (Array.isArray(c.adoptedParents) && c.adoptedParents.length > 0) {
                        c.adoptedParents = [];
                        characterChanged = true;
                    }
                    if (Array.isArray(c.adoptedChildren) && c.adoptedChildren.length > 0) {
                        c.adoptedChildren = [];
                        characterChanged = true;
                    }
                }

                if (characterChanged) {
                    c.updatedAt = Date.now();
                    changed = true;
                    affectedIds.push(c.id);
                }
            }

            if (changed) {
                _commit('removeAllReferences', affectedIds);
            }
            return { success: true, changed: changed };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.FamilyCommands = {
        // Primary entry points
        setParent: setParent,
        removeParent: removeParent,
        setAdoptiveParent: setAdoptiveParent,
        removeAdoptiveParent: removeAdoptiveParent,

        // Named variants (for callers that want to be explicit)
        setBiologicalParent: setBiologicalParent,
        removeBiologicalParent: removeBiologicalParent,

        // Cleanup
        removeAllReferencesTo: removeAllReferencesTo
    };

})();