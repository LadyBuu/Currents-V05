/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT LAW RULES
 * js/settlement/settlement-law-rules.js
 * =============================================================================
 *
 * PURE CIVIL LAW RULES.
 *
 * This file contains pure validation and evaluation rules for civil laws:
 *   - validate a civil law payload (new or updated)
 *   - detect duplicate names within a settlement's law set
 *   - validate a partial update payload
 *   - validate the crime mapping sub-object
 *
 * It is pure. It depends only on SettlementLawDefinitions. It does not
 * read canonical settlement state. It does not mutate anything. It does
 * not persist. It does not display UI. It does not clamp. It does not
 * coerce. It does not fabricate missing values. It does not use recursion
 * guards.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §20 (Ownership of foreign entities),
 * §32 (Completion Standard).
 *
 * Design notes:
 *   - Law ids are assigned by the command layer, not by these rules. This
 *     module never invents an id.
 *   - `name` is required and must be a non-empty string after trimming.
 *     Whitespace-only names are rejected.
 *   - `type`, `domain`, `severity` must be valid ids from the definitions.
 *   - `crimeMapping` is an optional object. When present, its fields are
 *     validated for shape and coherence. Missing `crimeMapping` is not
 *     the same as `crimeMapping: null`. `null` is rejected when supplied.
 *   - Duplicate-name detection is case-insensitive on trimmed names,
 *     matching the current behavior. It compares against the current law
 *     set, excluding the law being updated (when applicable).
 *   - Partial update payloads must distinguish `undefined` (not changing)
 *     from `null` (invalid). `""` (empty string) for a required field is
 *     invalid when supplied, not "clear the field".
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _isNonEmptyTrimmedString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function _isPlainObject(value) {
        return value !== null
            && typeof value === 'object'
            && Object.prototype.toString.call(value) === '[object Object]';
    }

    function _findById(list, id) {
        if (id === null || id === undefined) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
        return null;
    }

    function _isInList(list, id) {
        return _findById(list, id) !== null;
    }

    // =========================================================================
    // 2. CRIME MAPPING VALIDATION
    // =========================================================================
    //
    // A crimeMapping is an optional sub-object. When supplied, it must be a
    // plain object. Its fields are validated when present:
    //   crimeType    : non-empty string or null
    //   punishment   : non-empty string or null
    //   isEnforced   : boolean
    //   notes        : string
    //
    // Fields that are `undefined` are treated as "not supplied". Fields
    // that are `null` are permitted for crimeType and punishment only.
    // `isEnforced` may not be null; it must be a boolean or omitted.
    //

    function _validateCrimeMapping(mapping, reasons, context) {
        if (!_isPlainObject(mapping)) {
            reasons.push({
                code: 'INVALID_CRIME_MAPPING',
                context: context,
                actual: typeof mapping
            });
            return;
        }

        if (mapping.crimeType !== undefined && mapping.crimeType !== null) {
            if (!_isNonEmptyTrimmedString(mapping.crimeType)) {
                reasons.push({
                    code: 'INVALID_CRIME_TYPE',
                    context: context,
                    actual: mapping.crimeType
                });
            }
        }

        if (mapping.punishment !== undefined && mapping.punishment !== null) {
            if (!_isNonEmptyTrimmedString(mapping.punishment)) {
                reasons.push({
                    code: 'INVALID_PUNISHMENT',
                    context: context,
                    actual: mapping.punishment
                });
            }
        }

        if (mapping.isEnforced !== undefined) {
            if (typeof mapping.isEnforced !== 'boolean') {
                reasons.push({
                    code: 'INVALID_IS_ENFORCED',
                    context: context,
                    actual: typeof mapping.isEnforced
                });
            }
        }

        if (mapping.notes !== undefined && typeof mapping.notes !== 'string') {
            reasons.push({
                code: 'INVALID_CRIME_NOTES',
                context: context,
                actual: typeof mapping.notes
            });
        }
    }

    // =========================================================================
    // 3. FULL LAW VALIDATION (CREATE)
    // =========================================================================
    //
    // Validates a full law payload for creation. Required fields must be
    // present. Optional fields may be omitted. `id` is not the caller's to
    // supply; if present, it is ignored.
    //

    /**
     * @param {Object} input
     * @param {string} input.name
     * @param {string} input.type
     * @param {string} input.domain
     * @param {string} input.severity
     * @param {string} [input.description]
     * @param {Object} [input.crimeMapping]
     * @param {string} [input.notes]
     * @returns {Object} { valid: boolean, reasons: Array<Object>, normalized: Object }
     */
    function validateNewLaw(input) {
        var reasons = [];
        var normalized = {};

        if (!_isPlainObject(input)) {
            return {
                valid: false,
                reasons: [{ code: 'NOT_AN_OBJECT', actual: typeof input }],
                normalized: {}
            };
        }

        // --- name ---
        if (!_isNonEmptyTrimmedString(input.name)) {
            reasons.push({
                code: 'INVALID_NAME',
                actual: input.name
            });
        } else {
            normalized.name = input.name.trim();
        }

        // --- type ---
        if (!_isInList(window.SettlementLawDefinitions.LAW_TYPES, input.type)) {
            reasons.push({
                code: 'INVALID_TYPE',
                actual: input.type
            });
        } else {
            normalized.type = input.type;
        }

        // --- domain ---
        if (!_isInList(window.SettlementLawDefinitions.LAW_DOMAINS, input.domain)) {
            reasons.push({
                code: 'INVALID_DOMAIN',
                actual: input.domain
            });
        } else {
            normalized.domain = input.domain;
        }

        // --- severity ---
        if (!_isInList(window.SettlementLawDefinitions.LAW_SEVERITIES, input.severity)) {
            reasons.push({
                code: 'INVALID_SEVERITY',
                actual: input.severity
            });
        } else {
            normalized.severity = input.severity;
        }

        // --- description (optional) ---
        if (input.description !== undefined) {
            if (typeof input.description !== 'string') {
                reasons.push({
                    code: 'INVALID_DESCRIPTION',
                    actual: typeof input.description
                });
            } else {
                normalized.description = input.description;
            }
        } else {
            normalized.description = '';
        }

        // --- notes (optional) ---
        if (input.notes !== undefined) {
            if (typeof input.notes !== 'string') {
                reasons.push({
                    code: 'INVALID_NOTES',
                    actual: typeof input.notes
                });
            } else {
                normalized.notes = input.notes;
            }
        } else {
            normalized.notes = '';
        }

        // --- crimeMapping (optional) ---
        if (input.crimeMapping !== undefined) {
            if (input.crimeMapping === null) {
                reasons.push({ code: 'NULL_CRIME_MAPPING' });
            } else {
                _validateCrimeMapping(input.crimeMapping, reasons, 'newLaw');
                if (_isPlainObject(input.crimeMapping)) {
                    normalized.crimeMapping = {
                        crimeType: input.crimeMapping.crimeType || null,
                        punishment: input.crimeMapping.punishment || null,
                        isEnforced: input.crimeMapping.isEnforced === true,
                        notes: typeof input.crimeMapping.notes === 'string'
                            ? input.crimeMapping.notes
                            : ''
                    };
                }
            }
        } else {
            normalized.crimeMapping = {
                crimeType: null,
                punishment: null,
                isEnforced: false,
                notes: ''
            };
        }

        return {
            valid: reasons.length === 0,
            reasons: reasons,
            normalized: normalized
        };
    }

    // =========================================================================
    // 4. PARTIAL UPDATE VALIDATION
    // =========================================================================
    //
    // A partial update payload may supply any subset of fields. Fields not
    // present (`undefined`) are treated as "not being changed". `null` for
    // a required field is invalid. `""` for a required string field is
    // invalid; for optional string fields, `""` is a legitimate value.
    //
    // The law being updated is identified by `lawId`. It is not modified
    // by this validator; the id is not part of the update.
    //

    /**
     * @param {Object} updates
     * @returns {Object} { valid: boolean, reasons: Array<Object>, normalized: Object }
     */
    function validateLawUpdate(updates) {
        var reasons = [];
        var normalized = {};

        if (!_isPlainObject(updates)) {
            return {
                valid: false,
                reasons: [{ code: 'NOT_AN_OBJECT', actual: typeof updates }],
                normalized: {}
            };
        }

        // --- name ---
        if (updates.name !== undefined) {
            if (!_isNonEmptyTrimmedString(updates.name)) {
                reasons.push({
                    code: 'INVALID_NAME',
                    actual: updates.name
                });
            } else {
                normalized.name = updates.name.trim();
            }
        }

        // --- type ---
        if (updates.type !== undefined) {
            if (!_isInList(window.SettlementLawDefinitions.LAW_TYPES, updates.type)) {
                reasons.push({
                    code: 'INVALID_TYPE',
                    actual: updates.type
                });
            } else {
                normalized.type = updates.type;
            }
        }

        // --- domain ---
        if (updates.domain !== undefined) {
            if (!_isInList(window.SettlementLawDefinitions.LAW_DOMAINS, updates.domain)) {
                reasons.push({
                    code: 'INVALID_DOMAIN',
                    actual: updates.domain
                });
            } else {
                normalized.domain = updates.domain;
            }
        }

        // --- severity ---
        if (updates.severity !== undefined) {
            if (!_isInList(window.SettlementLawDefinitions.LAW_SEVERITIES, updates.severity)) {
                reasons.push({
                    code: 'INVALID_SEVERITY',
                    actual: updates.severity
                });
            } else {
                normalized.severity = updates.severity;
            }
        }

        // --- description ---
        if (updates.description !== undefined) {
            if (typeof updates.description !== 'string') {
                reasons.push({
                    code: 'INVALID_DESCRIPTION',
                    actual: typeof updates.description
                });
            } else {
                normalized.description = updates.description;
            }
        }

        // --- notes ---
        if (updates.notes !== undefined) {
            if (typeof updates.notes !== 'string') {
                reasons.push({
                    code: 'INVALID_NOTES',
                    actual: typeof updates.notes
                });
            } else {
                normalized.notes = updates.notes;
            }
        }

        // --- crimeMapping ---
        if (updates.crimeMapping !== undefined) {
            if (updates.crimeMapping === null) {
                reasons.push({ code: 'NULL_CRIME_MAPPING' });
            } else {
                _validateCrimeMapping(updates.crimeMapping, reasons, 'update');
                if (_isPlainObject(updates.crimeMapping)) {
                    var partial = {};
                    if (updates.crimeMapping.crimeType !== undefined) {
                        partial.crimeType = updates.crimeMapping.crimeType;
                    }
                    if (updates.crimeMapping.punishment !== undefined) {
                        partial.punishment = updates.crimeMapping.punishment;
                    }
                    if (updates.crimeMapping.isEnforced !== undefined) {
                        partial.isEnforced = updates.crimeMapping.isEnforced;
                    }
                    if (updates.crimeMapping.notes !== undefined) {
                        partial.notes = updates.crimeMapping.notes;
                    }
                    normalized.crimeMapping = partial;
                }
            }
        }

        return {
            valid: reasons.length === 0,
            reasons: reasons,
            normalized: normalized
        };
    }

    // =========================================================================
    // 5. DUPLICATE NAME DETECTION
    // =========================================================================
    //
    // Names are compared case-insensitively after trimming. The law with
    // `excludeLawId` (if supplied) is skipped, allowing updates to keep
    // their own name.
    //

    /**
     * @param {string} candidateName
     * @param {Array<Object>} existingLaws
     * @param {string} [excludeLawId]
     * @returns {Object} { duplicate: boolean, matchId: string|null }
     */
    function findDuplicateName(candidateName, existingLaws, excludeLawId) {
        if (!_isNonEmptyTrimmedString(candidateName)) {
            return { duplicate: false, matchId: null };
        }
        if (!existingLaws || existingLaws.length === 0) {
            return { duplicate: false, matchId: null };
        }

        var target = candidateName.trim().toLowerCase();

        for (var i = 0; i < existingLaws.length; i++) {
            var law = existingLaws[i];
            if (!law) continue;
            if (excludeLawId !== undefined && law.id === excludeLawId) continue;
            if (typeof law.name !== 'string') continue;
            if (law.name.trim().toLowerCase() === target) {
                return { duplicate: true, matchId: law.id };
            }
        }

        return { duplicate: false, matchId: null };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementLawRules = Object.freeze({
        validateNewLaw: validateNewLaw,
        validateLawUpdate: validateLawUpdate,
        findDuplicateName: findDuplicateName
    });

})();
