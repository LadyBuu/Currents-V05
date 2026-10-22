/**
 * =============================================================================
 * STILL WATERS - INDUSTRY RULES (industry-rules.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-rules.js
 *
 * Pure policy for the industry domain.
 *
 * This file:
 *   - builds a normalised enterprise record from raw input (shape only;
 *     the command layer stamps id and timestamps)
 *   - builds a normalised enterprise type record from raw input
 *   - validates enterprise records, type records, and their patches
 *   - validates the annual-transition result shape before commit
 *   - validates the household-transfer payload before commit
 *   - classifies an enterprise against a proposed owner change
 *
 * This file does NOT:
 *   - touch state (IndustryState, masterData, accessors)
 *   - persist, notify, or dispatch events
 *   - generate ids or timestamps
 *   - perform economic arithmetic (industry-economics.js owns that)
 *   - resolve type metadata (industry-queries.js owns that)
 *   - resolve owner or location names (industry-queries.js owns that)
 *   - render, toast, or reach into the DOM
 *   - use randomness
 *
 * CONTRACT:
 *   Every function is deterministic. Every validator returns a result
 *   object shaped { valid: boolean, errors?: string[], reason?: string }.
 *   No function throws for domain errors. Invalid explicit input (wrong
 *   type for a required argument where the caller is expected to have
 *   validated) throws — that is a programming error, not a domain error.
 *
 * DEPENDENCIES:
 *   - industry-constants.js (window.IndustryConstants)
 *   - industry-economics.js (window.IndustryEconomics) — only used by
 *     validateAnnualTransitionResult to check netProfit / totalProfit
 *     coherence against the transition's own fields; no arithmetic is
 *     re-performed here.
 *
 * Both dependencies are read at call time via window.*. There is no
 * cached reference. This keeps the file trivially testable and avoids
 * load-order traps: as long as industry-constants.js is loaded before a
 * caller invokes a function here, the constants are visible.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireConstants() {
        if (typeof window.IndustryConstants === 'undefined'
            || window.IndustryConstants === null) {
            throw new Error(
                'industry-rules.js: industry-constants.js must load first ' +
                '(IndustryConstants missing).'
            );
        }
        return window.IndustryConstants;
    }

    function _requireEconomics() {
        if (typeof window.IndustryEconomics === 'undefined'
            || window.IndustryEconomics === null) {
            throw new Error(
                'industry-rules.js: industry-economics.js must load first ' +
                '(IndustryEconomics missing).'
            );
        }
        return window.IndustryEconomics;
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    function _isNonNegativeFinite(v) {
        return _isFiniteNumber(v) && v >= 0;
    }

    function _isValidYearOrMissing(v) {
        if (_isMissing(v)) return true;
        if (typeof window.isValidYear === 'function') {
            return window.isValidYear(v) === true;
        }
        // Fallback: the time.js contract is "finite integer within
        // TIME_CONSTANTS bounds". If time.js is not loaded, we accept any
        // finite integer; the caller's load-order guarantees time.js.
        return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
    }

    function _constants() {
        return _requireConstants();
    }

    // =========================================================================
    // 3. DEFAULTS — ENTERPRISE SHAPE
    // =========================================================================

    /**
     * Produces a normalised enterprise record from raw input.
     *
     * Does NOT assign id, createdAt, or updatedAt. The command layer stamps
     * those. Does NOT read enterprise type defaults from the type registry
     * (income, expenses, wages, maxWorkers) — that requires state access,
     * which this module does not have. The caller resolves type defaults
     * via IndustryState.getEnterpriseTypeById and passes them in as
     * `typeDefaults` if the raw input omits a field.
     *
     * The canonical stored shape (per IndustryConstants.CANONICAL_ENTERPRISE_FIELDS)
     * is guaranteed on the output: every canonical field except id,
     * createdAt, updatedAt, history, demolishedAt, demolishedReason,
     * destroyedBy, disasterId, demolishedRecord is present with a
     * well-typed value. History and tombstone fields are set by the command
     * layer, not here.
     *
     * Idempotent: calling applyEnterpriseDefaults on the output of
     * applyEnterpriseDefaults returns an equivalent record.
     *
     * @param {Object} raw               raw enterprise input
     * @param {Object} [typeDefaults]    resolved type record, used when a
     *                                   field is missing from raw
     * @returns {Object}
     */
    function applyEnterpriseDefaults(raw, typeDefaults) {
        var C = _constants();
        var r = _isPlainObject(raw) ? raw : {};
        var t = _isPlainObject(typeDefaults) ? typeDefaults : {};

        // Preserve every field on the input, even unknown ones. Validation
        // will reject unknown fields separately; preserving them here keeps
        // the caller's error surface accurate (they see "unknown field X"
        // rather than "X silently dropped").
        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        // Name — required upstream; if absent, leave as-is. Validation
        // rejects the missing name with a clear reason.
        if (typeof out.name === 'string') {
            out.name = out.name.trim();
        }

        // typeId — required upstream; leave as-is.
        // ownershipType — required upstream on create; if absent, do not
        // fabricate. The command layer must resolve public/private from
        // ownerType when it can, and validation rejects the missing value
        // otherwise.

        // ownerType / ownerId — normalise 'missing' to 'none'/null.
        if (_isMissing(out.ownerType)) out.ownerType = C.OWNER_TYPE.NONE;
        if (_isMissing(out.ownerId)) out.ownerId = null;

        // locationId — normalise missing to null.
        if (_isMissing(out.locationId)) out.locationId = null;

        // Financials — pull from typeDefaults if missing, else leave
        // undefined for validation to reject. Financial defaults are not
        // fabricated here because "income: 0" and "income: undefined" mean
        // different things to the annual processor.
        if (_isMissing(out.income) && _isFiniteNumber(t.baseIncome)) {
            out.income = t.baseIncome;
        }
        if (_isMissing(out.expenses) && _isFiniteNumber(t.baseExpenses)) {
            out.expenses = t.baseExpenses;
        }
        if (_isMissing(out.wages) && _isFiniteNumber(t.baseWages)) {
            out.wages = t.baseWages;
        }
        if (_isMissing(out.wealth)) out.wealth = 0;
        if (_isMissing(out.debt)) out.debt = 0;

        // Workers
        if (_isMissing(out.maxWorkers) && _isFiniteNumber(t.maxWorkers)) {
            out.maxWorkers = t.maxWorkers;
        }
        if (!Array.isArray(out.workerList)) out.workerList = [];
        if (!_isPlainObject(out.workerWages)) out.workerWages = {};

        // Status — only active is a sensible default for a new record; a
        // caller that wants otherwise supplies it explicitly.
        if (_isMissing(out.status)) out.status = C.STATUS.ACTIVE;

        // foundedYear / lastProcessedYear — the command layer resolves
        // currentYear and stamps these. Left as-is here.

        // Notes
        if (_isMissing(out.notes)) out.notes = '';

        // History — the command layer stamps the initial entry.
        if (!Array.isArray(out.history)) out.history = [];

        return out;
    }

    // =========================================================================
    // 4. DEFAULTS — ENTERPRISE TYPE SHAPE
    // =========================================================================

    /**
     * Produces a normalised enterprise type record from raw input.
     *
     * Does NOT assign id. The command layer stamps it.
     *
     * Idempotent.
     *
     * @param {Object} raw
     * @returns {Object}
     */
    function applyEnterpriseTypeDefaults(raw) {
        var r = _isPlainObject(raw) ? raw : {};

        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        if (typeof out.name === 'string') out.name = out.name.trim();
        if (typeof out.category === 'string') out.category = out.category.trim();

        if (!_isNonNegativeFinite(out.baseIncome)) out.baseIncome = 0;
        if (!_isNonNegativeFinite(out.baseExpenses)) out.baseExpenses = 0;
        if (!_isNonNegativeFinite(out.baseWages)) out.baseWages = 0;
        if (!_isNonNegativeFinite(out.baseWorkers)) out.baseWorkers = 0;
        if (!_isNonNegativeFinite(out.baseCost)) out.baseCost = 0;
        if (!_isNonNegativeFinite(out.maxWorkers)) out.maxWorkers = 1;

        if (_isMissing(out.description)) out.description = '';

        return out;
    }

    // =========================================================================
    // 5. VALIDATION — ENTERPRISE RECORD
    // =========================================================================

    /**
     * Validates a fully-shaped enterprise record.
     *
     * Checks:
     *   - required fields present and well-typed
     *   - ownershipType is 'public' | 'private'
     *   - ownerType is one of the five valid values
     *   - ownerType/ownerId coherence ('none' has no ownerId; other types
     *     require an ownerId)
     *   - financial fields are finite, non-negative where required
     *   - workerList is an array; workerWages is a plain object; every
     *     workerList entry is a string id; every workerWages key is in
     *     workerList
     *   - workerList.length <= maxWorkers <= ABSOLUTE_MAX_WORKERS
     *   - status is one of the five valid values
     *   - history is an array; history length <= MAX_HISTORY_ENTRIES
     *   - no derived field is present on the record
     *   - no domain-owned field is present (currently empty set)
     *   - no unknown field is present (CANONICAL_ENTERPRISE_FIELDS_MAP is
     *     the allowlist, except for tombstone fields which are permitted
     *     only when status === 'demolished')
     *
     * Does NOT check cross-record references (typeId points at a real type,
     * ownerId points at a real character/household/place). Those are state
     * questions and belong to IndustryState.validateIntegrity.
     *
     * @param {Object} enterprise
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateEnterprise(enterprise) {
        var C = _constants();
        var errors = [];

        if (!_isPlainObject(enterprise)) {
            return { valid: false, errors: ['enterprise must be a plain object'] };
        }

        // Identity
        if (!_hasId(enterprise.id)) {
            errors.push('id is required');
        }
        if (!_isNonEmptyString(enterprise.name)) {
            errors.push('name is required');
        }
        if (!_hasId(enterprise.typeId)) {
            errors.push('typeId is required');
        }

        // Ownership
        if (C.VALID_OWNERSHIP_TYPES.indexOf(enterprise.ownershipType) === -1) {
            errors.push(
                'ownershipType must be one of: ' +
                C.VALID_OWNERSHIP_TYPES.join(', ')
            );
        }
        if (C.VALID_OWNER_TYPES.indexOf(enterprise.ownerType) === -1) {
            errors.push(
                'ownerType must be one of: ' +
                C.VALID_OWNER_TYPES.join(', ')
            );
        }
        if (enterprise.ownerType === C.OWNER_TYPE.NONE && enterprise.ownerId) {
            errors.push('ownerType "none" cannot have an ownerId');
        }
        if (enterprise.ownerType !== C.OWNER_TYPE.NONE && !enterprise.ownerId) {
            errors.push('ownerType "' + enterprise.ownerType + '" requires an ownerId');
        }

        // Location — nullable, but if present must be a non-empty string
        if (!_isMissing(enterprise.locationId) && !_hasId(enterprise.locationId)) {
            errors.push('locationId must be a non-empty string or null');
        }

        // Financials
        if (!_isFiniteNumber(enterprise.wealth)) {
            errors.push('wealth must be a finite number');
        }
        if (!_isNonNegativeFinite(enterprise.debt)) {
            errors.push('debt must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(enterprise.income)) {
            errors.push('income must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(enterprise.expenses)) {
            errors.push('expenses must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(enterprise.wages)) {
            errors.push('wages must be a non-negative finite number');
        }

        // Workers
        if (!_isNonNegativeFinite(enterprise.maxWorkers)) {
            errors.push('maxWorkers must be a non-negative finite number');
        } else if (enterprise.maxWorkers > C.ABSOLUTE_MAX_WORKERS) {
            errors.push('maxWorkers exceeds ABSOLUTE_MAX_WORKERS (' +
                C.ABSOLUTE_MAX_WORKERS + ')');
        }
        if (!Array.isArray(enterprise.workerList)) {
            errors.push('workerList must be an array');
        }
        if (!_isPlainObject(enterprise.workerWages)) {
            errors.push('workerWages must be a plain object');
        }

        if (Array.isArray(enterprise.workerList)) {
            if (enterprise.workerList.length > enterprise.maxWorkers) {
                errors.push('workerList exceeds maxWorkers');
            }

            var workerIds = {};
            for (var wi = 0; wi < enterprise.workerList.length; wi++) {
                var workerId = enterprise.workerList[wi];
                if (!_hasId(workerId)) {
                    errors.push('workerList[' + wi + '] must be a non-empty string id');
                } else if (workerIds[workerId] === true) {
                    errors.push('workerList contains duplicate id: ' + workerId);
                } else {
                    workerIds[workerId] = true;
                }
            }

            if (_isPlainObject(enterprise.workerWages)) {
                for (var wk in enterprise.workerWages) {
                    if (!Object.prototype.hasOwnProperty.call(enterprise.workerWages, wk)) {
                        continue;
                    }
                    if (workerIds[wk] !== true) {
                        errors.push('workerWages has entry for "' + wk +
                            '" but that id is not in workerList');
                    }
                    if (!_isNonNegativeFinite(enterprise.workerWages[wk])) {
                        errors.push('workerWages["' + wk +
                            '"] must be a non-negative finite number');
                    }
                }
            }
        }

        // Status
        var validStatuses = [
            C.STATUS.ACTIVE,
            C.STATUS.INACTIVE,
            C.STATUS.BANKRUPT,
            C.STATUS.CLOSED,
            C.STATUS.DEMOLISHED
        ];
        if (validStatuses.indexOf(enterprise.status) === -1) {
            errors.push('status must be one of: ' + validStatuses.join(', '));
        }

        // Years
        if (!_isValidYearOrMissing(enterprise.foundedYear)) {
            errors.push('foundedYear must be a valid year or null');
        }
        if (!_isValidYearOrMissing(enterprise.lastProcessedYear)) {
            errors.push('lastProcessedYear must be a valid year or null');
        }

        // History
        if (!Array.isArray(enterprise.history)) {
            errors.push('history must be an array');
        } else if (enterprise.history.length > C.MAX_HISTORY_ENTRIES) {
            errors.push('history length exceeds MAX_HISTORY_ENTRIES (' +
                C.MAX_HISTORY_ENTRIES + ')');
        }

        // Notes
        if (!_isMissing(enterprise.notes) && typeof enterprise.notes !== 'string') {
            errors.push('notes must be a string');
        }

        // Timestamps
        if (!_isMissing(enterprise.createdAt) && !_isFiniteNumber(enterprise.createdAt)) {
            errors.push('createdAt must be a finite timestamp or null');
        }
        if (!_isMissing(enterprise.updatedAt) && !_isFiniteNumber(enterprise.updatedAt)) {
            errors.push('updatedAt must be a finite timestamp or null');
        }

        // Derived fields must not be present on a canonical record.
        for (var dfi = 0; dfi < C.DERIVED_FIELDS.length; dfi++) {
            var df = C.DERIVED_FIELDS[dfi];
            if (Object.prototype.hasOwnProperty.call(enterprise, df)) {
                errors.push('derived field "' + df +
                    '" must not be stored on the canonical record');
            }
        }

        // Domain-owned fields must not be present.
        for (var dof in C.DOMAIN_OWNED_ENTERPRISE_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(
                    C.DOMAIN_OWNED_ENTERPRISE_FIELDS, dof)) {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(enterprise, dof)) {
                errors.push('field "' + dof +
                    '" is owned by another domain and must not be set here');
            }
        }

        // Unknown fields: reject anything not in the canonical set and not
        // in the tombstone set when applicable.
        var isDemolished = enterprise.status === C.STATUS.DEMOLISHED;
        var tombstoneAllowed = {
            demolishedAt: true,
            demolishedReason: true,
            destroyedBy: true,
            disasterId: true,
            demolishedRecord: true
        };
        for (var f in enterprise) {
            if (!Object.prototype.hasOwnProperty.call(enterprise, f)) continue;
            if (C.CANONICAL_ENTERPRISE_FIELDS_MAP[f] === true) continue;
            if (isDemolished && tombstoneAllowed[f] === true) continue;
            errors.push('unknown field "' + f + '" on enterprise record');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 6. VALIDATION — ENTERPRISE PATCH
    // =========================================================================

    /**
     * Validates a proposed change to an enterprise. Merges the patch onto a
     * shallow copy of the current record and validates the merged candidate.
     *
     * Does NOT enforce a field allowlist. The command layer owns the
     * allowlist; this function answers only "is the resulting record
     * well-formed?".
     *
     * @param {Object} current   the current enterprise record (canonical)
     * @param {Object} patch     the fields being changed
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateEnterprisePatch(current, patch) {
        if (!_isPlainObject(current)) {
            return { valid: false, errors: ['current must be a plain object'] };
        }
        if (!_isPlainObject(patch)) {
            return { valid: false, errors: ['patch must be a plain object'] };
        }

        var candidate = {};
        for (var k in current) {
            if (Object.prototype.hasOwnProperty.call(current, k)) {
                candidate[k] = current[k];
            }
        }
        for (var p in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, p)) {
                candidate[p] = patch[p];
            }
        }

        return validateEnterprise(candidate);
    }

    // =========================================================================
    // 7. VALIDATION — ENTERPRISE TYPE RECORD
    // =========================================================================

    /**
     * Validates a fully-shaped enterprise type record.
     *
     * Does NOT check id uniqueness — that is a state question.
     *
     * @param {Object} type
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateEnterpriseType(type) {
        var errors = [];

        if (!_isPlainObject(type)) {
            return { valid: false, errors: ['enterprise type must be a plain object'] };
        }

        if (!_hasId(type.id)) {
            errors.push('id is required');
        }
        if (!_isNonEmptyString(type.name)) {
            errors.push('name is required');
        }
        if (!_isNonEmptyString(type.category)) {
            errors.push('category is required');
        }

        if (!_isNonNegativeFinite(type.baseIncome)) {
            errors.push('baseIncome must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(type.baseExpenses)) {
            errors.push('baseExpenses must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(type.baseWages)) {
            errors.push('baseWages must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(type.baseWorkers)) {
            errors.push('baseWorkers must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(type.baseCost)) {
            errors.push('baseCost must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(type.maxWorkers) || type.maxWorkers < 1) {
            errors.push('maxWorkers must be a positive finite number');
        }
        if (type.baseWorkers > type.maxWorkers) {
            errors.push('baseWorkers cannot exceed maxWorkers');
        }

        if (!_isMissing(type.description) && typeof type.description !== 'string') {
            errors.push('description must be a string');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates a proposed change to an enterprise type. Merges the patch
     * onto a shallow copy of the current record and validates the merged
     * candidate.
     *
     * @param {Object} current
     * @param {Object} patch
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateEnterpriseTypePatch(current, patch) {
        if (!_isPlainObject(current)) {
            return { valid: false, errors: ['current must be a plain object'] };
        }
        if (!_isPlainObject(patch)) {
            return { valid: false, errors: ['patch must be a plain object'] };
        }

        var candidate = {};
        for (var k in current) {
            if (Object.prototype.hasOwnProperty.call(current, k)) {
                candidate[k] = current[k];
            }
        }
        for (var p in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, p)) {
                candidate[p] = patch[p];
            }
        }

        return validateEnterpriseType(candidate);
    }

    // =========================================================================
    // 8. VALIDATION — ANNUAL TRANSITION RESULT
    // =========================================================================

    /**
     * Validates the shape of a transition result produced by
     * IndustryEconomics.calculateAnnualTransition, before the command layer
     * commits it.
     *
     * This is a shape/coherence check, not a re-computation. The economics
     * module owns the arithmetic; this function verifies that the result it
     * produced is structurally sound and internally coherent (e.g. totalProfit
     * equals netProfit * yearsProcessed when yearsProcessed > 0).
     *
     * @param {Object} result
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateAnnualTransitionResult(result) {
        var C = _constants();
        var errors = [];

        if (!_isPlainObject(result)) {
            return { valid: false, errors: ['transition result must be a plain object'] };
        }

        if (result.ok !== true) {
            errors.push('transition result is not ok');
            // Nothing else to check; the failure reason lives on the result.
            return { valid: false, errors: errors };
        }

        if (!_isFiniteNumber(result.currentYear)) {
            errors.push('currentYear must be a finite number');
        }
        if (!_isNonNegativeFinite(result.yearsProcessed)) {
            errors.push('yearsProcessed must be a non-negative number');
        } else if (!Number.isInteger(result.yearsProcessed)) {
            errors.push('yearsProcessed must be an integer');
        }

        if (!_isNonNegativeFinite(result.annualIncome)) {
            errors.push('annualIncome must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(result.annualExpenses)) {
            errors.push('annualExpenses must be a non-negative finite number');
        }
        if (!_isNonNegativeFinite(result.totalWages)) {
            errors.push('totalWages must be a non-negative finite number');
        }
        if (!_isFiniteNumber(result.netProfit)) {
            errors.push('netProfit must be a finite number');
        }
        if (!_isFiniteNumber(result.totalProfit)) {
            errors.push('totalProfit must be a finite number');
        }
        if (!_isNonNegativeFinite(result.interest)) {
            errors.push('interest must be a non-negative finite number');
        }
        if (!_isFiniteNumber(result.newWealth)) {
            errors.push('newWealth must be a finite number');
        }
        if (!_isNonNegativeFinite(result.newDebt)) {
            errors.push('newDebt must be a non-negative finite number');
        }

        if (result.yearsProcessed === 0) {
            if (result.totalProfit !== 0) {
                errors.push('totalProfit must be 0 when yearsProcessed is 0');
            }
            if (result.interest !== 0) {
                errors.push('interest must be 0 when yearsProcessed is 0');
            }
        } else if (_isFiniteNumber(result.netProfit)
                && _isFiniteNumber(result.totalProfit)
                && _isFiniteNumber(result.yearsProcessed)) {
            // Coherence: totalProfit == netProfit * yearsProcessed. Use exact
            // equality; the economics module produces the product directly.
            if (result.totalProfit !== result.netProfit * result.yearsProcessed) {
                errors.push(
                    'totalProfit (' + result.totalProfit + ') does not equal ' +
                    'netProfit (' + result.netProfit + ') * yearsProcessed (' +
                    result.yearsProcessed + ')'
                );
            }
        }

        var validStatuses = [
            C.STATUS.ACTIVE, C.STATUS.INACTIVE, C.STATUS.BANKRUPT,
            C.STATUS.CLOSED, C.STATUS.DEMOLISHED
        ];
        if (validStatuses.indexOf(result.nextStatus) === -1) {
            errors.push('nextStatus must be one of: ' + validStatuses.join(', '));
        }

        if (!Array.isArray(result.historyEntries)) {
            errors.push('historyEntries must be an array');
        }

        // If the processor is routing a household transfer, the payload
        // must be coherent. Absent householdId means no transfer; present
        // means householdTransfer and householdReason should be set.
        var hasTransferField = Object.prototype.hasOwnProperty.call(
            result, 'householdTransfer');
        var hasHHIdField = Object.prototype.hasOwnProperty.call(
            result, 'householdId');

        if (hasHHIdField && !_isMissing(result.householdId)) {
            if (!_hasId(result.householdId)) {
                errors.push('householdId must be a non-empty string when present');
            }
            if (!hasTransferField || !_isFiniteNumber(result.householdTransfer)) {
                errors.push(
                    'householdId is set but householdTransfer is not a finite number'
                );
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 9. VALIDATION — CREATE INPUT (pre-defaults)
    // =========================================================================

    /**
     * Validates raw createEnterprise input BEFORE defaults are applied.
     * Returns the minimal set of checks the command layer needs to make
     * before resolving type defaults and stamping id/timestamps.
     *
     * @param {Object} data
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateCreateInput(data) {
        var C = _constants();
        var errors = [];

        if (!_isPlainObject(data)) {
            return { valid: false, errors: ['enterprise data must be a plain object'] };
        }

        if (!_isNonEmptyString(data.name)) {
            errors.push('name is required');
        }
        if (!_hasId(data.typeId)) {
            errors.push('typeId is required');
        }

        // Owner coherence, if provided.
        var hasOwnerType = !_isMissing(data.ownerType);
        var hasOwnerId = !_isMissing(data.ownerId);

        if (hasOwnerType) {
            if (C.VALID_OWNER_TYPES.indexOf(data.ownerType) === -1) {
                errors.push(
                    'ownerType must be one of: ' +
                    C.VALID_OWNER_TYPES.join(', ')
                );
            }
            if (data.ownerType === C.OWNER_TYPE.NONE && hasOwnerId) {
                errors.push('ownerType "none" cannot have an ownerId');
            }
            if (data.ownerType !== C.OWNER_TYPE.NONE && !hasOwnerId) {
                errors.push('ownerType "' + data.ownerType + '" requires an ownerId');
            }
        } else if (hasOwnerId) {
            errors.push('ownerId provided without an ownerType');
        }

        // Ownership type coherence, if provided.
        if (!_isMissing(data.ownershipType)
            && C.VALID_OWNERSHIP_TYPES.indexOf(data.ownershipType) === -1) {
            errors.push(
                'ownershipType must be one of: ' +
                C.VALID_OWNERSHIP_TYPES.join(', ')
            );
        }

        // Location
        if (!_isMissing(data.locationId) && !_hasId(data.locationId)) {
            errors.push('locationId must be a non-empty string or null');
        }

        // Financial inputs, if provided, must be non-negative finite.
        var financials = ['wealth', 'debt', 'income', 'expenses', 'wages'];
        for (var i = 0; i < financials.length; i++) {
            var f = financials[i];
            if (!_isMissing(data[f]) && !_isNonNegativeFinite(data[f])) {
                errors.push(f + ' must be a non-negative finite number when provided');
            }
        }

        if (!_isMissing(data.maxWorkers)
            && (!_isNonNegativeFinite(data.maxWorkers) || data.maxWorkers < 1)) {
            errors.push('maxWorkers must be a positive finite number when provided');
        }

        if (!_isMissing(data.foundedYear) && !_isValidYearOrMissing(data.foundedYear)) {
            errors.push('foundedYear must be a valid year when provided');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 10. VALIDATION — UPDATE INPUT (pre-allowlist)
    // =========================================================================

    /**
     * Validates the shape of an updateEnterprise patch — that it is a plain
     * object, that it does not attempt to change id, and that it does not
     * contain derived fields or domain-owned fields.
     *
     * Does NOT enforce the field allowlist. The command layer owns the
     * allowlist (which fields are writable at all); this function rejects
     * the two categories the allowlist never permits (derived fields and
     * domain-owned fields) and rejects attempts to change id.
     *
     * @param {Object} updates
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateUpdateInput(updates) {
        var C = _constants();
        var errors = [];

        if (!_isPlainObject(updates)) {
            return { valid: false, errors: ['updates must be a plain object'] };
        }

        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            errors.push('id cannot be changed');
        }

        for (var dfi = 0; dfi < C.DERIVED_FIELDS.length; dfi++) {
            var df = C.DERIVED_FIELDS[dfi];
            if (Object.prototype.hasOwnProperty.call(updates, df)) {
                errors.push('derived field "' + df +
                    '" cannot be written; it is resolved on read');
            }
        }

        for (var dof in C.DOMAIN_OWNED_ENTERPRISE_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(
                    C.DOMAIN_OWNED_ENTERPRISE_FIELDS, dof)) {
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(updates, dof)) {
                errors.push('field "' + dof +
                    '" is owned by another domain; use the owning domain\'s command');
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 11. OWNERSHIP CLASSIFICATION
    // =========================================================================

    /**
     * Classifies an enterprise against a proposed ownership change, without
     * applying it. Answers: "if the caller applies this (ownerType, ownerId,
     * ownershipType) triple to this enterprise, is the result coherent?"
     *
     * A change that flips ownershipType to 'public' without setting ownerType
     * to a place-owner type is rejected — public enterprises must be owned by
     * a settlement or state, never by a character or household.
     *
     * @param {Object} enterprise   the current enterprise record
     * @param {Object} next         { ownerType?, ownerId?, ownershipType? }
     * @returns {{ valid: boolean, reason?: string }}
     */
    function canApplyOwnershipChange(enterprise, next) {
        var C = _constants();

        if (!_isPlainObject(enterprise)) {
            return { valid: false, reason: 'enterprise is required' };
        }
        if (!_isPlainObject(next)) {
            return { valid: false, reason: 'next is required' };
        }

        // Resolve the effective triple after applying the patch.
        var effectiveOwnershipType =
            Object.prototype.hasOwnProperty.call(next, 'ownershipType')
                ? next.ownershipType
                : enterprise.ownershipType;

        var effectiveOwnerType =
            Object.prototype.hasOwnProperty.call(next, 'ownerType')
                ? next.ownerType
                : enterprise.ownerType;

        var effectiveOwnerId =
            Object.prototype.hasOwnProperty.call(next, 'ownerId')
                ? next.ownerId
                : enterprise.ownerId;

        if (C.VALID_OWNERSHIP_TYPES.indexOf(effectiveOwnershipType) === -1) {
            return { valid: false, reason: 'invalid ownershipType: ' + effectiveOwnershipType };
        }
        if (C.VALID_OWNER_TYPES.indexOf(effectiveOwnerType) === -1) {
            return { valid: false, reason: 'invalid ownerType: ' + effectiveOwnerType };
        }
        if (effectiveOwnerType === C.OWNER_TYPE.NONE && effectiveOwnerId) {
            return { valid: false, reason: 'ownerType "none" cannot have an ownerId' };
        }
        if (effectiveOwnerType !== C.OWNER_TYPE.NONE && !effectiveOwnerId) {
            return {
                valid: false,
                reason: 'ownerType "' + effectiveOwnerType + '" requires an ownerId'
            };
        }

        if (effectiveOwnershipType === C.OWNERSHIP_TYPE.PUBLIC) {
            if (C.PLACE_OWNER_TYPES.indexOf(effectiveOwnerType) === -1) {
                return {
                    valid: false,
                    reason: 'public enterprises must be owned by a settlement or state'
                };
            }
        }

        return { valid: true };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.IndustryRules = Object.freeze({
        // Defaults / shape
        applyEnterpriseDefaults: applyEnterpriseDefaults,
        applyEnterpriseTypeDefaults: applyEnterpriseTypeDefaults,

        // Enterprise validation
        validateEnterprise: validateEnterprise,
        validateEnterprisePatch: validateEnterprisePatch,
        validateCreateInput: validateCreateInput,
        validateUpdateInput: validateUpdateInput,

        // Enterprise type validation
        validateEnterpriseType: validateEnterpriseType,
        validateEnterpriseTypePatch: validateEnterpriseTypePatch,

        // Annual processing
        validateAnnualTransitionResult: validateAnnualTransitionResult,

        // Ownership classification
        canApplyOwnershipChange: canApplyOwnershipChange
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryRules;
    }
})();
