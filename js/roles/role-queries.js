/**
 * =============================================================================
 * STILL WATERS - ROLE QUERIES (js/roles/role-queries.js)
 * =============================================================================
 *
 * LOCATION: js/roles/role-queries.js
 *
 * Read-only queries and aggregations over the role catalogue and the
 * characters who hold each role.
 *
 * SCOPE:
 *   - Role lookup by name / id
 *   - Roles filtered by category / gender / literacy
 *   - Role search (name + notes substring)
 *   - Full role list (canonical read pass-through)
 *   - Characters who hold a given role, with skill details
 *   - Per-role statistics: total holders, average skill, tier counts
 *   - Category list with role counts
 *   - Specialization catalogue (per-role and global union)
 *   - Skill level reads for a (character, role) pair
 *   - Rank summary string for a rank id (used by the character
 *     summary projection)
 *
 * OUT OF SCOPE:
 *   - Role CRUD            -> role-commands.js
 *   - Role validation      -> role-rules.js (or validation.js)
 *   - Skill taxonomy       -> skill-utils.js
 *   - Presentation strings -> role-ui-list.js, formatting.js
 *   - Rank data            -> ranks/rank-queries.js
 *   - Rank assignment      -> character-commands.js (rank API)
 *
 * CONTRACT:
 *   - Reads are pure. No mutation. No caching. Reentrant.
 *   - Missing/invalid input returns null (singular) or [] (collection).
 *   - No fabrication. A role that no character holds returns statistics
 *     with zeros, not null.
 *   - Every character returned by getCharactersWithRole /
 *     getCharactersWithRoleDetails is a defensive projection (from
 *     CharacterQueries.getCharacterSummary). No live canonical objects
 *     leave this module.
 *
 * TIER CLASSIFICATION:
 *   Where the caller asks for a "tier" (untrained, novice, apprentice,
 *   journeyman, expert, master), this module delegates to SkillUtils if
 *   loaded. If SkillUtils is missing, tier names are reported as the
 *   empty string and tier counts are all zero — never fabricated.
 *
 *   This module does NOT hardcode skill thresholds. The thresholds are
 *   policy owned by SkillUtils, and role-queries is a consumer.
 *
 * ROLE DATA SHAPE (from accessors.getRoles()):
 *   {
 *     id,          string
 *     name,        string
 *     category,    string (category id)
 *     icon,        string (icon name, presentation may resolve)
 *     genderRestriction: 'both' | 'male' | 'female'
 *     baseSalary,  number
 *     requiresLiteracy: boolean
 *     literacyLevel: string | null
 *     specializations: string[]
 *     notes,       string
 *   }
 *
 * CHARACTER PROFESSION SHAPE (from CharacterCommands.getProfessions):
 *   {
 *     id,          string (role id)
 *     name,        string
 *     skillLevel,  number 0-100
 *     startYear,   number | null
 *     primary,     boolean
 *     specs,       string[]
 *     baseSalary,  number
 *     customSalary:number | null
 *     paysSalary,  boolean
 *     ...
 *   }
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - accessors.js:          getRoles
 *   - character-state.js:    CharacterState
 *   - character-commands.js: CharacterCommands
 *   - character-queries.js:  CharacterQueries
 *   - role-state.js:         RoleState (for category listing)
 *
 * DEPENDENCIES (OPTIONAL, called only if loaded):
 *   - skill-utils.js:        SkillUtils (getSkillLevelName, getTier,
 *                            getTeachingThreshold, getThresholds)
 *   - ranks/rank-queries.js: RankQueries (fallback for getRankSummary)
 *   - accessors.js:          getRankById (fallback for getRankSummary)
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

    function _requireDependencies() {
        var required = [
            'getRoles',
            'CharacterState',
            'CharacterCommands',
            'CharacterQueries',
            'RoleState'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'role-queries.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    function _skillUtilsLoaded() {
        return typeof window.SkillUtils !== 'undefined'
            && typeof window.SkillUtils.getTier === 'function';
    }

    function _getTierName(skillLevel) {
        if (!_skillUtilsLoaded()) return '';
        if (!_isFiniteNumber(skillLevel)) return '';
        var tier = window.SkillUtils.getTier(skillLevel);
        return tier && typeof tier.name === 'string' ? tier.name : '';
    }

    function _getTierKey(skillLevel) {
        if (!_skillUtilsLoaded()) return '';
        if (!_isFiniteNumber(skillLevel)) return '';
        var tier = window.SkillUtils.getTier(skillLevel);
        return tier && typeof tier.id === 'string' ? tier.id : '';
    }

    function _getTeachingThreshold() {
        if (_skillUtilsLoaded()
            && typeof window.SkillUtils.getTeachingThreshold === 'function') {
            var t = window.SkillUtils.getTeachingThreshold();
            return typeof t === 'number' && Number.isFinite(t) ? t : null;
        }
        return null;
    }

    /**
     * Returns all canonical tier keys in ascending order, or an empty
     * array if SkillUtils is unavailable. Used to build the tier-count
     * accumulator in getRoleStatistics without hardcoding the keys.
     */
    function _allTierKeys() {
        if (!_skillUtilsLoaded()) return [];
        if (typeof window.SkillUtils.getThresholds !== 'function') return [];
        var thresholds = window.SkillUtils.getThresholds();
        if (!thresholds || typeof thresholds !== 'object') return [];
        var keys = [];
        for (var k in thresholds) {
            if (!Object.prototype.hasOwnProperty.call(thresholds, k)) continue;
            keys.push(k.toLowerCase());
        }
        return keys;
    }

    function _emptyTierCounts() {
        var keys = _allTierKeys();
        var counts = {
            untrained: 0,
            novice: 0,
            apprentice: 0,
            journeyman: 0,
            expert: 0,
            master: 0
        };
        // Add any additional canonical keys that SkillUtils knows about
        // but the default set does not name explicitly.
        for (var i = 0; i < keys.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(counts, keys[i])) {
                counts[keys[i]] = 0;
            }
        }
        return counts;
    }

    // =========================================================================
    // 2. ROLE LOOKUPS
    // =========================================================================

    /**
     * Case-insensitive role lookup by name.
     * Returns the role record or null.
     */
    function findRoleByName(name) {
        if (!name || typeof name !== 'string') return null;
        var roles = window.getRoles();
        if (!Array.isArray(roles)) return null;
        var lower = name.toLowerCase();
        for (var i = 0; i < roles.length; i++) {
            if (roles[i] && typeof roles[i].name === 'string'
                && roles[i].name.toLowerCase() === lower) {
                return roles[i];
            }
        }
        return null;
    }

    function findRoleById(roleId) {
        if (!_hasId(roleId)) return null;
        var roles = window.getRoles();
        if (!Array.isArray(roles)) return null;
        for (var i = 0; i < roles.length; i++) {
            if (roles[i] && roles[i].id === roleId) return roles[i];
        }
        return null;
    }

    /**
     * Returns the full canonical role list. Accepts an optional filter
     * object with the same shape as the on-disk call:
     *   getRoles({})                      -> all roles
     *   getRoles({ category: 'combat' })  -> roles in that category
     *
     * Unknown filter keys are ignored. This keeps the call site stable
     * as role-ui-list.js and future callers evolve.
     */
    function getRoles(filters) {
        var all = window.getRoles();
        if (!Array.isArray(all)) return [];
        if (_isMissing(filters) || (typeof filters === 'object'
            && Object.keys(filters).length === 0)) {
            return all.slice();
        }

        var out = [];
        for (var i = 0; i < all.length; i++) {
            var r = all[i];
            if (!r || typeof r !== 'object') continue;

            if (!_isMissing(filters.category)
                && r.category !== filters.category) {
                continue;
            }
            if (!_isMissing(filters.genderRestriction)
                && r.genderRestriction !== filters.genderRestriction) {
                continue;
            }
            if (filters.requiresLiteracy === true
                && r.requiresLiteracy !== true) {
                continue;
            }
            if (filters.requiresLiteracy === false
                && r.requiresLiteracy === true) {
                continue;
            }
            if (Array.isArray(filters.excludeIds)
                && filters.excludeIds.indexOf(r.id) !== -1) {
                continue;
            }

            out.push(r);
        }
        return out;
    }

    function getRolesByCategory(categoryId) {
        if (typeof categoryId !== 'string' || categoryId.length === 0) return [];
        return getRoles({ category: categoryId });
    }

    /**
     * Search roles by name or notes substring (case-insensitive).
     * Optional filters narrow the result further.
     *
     * @param {string} query
     * @param {Object} [filters] - same shape as getRoles' filter object
     * @returns {Array<Object>}
     */
    function searchRoles(query, filters) {
        if (typeof query !== 'string' || query.trim() === '') {
            return getRoles(filters);
        }
        var needle = query.trim().toLowerCase();
        var base = getRoles(filters);

        var out = [];
        for (var i = 0; i < base.length; i++) {
            var r = base[i];
            var nameMatch = r.name && r.name.toLowerCase().indexOf(needle) !== -1;
            var notesMatch = r.notes && r.notes.toLowerCase().indexOf(needle) !== -1;
            if (nameMatch || notesMatch) out.push(r);
        }
        return out;
    }

    /**
     * Returns the list of category records with role counts.
     * Categories with zero roles are still listed.
     *
     * @returns {Array<{ id: string, name: string, roleCount: number }>}
     */
    function getRoleCategoriesWithCounts() {
        var categories = window.RoleState.getCategories();
        var roles = getRoles({});

        var counts = {};
        for (var i = 0; i < roles.length; i++) {
            var cat = roles[i].category || null;
            if (!cat) continue;
            counts[cat] = (counts[cat] || 0) + 1;
        }

        var out = [];
        for (var key in categories) {
            if (!Object.prototype.hasOwnProperty.call(categories, key)) continue;
            var c = categories[key];
            out.push({
                id: c.id,
                name: c.name,
                roleCount: counts[key] || 0
            });
        }

        out.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });
        return out;
    }

    // =========================================================================
    // 3. SPECIALIZATION CATALOGUE
    // =========================================================================

    /**
     * Returns the specializations array of a single role, as a copy.
     * Returns [] for a missing role or a role with no specializations.
     */
    function getRoleSpecializations(roleId) {
        if (!_hasId(roleId)) return [];
        var role = findRoleById(roleId);
        if (!role) return [];
        if (!Array.isArray(role.specializations)) return [];
        return role.specializations.slice();
    }

    /**
     * Returns the union of every specialization across every role in the
     * catalogue, as a sorted array of strings. Case-insensitive uniqueness
     * is applied; the first casing encountered wins.
     */
    function getAllRoleSpecializations() {
        var roles = getRoles({});
        var seen = {};
        var out = [];

        for (var i = 0; i < roles.length; i++) {
            var specs = roles[i].specializations;
            if (!Array.isArray(specs)) continue;
            for (var j = 0; j < specs.length; j++) {
                var spec = specs[j];
                if (typeof spec !== 'string' || spec.length === 0) continue;
                var key = spec.toLowerCase();
                if (seen[key]) continue;
                seen[key] = true;
                out.push(spec);
            }
        }

        out.sort(function (a, b) {
            return a.localeCompare(b);
        });
        return out;
    }

    // =========================================================================
    // 4. CHARACTERS HOLDING A ROLE
    // =========================================================================

    /**
     * Returns the character ids of every character who holds the given
     * role (i.e. whose professions array contains an entry with id ===
     * roleId). Uses CharacterState's index, which is O(1) per role id.
     *
     * @param {string} roleId
     * @returns {string[]}
     */
    function getCharactersWithRoleIds(roleId) {
        if (!_hasId(roleId)) return [];
        var projections = window.CharacterState.getCharactersByProfession(roleId);
        if (!Array.isArray(projections)) return [];
        var out = [];
        for (var i = 0; i < projections.length; i++) {
            if (projections[i] && _hasId(projections[i].id)) {
                out.push(projections[i].id);
            }
        }
        return out;
    }

    /**
     * Returns the character projections of every character who holds
     * the given role.
     *
     * @param {string} roleId
     * @returns {Array<Object>}
     */
    function getCharactersWithRole(roleId) {
        if (!_hasId(roleId)) return [];
        var projections = window.CharacterState.getCharactersByProfession(roleId);
        if (!Array.isArray(projections)) return [];
        // Defensive copy: CharacterState returns projections, but a
        // caller mutating the array should not corrupt subsequent calls.
        return projections.slice();
    }

    /**
     * Returns per-character detail entries for everyone who holds the
     * given role.
     *
     * Each entry:
     *   {
     *     characterId,
     *     character,      // character projection
     *     skillLevel,     // number 0-100
     *     tierKey,        // string; empty if SkillUtils missing
     *     tierName,       // string; empty if SkillUtils missing
     *     canTeach,       // boolean; false if SkillUtils missing
     *     specializations,// string[]
     *     isPrimary,      // boolean
     *     startYear       // number | null
     *   }
     *
     * @param {string} roleId
     * @param {Object} [options]
     * @param {boolean} [options.mastersOnly]
     *   When true, only characters whose skill reaches the master tier
     *   are returned. "Master tier" is defined by SkillUtils; if
     *   SkillUtils is unavailable, this filter returns [] rather than
     *   guessing.
     */
    function getCharactersWithRoleDetails(roleId, options) {
        if (!_hasId(roleId)) return [];

        var mastersOnly = false;
        if (options && typeof options === 'object') {
            mastersOnly = options.mastersOnly === true;
        }

        var ids = getCharactersWithRoleIds(roleId);
        if (ids.length === 0) return [];

        var teachingThreshold = _getTeachingThreshold();
        var out = [];

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var character = window.CharacterQueries.getCharacterSummary(id);
            if (!character) continue;

            var professions = window.CharacterCommands.getProfessions(id);
            if (!Array.isArray(professions)) continue;

            var match = null;
            for (var j = 0; j < professions.length; j++) {
                if (professions[j] && professions[j].id === roleId) {
                    match = professions[j];
                    break;
                }
            }
            if (!match) continue;

            var skillLevel = _isFiniteNumber(match.skillLevel)
                ? match.skillLevel
                : 0;
            var tierKey = _getTierKey(skillLevel);
            var tierName = _getTierName(skillLevel);
            var canTeach = teachingThreshold !== null
                && skillLevel >= teachingThreshold;

            if (mastersOnly) {
                if (tierKey !== 'master') continue;
            }

            out.push({
                characterId: id,
                character: character,
                skillLevel: skillLevel,
                tierKey: tierKey,
                tierName: tierName,
                canTeach: canTeach,
                specializations: Array.isArray(match.specs) ? match.specs.slice() : [],
                isPrimary: match.primary === true,
                startYear: _isMissing(match.startYear) ? null : match.startYear
            });
        }

        // Sort by skill level descending, then by name ascending.
        out.sort(function (a, b) {
            if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
            var an = (a.character.fullName || a.character.name || '').toLowerCase();
            var bn = (b.character.fullName || b.character.name || '').toLowerCase();
            return an.localeCompare(bn);
        });

        return out;
    }

    // =========================================================================
    // 5. SKILL LEVEL READS
    // =========================================================================

    /**
     * Returns the character's skill level for a given role, or null if
     * the character does not hold that role. Returns 0 when the
     * profession entry exists but carries a non-numeric skillLevel.
     *
     * Thin wrapper over CharacterCommands.getProfession. The canonical
     * skill write path is RoleCommands.updateCharacterSkill /
     * recordCharacterSkillProgress; this is the read side.
     *
     * @param {string} characterId
     * @param {string} roleId
     * @returns {number|null}
     */
    function getSkillLevel(characterId, roleId) {
        if (!_hasId(characterId) || !_hasId(roleId)) return null;
        var profession = window.CharacterCommands.getProfession(characterId, roleId);
        if (!profession) return null;
        return _isFiniteNumber(profession.skillLevel) ? profession.skillLevel : 0;
    }

    // =========================================================================
    // 6. ROLE STATISTICS
    // =========================================================================

    /**
     * Aggregate statistics for a single role across the population.
     *
     * Returns:
     *   {
     *     roleId,
     *     totalCharacters,        // number of holders
     *     totalSpecializations,   // union size across holders
     *     averageSkill,           // integer 0-100, rounded; 0 when empty
     *     countsByTier,           // { untrained, novice, ... }
     *     canTeachCount,          // holders with skill >= teaching threshold
     *     primaryCount            // holders who list this as primary
     *   }
     *
     * When SkillUtils is unavailable:
     *   - countsByTier is all zeros,
     *   - canTeachCount is 0,
     *   - averageSkill is still computed from raw skill levels.
     *
     * This is the ONE aggregation function callers should use. It is
     * O(n) in the number of holders of this role (usually small), not
     * O(n) in the total population.
     *
     * @param {string} roleId
     * @returns {Object}
     */
    function getRoleStatistics(roleId) {
        if (!_hasId(roleId)) {
            return _emptyStats(roleId);
        }

        var ids = getCharactersWithRoleIds(roleId);
        if (ids.length === 0) {
            return _emptyStats(roleId);
        }

        var teachingThreshold = _getTeachingThreshold();
        var countsByTier = _emptyTierCounts();

        var totalSkill = 0;
        var skillCount = 0;
        var canTeachCount = 0;
        var primaryCount = 0;

        var specializationSet = {};
        var specializationCount = 0;

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var professions = window.CharacterCommands.getProfessions(id);
            if (!Array.isArray(professions)) continue;

            var match = null;
            for (var j = 0; j < professions.length; j++) {
                if (professions[j] && professions[j].id === roleId) {
                    match = professions[j];
                    break;
                }
            }
            if (!match) continue;

            var skillLevel = _isFiniteNumber(match.skillLevel)
                ? match.skillLevel
                : 0;
            totalSkill += skillLevel;
            skillCount++;

            var tierKey = _getTierKey(skillLevel);
            if (tierKey && Object.prototype.hasOwnProperty.call(countsByTier, tierKey)) {
                countsByTier[tierKey]++;
            }

            if (teachingThreshold !== null && skillLevel >= teachingThreshold) {
                canTeachCount++;
            }
            if (match.primary === true) primaryCount++;

            if (Array.isArray(match.specs)) {
                for (var k = 0; k < match.specs.length; k++) {
                    var spec = match.specs[k];
                    if (typeof spec !== 'string' || spec.length === 0) continue;
                    if (!specializationSet[spec]) {
                        specializationSet[spec] = true;
                        specializationCount++;
                    }
                }
            }
        }

        var averageSkill = skillCount > 0
            ? Math.round(totalSkill / skillCount)
            : 0;

        return {
            roleId: roleId,
            totalCharacters: skillCount,
            totalSpecializations: specializationCount,
            averageSkill: averageSkill,
            countsByTier: countsByTier,
            canTeachCount: canTeachCount,
            primaryCount: primaryCount
        };
    }

    function _emptyStats(roleId) {
        return {
            roleId: roleId,
            totalCharacters: 0,
            totalSpecializations: 0,
            averageSkill: 0,
            countsByTier: _emptyTierCounts(),
            canTeachCount: 0,
            primaryCount: 0
        };
    }

    // =========================================================================
    // 7. RANK SUMMARY (for character summaries)
    // =========================================================================
    //
    // The character summary projection wants a human-readable rank
    // display. The canonical source for that is the rank assignment
    // (which carries customTitle / number.display) and the rank record
    // itself (which carries name). This function returns a small object
    // with both fields so a caller can choose.
    //
    // character-queries.js no longer calls this (it resolves rank
    // display via CharacterCommands.getRankAssignment, which is the
    // correct source), but other UI code may still expect it. It is
    // retained as a documented convenience.
    //
    // Returns:
    //   {
    //     id,            // rankId
    //     name,          // rank.name, or the rankId if unavailable
    //     priority,      // rank.priority or 3
    //     symbol         // rank.symbol or ''
    //   }
    // or null.

    function getRankSummary(rankId) {
        if (!_hasId(rankId)) return null;

        if (typeof window.getRankById === 'function') {
            var rank = window.getRankById(rankId);
            if (rank) {
                return {
                    id: rank.id,
                    name: typeof rank.name === 'string' ? rank.name : rankId,
                    priority: _isFiniteNumber(rank.priority) ? rank.priority : 3,
                    symbol: typeof rank.symbol === 'string' ? rank.symbol : ''
                };
            }
        }

        // Rank record not found. Do not fabricate a name.
        return null;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RoleQueries = {
        // Lookups
        findRoleById: findRoleById,
        findRoleByName: findRoleByName,

        // Lists
        getRoles: getRoles,
        getRolesByCategory: getRolesByCategory,
        searchRoles: searchRoles,

        // Categories
        getRoleCategoriesWithCounts: getRoleCategoriesWithCounts,

        // Specializations
        getRoleSpecializations: getRoleSpecializations,
        getAllRoleSpecializations: getAllRoleSpecializations,

        // Characters holding a role
        getCharactersWithRoleIds: getCharactersWithRoleIds,
        getCharactersWithRole: getCharactersWithRole,
        getCharactersWithRoleDetails: getCharactersWithRoleDetails,

        // Skill reads
        getSkillLevel: getSkillLevel,

        // Aggregation
        getRoleStatistics: getRoleStatistics,

        // Rank convenience (used by character summary legacy callers)
        getRankSummary: getRankSummary
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleQueries;
    }
})();
