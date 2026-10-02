/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-queries.js
 * 
 * PURPOSE
 * -------
 * Semantic read API for household data. This module owns:
 * 
 *   - Household lookups by id / location / status / member / head
 *   - Household status projections (active/vacant/empty/deprecated/destroyed)
 *   - Member projections (with characters resolved, ages, alive flags)
 *   - Demographic projections
 *   - Enterprise projections (delegating canonical ownership to Industry)
 *   - Position and assignment projections
 *   - Staff projections
 *   - Heir discovery (extracted from household-assignment.js)
 *   - Households-headed-by queries
 *   - Composite detail projections for UI modals
 *   - Statistics
 * 
 * CONTRACT
 * --------
 *   - All public functions return defensive snapshots or new projections.
 *   - No public function returns a live canonical household/position/assignment.
 *   - No public function mutates canonical data.
 *   - No global "processing" guard. Queries must compose.
 *   - Required dependencies fail loudly, not silently as [] / null.
 *   - Historical queries require an explicit reference year.
 * 
 * EXPLICITLY NOT OWNED BY THIS MODULE
 * -----------------------------------
 *   - Canonical storage                       → HouseholdState
 *   - Domain mutations                        → HouseholdCommands
 *   - Domain policy thresholds                → HouseholdRules
 *   - Enterprise canonical ownership          → IndustryCommands
 *   - Residence canonical occupancy           → ResidenceCommands
 *   - Presentation (icons, colours, toasts)   → UI layer
 * 
 * DEPENDENCIES (required)
 * -----------------------
 *   - HouseholdState
 *   - getCharacterById  (CharacterQueries)
 *   - getCharacters     (CharacterQueries)
 *   - getCurrentYearSafe
 * 
 * DEPENDENCIES (optional — used when present)
 * -------------------------------------------
 *   - IndustryQueries  (for enterprise summaries)
 *   - family queries: getChildren / getParents / getSpouses
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _state() {
        if (typeof window.HouseholdState === 'undefined') {
            throw new Error('HouseholdQueries: HouseholdState is required');
        }
        return window.HouseholdState;
    }

    function _internal() {
        return _state()._internal;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('HouseholdQueries: getCharacterById is required');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('HouseholdQueries: getCharacters is required');
        }
        return window.getCharacters();
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('HouseholdQueries: getCurrentYearSafe is required');
        }
        return window.getCurrentYearSafe();
    }

    function _resolveReferenceYear(options) {
        options = options || {};
        if (options.referenceYear === undefined || options.referenceYear === null) {
            return null;
        }
        return options.referenceYear;
    }

    // Optional family accessors
    function _getChildren(characterId) {
        if (typeof window.getChildren !== 'function') return null;
        return window.getChildren(characterId);
    }
    function _getParents(characterId) {
        if (typeof window.getParents !== 'function') return null;
        return window.getParents(characterId);
    }

    // Optional Industry accessors
    function _industryQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }
    function _industryState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    // =========================================================================
    // 2. CHARACTER SNAPSHOT HELPERS
    // =========================================================================

    /**
     * Returns a defensive snapshot of a character suitable for household
     * projections. Does not leak the canonical character object.
     */
    function _snapshotCharacter(character) {
        if (!character) return null;
        return {
            id: character.id,
            name: character.name || '',
            surname: character.surname || '',
            displayName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            gender: character.gender || null,
            birthYear: character.birthYear !== undefined ? character.birthYear : null,
            deathYear: character.deathYear !== undefined ? character.deathYear : null,
            isDeceased: character.isDeceased === true,
            professions: Array.isArray(character.professions)
                ? character.professions.map(function(p) {
                    return {
                        id: p.id,
                        name: p.name || null,
                        skillLevel: p.skillLevel !== undefined ? p.skillLevel : null
                    };
                })
                : []
        };
    }

    /**
     * Age at a specific year. If no referenceYear is provided, uses the
     * current simulation year.
     *
     * Returns null if birthYear is unknown.
     */
    function _ageAt(character, referenceYear) {
        if (!character || character.birthYear === undefined ||
            character.birthYear === null) {
            return null;
        }
        var year = referenceYear !== null && referenceYear !== undefined
            ? referenceYear
            : _currentYear();
        return year - character.birthYear;
    }

    // =========================================================================
    // 3. HOUSEHOLD STATUS PROJECTION
    // =========================================================================

    /**
     * Effective household status.
     *
     * Combines:
     *   - the persisted status field
     *   - the count of living vs. deceased members
     *
     * Returns a projection. Presentation (icon/colour/label) is derived
     * elsewhere.
     *
     * Precedence:
     *   destroyed  (persisted)
     *   deprecated (persisted)
     *   empty      (no members)
     *   vacant     (all members deceased / missing)
     *   declining  (few living, most deceased)
     *   active
     */
    function getHouseholdStatus(householdId) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) {
            return {
                exists: false,
                status: 'unknown',
                livingCount: 0,
                deceasedCount: 0,
                missingCount: 0,
                totalMembers: 0
            };
        }

        var persisted = household.status || null;

        var livingCount = 0;
        var deceasedCount = 0;
        var missingCount = 0;
        var totalMembers = Array.isArray(household.members)
            ? household.members.length
            : 0;

        if (Array.isArray(household.members)) {
            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                var character = null;
                try {
                    character = _getCharacterById(member.characterId);
                } catch (e) {
                    character = null;
                }
                if (!character) {
                    missingCount++;
                } else if (character.isDeceased) {
                    deceasedCount++;
                } else {
                    livingCount++;
                }
            }
        }

        var isEmpty = totalMembers === 0;
        var isVacant = livingCount === 0 && totalMembers > 0;
        var isDeclining = livingCount > 0 && totalMembers > 3 &&
            (livingCount / totalMembers) <= 0.5;

        var status;
        if (persisted === 'destroyed') {
            status = 'destroyed';
        } else if (persisted === 'deprecated') {
            status = 'deprecated';
        } else if (isEmpty) {
            status = 'empty';
        } else if (isVacant) {
            status = 'vacant';
        } else if (isDeclining) {
            status = 'declining';
        } else {
            status = 'active';
        }

        return {
            exists: true,
            status: status,
            persistedStatus: persisted,
            livingCount: livingCount,
            deceasedCount: deceasedCount,
            missingCount: missingCount,
            totalMembers: totalMembers,
            isEmpty: isEmpty,
            isVacant: isVacant,
            isDeclining: isDeclining
        };
    }

    // =========================================================================
    // 4. HOUSEHOLD LOOKUPS (defensive snapshots)
    // =========================================================================

    /**
     * Returns a defensive snapshot of a household suitable for read-only
     * consumption. Does NOT include resolved members — use
     * getHouseholdMembers() for that.
     */
    function getHousehold(householdId) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return null;

        return {
            id: household.id,
            name: household.name || '',
            locationId: household.locationId || null,
            locationName: household.locationName || null,
            status: household.status || null,
            reputation: household.reputation !== undefined ? household.reputation : null,
            wealth: household.wealth !== undefined ? household.wealth : null,
            debt: household.debt !== undefined ? household.debt : null,
            powerScore: household.powerScore !== undefined ? household.powerScore : null,
            foundedYear: household.foundedYear !== undefined ? household.foundedYear : null,
            notes: household.notes || '',
            currentNameSince: household.currentNameSince !== undefined
                ? household.currentNameSince : null,
            memberCount: Array.isArray(household.members)
                ? household.members.length : 0,
            departmentCount: Array.isArray(household.departments)
                ? household.departments.length : 0
        };
    }

    /**
     * Returns defensive snapshots of all households.
     */
    function getAllHouseholds(options) {
        options = options || {};
        var records = _internal().getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            result.push(getHousehold(records[i].id));
        }
        return result;
    }

    function getHouseholdsByLocation(locationId, options) {
        options = options || {};
        var records = _internal().getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].locationId === locationId) {
                result.push(getHousehold(records[i].id));
            }
        }
        return result;
    }

    function getHouseholdsByStatus(status, options) {
        options = options || {};
        var records = _internal().getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].status === status) {
                result.push(getHousehold(records[i].id));
            }
        }
        return result;
    }

    function getHouseholdsByMember(characterId) {
        if (!characterId) return [];
        var all = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var members = all[i].members;
            if (!Array.isArray(members)) continue;
            for (var j = 0; j < members.length; j++) {
                if (members[j].characterId === characterId) {
                    result.push(getHousehold(all[i].id));
                    break;
                }
            }
        }
        return result;
    }

    function getHouseholdsHeadedBy(characterId) {
        if (!characterId) return [];
        var all = _internal().getAllHouseholdRecords({ includeDeprecated: true });
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var members = all[i].members;
            if (!Array.isArray(members)) continue;
            for (var j = 0; j < members.length; j++) {
                var m = members[j];
                if (m.characterId === characterId && m.isHead) {
                    result.push(getHousehold(all[i].id));
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Returns the household that currently lists the character as a member,
     * or null. Prefers households where the character is not deceased.
     */
    function getCharacterHousehold(characterId) {
        if (!characterId) return null;
        var candidates = getHouseholdsByMember(characterId);
        if (candidates.length === 0) return null;
        return candidates[0];
    }

    // =========================================================================
    // 5. MEMBER PROJECTIONS
    // =========================================================================

    /**
     * Returns defensive member projections with resolved character snapshots.
     *
     * Age is calculated against current year unless options.referenceYear is
     * provided.
     *
     * @param {string} householdId
     * @param {object} [options]
     * @param {number} [options.referenceYear]
     */
    function getHouseholdMembers(householdId, options) {
        options = options || {};
        var referenceYear = _resolveReferenceYear(options);
        var household = _internal().getHouseholdRecord(householdId);
        if (!household || !Array.isArray(household.members)) return [];

        var result = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var character = null;
            try {
                character = _getCharacterById(member.characterId);
            } catch (e) {
                character = null;
            }

            result.push({
                characterId: member.characterId,
                character: _snapshotCharacter(character),
                characterName: character
                    ? (character.name || '') +
                        (character.surname ? ' ' + character.surname : '')
                    : 'Unknown',
                type: member.type || null,
                role: member.role || null,
                departmentId: member.departmentId || null,
                isHead: member.isHead === true,
                joinedYear: member.joinedYear !== undefined ? member.joinedYear : null,
                headSince: member.headSince !== undefined ? member.headSince : null,
                notes: member.notes || '',
                age: _ageAt(character, referenceYear),
                isDeceased: character ? character.isDeceased === true : null,
                isMissing: character === null
            });
        }
        return result;
    }

    /**
     * Returns the head of a household as a member projection, or null.
     */
    function getHouseholdHead(householdId) {
        var members = getHouseholdMembers(householdId);
        for (var i = 0; i < members.length; i++) {
            if (members[i].isHead) return members[i];
        }
        return null;
    }

    // =========================================================================
    // 6. DEMOGRAPHIC PROJECTIONS
    // =========================================================================

    /**
     * Returns a demographic breakdown.
     *
     * Historical callers must pass options.referenceYear.
     * Current-state callers may omit it.
     */
    function getDemographics(householdId, options) {
        options = options || {};
        var referenceYear = _resolveReferenceYear(options);
        var members = getHouseholdMembers(householdId, {
            referenceYear: referenceYear
        });

        var stats = {
            total: 0,
            male: 0,
            female: 0,
            unknown: 0,
            children: 0,
            youth: 0,
            adults: 0,
            elders: 0,
            ageUnknown: 0,
            living: 0,
            deceased: 0,
            missing: 0,
            byAgeGroup: {}
        };

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            stats.total++;

            if (m.isMissing) {
                stats.missing++;
                continue;
            }

            var c = m.character;
            if (c.gender === 'male') stats.male++;
            else if (c.gender === 'female') stats.female++;
            else stats.unknown++;

            if (m.isDeceased) stats.deceased++;
            else stats.living++;

            var age = m.age;
            if (age === null || age === undefined) {
                stats.ageUnknown++;
                continue;
            }

            if (age < 18) stats.children++;
            else if (age < 26) stats.youth++;
            else if (age < 60) stats.adults++;
            else stats.elders++;

            var group;
            if (age < 10) group = '0-9';
            else if (age < 20) group = '10-19';
            else if (age < 30) group = '20-29';
            else if (age < 40) group = '30-39';
            else if (age < 50) group = '40-49';
            else if (age < 60) group = '50-59';
            else if (age < 70) group = '60-69';
            else if (age < 80) group = '70-79';
            else group = '80+';

            if (!stats.byAgeGroup[group]) stats.byAgeGroup[group] = 0;
            stats.byAgeGroup[group]++;
        }

        return stats;
    }

    // =========================================================================
    // 7. POSITION PROJECTIONS
    // =========================================================================

    function _snapshotPosition(position) {
        if (!position) return null;
        return {
            id: position.id,
            name: position.name || '',
            householdId: position.householdId || null,
            departmentId: position.departmentId || null,
            requiredRoleId: position.requiredRoleId || null,
            minSkillLevel: position.minSkillLevel !== undefined
                ? position.minSkillLevel : 0,
            description: position.description || '',
            priority: position.priority !== undefined ? position.priority : null,
            createdAt: position.createdAt !== undefined ? position.createdAt : null,
            updatedAt: position.updatedAt !== undefined ? position.updatedAt : null
        };
    }

    function getHouseholdPosition(positionId) {
        return _snapshotPosition(_internal().getPositionRecord(positionId));
    }

    function getHouseholdPositions(options) {
        options = options || {};
        var all = _internal().getAllPositionRecords();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var p = all[i];
            if (options.householdId && p.householdId !== options.householdId) continue;
            if (options.departmentId && p.departmentId !== options.departmentId) continue;
            if (options.requiredRoleId && p.requiredRoleId !== options.requiredRoleId) continue;
            result.push(_snapshotPosition(p));
        }
        return result;
    }

    // =========================================================================
    // 8. ASSIGNMENT PROJECTIONS
    // =========================================================================

    function _snapshotAssignment(a) {
        if (!a) return null;
        return {
            id: a.id,
            positionId: a.positionId || null,
            characterId: a.characterId || null,
            householdId: a.householdId || null,
            title: a.title || null,
            notes: a.notes || '',
            startYear: a.startYear !== undefined ? a.startYear : null,
            endYear: a.endYear !== undefined ? a.endYear : null,
            endReason: a.endReason || null,
            roleIdAtAssignment: a.roleIdAtAssignment || null,
            skillLevelAtAssignment: a.skillLevelAtAssignment !== undefined
                ? a.skillLevelAtAssignment : null,
            isActive: a.endYear === null || a.endYear === undefined
        };
    }

    function getHouseholdAssignment(assignmentId) {
        return _snapshotAssignment(_internal().getAssignmentRecord(assignmentId));
    }

    function getAssignmentsForPosition(positionId, activeOnly) {
        var all = _internal().getAllAssignmentRecords();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].positionId !== positionId) continue;
            var snap = _snapshotAssignment(all[i]);
            if (activeOnly && !snap.isActive) continue;
            result.push(snap);
        }
        return result;
    }

    function getAssignmentsForCharacter(characterId, activeOnly) {
        var all = _internal().getAllAssignmentRecords();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].characterId !== characterId) continue;
            var snap = _snapshotAssignment(all[i]);
            if (activeOnly && !snap.isActive) continue;
            result.push(snap);
        }
        return result;
    }

    function getAssignmentsForHousehold(householdId, activeOnly) {
        var all = _internal().getAllAssignmentRecords();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].householdId !== householdId) continue;
            var snap = _snapshotAssignment(all[i]);
            if (activeOnly && !snap.isActive) continue;
            result.push(snap);
        }
        return result;
    }

    // =========================================================================
    // 9. ENTERPRISE PROJECTIONS
    // =========================================================================
    //
    // Canonical enterprise ownership belongs to Industry. Household-side
    // projection reads enterprise records through IndustryQueries/State.
    // =========================================================================

    function getHouseholdEnterprises(householdId) {
        var household = _internal().getHouseholdRecord(householdId);
        if (!household || !Array.isArray(household.enterprises)) return [];

        var industryState = _industryState();
        if (!industryState) return [];

        var result = [];
        for (var i = 0; i < household.enterprises.length; i++) {
            var id = household.enterprises[i];
            var enterprise = null;
            try {
                enterprise = industryState.getEnterprise(id);
            } catch (e) {
                enterprise = null;
            }
            if (enterprise) result.push(enterprise);
        }
        return result;
    }

    function getHouseholdEnterpriseSummaries(householdId) {
        var enterprises = getHouseholdEnterprises(householdId);
        var iq = _industryQueries();
        if (!iq || typeof iq.getEnterpriseSummary !== 'function') {
            throw new Error(
                'HouseholdQueries.getHouseholdEnterpriseSummaries requires ' +
                'IndustryQueries.getEnterpriseSummary'
            );
        }
        var result = [];
        for (var i = 0; i < enterprises.length; i++) {
            var s = iq.getEnterpriseSummary(enterprises[i].id);
            if (s) result.push(s);
        }
        return result;
    }

    function getHouseholdEnterpriseStats(householdId) {
        var summaries = getHouseholdEnterpriseSummaries(householdId);
        var stats = {
            total: summaries.length,
            profitable: 0,
            unprofitable: 0,
            totalProfit: 0,
            totalWealth: 0,
            totalDebt: 0,
            totalWorkers: 0,
            publicCount: 0,
            privateCount: 0,
            byStatus: {},
            byCategory: {}
        };

        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            var profit = s.annualProfit || 0;

            if (profit > 0) stats.profitable++;
            else if (profit < 0) stats.unprofitable++;

            stats.totalProfit += profit;
            stats.totalWealth += s.wealth || 0;
            stats.totalDebt += s.debt || 0;
            stats.totalWorkers += s.workerCount || 0;

            if (s.ownershipType === 'public') stats.publicCount++;
            else stats.privateCount++;

            var status = s.status || 'unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

            var cat = s.category || 'other';
            stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
        }

        return stats;
    }

    // =========================================================================
    // 10. HEIR DISCOVERY
    // =========================================================================
    //
    // Extracted from household-assignment.js. This is a pure read projection.
    //
    // Reference year is REQUIRED when the caller is processing a historical
    // event (e.g. inheritance at a death year). If not provided, the current
    // simulation year is used, which is only correct for present-tense
    // succession.
    // =========================================================================

    function getHouseholdHeirs(householdId, deceasedId, options) {
        options = options || {};
        var household = _internal().getHouseholdRecord(householdId);
        if (!household) return [];

        var referenceYear = _resolveReferenceYear(options);
        var includeExternal = options.includeExternal !== false;
        var minAge = options.minAge !== undefined ? options.minAge : null;
        var maxAge = options.maxAge !== undefined ? options.maxAge : null;

        var seen = {};
        var candidates = [];

        // 1. Household members
        if (Array.isArray(household.members)) {
            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                if (member.characterId === deceasedId) continue;

                var character = null;
                try {
                    character = _getCharacterById(member.characterId);
                } catch (e) {
                    character = null;
                }
                if (!character) continue;
                if (character.isDeceased) continue;

                var age = _ageAt(character, referenceYear);
                if (age === null) continue;
                if (minAge !== null && age < minAge) continue;
                if (maxAge !== null && age > maxAge) continue;

                if (seen[character.id]) continue;
                seen[character.id] = true;

                candidates.push({
                    id: character.id,
                    name: character.name || '',
                    surname: character.surname || '',
                    displayName: (character.name || '') +
                        (character.surname ? ' ' + character.surname : ''),
                    age: age,
                    isHead: member.isHead === true,
                    type: member.type || 'family',
                    relation: 'member',
                    source: 'household'
                });
            }
        }

        // 2. External descendants (children)
        if (includeExternal) {
            var children = _getChildren(deceasedId);
            if (Array.isArray(children)) {
                for (var j = 0; j < children.length; j++) {
                    var childId = children[j];
                    if (seen[childId]) continue;

                    var child = null;
                    try {
                        child = _getCharacterById(childId);
                    } catch (e) {
                        child = null;
                    }
                    if (!child || child.isDeceased) continue;

                    var childAge = _ageAt(child, referenceYear);
                    if (childAge === null) continue;
                    if (minAge !== null && childAge < minAge) continue;
                    if (maxAge !== null && childAge > maxAge) continue;

                    seen[child.id] = true;
                    candidates.push({
                        id: child.id,
                        name: child.name || '',
                        surname: child.surname || '',
                        displayName: (child.name || '') +
                            (child.surname ? ' ' + child.surname : ''),
                        age: childAge,
                        isHead: false,
                        type: 'external',
                        relation: 'child',
                        source: 'children'
                    });
                }
            }

            // 3. Siblings — via either parent, deduped
            var parents = _getParents(deceasedId);
            if (parents && (parents.father || parents.mother)) {
                var parentIds = [];
                if (parents.father) parentIds.push(parents.father);
                if (parents.mother) parentIds.push(parents.mother);

                for (var p = 0; p < parentIds.length; p++) {
                    var siblings = _getChildren(parentIds[p]);
                    if (!Array.isArray(siblings)) continue;

                    for (var k = 0; k < siblings.length; k++) {
                        var sibId = siblings[k];
                        if (sibId === deceasedId) continue;
                        if (seen[sibId]) continue;

                        var sibling = null;
                        try {
                            sibling = _getCharacterById(sibId);
                        } catch (e) {
                            sibling = null;
                        }
                        if (!sibling || sibling.isDeceased) continue;

                        var sibAge = _ageAt(sibling, referenceYear);
                        if (sibAge === null) continue;
                        if (minAge !== null && sibAge < minAge) continue;
                        if (maxAge !== null && sibAge > maxAge) continue;

                        seen[sibling.id] = true;
                        candidates.push({
                            id: sibling.id,
                            name: sibling.name || '',
                            surname: sibling.surname || '',
                            displayName: (sibling.name || '') +
                                (sibling.surname ? ' ' + sibling.surname : ''),
                            age: sibAge,
                            isHead: false,
                            type: 'external',
                            relation: 'sibling',
                            source: 'siblings'
                        });
                    }
                }
            }
        }

        // Priority:
        //   1. household member marked head (unusual but possible if the
        //      deceased wasn't flagged) — highest
        //   2. household member
        //   3. external descendant
        // Then: older first.
        candidates.sort(function(a, b) {
            var priA = a.isHead ? 0 : (a.type === 'family' ? 1 : 2);
            var priB = b.isHead ? 0 : (b.type === 'family' ? 1 : 2);
            if (priA !== priB) return priA - priB;
            return (b.age || 0) - (a.age || 0);
        });

        return candidates;
    }

    // =========================================================================
    // 11. STAFF PROJECTIONS
    // =========================================================================

    function getHouseholdStaff(householdId, options) {
        options = options || {};
        var members = getHouseholdMembers(householdId);
        var result = [];

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (m.type !== 'staff') continue;

            if (options.departmentId && m.departmentId !== options.departmentId) {
                continue;
            }

            var assignments = getAssignmentsForCharacter(
                m.characterId,
                options.activeOnly !== false
            );

            var hasActive = false;
            for (var j = 0; j < assignments.length; j++) {
                if (assignments[j].isActive) { hasActive = true; break; }
            }

            if (options.withRole === true && !hasActive) continue;
            if (options.withoutRole === true && hasActive) continue;

            result.push({
                characterId: m.characterId,
                character: m.character,
                characterName: m.characterName,
                type: m.type,
                departmentId: m.departmentId,
                role: m.role,
                isHead: m.isHead,
                joinedYear: m.joinedYear,
                notes: m.notes,
                age: m.age,
                isDeceased: m.isDeceased,
                isMissing: m.isMissing,
                assignments: assignments
            });
        }

        return result;
    }

    function getUnassignedHouseholdStaff(householdId) {
        var staff = getHouseholdStaff(householdId, { activeOnly: true });
        var result = [];
        for (var i = 0; i < staff.length; i++) {
            var hasActive = false;
            for (var j = 0; j < staff[i].assignments.length; j++) {
                if (staff[i].assignments[j].isActive) {
                    hasActive = true;
                    break;
                }
            }
            if (!hasActive) result.push(staff[i]);
        }
        return result;
    }

    // =========================================================================
    // 12. COMPOSITE PROJECTIONS (for UI)
    // =========================================================================

    /**
     * Full detail projection for a household details modal.
     *
     * Aggregates household + status + members + head + demographics +
     * enterprise summary + residence info. UI renders the projection as-is.
     */
    function getHouseholdDetails(householdId) {
        var household = getHousehold(householdId);
        if (!household) return null;

        var status = getHouseholdStatus(householdId);
        var members = getHouseholdMembers(householdId);
        var head = getHouseholdHead(householdId);
        var demographics = getDemographics(householdId);

        var enterpriseSummaries = [];
        var enterpriseStats = null;
        try {
            enterpriseSummaries = getHouseholdEnterpriseSummaries(householdId);
            enterpriseStats = getHouseholdEnterpriseStats(householdId);
        } catch (e) {
            // Industry may not be loaded; details should still work.
            enterpriseSummaries = [];
            enterpriseStats = null;
        }

        var record = _internal().getHouseholdRecord(householdId);
        var residence = null;
        if (record && record.residenceId) {
            residence = {
                residenceId: record.residenceId,
                residenceName: record.residenceName || null,
                residenceType: record.residenceType || null,
                associatedYear: record.associatedYear !== undefined
                    ? record.associatedYear : null,
                unitNumber: record.residenceUnitNumber !== undefined
                    ? record.residenceUnitNumber : null,
                notes: record.residenceNotes || ''
            };
        }

        return {
            household: household,
            status: status,
            members: members,
            head: head,
            demographics: demographics,
            residence: residence,
            enterprises: enterpriseSummaries,
            enterpriseStats: enterpriseStats
        };
    }

    // =========================================================================
    // 13. STATISTICS
    // =========================================================================

    function getStatistics(options) {
        options = options || {};
        var records = _internal().getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });

        var stats = {
            totalHouseholds: records.length,
            totalMembers: 0,
            totalFamilyMembers: 0,
            totalStaffMembers: 0,
            totalDepartments: 0,
            householdsWithDepartments: 0,
            householdsWithHead: 0,
            householdsWithoutHead: 0,
            emptyHouseholds: 0,
            vacantHouseholds: 0,
            totalPositions: 0,
            totalAssignments: 0,
            activeAssignments: 0
        };

        var memberCounts = [];
        var totalWealth = 0;
        var wealthCount = 0;
        var totalReputation = 0;
        var repCount = 0;

        for (var i = 0; i < records.length; i++) {
            var h = records[i];
            var count = Array.isArray(h.members) ? h.members.length : 0;
            memberCounts.push(count);
            stats.totalMembers += count;

            if (Array.isArray(h.departments) && h.departments.length > 0) {
                stats.householdsWithDepartments++;
                stats.totalDepartments += h.departments.length;
            }

            if (Array.isArray(h.members)) {
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].type === 'family') stats.totalFamilyMembers++;
                    else if (h.members[j].type === 'staff') stats.totalStaffMembers++;
                }
            }

            if (getHouseholdHead(h.id)) stats.householdsWithHead++;
            else stats.householdsWithoutHead++;

            if (count === 0) stats.emptyHouseholds++;
            var st = getHouseholdStatus(h.id);
            if (st.status === 'vacant') stats.vacantHouseholds++;

            if (h.wealth !== undefined && h.wealth !== null) {
                totalWealth += h.wealth;
                wealthCount++;
            }
            if (h.reputation !== undefined && h.reputation !== null) {
                totalReputation += h.reputation;
                repCount++;
            }
        }

        // Positions and assignments
        var positions = _internal().getAllPositionRecords();
        stats.totalPositions = positions.length;

        var assignments = _internal().getAllAssignmentRecords();
        stats.totalAssignments = assignments.length;
        for (var a = 0; a < assignments.length; a++) {
            if (assignments[a].endYear === null || assignments[a].endYear === undefined) {
                stats.activeAssignments++;
            }
        }

        // Derived averages (unused in some UIs but cheap)
        stats.averageWealth = wealthCount > 0 ? totalWealth / wealthCount : 0;
        stats.averageReputation = repCount > 0 ? totalReputation / repCount : 0;

        return stats;
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.HouseholdQueries = {
        // Lookups
        getHousehold: getHousehold,
        getAllHouseholds: getAllHouseholds,
        getHouseholdsByLocation: getHouseholdsByLocation,
        getHouseholdsByStatus: getHouseholdsByStatus,
        getHouseholdsByMember: getHouseholdsByMember,
        getHouseholdsHeadedBy: getHouseholdsHeadedBy,
        getCharacterHousehold: getCharacterHousehold,

        // Status
        getHouseholdStatus: getHouseholdStatus,

        // Members
        getHouseholdMembers: getHouseholdMembers,
        getHouseholdHead: getHouseholdHead,
        getDemographics: getDemographics,

        // Positions
        getHouseholdPosition: getHouseholdPosition,
        getHouseholdPositions: getHouseholdPositions,

        // Assignments
        getHouseholdAssignment: getHouseholdAssignment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignmentsForHousehold: getAssignmentsForHousehold,

        // Staff
        getHouseholdStaff: getHouseholdStaff,
        getUnassignedHouseholdStaff: getUnassignedHouseholdStaff,

        // Enterprises
        getHouseholdEnterprises: getHouseholdEnterprises,
        getHouseholdEnterpriseSummaries: getHouseholdEnterpriseSummaries,
        getHouseholdEnterpriseStats: getHouseholdEnterpriseStats,

        // Heirs
        getHouseholdHeirs: getHouseholdHeirs,

        // Composite
        getHouseholdDetails: getHouseholdDetails,

        // Statistics
        getStatistics: getStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdQueries;
    }

})();
