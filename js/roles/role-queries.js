/**
 * =============================================================================
 * STILL WATERS - ROLE QUERIES (role-queries.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/role-queries.js
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
 *   - Characters eligible for a role (assign-modal filter)
 *   - Occupied location id enumeration (assign-modal filter)
 *   - Per-role statistics: total holders, average skill, tier counts
 *   - Category list with role counts
 *   - Specialization catalogue (per-role and global union)
 *   - Skill level reads for a (character, role) pair
 *   - Rank summary string for a rank id (used by the character
 *     summary projection)
 *
 * OUT OF SCOPE:
 *   - Role CRUD            -> role-commands.js
 *   - Role validation      -> role-commands.js (inline validators)
 *   - Skill taxonomy       -> skill-utils.js
 *   - Presentation strings -> role-ui-list.js, formatting.js
 *   - Rank data            -> ranks/rank-queries.js
 *   - Rank assignment      -> character-commands.js (rank API)
 *
 * CANONICAL ROLE SOURCE
 *
 *   Reads go through _readCanonicalRoles(), which prefers
 *   RoleState.getAllRoles() (returns CLONES) and falls back to a
 *   captured accessors.getRoles() reference only when RoleState is not
 *   yet initialised.
 *
 *   Every public read returns copies. Callers may mutate the returned
 *   array or its role objects without affecting canonical state. This
 *   matches RoleState.getRole / RoleState.getAllRoles and the
 *   character / family / children / education query layers.
 *
 * BOOTSTRAP PATH
 *
 *   RoleState.getAllRoles() throws if RoleState.init() has not been
 *   called. During app bootstrap (before the role state has been
 *   initialised) the accessor fallback is used. accessors.getRoles()
 *   returns the LIVE canonical array; a bare .slice() would produce a
 *   new array whose elements are still the live role records. Any
 *   caller mutating those records would corrupt canonical state.
 *
 *   The fallback therefore clones each record via _cloneRoleRecord(),
 *   matching the shape RoleState._cloneRoleForRead() produces. Callers
 *   cannot tell the difference between the two paths — both return
 *   detached records.
 *
 *   The fallback is never entered in the steady state: it only fires
 *   before RoleState.init(). Any code that reads the role catalogue
 *   before RoleState has initialised still gets correct, detached
 *   data; there is no silent live-record leak.
 *
 * CLONE FIELD SYNC
 *
 *   _cloneRoleRecord's field list MUST stay in sync with
 *   RoleState._cloneRoleForRead's field list. If one gains a field the
 *   other does not, the bootstrap path and the steady-state path return
 *   different shapes, and every consumer of a role record in the
 *   bootstrap window (rare, but non-zero) gets a record missing fields
 *   the steady-state path provides.
 *
 *   To make that drift loud instead of silent, the module performs a
 *   one-time load-time check comparing the two field lists. If they
 *   diverge, the module throws at load. See _verifyCloneFieldParity.
 *
 * STATISTICS PERFORMANCE
 *
 *   getRoleStatistics(roleId) is O(characters) if implemented naively
 *   (loop over holders, call getProfessions per holder). Calling it
 *   once per role in renderRoleList is O(roles × characters × avg
 *   professions) — quadratic in the worst case. To avoid that:
 *
 *     - getRoleStatisticsBatch(roleIds) computes every role's stats in
 *       a single pass over CharacterState.getAllCharacters().
 *     - getRoleStatistics(roleId) delegates to the batch with a
 *       single-element array. It is O(characters × avg professions),
 *       not O(holders × avg professions) anymore.
 *
 *   Callers that want stats for N roles should call
 *   getRoleStatisticsBatch([...]) directly; that pays one scan, not N.
 *
 *   The change is behaviour-preserving: both paths use the same
 *   per-character role-skill lookup (via CharacterCommands.getProfessions
 *   once per character) and the same tier classification (via SkillUtils
 *   with a per-call tier cache). See STATISTICS in REFACTOR HISTORY.
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
 *   - getEligibleCharactersForRole takes a caller-supplied `getLocation`
 *     resolver. This module does not know how location is resolved
 *     (world.js, accessors.js, an override on the projection) — the
 *     caller decides and the resolver is invoked per candidate. If the
 *     resolver is absent, location filtering is skipped for candidates
 *     whose location cannot be determined.
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
 * ROLE DATA SHAPE (from RoleState.getAllRoles):
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
 *   - accessors.js:          getRoles (captured once at module load)
 *   - character-state.js:    CharacterState
 *   - character-commands.js: CharacterCommands
 *   - character-queries.js:  CharacterQueries
 *   - role-state.js:         RoleState (for category listing and role reads)
 *
 * DEPENDENCIES (OPTIONAL, called only if loaded):
 *   - skill-utils.js:        SkillUtils (getSkillLevelName, getTier,
 *                            getTeachingThreshold, getThresholds)
 *   - accessors.js:          getRankById (used by getRankSummary)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added getRoleStatisticsBatch(roleIds). Computes every role's
 *       stats in a single pass over CharacterState.getAllCharacters().
 *       getRoleStatistics(roleId) now delegates to the batch with a
 *       single-element array, which changes its complexity from
 *       O(holders × avg professions) getProfessions calls to
 *       O(characters × avg professions) — a single CharacterCommands
 *       call per character, not per holder. See STATISTICS PERFORMANCE
 *       in the header.
 *     - Added _verifyCloneFieldParity(), a one-time load-time check
 *       that the field list in _cloneRoleRecord matches
 *       RoleState._cloneRoleForRead. If the two diverge, the module
 *       throws at load rather than silently returning different role
 *       shapes on the bootstrap path vs the steady-state path. See
 *       CLONE FIELD SYNC in the header.
 *     - getCharactersWithRoleDetails now:
 *         * accepts options.characterIds to skip the
 *           getCharactersByProfession lookup when the caller already
 *           has the ID set;
 *         * short-circuits non-masters before computing canTeach and
 *           specialization fields, when options.mastersOnly is true;
 *         * uses a per-call tier cache keyed by skill level, so repeated
 *           skill values resolve from the cache rather than calling
 *           SkillUtils.getTier once per holder.
 *       All three are behaviour-preserving.
 *     - getTeachingThreshold() is cached per call, not per holder.
 *       Prior revisions re-resolved it once per getRoleStatistics call;
 *       the batch path resolves it once for the whole batch.
 *     - No other behavioural change. Every public read's return shape
 *       is unchanged.
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
    // 0b. CANONICAL ROLE SOURCE
    // =========================================================================
    //
    // _canonicalGetRoles is the accessors.js reference, captured once at
    // module load, before any shim can re-alias window.getRoles. It is
    // the FALLBACK source used only when RoleState is not initialised.
    //
    // The primary source is RoleState.getAllRoles(), which returns
    // clones and is the canonical runtime representation.
    //
    // See BOOTSTRAP PATH in the module header for why the fallback
    // clones each record rather than returning the live accessor output.

    var _canonicalGetRoles = window.getRoles;

    /**
     * Shallow clone of a role record, matching the shape produced by
     * RoleState._cloneRoleForRead. Used by the bootstrap fallback path so
     * that callers receive detached records regardless of which source
     * answered the read.
     *
     * MUST stay in sync with RoleState._cloneRoleForRead. See CLONE FIELD
     * SYNC in the module header and _verifyCloneFieldParity below.
     */
    function _cloneRoleRecord(role) {
        if (!role) return null;
        return {
            id: role.id,
            name: role.name,
            category: role.category,
            icon: role.icon,
            specializations: Array.isArray(role.specializations)
                ? role.specializations.slice()
                : [],
            notes: role.notes,
            genderRestriction: role.genderRestriction,
            baseSalary: role.baseSalary,
            requiresLiteracy: role.requiresLiteracy,
            literacyLevel: role.literacyLevel
        };
    }

    // One-time load-time parity check: the field list in _cloneRoleRecord
    // must match the field list RoleState._cloneRoleForRead produces. If
    // RoleState is loaded (it is required above), we can compare the two
    // by probing a synthesized record. This turns silent shape drift into
    // a load-time error.
    (function _verifyCloneFieldParity() {
        if (typeof window.RoleState === 'undefined'
            || typeof window.RoleState._cloneRoleForRead !== 'function') {
            // RoleState does not expose its internal clone helper. Skip
            // the check rather than inventing a comparison against a
            // function we cannot call.
            return;
        }
        var probe = {
            id: '__probe__',
            name: '__probe__',
            category: '__probe__',
            icon: '__probe__',
            specializations: [],
            notes: '__probe__',
            genderRestriction: 'both',
            baseSalary: 0,
            requiresLiteracy: false,
            literacyLevel: null
        };
        var fromState;
        try {
            fromState = window.RoleState._cloneRoleForRead(probe);
        } catch (e) {
            // If probing throws, skip the check. This is a defensive
            // load-time diagnostic, not a hard contract.
            return;
        }
        if (!fromState || typeof fromState !== 'object') return;

        var stateKeys = Object.keys(fromState).sort();
        var queryKeys = Object.keys(_cloneRoleRecord(probe)).sort();
        if (stateKeys.length !== queryKeys.length) {
            throw new Error(
                'role-queries.js: _cloneRoleRecord field list diverges from ' +
                'RoleState._cloneRoleForRead. State has [' + stateKeys.join(',') +
                '], queries has [' + queryKeys.join(',') +
                ']. Keep them in sync.'
            );
        }
        for (var i = 0; i < stateKeys.length; i++) {
            if (stateKeys[i] !== queryKeys[i]) {
                throw new Error(
                    'role-queries.js: _cloneRoleRecord field list diverges ' +
                    'from RoleState._cloneRoleForRead at index ' + i +
                    '. State has "' + stateKeys[i] + '", queries has "' +
                    queryKeys[i] + '". Keep them in sync.'
                );
            }
        }
    })();

    /**
     * Reads the canonical role array.
     *
     * Prefers RoleState (returns clones). Falls back to the captured
     * accessors reference only when RoleState is unavailable or not yet
     * initialised, and clones each record on that path so callers cannot
     * corrupt canonical state. Every public read in this module goes
     * through here.
     *
     * Returns a copy in all paths.
     */
    function _readCanonicalRoles() {
        if (window.RoleState && typeof window.RoleState.getAllRoles === 'function') {
            try {
                var fromState = window.RoleState.getAllRoles();
                if (Array.isArray(fromState)) return fromState;
            } catch (e) {
                // RoleState.getAllRoles throws if init() hasn't been called.
                // Fall through to the accessor reference. This only happens
                // during bootstrap, before any UI reads the query layer.
            }
        }
        var fromAccessor = _canonicalGetRoles();
        if (!Array.isArray(fromAccessor)) return [];
        var out = [];
        for (var i = 0; i < fromAccessor.length; i++) {
            var clone = _cloneRoleRecord(fromAccessor[i]);
            if (clone) out.push(clone);
        }
        return out;
    }

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

    /**
     * Per-call tier cache. Repeated skill values (very common — most
     * holders cluster at tier boundaries) resolve from the cache instead
     * of calling SkillUtils.getTier once per holder.
     *
     * The cache is per-invocation, not module-level, so it does not
     * outlive a stale SkillUtils. Callers that make many
     * getTier/getTierId calls within a single query (getRoleStatistics,
     * getCharactersWithRoleDetails) pass one cache into the loop.
     */
    function _createTierCache() {
        var cache = Object.create(null);
        return function (skillLevel) {
            var key = String(skillLevel);
            if (cache[key] !== undefined) return cache[key];
            cache[key] = {
                key: _getTierKey(skillLevel),
                name: _getTierName(skillLevel)
            };
            return cache[key];
        };
    }

    function _getTeachingThreshold() {
        if (_skillUtilsLoaded()
            && typeof window.SkillUtils.getTeachingThreshold === 'function') {
            var t = window.SkillUtils.getTeachingThreshold();
            return typeof t === 'number' && Number.isFinite(t) ? t : null;
        }
        return null;
    }

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
        for (var i = 0; i < keys.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(counts, keys[i])) {
                counts[keys[i]] = 0;
            }
        }
        return counts;
    }

    function _fullName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        return (name + ' ' + surname).trim();
    }

    // =========================================================================
    // 2. ROLE LOOKUPS
    // =========================================================================

    function findRoleByName(name) {
        if (!name || typeof name !== 'string') return null;
        var roles = _readCanonicalRoles();
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
        var roles = _readCanonicalRoles();
        for (var i = 0; i < roles.length; i++) {
            if (roles[i] && roles[i].id === roleId) return roles[i];
        }
        return null;
    }

    /**
     * Returns the full canonical role list, filtered. Every element is
     * a defensive copy.
     *
     * Filters:
     *   category             string (category id)
     *   genderRestriction    'both' | 'male' | 'female'
     *   requiresLiteracy     boolean
     *   excludeIds           array of role ids to omit
     *
     * Unknown filter keys are ignored.
     */
    function getRoles(filters) {
        var all = _readCanonicalRoles();
        if (_isMissing(filters) || (typeof filters === 'object'
            && Object.keys(filters).length === 0)) {
            return all;
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

    function getRoleSpecializations(roleId) {
        if (!_hasId(roleId)) return [];
        var role = findRoleById(roleId);
        if (!role) return [];
        if (!Array.isArray(role.specializations)) return [];
        return role.specializations.slice();
    }

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

    function getCharactersWithRole(roleId) {
        if (!_hasId(roleId)) return [];
        var projections = window.CharacterState.getCharactersByProfession(roleId);
        if (!Array.isArray(projections)) return [];
        return projections.slice();
    }

    /**
     * Extracts the profession entry matching `roleId` from a character's
     * professions array. Returns null if the character does not hold the
     * role.
     *
     * Hoisted from the loop body so both getCharactersWithRoleDetails
     * and getRoleStatisticsBatch can share the same extraction and the
     * same skill-level validation.
     */
    function _professionForRole(characterId, roleId) {
        var professions = window.CharacterCommands.getProfessions(characterId);
        if (!Array.isArray(professions)) return null;
        for (var i = 0; i < professions.length; i++) {
            if (professions[i] && professions[i].id === roleId) {
                return professions[i];
            }
        }
        return null;
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
     * Options:
     *   mastersOnly     if true, only returns holders whose tier key is
     *                   'master'. The tier key is computed first, so
     *                   non-masters skip the canTeach and specialization
     *                   work.
     *   characterIds    if supplied (array of strings), used directly
     *                   instead of the getCharactersByProfession lookup.
     *                   Callers that already have the ID set save a
     *                   CharacterState scan.
     */
    function getCharactersWithRoleDetails(roleId, options) {
        if (!_hasId(roleId)) return [];

        var mastersOnly = false;
        var providedIds = null;
        if (options && typeof options === 'object') {
            mastersOnly = options.mastersOnly === true;
            if (Array.isArray(options.characterIds)) {
                providedIds = options.characterIds;
            }
        }

        var ids = providedIds !== null
            ? providedIds
            : getCharactersWithRoleIds(roleId);
        if (ids.length === 0) return [];

        var teachingThreshold = _getTeachingThreshold();
        var tierFor = _createTierCache();
        var out = [];

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var character = window.CharacterQueries.getCharacterSummary(id);
            if (!character) continue;

            var match = _professionForRole(id, roleId);
            if (!match) continue;

            var skillLevel = _isFiniteNumber(match.skillLevel)
                ? match.skillLevel
                : 0;
            var tier = tierFor(skillLevel);

            // mastersOnly fast path: check tier BEFORE the expensive
            // canTeach and specialization work.
            if (mastersOnly && tier.key !== 'master') continue;

            var canTeach = teachingThreshold !== null
                && skillLevel >= teachingThreshold;

            out.push({
                characterId: id,
                character: character,
                skillLevel: skillLevel,
                tierKey: tier.key,
                tierName: tier.name,
                canTeach: canTeach,
                specializations: Array.isArray(match.specs) ? match.specs.slice() : [],
                isPrimary: match.primary === true,
                startYear: _isMissing(match.startYear) ? null : match.startYear
            });
        }

        out.sort(function (a, b) {
            if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
            var an = _fullName(a.character).toLowerCase();
            var bn = _fullName(b.character).toLowerCase();
            return an.localeCompare(bn);
        });

        return out;
    }

    // =========================================================================
    // 5. SKILL LEVEL READS
    // =========================================================================

    function getSkillLevel(characterId, roleId) {
        if (!_hasId(characterId) || !_hasId(roleId)) return null;
        var profession = window.CharacterCommands.getProfession(characterId, roleId);
        if (!profession) return null;
        return _isFiniteNumber(profession.skillLevel) ? profession.skillLevel : 0;
    }

    // =========================================================================
    // 6. ASSIGN-MODAL CANDIDATE ENUMERATION
    // =========================================================================
    //
    // These two functions support modals-roles.js's assign-role modal.
    // They are read-only and take all their inputs explicitly.

    function getOccupiedLocationIds(getLocation) {
        var characters = window.CharacterState.getAllCharacters();
        if (!Array.isArray(characters)) return [];
        if (typeof getLocation !== 'function') return [];

        var seen = {};
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || c.isDeceased === true) continue;
            var loc = getLocation(c);
            if (!_hasId(loc)) continue;
            seen[loc] = true;
        }

        var out = Object.keys(seen);
        out.sort(function (a, b) { return a.localeCompare(b); });
        return out;
    }

    function getEligibleCharactersForRole(roleId, options) {
        if (!_hasId(roleId)) return [];
        var role = findRoleById(roleId);
        if (!role) return [];

        options = options || {};
        var search = typeof options.search === 'string'
            ? options.search.trim().toLowerCase()
            : '';
        var genderFilter = options.gender === 'male' || options.gender === 'female'
            ? options.gender
            : 'all';
        var locationFilter = _hasId(options.locationId) && options.locationId !== 'all'
            ? options.locationId
            : null;
        var getLocation = typeof options.getLocation === 'function'
            ? options.getLocation
            : null;

        var characters = window.CharacterState.getAllCharacters();
        if (!Array.isArray(characters)) return [];

        var roleGender = role.genderRestriction === 'male' || role.genderRestriction === 'female'
            ? role.genderRestriction
            : 'both';

        var out = [];

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !_hasId(c.id)) continue;
            if (c.isDeceased === true) continue;

            if (roleGender === 'male' && c.gender !== 'male') continue;
            if (roleGender === 'female' && c.gender !== 'female') continue;

            if (genderFilter !== 'all' && c.gender !== genderFilter) continue;

            if (search.length > 0) {
                var haystack = _fullName(c).toLowerCase();
                if (haystack.indexOf(search) === -1) continue;
            }

            if (locationFilter !== null) {
                if (getLocation === null) continue;
                var loc = getLocation(c);
                if (loc !== locationFilter) continue;
            }

            out.push(c);
        }

        out.sort(function (a, b) {
            return _fullName(a).localeCompare(_fullName(b));
        });
        return out;
    }

    // =========================================================================
    // 7. ROLE STATISTICS
    // =========================================================================
    //
    // Both getRoleStatistics and getRoleStatisticsBatch share a single
    // pass over CharacterState.getAllCharacters(). Per character:
    //
    //   - one getProfessions call (not one per requested role)
    //   - one tier lookup per distinct skill level, via the per-call
    //     tier cache
    //
    // The batch is O(characters × avg professions). The single-role
    // form delegates to the batch with a one-element array, so it is the
    // same complexity. See STATISTICS PERFORMANCE in the header.

    /**
     * Returns statistics for a batch of roles in one pass.
     *
     * Each entry has the shape returned by getRoleStatistics. Roles with
     * no holders still get a zeroed entry (matching the single-role
     * contract that a role with no holders returns zeros, not null).
     *
     * Non-existent role ids are silently skipped (they get no entry in
     * the result map), matching getRoleStatistics(roleId) returning
     * _emptyStats for missing ids.
     *
     * @param {string[]} roleIds
     * @returns {Object<string, Object>} roleId -> statistics
     */
    function getRoleStatisticsBatch(roleIds) {
        var result = Object.create(null);
        if (!Array.isArray(roleIds) || roleIds.length === 0) return result;

        // Dedupe and filter to known roles. Unknown role ids are skipped
        // entirely (they get no entry), matching getRoleStatistics.
        var wanted = Object.create(null);
        var wantedList = [];
        for (var w = 0; w < roleIds.length; w++) {
            var rid = roleIds[w];
            if (!_hasId(rid)) continue;
            if (wanted[rid]) continue;
            wanted[rid] = true;
            wantedList.push(rid);
        }
        if (wantedList.length === 0) return result;

        // Pre-populate with empty stats so a role with no holders still
        // gets an entry (matches the single-role "zeros not null"
        // contract).
        for (var p = 0; p < wantedList.length; p++) {
            result[wantedList[p]] = _emptyStats(wantedList[p]);
        }

        var characters = window.CharacterState.getAllCharacters();
        if (!Array.isArray(characters) || characters.length === 0) {
            return result;
        }

        var teachingThreshold = _getTeachingThreshold();
        var tierFor = _createTierCache();

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !_hasId(c.id)) continue;

            var professions = window.CharacterCommands.getProfessions(c.id);
            if (!Array.isArray(professions) || professions.length === 0) continue;

            for (var j = 0; j < professions.length; j++) {
                var prof = professions[j];
                if (!prof || !_hasId(prof.id)) continue;
                if (!wanted[prof.id]) continue;

                var stats = result[prof.id];
                var skillLevel = _isFiniteNumber(prof.skillLevel)
                    ? prof.skillLevel
                    : 0;
                stats.totalCharacters++;
                stats._totalSkill += skillLevel;

                var tier = tierFor(skillLevel);
                if (tier.key && Object.prototype.hasOwnProperty.call(
                    stats.countsByTier, tier.key
                )) {
                    stats.countsByTier[tier.key]++;
                }

                if (teachingThreshold !== null && skillLevel >= teachingThreshold) {
                    stats.canTeachCount++;
                }
                if (prof.primary === true) stats.primaryCount++;

                if (Array.isArray(prof.specs)) {
                    for (var k = 0; k < prof.specs.length; k++) {
                        var spec = prof.specs[k];
                        if (typeof spec !== 'string' || spec.length === 0) continue;
                        if (!stats._specSet[spec]) {
                            stats._specSet[spec] = true;
                            stats.totalSpecializations++;
                        }
                    }
                }
            }
        }

        // Finalize: average skill, drop internal accumulators.
        for (var r = 0; r < wantedList.length; r++) {
            var roleId = wantedList[r];
            var s = result[roleId];
            s.averageSkill = s.totalCharacters > 0
                ? Math.round(s._totalSkill / s.totalCharacters)
                : 0;
            delete s._totalSkill;
            delete s._specSet;
        }

        return result;
    }

    function getRoleStatistics(roleId) {
        if (!_hasId(roleId)) {
            return _emptyStats(roleId);
        }
        var batch = getRoleStatisticsBatch([roleId]);
        var entry = batch[roleId];
        return entry !== undefined ? entry : _emptyStats(roleId);
    }

    function _emptyStats(roleId) {
        return {
            roleId: roleId,
            totalCharacters: 0,
            totalSpecializations: 0,
            averageSkill: 0,
            countsByTier: _emptyTierCounts(),
            canTeachCount: 0,
            primaryCount: 0,
            // Internal accumulators, deleted in getRoleStatisticsBatch
            // before returning. Present here so the single-role path
            // produces the same shape as a pre-populated batch entry.
            _totalSkill: 0,
            _specSet: Object.create(null)
        };
    }

    // =========================================================================
    // 8. RANK SUMMARY
    // =========================================================================

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

        return null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.RoleQueries = {
        findRoleById: findRoleById,
        findRoleByName: findRoleByName,

        getRoles: getRoles,
        getRolesByCategory: getRolesByCategory,
        searchRoles: searchRoles,

        getRoleCategoriesWithCounts: getRoleCategoriesWithCounts,

        getRoleSpecializations: getRoleSpecializations,
        getAllRoleSpecializations: getAllRoleSpecializations,

        getCharactersWithRoleIds: getCharactersWithRoleIds,
        getCharactersWithRole: getCharactersWithRole,
        getCharactersWithRoleDetails: getCharactersWithRoleDetails,

        getOccupiedLocationIds: getOccupiedLocationIds,
        getEligibleCharactersForRole: getEligibleCharactersForRole,

        getSkillLevel: getSkillLevel,

        getRoleStatistics: getRoleStatistics,
        getRoleStatisticsBatch: getRoleStatisticsBatch,

        getRankSummary: getRankSummary
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleQueries;
    }
})();
