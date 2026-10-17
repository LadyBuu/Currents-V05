/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-queries.js
 *
 * PURPOSE
 * -------
 * Semantic read API for household data. Returns defensive snapshots.
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - No mutations. No _processing guard.
 *   - Required dependencies fail loudly (throw at load or at call time).
 *   - Optional dependencies are checked at call time; if a query
 *     fundamentally cannot be answered without an optional dep (e.g.
 *     enterprise summaries without IndustryQueries), and the household
 *     actually has enterprises, we throw. If the household has no
 *     enterprises, we return [] — because empty is legitimate.
 *   - Public reads never expose live canonical records.
 *   - Historical queries accept explicit referenceYear.
 *
 * WHAT IS SNAPSHOTTED
 * -------------------
 *   getHousehold               → flat projection (no members array)
 *   getAllHouseholds            → [flat projection]
 *   getHouseholdMembers         → [{member, character snapshot, age, ...}]
 *   getHouseholdDetails         → composite { household, status, members,
 *                                              head, demographics,
 *                                              departments, residence,
 *                                              enterprises, enterpriseStats }
 *   getHouseholdSnapshot        → temporal projection at referenceYear
 *   getCharacterHouseholdSnapshot → temporal projection for a character
 *
 * DEPENDENCIES (required)
 * -----------------------
 *   - HouseholdState
 *   - getCharacterById
 *   - getCharacters
 *   - getCurrentYearSafe
 *
 * DEPENDENCIES (optional)
 * -----------------------
 *   - getChildren, getParents  (heir discovery — if missing, external
 *                               heirs are not included)
 *   - IndustryState            (getHouseholdEnterprises)
 *   - IndustryQueries          (getHouseholdEnterpriseSummaries)
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdQueries: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdQueries: ' + name + ' is required');
        }
        return obj;
    }

    var _state = _requireObject('HouseholdState', window.HouseholdState);
    if (!_state._internal ||
        typeof _state._internal.getHouseholdRecord !== 'function' ||
        typeof _state._internal.getAllHouseholdRecords !== 'function' ||
        typeof _state._internal.getPositionRecord !== 'function' ||
        typeof _state._internal.getAllPositionRecords !== 'function' ||
        typeof _state._internal.getAssignmentRecord !== 'function' ||
        typeof _state._internal.getAllAssignmentRecords !== 'function') {
        throw new Error(
            'HouseholdQueries: HouseholdState._internal is missing required methods');
    }
    var _internal = _state._internal;

    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);
    var _getCharacters = _requireFunction('getCharacters', window.getCharacters);
    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe',
        window.getCurrentYearSafe);

    // Optional deps — checked at call time
    function _getChildren(characterId) {
        if (typeof window.getChildren !== 'function') return null;
        return window.getChildren(characterId);
    }
    function _getParents(characterId) {
        if (typeof window.getParents !== 'function') return null;
        return window.getParents(characterId);
    }
    function _industryState() {
        return typeof window.IndustryState !== 'undefined'
            ? window.IndustryState
            : null;
    }
    function _industryQueries() {
        return typeof window.IndustryQueries !== 'undefined'
            ? window.IndustryQueries
            : null;
    }

    // =========================================================================
    // 2. CHARACTER SNAPSHOT HELPERS
    // =========================================================================

    function _snapshotCharacter(character) {
        if (!character) return null;
        return {
            id: character.id,
            name: character.name || '',
            surname: character.surname || '',
            displayName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            gender: character.gender || null,
            birthYear: character.birthYear !== undefined
                ? character.birthYear : null,
            deathYear: character.deathYear !== undefined
                ? character.deathYear : null,
            isDeceased: character.isDeceased === true,
            professions: Array.isArray(character.professions)
                ? character.professions.map(function(p) {
                    return {
                        id: p.id,
                        name: p.name || null,
                        skillLevel: p.skillLevel !== undefined
                            ? p.skillLevel : null
                    };
                })
                : []
        };
    }

    function _ageAt(character, referenceYear) {
        if (!character || character.birthYear === undefined ||
            character.birthYear === null) {
            return null;
        }
        var year = referenceYear !== null && referenceYear !== undefined
            ? referenceYear
            : _getCurrentYearSafe();
        return year - character.birthYear;
    }

    function _resolveReferenceYear(options) {
        options = options || {};
        if (options.referenceYear === undefined || options.referenceYear === null) {
            return null;
        }
        return options.referenceYear;
    }

    // =========================================================================
    // 3. HOUSEHOLD STATUS PROJECTION
    // =========================================================================

    function getHouseholdStatus(householdId) {
        var household = _internal.getHouseholdRecord(householdId);
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
        if (persisted === 'destroyed') status = 'destroyed';
        else if (persisted === 'deprecated') status = 'deprecated';
        else if (isEmpty) status = 'empty';
        else if (isVacant) status = 'vacant';
        else if (isDeclining) status = 'declining';
        else status = 'active';

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
    // 4. HOUSEHOLD LOOKUPS
    // =========================================================================

    function getHousehold(householdId) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return null;

        return {
            id: household.id,
            name: household.name || '',
            locationId: household.locationId || null,
            locationName: household.locationName || null,
            status: household.status || null,
            reputation: household.reputation !== undefined
                ? household.reputation : null,
            wealth: household.wealth !== undefined ? household.wealth : null,
            debt: household.debt !== undefined ? household.debt : null,
            powerScore: household.powerScore !== undefined
                ? household.powerScore : null,
            foundedYear: household.foundedYear !== undefined
                ? household.foundedYear : null,
            notes: household.notes || '',
            currentNameSince: household.currentNameSince !== undefined
                ? household.currentNameSince : null,
            memberCount: Array.isArray(household.members)
                ? household.members.length : 0,
            departmentCount: Array.isArray(household.departments)
                ? household.departments.length : 0
        };
    }

    function getAllHouseholds(options) {
        options = options || {};
        var records = _internal.getAllHouseholdRecords({
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
        var records = _internal.getAllHouseholdRecords({
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
        var records = _internal.getAllHouseholdRecords({
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

    /**
     * Households containing the character as a member.
     *
     * By default excludes deprecated/destroyed households — a character
     * should not be considered "living in" a household that has been
     * deprecated by a merge or destroyed. Pass includeDeprecated:true to
     * see all historical membership.
     */
    function getHouseholdsByMember(characterId, options) {
        options = options || {};
        if (!characterId) return [];

        var all = _internal.getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });
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

    /**
     * Households headed by the character.
     *
     * By default excludes deprecated/destroyed. Pass includeDeprecated:true
     * to include them.
     */
    function getHouseholdsHeadedBy(characterId, options) {
        options = options || {};
        if (!characterId) return [];

        var all = _internal.getAllHouseholdRecords({
            includeDeprecated: options.includeDeprecated === true
        });
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
     * The character's CURRENT household.
     *
     * By default excludes deprecated/destroyed — a character is not
     * "currently in" a household that's been merged away. Use
     * getHouseholdsByMember(id, {includeDeprecated: true}) for the full
     * membership history.
     */
    function getCharacterHousehold(characterId, options) {
        if (!characterId) return null;
        var candidates = getHouseholdsByMember(characterId, options);
        if (candidates.length === 0) return null;
        return candidates[0];
    }

    // =========================================================================
    // 5. MEMBER PROJECTIONS
    // =========================================================================

    function getHouseholdMembers(householdId, options) {
        options = options || {};
        var referenceYear = _resolveReferenceYear(options);
        var household = _internal.getHouseholdRecord(householdId);
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
                joinedYear: member.joinedYear !== undefined
                    ? member.joinedYear : null,
                headSince: member.headSince !== undefined
                    ? member.headSince : null,
                notes: member.notes || '',
                age: _ageAt(character, referenceYear),
                isDeceased: character ? character.isDeceased === true : null,
                isMissing: character === null
            });
        }
        return result;
    }

    function getHouseholdHead(householdId) {
        var members = getHouseholdMembers(householdId);
        for (var i = 0; i < members.length; i++) {
            if (members[i].isHead) return members[i];
        }
        return null;
    }

    // =========================================================================
    // 6. DEPARTMENT PROJECTIONS
    // =========================================================================

    function _snapshotDepartment(d) {
        if (!d) return null;
        return {
            id: d.id,
            name: d.name || '',
            headId: d.headId || null,
            headName: d.headName || null,
            createdAt: d.createdAt !== undefined ? d.createdAt : null
        };
    }

    function getHouseholdDepartments(householdId) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return null;
        if (!Array.isArray(household.departments)) return [];
        var result = [];
        for (var i = 0; i < household.departments.length; i++) {
            var s = _snapshotDepartment(household.departments[i]);
            if (s) result.push(s);
        }
        return result;
    }

    function getHouseholdDepartment(householdId, departmentId) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household || !Array.isArray(household.departments)) return null;
        for (var i = 0; i < household.departments.length; i++) {
            if (household.departments[i].id === departmentId) {
                return _snapshotDepartment(household.departments[i]);
            }
        }
        return null;
    }

    function getHouseholdMembersByDepartment(householdId, departmentId) {
        var members = getHouseholdMembers(householdId);
        var result = [];
        for (var i = 0; i < members.length; i++) {
            if (members[i].departmentId === departmentId) {
                result.push(members[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 7. DEMOGRAPHIC PROJECTIONS
    // =========================================================================

    function getDemographics(householdId, options) {
        options = options || {};
        var referenceYear = _resolveReferenceYear(options);
        var members = getHouseholdMembers(householdId, {
            referenceYear: referenceYear
        });

        var stats = {
            total: 0, male: 0, female: 0, unknown: 0,
            children: 0, youth: 0, adults: 0, elders: 0,
            ageUnknown: 0, living: 0, deceased: 0, missing: 0,
            byAgeGroup: {}
        };

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            stats.total++;

            if (m.isMissing) { stats.missing++; continue; }

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
    // 8. NAME PERIODS
    // =========================================================================
    //
    // getHouseholdNamePeriods is called by modals-household-snapshot.js.
    // The projection computes index, periodEnd, and isCurrent so the UI
    // does not need to sort or decorate the raw nameHistory array.
    // =========================================================================

    function getHouseholdNamePeriods(householdId) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return [];
        if (!Array.isArray(household.nameHistory)) return [];

        var result = [];
        var history = household.nameHistory;
        for (var i = 0; i < history.length; i++) {
            var entry = history[i];
            var isCurrent = i === history.length - 1;
            result.push({
                index: i,
                oldName: entry.oldName || null,
                newName: entry.newName || '',
                year: entry.year !== undefined ? entry.year : null,
                periodEnd: isCurrent ? null :
                    (history[i + 1].year !== undefined
                        ? history[i + 1].year : null),
                reason: entry.reason || null,
                changedBy: entry.changedBy || null,
                timestamp: entry.timestamp !== undefined
                    ? entry.timestamp : null,
                isCurrent: isCurrent
            });
        }
        return result;
    }

    // =========================================================================
    // 9. TEMPORAL SNAPSHOTS
    // =========================================================================
    //
    // getHouseholdSnapshot and getCharacterHouseholdSnapshot are called
    // by modals-household-snapshot.js. They produce a projection of the
    // household as it existed at a specific reference year.
    //
    // The snapshot cannot resurrect deleted members, but it can:
    //   - include members whose joinedYear <= referenceYear
    //   - exclude members whose leftYear is set and < referenceYear
    //   - exclude members whose birthYear > referenceYear (not yet born)
    //   - include members who died after referenceYear (alive at snapshot)
    //   - mark members who died at or before referenceYear as deceased
    //
    // For character snapshots, viewMode controls which year is used:
    //   'at_death' → character.deathYear (or current year if alive)
    //   'at_join'  → character's earliest householdHistory joinedYear
    //   'all'      → current year
    // =========================================================================

    function getHouseholdSnapshot(householdId, referenceYear, viewMode) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return null;

        var year = referenceYear !== undefined && referenceYear !== null
            ? referenceYear
            : _getCurrentYearSafe();

        // Find the name period that was current at referenceYear
        var nameAtTime = household.name || '';
        var periodAtTime = null;
        if (Array.isArray(household.nameHistory)) {
            var history = household.nameHistory;
            for (var i = history.length - 1; i >= 0; i--) {
                if (history[i].year !== undefined && history[i].year <= year) {
                    nameAtTime = history[i].newName || nameAtTime;
                    periodAtTime = {
                        index: i,
                        oldName: history[i].oldName || null,
                        newName: history[i].newName || '',
                        year: history[i].year,
                        endYear: (i === history.length - 1)
                            ? null
                            : (history[i + 1].year || null),
                        reason: history[i].reason || null
                    };
                    break;
                }
            }
        }

        // Build member snapshots
        var members = [];
        var livingCount = 0;
        var totalMembers = 0;

        if (Array.isArray(household.members)) {
            for (var m = 0; m < household.members.length; m++) {
                var member = household.members[m];
                var character = null;
                try {
                    character = _getCharacterById(member.characterId);
                } catch (e) {
                    character = null;
                }

                var joinedYear = member.joinedYear !== undefined
                    ? member.joinedYear : null;
                if (joinedYear !== null && joinedYear > year) continue;

                var birthYear = character && character.birthYear !== undefined
                    ? character.birthYear : null;
                if (birthYear !== null && birthYear > year) continue;

                // Member left the household before the snapshot?
                var leftYear = null;
                if (character && Array.isArray(character.householdHistory)) {
                    for (var hh = 0; hh < character.householdHistory.length; hh++) {
                        var he = character.householdHistory[hh];
                        if (he.householdId === householdId &&
                            he.joinedYear === joinedYear &&
                            he.leftYear !== null &&
                            he.leftYear !== undefined) {
                            leftYear = he.leftYear;
                            break;
                        }
                    }
                }
                if (leftYear !== null && leftYear <= year) continue;

                totalMembers++;

                var age = (birthYear !== null) ? year - birthYear : null;
                var diedAtOrBefore = character &&
                    character.isDeceased &&
                    character.deathYear !== undefined &&
                    character.deathYear !== null &&
                    character.deathYear <= year;
                var aliveAtSnapshot = character && !diedAtOrBefore &&
                    (!character.isDeceased ||
                        (character.deathYear !== undefined &&
                            character.deathYear !== null &&
                            character.deathYear > year));

                if (aliveAtSnapshot) livingCount++;

                members.push({
                    characterId: member.characterId,
                    name: character ? character.name || '' : '',
                    surname: character ? character.surname || '' : '',
                    displayName: character
                        ? (character.name || '') +
                            (character.surname ? ' ' + character.surname : '')
                        : 'Unknown',
                    role: member.role || null,
                    type: member.type || null,
                    isHead: member.isHead === true,
                    departmentId: member.departmentId || null,
                    joinedYear: joinedYear,
                    leftYear: leftYear,
                    ageAtSnapshot: age,
                    aliveAtSnapshot: aliveAtSnapshot,
                    currentlyDeceased: character
                        ? character.isDeceased === true : null,
                    isMissing: character === null
                });
            }
        }

        return {
            householdId: householdId,
            householdName: household.name || '',
            nameAtTime: nameAtTime,
            periodName: nameAtTime,
            period: periodAtTime,
            snapshotYear: year,
            viewMode: viewMode || 'all',
            members: members,
            totalMembers: totalMembers,
            livingCount: livingCount
        };
    }

    function getCharacterHouseholdSnapshot(characterId, viewMode) {
        var character = null;
        try {
            character = _getCharacterById(characterId);
        } catch (e) {
            character = null;
        }
        if (!character) return null;

        var mode = viewMode || 'at_death';
        var year = _getCurrentYearSafe();

        if (mode === 'at_death') {
            if (character.deathYear !== undefined &&
                character.deathYear !== null) {
                year = character.deathYear;
            }
        } else if (mode === 'at_join') {
            if (Array.isArray(character.householdHistory) &&
                character.householdHistory.length > 0) {
                var earliest = null;
                for (var i = 0; i < character.householdHistory.length; i++) {
                    var jy = character.householdHistory[i].joinedYear;
                    if (jy !== undefined && jy !== null) {
                        if (earliest === null || jy < earliest) earliest = jy;
                    }
                }
                if (earliest !== null) year = earliest;
            }
        }

        // Find the household that contained the character at this year.
        var householdId = null;
        if (Array.isArray(character.householdHistory)) {
            for (var hh = character.householdHistory.length - 1; hh >= 0; hh--) {
                var entry = character.householdHistory[hh];
                var jy2 = entry.joinedYear;
                var ly = entry.leftYear;
                if (jy2 === null || jy2 === undefined) continue;
                if (jy2 > year) continue;
                if (ly !== null && ly !== undefined && ly <= year) continue;
                householdId = entry.householdId;
                break;
            }
        }

        if (!householdId) {
            // Fall back to the character's current household
            var current = getCharacterHousehold(characterId);
            if (!current) return null;
            householdId = current.id;
        }

        var snapshot = getHouseholdSnapshot(householdId, year, mode);
        if (snapshot) {
            snapshot.targetCharacterId = characterId;
        }
        return snapshot;
    }

    // =========================================================================
    // 10. POSITION PROJECTIONS
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
            priority: position.priority !== undefined
                ? position.priority : null,
            createdAt: position.createdAt !== undefined
                ? position.createdAt : null,
            updatedAt: position.updatedAt !== undefined
                ? position.updatedAt : null
        };
    }

    function getHouseholdPosition(positionId) {
        return _snapshotPosition(_internal.getPositionRecord(positionId));
    }

    function getHouseholdPositions(options) {
        options = options || {};
        var all = _internal.getAllPositionRecords();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var p = all[i];
            if (options.householdId && p.householdId !== options.householdId) {
                continue;
            }
            if (options.departmentId && p.departmentId !== options.departmentId) {
                continue;
            }
            if (options.requiredRoleId && p.requiredRoleId !== options.requiredRoleId) {
                continue;
            }
            result.push(_snapshotPosition(p));
        }
        return result;
    }

    // =========================================================================
    // 11. ASSIGNMENT PROJECTIONS
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
        return _snapshotAssignment(_internal.getAssignmentRecord(assignmentId));
    }

    function getAssignmentsForPosition(positionId, activeOnly) {
        var all = _internal.getAllAssignmentRecords();
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
        var all = _internal.getAllAssignmentRecords();
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
        var all = _internal.getAllAssignmentRecords();
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
    // 12. ENTERPRISE PROJECTIONS
    // =========================================================================
    //
    // Both getHouseholdEnterprises and getHouseholdEnterpriseSummaries
    // follow the same rule:
    //   - If household has no enterprises → return [] (empty is legitimate)
    //   - If household has enterprises but required industry module is
    //     missing → throw (silent fallback would hide a real failure)
    //   - Otherwise → return snapshots from the industry module
    //
    // This is the same rule applied across the module: missing
    // infrastructure is loud, empty data is quiet.
    // =========================================================================

    function getHouseholdEnterprises(householdId) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household || !Array.isArray(household.enterprises)) return [];
        if (household.enterprises.length === 0) return [];

        var industryState = _industryState();
        if (!industryState) {
            throw new Error(
                'HouseholdQueries.getHouseholdEnterprises: household ' +
                householdId + ' has ' + household.enterprises.length +
                ' enterprise(s) but IndustryState is not loaded'
            );
        }
        if (typeof industryState.getEnterprise !== 'function') {
            throw new Error(
                'HouseholdQueries.getHouseholdEnterprises: ' +
                'IndustryState.getEnterprise is not available'
            );
        }

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
        if (enterprises.length === 0) return [];

        var iq = _industryQueries();
        if (!iq) {
            throw new Error(
                'HouseholdQueries.getHouseholdEnterpriseSummaries: household ' +
                householdId + ' has ' + enterprises.length +
                ' enterprise(s) but IndustryQueries is not loaded'
            );
        }
        if (typeof iq.getEnterpriseSummary !== 'function') {
            throw new Error(
                'HouseholdQueries.getHouseholdEnterpriseSummaries: ' +
                'IndustryQueries.getEnterpriseSummary is not available'
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
            total: summaries.length, profitable: 0, unprofitable: 0,
            totalProfit: 0, totalWealth: 0, totalDebt: 0, totalWorkers: 0,
            publicCount: 0, privateCount: 0,
            byStatus: {}, byCategory: {}
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

    function getHouseholdEnterpriseValue(householdId) {
        var summaries = getHouseholdEnterpriseSummaries(householdId);
        var total = 0;
        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            total += (s.wealth || 0) - (s.debt || 0);
        }
        return total;
    }

    // =========================================================================
    // 13. HEIR DISCOVERY
    // =========================================================================

    function getHouseholdHeirs(householdId, deceasedId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return [];

        var referenceYear = _resolveReferenceYear(options);
        var includeExternal = options.includeExternal !== false;
        var minAge = options.minAge !== undefined ? options.minAge : null;
        var maxAge = options.maxAge !== undefined ? options.maxAge : null;

        var seen = {};
        var candidates = [];

        // First pass: current household members
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

        // Second pass: children and siblings (if external allowed and
        // family accessors available)
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

        // Sort: current head first, then household members, then external,
        // then by age (oldest first).
        candidates.sort(function(a, b) {
            var priA = a.isHead ? 0 : (a.type === 'family' ? 1 : 2);
            var priB = b.isHead ? 0 : (b.type === 'family' ? 1 : 2);
            if (priA !== priB) return priA - priB;
            return (b.age || 0) - (a.age || 0);
        });

        return candidates;
    }

    // =========================================================================
    // 14. STAFF PROJECTIONS
    // =========================================================================

    function getHouseholdStaff(householdId, options) {
        options = options || {};
        var members = getHouseholdMembers(householdId);
        var result = [];

        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (m.type !== 'staff') continue;

            if (options.departmentId &&
                m.departmentId !== options.departmentId) {
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
    // 15. COMPOSITE PROJECTIONS (for UI)
    // =========================================================================

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
            // Household has enterprises but Industry is not loaded — that's
            // a legitimate runtime concern for the caller, but the details
            // modal should still render. We swallow here so the modal is
            // usable; callers that need the full enterprise list use
            // getHouseholdEnterpriseSummaries directly (which will throw).
            enterpriseSummaries = [];
            enterpriseStats = null;
        }

        var record = _internal.getHouseholdRecord(householdId);

        var departments = [];
        if (record && Array.isArray(record.departments)) {
            for (var d = 0; d < record.departments.length; d++) {
                var s = _snapshotDepartment(record.departments[d]);
                if (s) departments.push(s);
            }
        }

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
            departments: departments,
            residence: residence,
            enterprises: enterpriseSummaries,
            enterpriseStats: enterpriseStats
        };
    }

    // =========================================================================
    // 16. STATISTICS
    // =========================================================================

    function getStatistics(options) {
        options = options || {};
        var records = _internal.getAllHouseholdRecords({
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
            activeAssignments: 0,
            averageWealth: null,
            averageReputation: null
        };

        var totalWealth = 0;
        var wealthCount = 0;
        var totalReputation = 0;
        var repCount = 0;

        for (var i = 0; i < records.length; i++) {
            var h = records[i];
            var count = Array.isArray(h.members) ? h.members.length : 0;
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

        var positions = _internal.getAllPositionRecords();
        stats.totalPositions = positions.length;

        var assignments = _internal.getAllAssignmentRecords();
        stats.totalAssignments = assignments.length;
        for (var a = 0; a < assignments.length; a++) {
            if (assignments[a].endYear === null ||
                assignments[a].endYear === undefined) {
                stats.activeAssignments++;
            }
        }

        // null means "no data", not "zero" — the caller can distinguish
        // "average wealth of these households is 0" from "no household
        // has a wealth field".
        stats.averageWealth = wealthCount > 0 ? totalWealth / wealthCount : null;
        stats.averageReputation = repCount > 0
            ? totalReputation / repCount
            : null;

        return stats;
    }

    // =========================================================================
    // 17. EXPORTS
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

        // Name periods
        getHouseholdNamePeriods: getHouseholdNamePeriods,

        // Temporal snapshots
        getHouseholdSnapshot: getHouseholdSnapshot,
        getCharacterHouseholdSnapshot: getCharacterHouseholdSnapshot,

        // Departments
        getHouseholdDepartments: getHouseholdDepartments,
        getHouseholdDepartment: getHouseholdDepartment,
        getHouseholdMembersByDepartment: getHouseholdMembersByDepartment,

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
        getHouseholdEnterpriseValue: getHouseholdEnterpriseValue,

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
