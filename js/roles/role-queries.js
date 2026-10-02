/**
 * =============================================================================
 * STILL WATERS - ROLE QUERIES (role-queries.js)
 * =============================================================================
 *
 * All read-only operations for the role domain.
 *
 * Contract:
 *   - No mutations, no side effects, no events, no persistence.
 *   - No recursion guards.
 *   - No fallbacks. Required dependencies fail loudly.
 *   - No presentation data in domain projections. Icons and labels
 *     belong in the UI layer.
 *   - Skill-tier classification delegated entirely to SkillUtils.
 *
 * DEPENDENCIES:
 *   - role-state.js       (RoleState)
 *   - role-constants.js   (RoleConstants)
 *   - skill-utils.js      (SkillUtils)
 *   - accessors.js        (getCharacterById, getCharacters, getRankById)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RoleState) {
        throw new Error('role-queries.js requires role-state.js to be loaded first.');
    }
    if (!window.RoleConstants) {
        throw new Error('role-queries.js requires role-constants.js to be loaded first.');
    }
    if (!window.SkillUtils) {
        throw new Error('role-queries.js requires skill-utils.js to be loaded first.');
    }
    if (typeof window.getCharacterById !== 'function' ||
        typeof window.getCharacters !== 'function') {
        throw new Error(
            'role-queries.js requires accessors.js (getCharacterById, getCharacters).'
        );
    }

    var RC = window.RoleConstants;
    var RS = window.RoleState;
    var SU = window.SkillUtils;

    // =========================================================================
    // 2. PRIVATE HELPERS
    // =========================================================================

    function _characterHasRole(character, roleId) {
        if (!character || !Array.isArray(character.professions)) return false;
        for (var i = 0; i < character.professions.length; i++) {
            if (character.professions[i] && character.professions[i].id === roleId) {
                return true;
            }
        }
        return false;
    }

    function _findProfession(character, roleId) {
        if (!character || !Array.isArray(character.professions)) return null;
        for (var i = 0; i < character.professions.length; i++) {
            if (character.professions[i] && character.professions[i].id === roleId) {
                return character.professions[i];
            }
        }
        return null;
    }

    function _matchesGenderRestriction(role, character) {
        if (role.genderRestriction === 'both') return true;
        return role.genderRestriction === character.gender;
    }

    // =========================================================================
    // 3. ROLE COLLECTION QUERIES
    // =========================================================================

    function getRoles(filters) {
        filters = filters || {};
        var roles = RS.getAllRoles();
        var result = roles.slice();

        if (filters.category && filters.category !== 'all') {
            result = result.filter(function (r) { return r.category === filters.category; });
        }

        if (filters.gender && filters.gender !== 'all') {
            var g = filters.gender;
            result = result.filter(function (r) {
                return r.genderRestriction === 'both' || r.genderRestriction === g;
            });
        }

        if (typeof filters.search === 'string' && filters.search.trim()) {
            var needle = filters.search.toLowerCase().trim();
            result = result.filter(function (r) {
                if (r.name && r.name.toLowerCase().indexOf(needle) !== -1) return true;
                if (r.notes && r.notes.toLowerCase().indexOf(needle) !== -1) return true;
                return false;
            });
        }

        if (Array.isArray(filters.excludeIds) && filters.excludeIds.length > 0) {
            var excluded = {};
            for (var i = 0; i < filters.excludeIds.length; i++) {
                excluded[filters.excludeIds[i]] = true;
            }
            result = result.filter(function (r) { return !excluded[r.id]; });
        }

        result.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        return result;
    }

    function searchRoles(searchTerm, options) {
        options = options || {};
        return getRoles({
            search: searchTerm,
            category: options.category,
            gender: options.gender
        }).slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
    }

    // =========================================================================
    // 4. ROLE SUMMARY PROJECTIONS
    // =========================================================================
    //
    // Defensive, flat projections used by cross-domain consumers and UI
    // that need role facts without reaching into role-state.
    // =========================================================================

    /**
     * Returns a defensive summary of a role.
     *
     * @param {string} roleId
     * @returns {Object|null}
     */
    function getRoleSummary(roleId) {
        if (!roleId) return null;
        var role = RS.getRole(roleId);
        if (!role) return null;

        return {
            id: role.id,
            name: role.name || '',
            category: role.category || null,
            genderRestriction: role.genderRestriction || 'both',
            icon: role.icon || null,
            descriptions: role.descriptions ? Object.assign({}, role.descriptions) : {},
            specializations: Array.isArray(role.specializations)
                ? role.specializations.slice()
                : [],
            notes: role.notes || ''
        };
    }

    /**
     * Returns summaries for all roles.
     *
     * @param {Object} [filters] same shape as getRoles
     * @returns {Array<Object>}
     */
    function getAllRoleSummaries(filters) {
        var roles = getRoles(filters);
        var out = [];
        for (var i = 0; i < roles.length; i++) {
            var s = getRoleSummary(roles[i].id);
            if (s) out.push(s);
        }
        return out;
    }

    /**
     * Returns a defensive summary of a rank.
     *
     * Delegates to getRankById (accessors). Rank is canonical in
     * masterData.data.ranks; this projection is what UI and cross-domain
     * consumers use.
     *
     * @param {string} rankId
     * @returns {Object|null}
     */
    function getRankSummary(rankId) {
        if (!rankId) return null;
        if (typeof window.getRankById !== 'function') return null;
        var rank = window.getRankById(rankId);
        if (!rank) return null;

        return {
            id: rank.id,
            name: rank.name || '',
            symbol: rank.symbol || null,
            priority: rank.priority !== undefined ? rank.priority : null
        };
    }

    /**
     * Returns summaries for all ranks.
     *
     * @returns {Array<Object>}
     */
    function getAllRankSummaries() {
        if (typeof window.getRanks !== 'function') return [];
        var ranks = window.getRanks();
        var out = [];
        for (var i = 0; i < ranks.length; i++) {
            var s = getRankSummary(ranks[i].id);
            if (s) out.push(s);
        }
        return out;
    }

    // =========================================================================
    // 5. CATEGORY QUERIES
    // =========================================================================

    function getRoleCategories() {
        return RS.getCategories();
    }

    function getRoleCategoriesWithCounts() {
        var categories = RS.getCategories();
        var roles = RS.getAllRoles();

        var counts = {};
        for (var i = 0; i < roles.length; i++) {
            var cat = roles[i].category || RC.UNCATEGORIZED_ID;
            counts[cat] = (counts[cat] || 0) + 1;
        }

        var result = [];
        for (var key in categories) {
            if (!Object.prototype.hasOwnProperty.call(categories, key)) continue;
            result.push({
                id: categories[key].id,
                name: categories[key].name,
                count: counts[key] || 0
            });
        }

        result.sort(function (a, b) {
            return b.count - a.count || a.name.localeCompare(b.name);
        });

        return result;
    }

    // =========================================================================
    // 6. CHARACTER-ROLE QUERIES
    // =========================================================================

    function getCharactersWithRoleDetails(roleId, options) {
        options = options || {};

        var role = RS.getRole(roleId);
        if (!role) return [];

        var characters = window.getCharacters();
        var results = [];
        var minSkill = null;

        if (options.mastersOnly) {
            minSkill = SU.getThresholds().MASTER;
        } else if (options.expertsAndUp) {
            minSkill = SU.getThresholds().EXPERT;
        } else if (options.canTeachOnly) {
            minSkill = SU.getTeachingThreshold();
        } else if (typeof options.minSkill === 'number') {
            minSkill = options.minSkill;
        } else if (typeof options.minTier === 'string') {
            var tierMap = {
                novice:     SU.getThresholds().NOVICE,
                apprentice: SU.getThresholds().APPRENTICE,
                journeyman: SU.getThresholds().JOURNEYMAN,
                expert:     SU.getThresholds().EXPERT,
                master:     SU.getThresholds().MASTER
            };
            if (Object.prototype.hasOwnProperty.call(tierMap, options.minTier)) {
                minSkill = tierMap[options.minTier];
            }
        }

        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            var profession = _findProfession(character, roleId);
            if (!profession) continue;

            var skillLevel = typeof profession.skillLevel === 'number'
                ? SU.clampLevel(profession.skillLevel)
                : 0;

            if (minSkill !== null && skillLevel < minSkill) continue;

            var tier = SU.getTier(skillLevel);
            var specializations = Array.isArray(profession.specs)
                ? profession.specs.slice()
                : [];

            results.push({
                character: character,
                profession: profession,
                skillLevel: skillLevel,
                tierId: tier.id,
                tierName: tier.name,
                specializations: specializations,
                isPrimary: profession.primary === true,
                canTeach: SU.canTeach(skillLevel)
            });
        }

        results.sort(function (a, b) {
            if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
            return (a.character.name || '').localeCompare(b.character.name || '');
        });

        return results;
    }

    function getCharactersWithRole(roleId, options) {
        return getCharactersWithRoleDetails(roleId, options).map(function (entry) {
            return entry.character;
        });
    }

    function getSkillLevel(characterId, roleId) {
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        var profession = _findProfession(character, roleId);
        if (!profession) return null;
        return typeof profession.skillLevel === 'number'
            ? SU.clampLevel(profession.skillLevel)
            : 0;
    }

    function characterHasRole(characterId, roleId) {
        var character = window.getCharacterById(characterId);
        return _characterHasRole(character, roleId);
    }

    // =========================================================================
    // 7. ELIGIBILITY QUERY
    // =========================================================================

    function getEligibleCharactersForRole(roleId, filters) {
        filters = filters || {};
        var role = RS.getRole(roleId);
        if (!role) return [];

        var all = window.getCharacters();
        var needle = typeof filters.search === 'string' && filters.search.trim()
            ? filters.search.toLowerCase().trim()
            : null;
        var genderFilter = filters.gender && filters.gender !== 'all'
            ? filters.gender
            : null;
        var locationFilter = filters.locationId && filters.locationId !== 'all'
            ? filters.locationId
            : null;
        var resolveLocation = typeof filters.getLocation === 'function'
            ? filters.getLocation
            : null;

        var result = [];

        for (var i = 0; i < all.length; i++) {
            var character = all[i];

            if (character.isDeceased) continue;
            if (!_matchesGenderRestriction(role, character)) continue;
            if (_characterHasRole(character, roleId)) continue;

            if (needle) {
                var nameMatch = character.name &&
                    character.name.toLowerCase().indexOf(needle) !== -1;
                var surnameMatch = character.surname &&
                    character.surname.toLowerCase().indexOf(needle) !== -1;
                if (!nameMatch && !surnameMatch) continue;
            }

            if (genderFilter && character.gender !== genderFilter) continue;

            if (locationFilter && resolveLocation) {
                if (resolveLocation(character) !== locationFilter) continue;
            }

            result.push(character);
        }

        result.sort(function (a, b) {
            return (a.birthYear || 9999) - (b.birthYear || 9999);
        });

        return result;
    }

    function getOccupiedLocationIds(getLocation) {
        if (typeof getLocation !== 'function') return [];
        var characters = window.getCharacters();
        var seen = {};
        var result = [];
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (c.isDeceased) continue;
            var loc = getLocation(c);
            if (!loc || loc === 'unknown') continue;
            if (seen[loc]) continue;
            seen[loc] = true;
            result.push(loc);
        }
        result.sort();
        return result;
    }

    // =========================================================================
    // 8. STATISTICS
    // =========================================================================

    function getRoleStatistics(roleId) {
        var role = RS.getRole(roleId);
        if (!role) {
            return {
                totalCharacters: 0,
                averageSkill: 0,
                countsByTier: {
                    untrained: 0, novice: 0, apprentice: 0,
                    journeyman: 0, expert: 0, master: 0
                },
                canTeachCount: 0,
                specializations: [],
                totalSpecializations: 0
            };
        }

        var entries = getCharactersWithRoleDetails(roleId);
        var total = entries.length;
        var totalSkill = 0;
        var countsByTier = {
            untrained: 0, novice: 0, apprentice: 0,
            journeyman: 0, expert: 0, master: 0
        };
        var canTeachCount = 0;

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            totalSkill += entry.skillLevel;
            countsByTier[entry.tierId] = (countsByTier[entry.tierId] || 0) + 1;
            if (entry.canTeach) canTeachCount++;
        }

        var specializations = Array.isArray(role.specializations)
            ? role.specializations.slice()
            : [];

        return {
            totalCharacters: total,
            averageSkill: total > 0 ? Math.round(totalSkill / total) : 0,
            countsByTier: countsByTier,
            canTeachCount: canTeachCount,
            specializations: specializations,
            totalSpecializations: specializations.length
        };
    }

    // =========================================================================
    // 9. SPECIALIZATION QUERIES
    // =========================================================================

    function getRoleSpecializations(roleId) {
        var role = RS.getRole(roleId);
        if (!role || !Array.isArray(role.specializations)) return [];
        return role.specializations.slice();
    }

    function getAllRoleSpecializations() {
        var roles = RS.getAllRoles();
        var seen = {};
        var result = [];
        for (var i = 0; i < roles.length; i++) {
            var specs = roles[i].specializations || [];
            for (var j = 0; j < specs.length; j++) {
                var spec = specs[j];
                if (spec && !seen[spec]) {
                    seen[spec] = true;
                    result.push(spec);
                }
            }
        }
        result.sort();
        return result;
    }

    function getRolesWithSpecialization(specialization) {
        if (typeof specialization !== 'string' || !specialization) return [];
        var roles = RS.getAllRoles();
        return roles.filter(function (role) {
            return Array.isArray(role.specializations) &&
                role.specializations.indexOf(specialization) !== -1;
        });
    }

    // =========================================================================
    // 10. TEACHING QUERIES
    // =========================================================================

    function getPotentialTeachersForRole(roleId) {
        return getCharactersWithRoleDetails(roleId, { canTeachOnly: true });
    }

    function canCharacterTeachRole(characterId, roleId) {
        var level = getSkillLevel(characterId, roleId);
        if (level === null) return false;
        return SU.canTeach(level);
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.RoleQueries = {
        // Role collection
        getRoles: getRoles,
        searchRoles: searchRoles,

        // Summary projections
        getRoleSummary: getRoleSummary,
        getAllRoleSummaries: getAllRoleSummaries,
        getRankSummary: getRankSummary,
        getAllRankSummaries: getAllRankSummaries,

        // Categories
        getRoleCategories: getRoleCategories,
        getRoleCategoriesWithCounts: getRoleCategoriesWithCounts,

        // Character-role
        getCharactersWithRoleDetails: getCharactersWithRoleDetails,
        getCharactersWithRole: getCharactersWithRole,
        getSkillLevel: getSkillLevel,
        characterHasRole: characterHasRole,

        // Eligibility
        getEligibleCharactersForRole: getEligibleCharactersForRole,
        getOccupiedLocationIds: getOccupiedLocationIds,

        // Statistics
        getRoleStatistics: getRoleStatistics,

        // Specializations
        getRoleSpecializations: getRoleSpecializations,
        getAllRoleSpecializations: getAllRoleSpecializations,
        getRolesWithSpecialization: getRolesWithSpecialization,

        // Teaching
        getPotentialTeachersForRole: getPotentialTeachersForRole,
        canCharacterTeachRole: canCharacterTeachRole
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleQueries;
    }
})();
