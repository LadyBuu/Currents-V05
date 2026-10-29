// js/core/storage-schema.js
/**
 * =============================================================================
 * STILL WATERS - STORAGE SCHEMA (storage-schema.js)
 * =============================================================================
 *
 * LOCATION: js/core/storage-schema.js
 *
 * SCOPE:
 *   - Canonical shape of the persisted masterData envelope
 *   - Current-schema normalization: bring loaded data into the canonical
 *     current shape without changing its meaning
 *   - Default masterData factory
 *
 * OUT OF SCOPE:
 *   - Migration between schema versions → database.js
 *   - Persistence mechanics → storage.js / database.js
 *   - Entity semantic validation → validation.js
 *   - Entity domain meaning → domain modules
 *
 * SEMANTIC RULES:
 *   - Required dependencies fail loudly. No silent fallbacks to magic
 *     constants (e.g. year 1250).
 *   - "Missing" and "present but invalid" are distinct cases:
 *       missing (undefined/null)             → default value
 *       present but wrong type / out of range → normalization error
 *   - Explicit missing checks only. Truthiness is not a domain predicate.
 *   - Object fields must be plain objects (not arrays, not class instances).
 *   - Normalization MUTATES the supplied envelope's data in place. It does
 *     not deep-clone. Callers who need a detached copy should clone before
 *     calling.
 *
 * SCHEMA VERSIONING
 *
 *   SCHEMA_VERSION identifies the shape of the persisted masterData
 *   envelope produced by this module.
 *
 *   IMPORTANT: this is a distinct concern from any existing "data version"
 *   tracked elsewhere (e.g. database.js). There must be exactly ONE
 *   canonical current-schema version for the application. If this module
 *   supersedes an older data-version scheme, the migration history must
 *   move with it. If this module uses SCHEMA_VERSION only for its own
 *   envelope format, that must be documented as a separate namespace from
 *   the application's data version.
 *
 *   normalizeMasterData does NOT decide which version incoming data
 *   belongs to. That is migration's job (database.js). This module assumes
 *   the input is already at SCHEMA_VERSION, or is being brought to the
 *   current shape by the storage load path.
 *
 * LEGACY ENVELOPE-LESS WRAPPING
 *
 *   storage.js's load path may encounter a persisted blob that has no
 *   envelope wrapper (`{ characters: [...], places: [...] }` rather
 *   than `{ schemaVersion, savedAt, data: { ... } }`). When it does,
 *   it wraps the blob with `STORAGE_SCHEMA_VERSION` and constructs a
 *   synthetic envelope. That label is only accurate if the blob was
 *   written by a build that used the current schema; if the blob
 *   predates the envelope format entirely, the label is a lie.
 *
 *   To surface that, storage.js may set `_legacyEnvelopeLess: true` on
 *   the synthetic envelope before calling normalizeMasterData. This
 *   module PRESERVES the marker if present (and does NOT add it on its
 *   own). Migration tooling (database.js) reads the marker to know that
 *   the envelope's declared schemaVersion is synthetic. storage.js
 *   strips the marker before the next save, so it does not persist.
 *
 *   The marker is not propagated by normalizeMasterData. If the caller
 *   does not set it, the returned envelope has no marker. That way a
 *   fresh install (factory) and a save that has been through the
 *   migration path both carry no marker, and the ambiguity is
 *   localized to the load path that created it.
 *
 * LOSSY NORMALIZATION MARKERS
 *
 *   normalizeMasterData may silently coerce or drop some input, in the
 *   interest of producing a usable envelope from a corrupt one. Every
 *   such lossy step is signalled via an envelope-level marker so that
 *   consumers (storage.js, database.js migration) can surface it, while
 *   the envelope itself remains usable:
 *
 *     _yearCoerced            true if a present-but-invalid currentYear
 *                             was replaced with DEFAULT_YEAR.
 *
 *     _preservedUnknownTopLevel  array of top-level field names the
 *                                source envelope carried that
 *                                normalizeMasterData does not recognize.
 *                                The names are recorded; the fields are
 *                                not preserved (dropping them is the
 *                                schema contract). Callers that want
 *                                to preserve them must do so before
 *                                calling normalizeMasterData.
 *
 *   These markers are only emitted when the caller opts in on the input
 *   envelope. This module does not add them on its own. The intent is:
 *   storage.js is the only place that knows the input's provenance, so
 *   storage.js decides which markers to attach. Every marker is stripped
 *   before the next save.
 *
 * TRAITS:
 *   The character record carries a domain-owned `traits` array. It is
 *   NOT defaulted by the factory alone: old saves written before the
 *   field existed must also receive `traits: []` on load, without a
 *   migration pass. _ensureArrayField(char, 'traits') covers both:
 *   - factory output already has it (no-op)
 *   - old saves get [] appended here
 *
 *   Contents are owned by CharacterCommands (trait API). This module
 *   guarantees the container is an array; it does not validate that
 *   the entries are canonical trait ids. That is the factory's job at
 *   build time and the trait commands' job at write time.
 *
 * CHILDREN COLLECTIONS:
 *   ChildrenState owns three top-level collections that live in
 *   masterData.data:
 *
 *     pregnancyRecords        array   (pregnancy / birth events)
 *     surrogacyArrangements   array   (surrogacy arrangement records)
 *     adoptionRecords         array   (adoption metadata records)
 *
 *   These are declared here (factory + normalization) so that every
 *   fresh install and every old save gets the arrays up front.
 *
 * HOUSEHOLD COLLECTIONS:
 *   HouseholdState owns three top-level collections that live in
 *   masterData.data:
 *
 *     households              array   (household records)
 *     householdPositions      array   (staff position records)
 *     householdAssignments    array   (staff assignment records)
 *
 *   All three are declared here (factory + normalization). The household
 *   domain's bootstrap (household-bootstrap.js::_verifyCanonical)
 *   requires all three to be arrays at load time; without these
 *   declarations, a fresh install or an old save would fail bootstrap
 *   with "householdPositions must be an array".
 *
 * INDUSTRY COLLECTIONS:
 *   IndustryState owns two top-level collections that live in
 *   masterData.data:
 *
 *     enterprises             array   (enterprise records)
 *     enterpriseTypes         array   (enterprise type registry)
 *
 *   Both are declared here (factory + normalization). They are additive
 *   declarations, same policy as householdPositions/householdAssignments
 *   and the children collections. Prior to their declaration,
 *   industry-migration.js and industry-type-init.js defaulted them on
 *   every load and persisted the defaults, producing a
 *   "defaults-then-persist on every fresh load" pattern. Declaring them
 *   here closes that gap.
 *
 * SETTLEMENT DATA:
 *   The settlement domain owns one top-level object that lives in
 *   masterData.data:
 *
 *     settlementData          object  (keyed by locationId)
 *
 *   It is declared here (factory + normalization) so that:
 *     - fresh installs get the empty object up front;
 *     - old saves without the field get {} on load, matching what
 *       SettlementCommandCommit expects;
 *     - a malformed value (array, string, null) is replaced with {}
 *       and warned about, rather than being allowed to reach the
 *       settlement commit path where it would be silently overwritten
 *       on first write.
 *
 * RANK RECORD FIELDS:
 *   Rank records carry NO location pointer. The current rank shape
 *   (rank-constants.js::DEFAULT_RANK, rank-rules.js::applyDefaults,
 *   rank-state.js::_normaliseRank) declares:
 *
 *     locationTypeId      scope qualifier (which location TYPE the rank
 *                         applies to — country, region, town, etc.)
 *
 *   It does NOT declare `locationId`. A rank applies to a type of
 *   location, not to a specific location instance. Concrete holder
 *   assignment is expressed by `parentRankId` / `sourceRankId` /
 *   `character.activeRankId`, not by a location instance reference.
 *
 * YEAR RESOLUTION:
 *   This module reads window.TIME_CONSTANTS.DEFAULT_YEAR (a schema
 *   constant) and window.TIME_CONSTANTS.MIN_YEAR / MAX_YEAR (the
 *   canonical world-year bounds). It does NOT read getCurrentYearSafe
 *   or getCurrentYear. Current-year resolution belongs to time.js and
 *   to the runtime callers; the schema layer produces a default
 *   envelope whose currentYear is TIME_CONSTANTS.DEFAULT_YEAR. No
 *   year migration is required in this file.
 *
 * DEPENDENCIES (REQUIRED):
 *   - time.js: TIME_CONSTANTS.DEFAULT_YEAR, MIN_YEAR, MAX_YEAR
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - normalizeMasterData now preserves _legacyEnvelopeLess if the
 *       caller set it on the input envelope, and does NOT add it on
 *       its own. See LEGACY ENVELOPE-LESS WRAPPING.
 *     - normalizeMasterData now preserves _yearCoerced and
 *       _preservedUnknownTopLevel if the caller set them on the input
 *       envelope, and does NOT add them on its own. See LOSSY
 *       NORMALIZATION MARKERS.
 *     - _collectUnknownTopLevel(source, knownKeys) added: returns the
 *       list of top-level keys in `source` that are not in knownKeys.
 *       Called by normalizeMasterData when the caller sets
 *       _preserveUnknownTopLevel on the input envelope.
 *     - Header LEGACY ENVELOPE-LESS WRAPPING and LOSSY NORMALIZATION
 *       MARKERS sections added.
 *     - Verified arrayKeys and objectKeys both cover the full set
 *       declared by createDefaultMasterDataOverride().data.
 *     - No other field or behaviour changed. Existing saves normalize
 *       identically except for the three opt-in markers.
 *   Previous revisions:
 *     - Added enterprises and enterpriseTypes (C3).
 *     - Added settlementData.
 *     - Added householdPositions and householdAssignments (v6.1).
 *     - Removed rank.locationId normalization.
 *     - Added pregnancyRecords, surrogacyArrangements, adoptionRecords.
 *     - _ensureArrayField(char, 'traits') added.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireTime() {
        if (typeof window.TIME_CONSTANTS === 'undefined'
            || typeof window.TIME_CONSTANTS.DEFAULT_YEAR !== 'number'
            || typeof window.TIME_CONSTANTS.MIN_YEAR !== 'number'
            || typeof window.TIME_CONSTANTS.MAX_YEAR !== 'number') {
            throw new Error(
                'storage-schema.js: time.js must load first ' +
                '(TIME_CONSTANTS.DEFAULT_YEAR / MIN_YEAR / MAX_YEAR missing).'
            );
        }
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    // Envelope schema version. See SCHEMA VERSIONING in the file header.
    //
    // NOTE ON VERSION BUMPS:
    //   Additive field declarations (declaring a previously-undeclared
    //   collection so normalizeMasterData fills it with []) do NOT
    //   require a version bump. Old saves normalize cleanly: the missing
    //   field becomes [] the first time the save is loaded. Only a
    //   breaking shape change (renaming a field, changing an existing
    //   field's type, removing a field consumers depend on) requires a
    //   migration and a version bump.
    //
    //   The C3 revision added enterprises and enterpriseTypes. Both are
    //   additive. SCHEMA_VERSION stays at 3.
    var SCHEMA_VERSION = 3;

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * True if `value` is a plain object (prototype is Object.prototype or
     * null). Arrays, Dates, class instances, and Map/Set are not plain
     * objects.
     * @private
     */
    function _isPlainObject(value) {
        if (value === null || typeof value !== 'object') return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    /**
     * True if `year` is within TIME_CONSTANTS bounds and is an integer.
     * Delegates to the canonical year definition owned by time.js. This
     * module does not maintain a second definition of "valid year."
     * @private
     */
    function _isValidWorldYear(year) {
        if (typeof year !== 'number' || !Number.isFinite(year)) return false;
        if (!Number.isInteger(year)) return false;
        return year >= window.TIME_CONSTANTS.MIN_YEAR
            && year <= window.TIME_CONSTANTS.MAX_YEAR;
    }

    /**
     * Normalizes a top-level array field.
     *
     *   missing  → []
     *   array    → returned as-is
     *   present-but-not-array → replaced with [] and a warning is emitted
     *
     * The warning is the only signal we have that stored data was malformed.
     * Callers who want to reject malformed data rather than repair it should
     * validate the envelope before calling normalizeMasterData.
     *
     * @private
     */
    function _normalizeArrayField(value, fieldName) {
        if (_isMissing(value)) return [];
        if (Array.isArray(value)) return value;
        console.warn(
            'storage-schema.js: field "' + fieldName + '" is not an array ' +
            '(got ' + typeof value + '); replacing with [].'
        );
        return [];
    }

    /**
     * Normalizes a top-level object field.
     *
     *   missing  → {} (fresh)
     *   plain obj → returned as-is
     *   otherwise → replaced with {} and a warning is emitted
     * @private
     */
    function _normalizeObjectField(value, fieldName) {
        if (_isMissing(value)) return {};
        if (_isPlainObject(value)) return value;
        console.warn(
            'storage-schema.js: field "' + fieldName + '" is not a plain object ' +
            '(got ' + (Array.isArray(value) ? 'array' : typeof value) + '); replacing with {}.'
        );
        return {};
    }

    /**
     * Ensures a field on an entity object is an array. Mutates in place.
     * Uses explicit missing/type checks; truthiness is not a predicate.
     * @private
     */
    function _ensureArrayField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (_isMissing(obj[fieldName]) || !Array.isArray(obj[fieldName])) {
            obj[fieldName] = [];
        }
    }

    /**
     * Ensures a field on an entity object is a plain object. Mutates in place.
     * @private
     */
    function _ensurePlainObjectField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (!_isPlainObject(obj[fieldName])) {
            obj[fieldName] = {};
        }
    }

    /**
     * Returns the list of top-level keys in `source` that are not present
     * in `knownKeys`. Used to record unknown top-level fields when the
     * caller sets _preserveUnknownTopLevel on the input envelope. The
     * fields themselves are not preserved — only their names.
     *
     * @private
     * @param {Object} source
     * @param {Object} knownKeys  null-prototype set: { key: true, ... }
     * @returns {string[]}
     */
    function _collectUnknownTopLevel(source, knownKeys) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return [];
        }
        var out = [];
        var keys = Object.keys(source);
        for (var i = 0; i < keys.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(knownKeys, keys[i])) {
                out.push(keys[i]);
            }
        }
        return out;
    }

    // =========================================================================
    // 3. DEFAULT FACTORY
    // =========================================================================

    /**
     * Creates a fresh default masterData envelope.
     *
     * This is the canonical current shape. Every field listed here must
     * also appear in normalizeMasterData's array/object classification
     * below; keeping those in sync is the caller's responsibility until a
     * declarative schema descriptor is introduced.
     *
     * @returns {Object}
     */
    function createDefaultMasterDataOverride() {
        _requireTime();

        return {
            schemaVersion: SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            data: {
                // ─── Top-level arrays ─────────────────────────────────────
                characters: [],
                places: [],
                ranks: [],
                roles: [],
                locationTypes: [],
                governmentTypes: [],
                governments: [],
                households: [],
                householdPositions: [],
                householdAssignments: [],

                // ─── Industry collections ─────────────────────────────────
                enterprises: [],
                enterpriseTypes: [],

                residences: [],
                disasters: [],
                eventLog: [],
                educationalInstitutions: [],
                parentChildEdges: [],

                // ─── Children domain collections ──────────────────────────
                pregnancyRecords: [],
                surrogacyArrangements: [],
                adoptionRecords: [],

                // ─── Top-level objects ────────────────────────────────────
                nameLists: {},
                cityNameParts: {},
                rankInheritanceRules: {},
                educationalSubjects: {},
                subjectProgress: {},

                // ─── Settlement domain collection ─────────────────────────
                settlementData: {},

                // ─── Scalars ──────────────────────────────────────────────
                currentYear: window.TIME_CONSTANTS.DEFAULT_YEAR
            }
        };
    }

    // =========================================================================
    // 4. NORMALIZATION
    // =========================================================================
    //
    // normalizeMasterData brings a loaded envelope into the canonical
    // current shape. It does NOT migrate between schema versions; that is
    // the migration layer's responsibility. It does NOT semantically
    // validate entities; that is validation.js's responsibility.
    //
    // Missing fields are given defaults. Present-but-malformed fields are
    // normalized to a safe shape and a warning is emitted, so corruption
    // surfaces in logs rather than silently disappearing. Callers who want
    // to reject malformed data must validate before calling this function.
    //
    // MUTATION: this function mutates entity objects inside the supplied
    // envelope. It does not deep-clone.
    //
    // OPT-IN MARKERS: _legacyEnvelopeLess, _yearCoerced, and
    // _preservedUnknownTopLevel are preserved if the caller set them on
    // the input envelope. This function does NOT add them on its own.
    // See LEGACY ENVELOPE-LESS WRAPPING and LOSSY NORMALIZATION MARKERS
    // in the header.

    function normalizeMasterData(envelope) {
        if (!envelope || !envelope.data) return envelope;

        _requireTime();

        var defaults = createDefaultMasterDataOverride().data;
        var source = envelope.data;
        var out = {};

        // ─── Top-level array fields ───────────────────────────────────────
        //
        // householdPositions and householdAssignments are household-domain
        // auxiliary collections. Declared here so household-bootstrap.js's
        // canonical verification passes on every fresh install and every
        // save that predates the household subdomain.
        //
        // enterprises and enterpriseTypes are industry-domain collections.
        // Declared here so industry-migration.js and industry-type-init.js
        // do not have to default them on every load, and so a fresh
        // install produces the same envelope shape as a save that has been
        // through the industry bootstrap once. See INDUSTRY COLLECTIONS in
        // the module header.
        //
        // parentChildEdges, pregnancyRecords, surrogacyArrangements, and
        // adoptionRecords are children/family-owned top-level collections.
        var arrayKeys = [
            'characters', 'places', 'ranks', 'roles', 'locationTypes',
            'governmentTypes', 'governments', 'households',
            'householdPositions', 'householdAssignments',
            'enterprises', 'enterpriseTypes',
            'residences', 'disasters', 'eventLog',
            'educationalInstitutions', 'parentChildEdges',
            'pregnancyRecords', 'surrogacyArrangements', 'adoptionRecords'
        ];
        for (var i = 0; i < arrayKeys.length; i++) {
            var k = arrayKeys[i];
            out[k] = _normalizeArrayField(source[k], k);
        }

        // ─── Top-level object fields ──────────────────────────────────────
        //
        // settlementData is the settlement domain's canonical store, keyed
        // by locationId. Declared here so every fresh install and every old
        // save gets the object up front. See SETTLEMENT DATA in the module
        // header.
        var objectKeys = [
            'nameLists', 'cityNameParts', 'rankInheritanceRules',
            'educationalSubjects', 'subjectProgress', 'settlementData'
        ];
        for (var j = 0; j < objectKeys.length; j++) {
            var ok = objectKeys[j];
            out[ok] = _normalizeObjectField(source[ok], ok);
        }

        // ─── Year ─────────────────────────────────────────────────────────
        // Missing → default. Present-but-invalid → warn and default, so
        // corruption is visible but the application still loads. When the
        // caller set _yearCoerced on the input envelope, the returned
        // envelope carries it too; otherwise it does not.
        if (_isMissing(source.currentYear)) {
            out.currentYear = defaults.currentYear;
        } else if (_isValidWorldYear(source.currentYear)) {
            out.currentYear = source.currentYear;
        } else {
            console.warn(
                'storage-schema.js: currentYear "' + source.currentYear +
                '" is not a valid world year; using default ' + defaults.currentYear + '.'
            );
            out.currentYear = defaults.currentYear;
        }

        // ─── Entity field defaults (characters) ──────────────────────────
        //
        // Embedded domain-owned containers on the character record are
        // guaranteed to be present with the correct shape. Contents are
        // owned by the domains; the schema owns the container shape only.
        //
        // Removed fields (motherId, fatherId, children, adoptedParents,
        // adoptedChildren) are NOT normalized. Parentage lives in
        // parentChildEdges; if an old save carries these fields, they are
        // ignored rather than resurrected.
        for (var c = 0; c < out.characters.length; c++) {
            var char = out.characters[c];
            if (!char || typeof char !== 'object') continue;

            _ensureArrayField(char, 'traits');
            _ensureArrayField(char, 'relationships');
            _ensureArrayField(char, 'friends');
            _ensureArrayField(char, 'moves');
            _ensureArrayField(char, 'professions');
            _ensureArrayField(char, 'rankAssignments');
            _ensureArrayField(char, 'apprentices');

            if (char.isDeceased === undefined) char.isDeceased = false;
            if (char.isMaster === undefined) char.isMaster = false;
            if (char.masterId === undefined) char.masterId = null;
            if (char.masterProfessionId === undefined) char.masterProfessionId = null;

            _ensurePlainObjectField(char, 'apprenticeshipDetails');
            _ensurePlainObjectField(char, 'friendshipDetails');
            _ensurePlainObjectField(char, 'appearance');
        }

        // ─── Entity field defaults (places) ──────────────────────────────
        for (var p = 0; p < out.places.length; p++) {
            var place = out.places[p];
            if (!place || typeof place !== 'object') continue;

            if (place.governmentTypeId === undefined) place.governmentTypeId = null;
            if (place.governmentStyle === undefined) place.governmentStyle = null;

            _ensureArrayField(place, 'leaderAssignments');
        }

        // ─── Entity field defaults (ranks) ───────────────────────────────
        //
        // The rank shape is owned by rank-constants.js::DEFAULT_RANK,
        // rank-rules.js::applyDefaults, and rank-state.js::_normaliseRank.
        // This layer only guarantees the top-level field presence that
        // external consumers rely on before the rank module hydrates.
        //
        // There is NO `locationId` field on the current rank shape. A rank
        // applies to a location TYPE (`locationTypeId`), not to a specific
        // location instance. The `locationId` normalization that used to
        // live here was a schema-layer artifact from an older rank shape.
        // It added a phantom field that no consumer read. Removed.
        // See RANK RECORD FIELDS in the module header.
        for (var r = 0; r < out.ranks.length; r++) {
            var rank = out.ranks[r];
            if (!rank || typeof rank !== 'object') continue;

            if (rank.genderRestriction === undefined) rank.genderRestriction = 'either';
            if (rank.locationTypeId === undefined) rank.locationTypeId = null;
            if (rank.numbered === undefined) rank.numbered = false;
            if (rank.symbol === undefined) rank.symbol = '';
            if (rank.deprecateOnDeath === undefined) rank.deprecateOnDeath = false;
            if (rank.spouseInheritance === undefined) rank.spouseInheritance = null;
        }

        // ─── Entity field defaults (government types) ────────────────────
        for (var g = 0; g < out.governmentTypes.length; g++) {
            var govType = out.governmentTypes[g];
            if (!govType || typeof govType !== 'object') continue;
            _ensureArrayField(govType, 'allowedRankIds');
        }

        // ─── Entity field defaults (households) ──────────────────────────
        for (var h = 0; h < out.households.length; h++) {
            var household = out.households[h];
            if (!household || typeof household !== 'object') continue;
            _ensureArrayField(household, 'departments');
            _ensureArrayField(household, 'members');
        }

        // ─── Entity field defaults (roles) ───────────────────────────────
        for (var ro = 0; ro < out.roles.length; ro++) {
            var role = out.roles[ro];
            if (!role || typeof role !== 'object') continue;
            if (role.genderRestriction === undefined) role.genderRestriction = 'both';
            _ensureArrayField(role, 'specializations');
            if (role.notes === undefined) role.notes = '';
        }

        // ─── Envelope ─────────────────────────────────────────────────────
        // schemaVersion: this module does NOT decide which version the
        // incoming data belongs to. If the envelope declares the current
        // version, we preserve the declaration. If it declares anything
        // else, that is a migration concern and we do not silently rewrite
        // it to the current version.
        //
        // savedAt: preserved if present. NOT invented.
        //
        // Opt-in markers: preserved if the caller set them on the input
        // envelope; not added on their own. See LEGACY ENVELOPE-LESS
        // WRAPPING and LOSSY NORMALIZATION MARKERS in the header.
        var result = {
            schemaVersion: _isMissing(envelope.schemaVersion)
                ? SCHEMA_VERSION
                : envelope.schemaVersion,
            savedAt: envelope.savedAt,
            data: out
        };

        if (envelope._legacyEnvelopeLess === true) {
            result._legacyEnvelopeLess = true;
        }
        if (envelope._yearCoerced === true) {
            result._yearCoerced = true;
        }
        if (envelope._preserveUnknownTopLevel === true) {
            // Caller opted in. Record the names of unknown top-level
            // fields so migration tooling can audit them. The fields
            // themselves are NOT preserved (dropping them is the schema
            // contract).
            var knownKeys = Object.create(null);
            for (var ak = 0; ak < arrayKeys.length; ak++) {
                knownKeys[arrayKeys[ak]] = true;
            }
            for (var okk = 0; okk < objectKeys.length; okk++) {
                knownKeys[objectKeys[okk]] = true;
            }
            knownKeys.currentYear = true;
            var unknown = _collectUnknownTopLevel(source, knownKeys);
            if (unknown.length > 0) {
                result._preservedUnknownTopLevel = unknown;
            }
        }

        return result;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.createDefaultMasterDataOverride = createDefaultMasterDataOverride;
    window.normalizeMasterData = normalizeMasterData;

    // SCHEMA_VERSION is exposed so callers (notably database.js) can reason
    // about the current envelope shape without duplicating the constant.
    window.STORAGE_SCHEMA_VERSION = SCHEMA_VERSION;

})();
