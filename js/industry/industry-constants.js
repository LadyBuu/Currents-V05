/**
 * =============================================================================
 * STILL WATERS - INDUSTRY CONSTANTS (industry-constants.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-constants.js
 *
 * SINGLE SOURCE OF TRUTH for industry-domain vocabulary, thresholds, and
 * field classification tables.
 *
 * SCOPE:
 *   - Economic thresholds (bankruptcy, interest rate)
 *   - Status vocabulary
 *   - Ownership vocabulary (ownershipType, ownerType)
 *   - Derived-field list (fields stripped by migration, resolved on read)
 *   - Canonical enterprise field names (the stored shape)
 *   - Domain-owned field map (fields owned by another module)
 *   - Migration error vocabulary
 *   - Type-category fallback for missing typeId references
 *
 * OUT OF SCOPE:
 *   - Numeric defaults for a new enterprise (industry-rules.js:applyDefaults)
 *   - Type registry data (industry-type-defaults.js)
 *   - Validation policy (industry-rules.js)
 *   - Economic arithmetic (industry-economics.js)
 *
 * SEMANTIC RULES:
 *   - Everything here is frozen. Mutation is a bug.
 *   - String values are the canonical stored values. Do not alias.
 *   - Arrays are frozen. Iteration is fine; mutation is not.
 *   - Maps that need O(1) lookup are exported as frozen objects with
 *     boolean `true` values, matching the household-commands.js pattern.
 *
 * DEPENDENCIES (NONE AT LOAD):
 *   This module reads only `window` to attach its export. It requires no
 *   other application module.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. ECONOMIC THRESHOLDS
    // =========================================================================

    /**
     * Debt accrual rate. Simple interest per year, applied in
     * industry-economics.calculateDebtInterest.
     *
     * Phase 1 uses simple interest. Compound interest is a documented
     * deferral; the rate constant is unchanged when that lands.
     */
    var DEBT_INTEREST_RATE = 0.05;

    /**
     * Wealth below this threshold flips an active enterprise to
     * 'bankrupt'. The threshold is applied to post-processing wealth.
     *
     * Negative because debt is already represented separately (debt field).
     * Bankruptcy here means "operating capital has gone negative beyond
     * tolerance."
     */
    var BANKRUPTCY_THRESHOLD = -100;

    /**
     * Fraction of a demolished enterprise's prior wealth that seeds a
     * rebuilt enterprise, floored. Minimum 10 regardless.
     *
     * Used by IndustryCommands.rebuildEnterprise.
     */
    var REBUILD_WEALTH_FRACTION = 0.5;
    var REBUILD_WEALTH_MINIMUM = 10;

    // =========================================================================
    // 2. STATUS VOCABULARY
    // =========================================================================

    /**
     * Valid values for enterprise.status.
     *
     *   active       — operating; eligible for annual processing
     *   inactive     — not operating; not eligible for annual processing
     *   bankrupt     — operating capital exhausted; not eligible
     *   closed       — voluntarily closed; not eligible
     *   demolished   — physically destroyed; the record is a tombstone.
     *                  workerList is cleared, wealth and debt are zeroed,
     *                  demolishedRecord captures the pre-demolition state.
     */
    var STATUS = Object.freeze({
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        BANKRUPT: 'bankrupt',
        CLOSED: 'closed',
        DEMOLISHED: 'demolished'
    });

    /**
     * Statuses eligible for annual processing.
     * Only 'active' enterprises process.
     */
    var PROCESSABLE_STATUSES = Object.freeze(['active']);

    /**
     * Statuses that block worker assignment.
     * Matches the guard in IndustryCommands.addWorkerToEnterprise.
     */
    var WORKER_BLOCKED_STATUSES = Object.freeze(['bankrupt', 'closed', 'demolished']);

    /**
     * Statuses that block wealth and debt mutation.
     * A demolished enterprise's finances are frozen.
     */
    var FINANCIALS_FROZEN_STATUSES = Object.freeze(['demolished']);

    // =========================================================================
    // 3. OWNERSHIP VOCABULARY
    // =========================================================================

    /**
     * Valid values for enterprise.ownershipType.
     *
     *   public   — owned by a settlement (ownerType settlement)
     *   private  — owned by a character or household, or unowned
     *
     * 'public' is not automatically coupled to ownerType: a settlement-owned
     * enterprise is public, but so would be a state-owned enterprise. The
     * distinction matters for revenue routing (public revenue goes to the
     * settlement treasury) and for settlement-side reporting.
     */
    var OWNERSHIP_TYPE = Object.freeze({
        PUBLIC: 'public',
        PRIVATE: 'private'
    });

    var VALID_OWNERSHIP_TYPES = Object.freeze(['public', 'private']);

    /**
     * Valid values for enterprise.ownerType.
     *
     *   none        — no owner (ownerId must be null)
     *   character   — ownerId is a character id
     *   household   — ownerId is a household id
     *   settlement  — ownerId is a place id (settlement-level place)
     *   state       — ownerId is a place id (state-level place)
     *
     * 'settlement' and 'state' both point at place ids but are distinct
     * ownership semantics: settlement revenue accrues to the local treasury,
     * state revenue accrues to the central treasury.
     */
    var OWNER_TYPE = Object.freeze({
        NONE: 'none',
        CHARACTER: 'character',
        HOUSEHOLD: 'household',
        SETTLEMENT: 'settlement',
        STATE: 'state'
    });

    var VALID_OWNER_TYPES = Object.freeze([
        'none', 'character', 'household', 'settlement', 'state'
    ]);

    /**
     * Owner types whose ownerId is a place id. Used by query-layer owner-name
     * resolution to route to getPlaceById instead of getCharacterById /
     * getHouseholdById.
     */
    var PLACE_OWNER_TYPES = Object.freeze(['settlement', 'state']);

    /**
     * Owner types whose ownerId is a household id. Used by the cross-domain
     * bridge (household enterprise reverse-index maintenance).
     */
    var HOUSEHOLD_OWNER_TYPES = Object.freeze(['household']);

    // =========================================================================
    // 4. DERIVED FIELDS (stripped by migration, resolved on read)
    // =========================================================================

    /**
     * Fields that are no longer stored on the canonical enterprise record.
     * They are projections, resolved on read by IndustryQueries.
     *
     * Phase 3 eliminated these from the stored shape. The migration strips
     * any surviving copies. Queries resolve:
     *
     *   typeName      <- IndustryState.getEnterpriseTypeById(typeId).name
     *   category      <- IndustryState.getEnterpriseTypeById(typeId).category
     *   isPublic      <- (ownershipType === 'public')
     *   ownerName     <- getCharacterById / getHouseholdById / getPlaceById
     *   locationName  <- getPlaceById(locationId)
     *   workerCount   <- workerList.length
     *
     * None of these may be written by any command. Any code that reaches
     * for them on the canonical record is a stale caller.
     */
    var DERIVED_FIELDS = Object.freeze([
        'typeName',
        'category',
        'isPublic',
        'ownerName',
        'locationName',
        'workerCount'
    ]);

    /**
     * Same set as a boolean-keyed map for O(1) membership checks.
     * Used by industry-migration.js.
     */
    var DERIVED_FIELDS_MAP = Object.freeze({
        typeName: true,
        category: true,
        isPublic: true,
        ownerName: true,
        locationName: true,
        workerCount: true
    });

    // =========================================================================
    // 5. CANONICAL ENTERPRISE FIELDS
    // =========================================================================

    /**
     * The canonical stored shape of an enterprise record.
     *
     * Every field here is either:
     *   (a) an irreducible fact (id, name, typeId, ownershipType, ownerType,
     *       ownerId, locationId, foundedYear), or
     *   (b) a mutable state field owned by IndustryCommands
     *       (wealth, debt, income, expenses, wages, maxWorkers,
     *        workerList, workerWages, status, lastProcessedYear, notes), or
     *   (c) a historical record (history), or
     *   (d) a tombstone payload (demolishedAt, demolishedReason, destroyedBy,
     *       disasterId, demolishedRecord).
     *
     * derived fields are absent by design. See DERIVED_FIELDS.
     */
    var CANONICAL_ENTERPRISE_FIELDS = Object.freeze([
        // Identity
        'id',
        'name',
        'typeId',

        // Ownership
        'ownershipType',
        'ownerType',
        'ownerId',

        // Location
        'locationId',

        // Financials
        'wealth',
        'debt',
        'income',
        'expenses',
        'wages',

        // Workers
        'maxWorkers',
        'workerList',
        'workerWages',

        // Status
        'status',
        'foundedYear',
        'lastProcessedYear',

        // History
        'history',
        'notes',

        // Metadata
        'createdAt',
        'updatedAt',

        // Tombstone (present only on demolished records)
        'demolishedAt',
        'demolishedReason',
        'destroyedBy',
        'disasterId',
        'demolishedRecord'
    ]);

    /**
     * Same set as a boolean-keyed map. Used by validation to reject
     * unknown fields on a candidate enterprise.
     */
    var CANONICAL_ENTERPRISE_FIELDS_MAP = Object.freeze(
        CANONICAL_ENTERPRISE_FIELDS.reduce(function (acc, key) {
            acc[key] = true;
            return acc;
        }, {})
    );

    // =========================================================================
    // 6. DOMAIN-OWNED FIELD MAP
    // =========================================================================

    /**
     * Fields that appear on an enterprise record but are NOT writable by
     * IndustryCommands, because another module owns their truth.
     *
     * Currently empty: every canonical field is industry-owned. The map
     * exists so that when a cross-domain field is added (e.g. a
     * settlement-assigned tax bracket), the rejection path is already
     * wired up and consistent with household-commands.js.
     *
     * Rejection message format:
     *   'Field "X" is owned by another domain. Use Y.'
     */
    var DOMAIN_OWNED_ENTERPRISE_FIELDS = Object.freeze({
        // Reserved for future cross-domain fields.
    });

    // =========================================================================
    // 7. TYPE CATEGORY FALLBACK
    // =========================================================================

    /**
     * Category used when an enterprise's typeId points to a type that does
     * not exist in the registry.
     *
     * IMPORTANT: This is NOT a stored value. It is a resolution fallback
     * used only by industry-queries.resolveTypeMetadata and by the
     * bootstrap integrity diagnostic (which counts broken references).
     *
     * Queries that resolve type metadata MUST distinguish "typeId is null"
     * (no type assigned) from "typeId points to a missing type" (broken
     * reference). Both resolve to null metadata; the difference is visible
     * only in the integrity diagnostic.
     */
    var UNKNOWN_TYPE_CATEGORY = 'other';

    // =========================================================================
    // 8. MIGRATION ERROR VOCABULARY
    // =========================================================================

    /**
     * Reasons industry-migration can report for a record it refuses to
     * migrate. Every reason here means the record is malformed in a way
     * that cannot be repaired without inventing facts.
     *
     * The migration is strict by design: a record with a missing typeId
     * is a migration error, not an invitation to invent "other".
     */
    var MIGRATION_ERROR = Object.freeze({
        MISSING_ID: 'missing id',
        MISSING_NAME: 'missing or empty name',
        MISSING_TYPE_ID: 'missing typeId (cannot infer intended type)',
        INVALID_OWNERSHIP_TYPE: 'invalid ownershipType',
        INVALID_OWNER_TYPE: 'invalid ownerType',
        OWNER_TYPE_NONE_WITH_ID: 'ownerType "none" cannot have an ownerId',
        OWNER_TYPE_WITHOUT_ID: 'ownerType requires an ownerId',
        WORKER_LIST_NOT_ARRAY: 'workerList is not an array',
        WORKER_WAGES_NOT_OBJECT: 'workerWages is not an object',
        HISTORY_NOT_ARRAY: 'history is not an array'
    });

    // =========================================================================
    // 9. ECONOMIC CONSTANTS (annual processing)
    // =========================================================================

    /**
     * The number of history entries an enterprise keeps. Older entries are
     * discarded on write once the cap is exceeded. Kept high enough that
     * multi-century enterprises retain an auditable trail; kept bounded so
     * that a runaway processor cannot grow the record without limit.
     */
    var MAX_HISTORY_ENTRIES = 500;

    /**
     * The maximum number of workers an enterprise may hold. Not a policy
     * constant (per-type maxWorkers governs); this is a hard ceiling to
     * catch runaway loops that would otherwise generate millions of
     * entries. If a legitimate enterprise ever needs more, raise the cap.
     */
    var ABSOLUTE_MAX_WORKERS = 10000;

    // =========================================================================
    // 10. EVENT NAMES
    // =========================================================================
    //
    // The event names emitted via IndustryState.publish and dispatched via
    // CustomEvent. Both channels use the same string. This map is exported
    // for consumers that subscribe or listen; commands reference the
    // constant, not a literal.
    //
    // Naming matches household-commands.js: raw camelCase action names,
    // no 'domain:action' prefix.

    var EVENT = Object.freeze({
        // Lifecycle
        ENTERPRISE_ADDED: 'enterpriseAdded',
        ENTERPRISE_UPDATED: 'enterpriseUpdated',
        ENTERPRISE_DELETED: 'enterpriseDeleted',

        // Processing
        ENTERPRISE_PROCESSED: 'enterpriseProcessed',

        // Demolition / rebuild
        ENTERPRISE_DEMOLISHED: 'enterpriseDemolished',
        ENTERPRISE_REBUILT: 'enterpriseRebuilt',

        // Type registry
        ENTERPRISE_TYPE_ADDED: 'enterpriseTypeAdded',
        ENTERPRISE_TYPE_UPDATED: 'enterpriseTypeUpdated',
        ENTERPRISE_TYPE_DELETED: 'enterpriseTypeDeleted',

        // Migration / hydration
        ENTERPRISES_MIGRATED: 'enterprisesMigrated',
        ENTERPRISES_HYDRATED: 'enterprisesHydrated'
    });

    // =========================================================================
    // 11. RESULT SHAPE LITERALS
    // =========================================================================
    //
    // The reference set uses { valid, errors } for rules and
    // { success, reason } for commands. These constants formalize the
    // shapes so consumers can destructure without guessing.

    var RESULT_SHAPE = Object.freeze({
        VALID: 'valid',
        SUCCESS: 'success'
    });

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.IndustryConstants = Object.freeze({
        // Economic thresholds
        DEBT_INTEREST_RATE: DEBT_INTEREST_RATE,
        BANKRUPTCY_THRESHOLD: BANKRUPTCY_THRESHOLD,
        REBUILD_WEALTH_FRACTION: REBUILD_WEALTH_FRACTION,
        REBUILD_WEALTH_MINIMUM: REBUILD_WEALTH_MINIMUM,

        // Status
        STATUS: STATUS,
        PROCESSABLE_STATUSES: PROCESSABLE_STATUSES,
        WORKER_BLOCKED_STATUSES: WORKER_BLOCKED_STATUSES,
        FINANCIALS_FROZEN_STATUSES: FINANCIALS_FROZEN_STATUSES,

        // Ownership
        OWNERSHIP_TYPE: OWNERSHIP_TYPE,
        VALID_OWNERSHIP_TYPES: VALID_OWNERSHIP_TYPES,
        OWNER_TYPE: OWNER_TYPE,
        VALID_OWNER_TYPES: VALID_OWNER_TYPES,
        PLACE_OWNER_TYPES: PLACE_OWNER_TYPES,
        HOUSEHOLD_OWNER_TYPES: HOUSEHOLD_OWNER_TYPES,

        // Derived-field classification
        DERIVED_FIELDS: DERIVED_FIELDS,
        DERIVED_FIELDS_MAP: DERIVED_FIELDS_MAP,

        // Canonical shape
        CANONICAL_ENTERPRISE_FIELDS: CANONICAL_ENTERPRISE_FIELDS,
        CANONICAL_ENTERPRISE_FIELDS_MAP: CANONICAL_ENTERPRISE_FIELDS_MAP,

        // Domain-owned fields
        DOMAIN_OWNED_ENTERPRISE_FIELDS: DOMAIN_OWNED_ENTERPRISE_FIELDS,

        // Type resolution
        UNKNOWN_TYPE_CATEGORY: UNKNOWN_TYPE_CATEGORY,

        // Migration
        MIGRATION_ERROR: MIGRATION_ERROR,

        // Processing caps
        MAX_HISTORY_ENTRIES: MAX_HISTORY_ENTRIES,
        ABSOLUTE_MAX_WORKERS: ABSOLUTE_MAX_WORKERS,

        // Events
        EVENT: EVENT,

        // Result shape literals
        RESULT_SHAPE: RESULT_SHAPE
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryConstants;
    }
})();
