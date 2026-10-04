/**
 * family-commands.js
 *
 * Mutation and transaction boundary for family relationships.
 * Orchestrates rules + queries + RelationshipCommands.
 *
 * PARENT_CHILD DIRECTION: participantA = parent, participantB = child
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var FR = window.FamilyRules;
    var FQ = window.FamilyQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !FR || !FQ || !A || !STATUS) {
        throw new Error('family-commands.js: relationship-* and family-rules/queries must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('family-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('family-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _ageAtYear(character, year) {
        if (!character || !character.birthYear) return 0;
        if (character.isDeceased && character.deathYear && character.deathYear <= year) {
            return Math.max(0, character.deathYear - character.birthYear);
        }
        return Math.max(0, year - character.birthYear);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _commit() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // -------------------------------------------------------------------------
    // SIBLING SYNC
    //
    // After a parent relationship is created or removed, ensure sibling
    // relationships between the parent's children are consistent.
    // Sibling relationships are DERIVED, but we persist them as entities
    // for graph traversal; they are auto-created/ended here.
    // -------------------------------------------------------------------------

    function _ensureSiblingEntities(childrenIds, year) {
        for (var i = 0; i < childrenIds.length; i++) {
            for (var j = i + 1; j < childrenIds.length; j++) {
                var a = childrenIds[i];
                var b = childrenIds[j];
                var existing = RQ.getBetweenOfType(a, b, A.SIBLING, { status: STATUS.ONGOING });
                if (existing.length > 0) continue;

                RC.create({
                    participantA: a,
                    participantB: b,
                    type: A.SIBLING,
                    status: STATUS.ONGOING,
                    startYear: year,
                    metadata: { autoDerived: true }
                });
            }
        }
    }

    function _endOrphanedSiblingEntities(childId, year, reason) {
        var siblings = FQ.getSiblings(childId, { activeOnly: true });
        for (var i = 0; i < siblings.length; i++) {
            var sibRel = RQ.getBetweenOfType(childId, siblings[i].siblingId, A.SIBLING, { status: STATUS.ONGOING });
            for (var j = 0; j < sibRel.length; j++) {
                RC.end(sibRel[j].id, year, reason);
            }
        }
    }

    // -------------------------------------------------------------------------
    // SET PARENT
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   parentRole: 'father' | 'mother' | 'parent'  (optional; inferred from gender)
     *   parentType: 'biological' | 'legal' | 'social'  (default biological)
     *   startYear: number  (defaults to child birthYear or current year)
     *   notes: string
     * }
     */
    function setParent(childId, parentId, options) {
        options = options || {};
        if (!childId || !parentId) return _fail('MISSING_ID', 'child and parent required');
        if (childId === parentId) return _fail('SAME_PERSON', 'cannot be own parent');

        var child = _getCharacter(childId);
        var parent = _getCharacter(parentId);
        if (!child || !parent) return _fail('MISSING_CHARACTER', 'character not found');

        var startYear = options.startYear !== undefined
            ? options.startYear
            : (child.birthYear !== undefined ? child.birthYear : _getCurrentYear());

        var parentRole = FR.normalizeParentRole(options.parentRole, parent.gender);
        var parentType = options.parentType || FR.PARENT_TYPE.BIOLOGICAL;

        // Validation
        var existingParents = FQ.getParentRelationships(childId, { activeOnly: true });
        var validation = FR.canSetParent({
            childId: childId,
            parentId: parentId,
            childAgeAtStart: _ageAtYear(child, startYear),
            parentAgeAtStart: _ageAtYear(parent, startYear),
            parentRole: parentRole,
            existingParentsOfChild: existingParents.map(function(p) {
                return { parentId: p.parentId, role: p.parentRole, type: p.parentType };
            })
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        // If a role is already filled by a different parent, end that relationship
        // (only when parentType and parentRole both match)
        for (var i = 0; i < existingParents.length; i++) {
            var ep = existingParents[i];
            if (ep.parentRole !== parentRole) continue;
            if (ep.parentType !== parentType) continue;
            if (ep.parentId === parentId) continue;
            RC.end(ep.relationshipId, startYear, 'replaced');
        }

        // Create parent_child relationship
        var createResult = RC.create({
            participantA: parentId,
            participantB: childId,
            type: A.PARENT_CHILD,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                parentType: parentType,
                parentRole: parentRole,
                notes: options.notes || ''
            }
        });
        if (!createResult.success) return createResult;

        // Sibling cascade: get all children of this parent
        var siblingsIds = FQ.getChildren(parentId, { activeOnly: true });
        _ensureSiblingEntities(siblingsIds, startYear);

        _logEvent('family', 'Parent Set',
            parent.name + ' set as ' + parentRole + ' of ' + child.name,
            [parent, child]);
        _commit();

        return _ok({ relationship: createResult.relationship });
    }

    // -------------------------------------------------------------------------
    // REMOVE PARENT
    // -------------------------------------------------------------------------

    function removeParent(childId, parentId, options) {
        options = options || {};
        var rels = FQ.getParentRelationships(childId, { activeOnly: true });
        var target = null;
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].parentId === parentId) { target = rels[i]; break; }
        }
        if (!target) return _fail('NOT_FOUND', 'no active parent relationship');

        var endYear = options.endYear !== undefined ? options.endYear : _getCurrentYear();
        var reason = options.reason || 'parent removed';

        var endResult = RC.end(target.relationshipId, endYear, reason);
        if (!endResult.success) return endResult;

        // Sibling cascade: end any sibling entities between this child
        // and children of the removed parent that no longer share another
        // active parent.
        var remainingParents = FQ.getAllParentIds(childId, { activeOnly: true });
        var otherChildren = FQ.getChildren(parentId, { activeOnly: true });

        // Actually: need to recompute siblingship. Simpler: for each sibling
        // of childId that only shared this parent, end sibling entity.
        var siblings = FQ.getSiblings(childId, { activeOnly: true });
        for (var s = 0; s < siblings.length; s++) {
            var sibId = siblings[s].siblingId;
            var sibParents = FQ.getAllParentIds(sibId, { activeOnly: true });
            var stillShared = remainingParents.some(function(p) {
                return sibParents.indexOf(p) !== -1;
            });
            if (!stillShared) {
                var sibRels = RQ.getBetweenOfType(childId, sibId, A.SIBLING, { status: STATUS.ONGOING });
                for (var j = 0; j < sibRels.length; j++) {
                    RC.end(sibRels[j].id, endYear, 'parentage removed');
                }
            }
        }

        _commit();
        return _ok({ relationship: endResult.relationship });
    }

    // -------------------------------------------------------------------------
    // ADOPTION
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   parentRole: 'father' | 'mother' | 'parent'
     *   startYear
     *   notes
     * }
     * Adoption = a LEGAL parent relationship.
     */
    function createAdoption(childId, adopterId, options) {
        options = options || {};
        var facts = {
            childId: childId,
            adopterIds: [adopterId]
        };
        var check = FR.canCreateAdoption(facts);
        if (!check.valid) return _fail('VALIDATION_FAILED', check.errors.join('; '));

        return setParent(childId, adopterId, {
            parentRole: options.parentRole,
            parentType: FR.PARENT_TYPE.LEGAL,
            startYear: options.startYear,
            notes: options.notes || 'adoption'
        });
    }

    function removeAdoption(childId, adopterId, options) {
        options = options || {};
        var rels = FQ.getParentRelationships(childId, { activeOnly: true });
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].parentId === adopterId &&
                rels[i].parentType === FR.PARENT_TYPE.LEGAL) {
                return removeParent(childId, adopterId, {
                    endYear: options.endYear,
                    reason: options.reason || 'adoption ended'
                });
            }
        }
        return _fail('NOT_FOUND', 'no active adoption');
    }

    // -------------------------------------------------------------------------
    // LEGITIMIZATION
    //
    // Legitimization = the child gains a LEGAL parent relationship
    // mirroring an existing BIOLOGICAL parent, plus an INHERITANCE
    // marker on the child character.
    // -------------------------------------------------------------------------

    /**
     * options: {
     *   fatherId, motherId,
     *   year,
     *   inheritanceRights: 'full' | 'limited' | 'none'
     *   notes
     * }
     */
    function legitimize(childId, options) {
        options = options || {};
        var child = _getCharacter(childId);
        if (!child) return _fail('MISSING_CHARACTER', 'child not found');

        var fatherId = options.fatherId || null;
        var motherId = options.motherId || null;

        var check = FR.canLegitimize({
            childId: childId,
            fatherId: fatherId,
            motherId: motherId,
            alreadyLegitimate: !!child.isLegitimate
        });
        if (!check.valid) return _fail('VALIDATION_FAILED', check.errors.join('; '));

        var year = options.year !== undefined ? options.year : _getCurrentYear();
        var inheritanceRights = options.inheritanceRights || 'full';

        // Create LEGAL parent relationship for each known biological parent
        if (fatherId) {
            setParent(childId, fatherId, {
                parentRole: FR.PARENT_ROLE.FATHER,
                parentType: FR.PARENT_TYPE.LEGAL,
                startYear: year,
                notes: 'legitimization'
            });
        }
        if (motherId) {
            setParent(childId, motherId, {
                parentRole: FR.PARENT_ROLE.MOTHER,
                parentType: FR.PARENT_TYPE.LEGAL,
                startYear: year,
                notes: 'legitimization'
            });
        }

        // Mark character fields
        if (!child.legitimization) child.legitimization = [];
        child.legitimization.push({
            year: year,
            fatherId: fatherId,
            motherId: motherId,
            inheritanceRights: inheritanceRights,
            notes: options.notes || ''
        });
        child.isLegitimate = true;
        child.legitimizedYear = year;
        child.inheritanceRights = inheritanceRights;

        _logEvent('family', 'Legitimization',
            child.name + ' was legitimized in ' + year,
            [child]);
        _commit();

        return _ok({ childId: childId, year: year });
    }

    // -------------------------------------------------------------------------
    // DEATH HANDLING
    //
    // Called when a character dies. Marks their active family relationships
    // as ended (not widowed — that's romance-specific).
    // -------------------------------------------------------------------------

    function handleCharacterDeath(characterId, deathYear) {
        var rels = RQ.getActiveForCharacter(characterId);
        var ended = 0;
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.type === A.PARENT_CHILD ||
                rel.type === A.SIBLING ||
                rel.type === A.GRANDPARENT ||
                rel.type === A.AUNT_UNCLE ||
                rel.type === A.COUSIN) {
                var r = RC.end(rel.id, deathYear, 'death of participant');
                if (r.success) ended++;
            }
        }
        if (ended > 0) {
            _logEvent('family', 'Death Cascade',
                ended + ' family relationship(s) ended by death',
                [_getCharacter(characterId)]);
            _commit();
        }
        return _ok({ ended: ended });
    }

    // -------------------------------------------------------------------------

    window.FamilyCommands = {
        setParent: setParent,
        removeParent: removeParent,
        createAdoption: createAdoption,
        removeAdoption: removeAdoption,
        legitimize: legitimize,
        handleCharacterDeath: handleCharacterDeath
    };

})();
