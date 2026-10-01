/**
 * =============================================================================
 * STILL WATERS - ROLE QUERIES (role-queries.js)
 * =============================================================================
 *
 * All read-only operations for the role domain.
 *
 * Contract:
 *   - No mutations, no side effects, no events, no persistence.
 *   - No recursion guards. These are synchronous pure reads; there is no
 *     recursive graph to protect, and a guard would only break legitimate
 *     composition between queries.
 *   - No fallbacks. If a required dependency is missing at load time, this
 *     module throws. If RoleState is not initialised, the underlying call
 *     throws and the error propagates.
 *   - No presentation data. Icons, labels, colours belong in the UI layer.
 *   - Skill-tier classification delegated entirely to SkillUtils.
 *
 * DEPENDENCIES:
 *   - role-state.js       (RoleState)
 *   - role-constants.js   (RoleConstants)
 *   - skill-utils.js      (SkillUtils)
 *   - accessors.js        (getCharacterById, getCharacters)
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

    function _roleHasId(role, roleId) {
        return role && role.id === roleId;
    }

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

    /**
     * Returns all roles, optionally filtered.
     *
     * @param {Object} [filters]
     * @param {string} [filters.category]   Category id, or 'all'.
     * @param {string} [filters.gender]     'male', 'female', 'both', or 'all'.
     * @param {string} [filters.search]     Case-insensitive name/notes substring.
     * @param {string[]} [filters.excludeIds] Role ids to omit from the result.
     * @returns {Array} Sorted by name.
     */
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

    /**
     * Searches roles by name only. Intended for autocomplete-style lookups.
     */
    function searchRoles(searchTerm, options) {
        options = options || {};
        return getRoles({
            search: searchTerm,
            category: options.category,
            gender: options.gender
        }).slice(0, options.limit && options.limit > 0 ? options.limit : undefined);
    }

    // =========================================================================
    // 4. CATEGORY QUERIES
    // =========================================================================

    /**
     * Returns the category map. No icons, no presentation data.
     */
    function getRoleCategories() {
        return RS.getCategories();
    }

    /**
     * Returns categories as a sorted array with role counts.
     */
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
    // 5. CHARACTER-ROLE QUERIES
    // =========================================================================

    /**
     * Returns characters who hold a role, with their profession details.
     *
     * Options:
     *   minSkill       - Only include professions with skillLevel >= minSkill.
     *   minTier        - Only include professions whose tier id is >= this tier.
     *                    One of: 'novice','apprentice','journeyman','expert','master'.
     *   mastersOnly    - Shortcut for minTier: 'master'   (level 91+)
     *   expertsAndUp   - Shortcut for minTier: 'expert'   (level 76+)
     *   canTeachOnly   - Only include characters eligible to teach (51+).
     *
     * Note: `mastersOnly` means MASTER (91+), matching the canonical tier
     * names. If you want "expert and above", use `expertsAndUp`.
     */
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

    /**
     * Convenience: just the character records.
     */
    function getCharactersWithRole(roleId, options) {
        return getCharactersWithRoleDetails(roleId, options).map(function (entry) {
            return entry.character;
        });
    }

    /**
     * Returns the character's skill level in a role, or null if they do not
     * hold the role.
     */
    function getSkillLevel(characterId, roleId) {
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        var profession = _findProfession(character, roleId);
        if (!profession) return null;
        return typeof profession.skillLevel === 'number'
            ? SU.clampLevel(profession.skillLevel)
            : 0;
    }

    /**
     * True if the character currently holds this role.
     */
    function characterHasRole(characterId, roleId) {
        var character = window.getCharacterById(characterId);
        return _characterHasRole(character, roleId);
    }

    // =========================================================================
    // 6. ELIGIBILITY QUERY
    // =========================================================================

    /**
     * Returns characters eligible to be assigned a role.
     *
     * A character is eligible when:
     *   - they are alive
     *   - they satisfy the role's gender restriction
     *   - they do not already hold the role
     *
     * UI-side filters (search text, current location, gender dropdown) are
     * applied by this query so that every screen uses one definition of
     * "eligible".
     *
     * @param {string} roleId
     * @param {Object} [filters]
     * @param {string} [filters.search]         Case-insensitive name/surname substring.
     * @param {string} [filters.gender]         'male' | 'female' | 'all'.
     * @param {string} [filters.locationId]     Place id, or 'all'.
     * @param {Function} [filters.getLocation]  Optional location resolver
     *                                          (character) -> locationId.
     * @returns {Array} Characters sorted by birth year ascending.
     */
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

    /**
     * Returns the distinct location ids currently occupied by any live
     * character. Optional location resolver, same contract as
     * getEligibleCharactersForRole.
     */
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
    // 7. STATISTICS
    // =========================================================================

    /**
     * Returns statistics for a role based on current character data.
     *
     * The returned `specializations` array is a copy. `canTeachCount` uses
     * SkillUtils' teaching threshold, so it can never drift from the tier
     * classification.
     */
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
    // 8. SPECIALIZATION QUERIES
    // =========================================================================

    /**
     * Returns a copy of the role's specializations.
     */
    function getRoleSpecializations(roleId) {
        var role = RS.getRole(roleId);
        if (!role || !Array.isArray(role.specializations)) return [];
        return role.specializations.slice();
    }

    /**
     * Returns every distinct specialization across all roles, sorted.
     */
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

    /**
     * Returns roles that list the given specialization.
     */
    function getRolesWithSpecialization(specialization) {
        if (typeof specialization !== 'string' || !specialization) return [];
        var roles = RS.getAllRoles();
        return roles.filter(function (role) {
            return Array.isArray(role.specializations) &&
                role.specializations.indexOf(specialization) !== -1;
        });
    }

    // =========================================================================
    // 9. TEACHING QUERIES
    // =========================================================================

    /**
     * Returns characters who hold this role and are eligible to teach it.
     */
    function getPotentialTeachersForRole(roleId) {
        return getCharactersWithRoleDetails(roleId, { canTeachOnly: true });
    }

    /**
     * True if the character can teach this specific role.
     * Being a teacher in general is not enough — the character must hold the
     * role at or above the teaching threshold.
     */
    function canCharacterTeachRole(characterId, roleId) {
        var level = getSkillLevel(characterId, roleId);
        if (level === null) return false;
        return SU.canTeach(level);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RoleQueries = {
        // Role collection
        getRoles: getRoles,
        searchRoles: searchRoles,

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
