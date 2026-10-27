/**
 * =============================================================================
 * STILL WATERS - RANK RULES (rank-rules.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-rules.js
 *
 * Pure policy for the rank domain.
 *
 * This file:
 *   - builds a normalised rank record from raw input (shape only; the
 *     command layer stamps id and timestamps)
 *   - validates rank records and their fields
 *   - validates inheritance rules
 *   - decides whether a character may receive a rank assignment
 *   - classifies the numbering group for a rank given the character it is
 *     being assigned to
 *   - answers policy questions the romance domain asks about ranks
 *
 * This file does NOT:
 *   - touch state (RankState, CharacterState, masterData)
 *   - persist, notify, or dispatch events
 *   - generate ids or timestamps
 *   - perform numbering arithmetic (rank-assignment.js owns that)
 *   - perform inheritance resolution (rank-queries.js owns that)
 *   - render, toast, or reach into the DOM
 *   - use randomness
 *
 * CONTRACT:
 *   Every function is deterministic. Every validator returns a result
 *   object shaped { valid: boolean, errors?: string[], reason?: string }.
 *   No function throws for domain errors. Invalid explicit input (wrong
 *   type for a required argument) throws — that is a programming error,
 *   not a domain error.
 *
 * DEPENDENCIES:
 *   - rank-constants.js (RANK_LEVELS, AVAILABLE_SYMBOLS, INHERITANCE_SOURCE,
 *                       NUMBERING_GROUP, DEFAULT_RANK) — required for
 *                       correct default values and symbol validation.
 *                       Read at call time via window.*.
 *
 *   - formatting.js::formatRomanNumeral — OPTIONAL. Used when
 *     formatRomanFull is unavailable. Falls back to a local table.
 *
 *   - formatting.js::formatOrdinal — OPTIONAL. Used for the ordinal
 *     fallback. Falls back to an inline implementation.
 *
 *   - names.js::formatRomanFull — OPTIONAL. Provides full-range Roman
 *     numerals (1-3999). Falls back to formatRomanNumeral and then to
 *     the local table.
 *
 *   All dependencies are read at call time via window.*. There is no
 *   cached reference. This keeps the file trivially testable and avoids
 *   load-order traps: as long as the optional dependencies are loaded
 *   before a caller invokes a function here, they are visible. The
 *   fallbacks make the module safe in bare test harnesses.
 *
 * COHERENCE POLICY (applyDefaults):
 *   applyDefaults does NOT guess inheritanceSource from a set
 *   sourceRankId. A record with sourceRankId but inheritanceSource
 *   'none' is incoherent; applyDefaults leaves it incoherent and
 *   validate() rejects it. The caller (RankCommands.createRank /
 *   updateRank) is responsible for supplying both fields together, or
 *   for supplying neither.
 *
 *   The one coercion applyDefaults DOES perform: if sourceRankId is
 *   null but inheritanceSource is set to 'parent' or 'spouse', the
 *   inheritance source is reset to 'none'. This is a safe correction
 *   (the record cannot fulfill an inheritance source without a target)
 *   and it prevents validate() from rejecting a record that was never
 *   intended to inherit.
 *
 * ROMAN NUMERAL DELEGATION:
 *   Three implementations exist in the tree:
 *     - formatting.js::formatRomanNumeral (1-20, returns String for >20)
 *     - names.js::formatRomanFull (1-3999, canonical)
 *     - local fallback (1-39, returns String for >39)
 *
 *   _toRoman delegates to formatRomanFull first, then
 *   formatRomanNumeral, then the local table. This gives full Roman
 *   coverage without duplicating the 1-3999 table.
 *
 * ORDINAL DELEGATION:
 *   _toOrdinal delegates to window.formatOrdinal (formatting.js) when
 *   present, with an inline fallback. The 11th/12th/13th exception is
 *   handled identically in both.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 1 of the rank module fix plan):
 *     - _toRoman delegates to window.formatRomanFull (names.js) and
 *       window.formatRomanNumeral (formatting.js), falling back to the
 *       local table. Full range (1-3999) is now available when
 *       names.js is loaded.
 *     - _toOrdinal delegates to window.formatOrdinal (formatting.js),
 *       falling back to the local implementation. The 11th/12th/13th
 *       exception is unchanged.
 *     - applyDefaults no longer infers 'parent' from a set sourceRankId.
 *       validate() rejects the incoherent combination instead of
 *       silently coercing it.
 *     - validate() now checks: sourceRankId present but inheritanceSource
 *       'none' (rejects), inheritanceSource present but sourceRankId
 *       null (rejects). These were previously masked by applyDefaults'
 *       silent inference.
 *     - Header COHERENCE POLICY, ROMAN NUMERAL DELEGATION, and ORDINAL
 *       DELEGATION sections added.
 *     - No public signature change, no public return-shape change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. INTERNAL HELPERS
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

    function _isValidPriority(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (!Number.isInteger(v)) return false;
        if (v < 1 || v > 10) return false;
        return true;
    }

    function _isValidGenderRestriction(v) {
        return v === 'either' || v === 'male' || v === 'female';
    }

    function _isValidNumberingType(v) {
        return v === 'ordinal' || v === 'roman' || v === 'reign';
    }

    function _isValidNumberingGroup(v) {
        return v === 'global' || v === 'parent'
            || v === 'spouse' || v === 'source';
    }

    function _isValidInheritanceSource(v) {
        return v === 'none' || v === 'parent' || v === 'spouse';
    }

    function _isValidYearOrMissing(v) {
        if (_isMissing(v)) return true;
        return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
    }

    function _getAvailableSymbols() {
        var symbols = window.AVAILABLE_SYMBOLS;
        if (Array.isArray(symbols) && symbols.length > 0) return symbols;
        return ['⟡'];
    }

    function _isKnownSymbol(symbol) {
        var symbols = _getAvailableSymbols();
        for (var i = 0; i < symbols.length; i++) {
            if (symbols[i] === symbol) return true;
        }
        return false;
    }

    // =========================================================================
    // 2. DEFAULTS / SHAPE
    // =========================================================================

    /**
     * Produces a normalised rank record from raw input.
     *
     * Does NOT assign id, createdAt, or updatedAt. The command layer stamps
     * those. Everything else on the record is set here, so the shape returned
     * by this function is the canonical shape for a freshly-created rank.
     *
     * Idempotent: calling applyDefaults on the output of applyDefaults returns
     * an equivalent record. Safe to call from RankState._normaliseRank as a
     * shape source; that method now delegates to this function to eliminate
     * the two-implementation drift.
     *
     * COHERENCE: see the header's COHERENCE POLICY section. This function
     * does NOT guess inheritanceSource from a set sourceRankId. It resets
     * inheritanceSource to 'none' when sourceRankId is null, which is a
     * safe correction rather than a guess.
     *
     * @param {Object} raw
     * @returns {Object}
     */
    function applyDefaults(raw) {
        var r = _isPlainObject(raw) ? raw : {};
        var defaults = _isPlainObject(window.DEFAULT_RANK) ? window.DEFAULT_RANK : {};

        // Preserve every field on the input, even unknown ones. Forward
        // compatibility for future fields and for domain-specific extras.
        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        // Helper: use raw if present and non-empty, else fall back to defaults,
        // else a hardcoded literal. Hardcoded literals mirror DEFAULT_RANK so
        // the shape is stable even if rank-constants.js is not loaded.
        function pick(field, fallback, useWhen) {
            var v = r[field];
            if (useWhen ? useWhen(v) : !_isMissing(v)) return v;
            var d = defaults[field];
            if (useWhen ? useWhen(d) : !_isMissing(d)) return d;
            return fallback;
        }

        out.name = pick('name', 'New Rank', function (v) {
            return typeof v === 'string' && v.trim() !== '';
        });
        out.priority = pick('priority', 5, _isValidPriority);
        out.numbered = r.numbered === true || (r.numbered === undefined
            && defaults.numbered === true);
        out.numberingType = pick('numberingType', 'reign', _isValidNumberingType);
        out.numberingGroup = pick('numberingGroup', 'global', _isValidNumberingGroup);
        out.numberingPrefix = typeof r.numberingPrefix === 'string'
            ? r.numberingPrefix
            : (typeof defaults.numberingPrefix === 'string'
                ? defaults.numberingPrefix
                : '');
        out.numberingSuffix = typeof r.numberingSuffix === 'string'
            ? r.numberingSuffix
            : (typeof defaults.numberingSuffix === 'string'
                ? defaults.numberingSuffix
                : '');
        out.symbol = pick('symbol', '⟡', function (v) {
            return typeof v === 'string' && v.length > 0;
        });
        out.genderRestriction = pick('genderRestriction', 'either',
            _isValidGenderRestriction);
        out.locationTypeId = _hasId(r.locationTypeId) ? r.locationTypeId
            : (defaults.locationTypeId || null);
        out.deprecateOnDeath = r.deprecateOnDeath === true
            || (r.deprecateOnDeath === undefined
                && defaults.deprecateOnDeath === true);
        out.spouseInheritance = _hasId(r.spouseInheritance)
            ? r.spouseInheritance
            : (defaults.spouseInheritance || null);
        out.allowsMultipleSpouses = r.allowsMultipleSpouses === true
            || (r.allowsMultipleSpouses === undefined
                && defaults.allowsMultipleSpouses === true);
        out.parentRankId = _hasId(r.parentRankId) ? r.parentRankId : null;
        out.sourceRankId = _hasId(r.sourceRankId) ? r.sourceRankId : null;
        out.inheritanceSource = pick('inheritanceSource', 'none',
            _isValidInheritanceSource);
        out.customSurnameRule = r.customSurnameRule === true
            || (r.customSurnameRule === undefined
                && defaults.customSurnameRule === true);
        out.surnameConnector = typeof r.surnameConnector === 'string'
            ? r.surnameConnector
            : (typeof defaults.surnameConnector === 'string'
                ? defaults.surnameConnector
                : 'of');
        out.surnamePrefix = typeof r.surnamePrefix === 'string'
            ? r.surnamePrefix
            : (typeof defaults.surnamePrefix === 'string'
                ? defaults.surnamePrefix
                : '');
        out.surnameSuffix = typeof r.surnameSuffix === 'string'
            ? r.surnameSuffix
            : (typeof defaults.surnameSuffix === 'string'
                ? defaults.surnameSuffix
                : '');

        // Coherence: inheritanceSource requires a sourceRankId. If the
        // caller supplied an inheritanceSource but no sourceRankId, reset
        // the source to 'none' — a safe correction that lets the record
        // proceed without an impossible inheritance claim.
        if (out.sourceRankId === null && out.inheritanceSource !== 'none') {
            out.inheritanceSource = 'none';
        }

        // The reverse case (sourceRankId set, inheritanceSource 'none') is
        // NOT corrected here. See COHERENCE POLICY in the header:
        // applyDefaults does not guess 'parent'. validate() rejects the
        // combination so the caller supplies both fields or neither.

        // Coherence: numbered is false implies numberingGroup is inert.
        // The value is still preserved (it describes what the rank WOULD
        // use if numbered were enabled), but the group is normalised to
        // 'global' so a stale 'spouse' or 'source' group does not linger
        // on an unnumbered rank.
        if (out.numbered !== true) {
            out.numberingGroup = 'global';
        }

        return out;
    }

    // =========================================================================
    // 3. VALIDATION
    // =========================================================================

    /**
     * Validates a rank record (already shaped by applyDefaults, or a raw
     * input if you want to validate before applying defaults).
     *
     * Does NOT check cross-rank references (parentRankId, sourceRankId) —
     * that is a state question and belongs to RankState.validateIntegrity.
     *
     * Cross-field coherence checks are enforced here:
     *   - sourceRankId present requires inheritanceSource !== 'none'
     *   - inheritanceSource !== 'none' requires sourceRankId present
     *   - numberedGroup 'source' requires inheritanceSource !== 'none'
     *
     * These cannot be silently "fixed" — a caller that produces an
     * incoherent record needs to be told, not have their intent guessed.
     *
     * @param {Object} rank
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validate(rank) {
        var errors = [];

        if (!_isPlainObject(rank)) {
            return { valid: false, errors: ['rank must be a plain object'] };
        }

        if (!_isNonEmptyString(rank.name)) {
            errors.push('name is required');
        }

        if (!_isValidPriority(rank.priority)) {
            errors.push('priority must be an integer between 1 and 10');
        }

        if (!_isNonEmptyString(rank.symbol)) {
            errors.push('symbol is required');
        } else if (!_isKnownSymbol(rank.symbol)) {
            errors.push('symbol "' + rank.symbol + '" is not in AVAILABLE_SYMBOLS');
        }

        if (!_isValidGenderRestriction(rank.genderRestriction)) {
            errors.push('genderRestriction must be either, male, or female');
        }

        // Numbering coherence.
        if (rank.numbered === true) {
            if (!_isValidNumberingType(rank.numberingType)) {
                errors.push('numberingType must be ordinal, roman, or reign');
            }
            if (!_isValidNumberingGroup(rank.numberingGroup)) {
                errors.push('numberingGroup must be global, parent, spouse, or source');
            }
            // group === 'source' requires the rank to have an inheritance
            // source configured. Grouping by source without a source is
            // meaningless and would silently produce an empty bucket.
            if (rank.numberingGroup === 'source'
                && rank.inheritanceSource === 'none') {
                errors.push('numberingGroup "source" requires inheritanceSource ' +
                    'to be parent or spouse');
            }
        }

        // Inheritance coherence.
        if (!_isValidInheritanceSource(rank.inheritanceSource)) {
            errors.push('inheritanceSource must be none, parent, or spouse');
        }
        if (rank.inheritanceSource !== 'none' && !_hasId(rank.sourceRankId)) {
            errors.push('inheritanceSource "' + rank.inheritanceSource +
                '" requires a sourceRankId');
        }
        if (rank.inheritanceSource === 'none' && _hasId(rank.sourceRankId)) {
            errors.push('sourceRankId is set but inheritanceSource is "none"');
        }

        // Surname coherence.
        if (rank.customSurnameRule === true) {
            if (!_isNonEmptyString(rank.surnameConnector)
                && !_isNonEmptyString(rank.surnamePrefix)
                && !_isNonEmptyString(rank.surnameSuffix)) {
                errors.push('customSurnameRule requires at least one of ' +
                    'surnameConnector, surnamePrefix, or surnameSuffix');
            }
        }

        // Self-reference guards. RankState enforces these too; rules state
        // them as policy so a caller can reject early without touching state.
        if (_hasId(rank.parentRankId) && rank.parentRankId === rank.id) {
            errors.push('rank cannot be its own parent');
        }
        if (_hasId(rank.sourceRankId) && rank.sourceRankId === rank.id) {
            errors.push('rank cannot be its own source');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates a proposed change to a rank. Returns which of the supplied
     * fields would be rejected, without applying them.
     *
     * Merges the patch onto the current record and runs full validation.
     * This catches coherence errors that a per-field check would miss
     * (e.g. clearing sourceRankId without resetting inheritanceSource).
     *
     * @param {Object} current  the current rank record (shape from RankState)
     * @param {Object} patch    the fields being changed
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validatePatch(current, patch) {
        if (!_isPlainObject(current)) {
            return { valid: false, errors: ['current rank must be a plain object'] };
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

        return validate(candidate);
    }

    // =========================================================================
    // 4. INHERITANCE RULES
    // =========================================================================

    /**
     * Validates a single inheritance rule record.
     *
     * Does NOT check that childRankId / childRankIdFemale reference real
     * ranks — that is a state question. This checks shape and internal
     * coherence.
     *
     * @param {Object} rule
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateInheritanceRule(rule) {
        var errors = [];

        if (!_isPlainObject(rule)) {
            return { valid: false, errors: ['rule must be a plain object'] };
        }

        var hasChild = _hasId(rule.childRankId);
        var hasFemaleChild = _hasId(rule.childRankIdFemale);

        if (!hasChild && !hasFemaleChild) {
            errors.push('rule must reference at least one of childRankId or ' +
                'childRankIdFemale');
        }

        if (rule.minChildAge !== undefined && rule.minChildAge !== null) {
            if (typeof rule.minChildAge !== 'number'
                || !Number.isFinite(rule.minChildAge)
                || rule.minChildAge < 0) {
                errors.push('minChildAge must be a non-negative number or omitted');
            }
        }

        if (rule.maxChildren !== undefined && rule.maxChildren !== null) {
            if (typeof rule.maxChildren !== 'number'
                || !Number.isFinite(rule.maxChildren)
                || !Number.isInteger(rule.maxChildren)
                || rule.maxChildren < 0) {
                errors.push('maxChildren must be a non-negative integer or omitted');
            }
        }

        if (rule.order !== undefined && rule.order !== null) {
            if (typeof rule.order !== 'number'
                || !Number.isFinite(rule.order)) {
                errors.push('order must be a finite number or omitted');
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 5. ASSIGNMENT POLICY
    // =========================================================================

    /**
     * Decides whether a character may receive a rank assignment.
     *
     * Reads only from the supplied arguments. Does not touch state.
     *
     * @param {Object} character    character projection (from CharacterState
     *                              or CharacterQueries)
     * @param {Object} rank         rank record (from RankState or RankQueries)
     * @param {Object} [options]
     * @param {number} [options.assignedYear]  the year the rank would be
     *                              assigned; used only for the deceased check
     * @param {boolean} [options.allowDeprecated]  default false
     * @returns {{ valid: boolean, reason?: string }}
     */
    function canAssignRank(character, rank, options) {
        options = options || {};

        if (!_isPlainObject(character)) {
            return { valid: false, reason: 'character is required' };
        }
        if (!_isPlainObject(rank)) {
            return { valid: false, reason: 'rank is required' };
        }

        if (!_hasId(character.id)) {
            return { valid: false, reason: 'character has no id' };
        }
        if (!_hasId(rank.id)) {
            return { valid: false, reason: 'rank has no id' };
        }

        if (character.isDeleted === true) {
            return { valid: false, reason: 'character is soft-deleted' };
        }

        if (character.isDeceased === true) {
            return { valid: false, reason: 'character is deceased' };
        }

        // Gender restriction.
        if (rank.genderRestriction === 'male'
            && character.gender !== 'male') {
            return { valid: false, reason: 'rank is restricted to males' };
        }
        if (rank.genderRestriction === 'female'
            && character.gender !== 'female') {
            return { valid: false, reason: 'rank is restricted to females' };
        }

        // Duplicate: a non-deprecated assignment for the same rank exists.
        var assignments = Array.isArray(character.rankAssignments)
            ? character.rankAssignments
            : [];
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!a || a.rankId !== rank.id) continue;
            if (a.isDeprecated !== true) {
                return { valid: false, reason: 'character already has this rank' };
            }
        }

        // Numbered ranks with group 'source' require an inheritance source
        // to be configured on the rank. This is a rank-record check, not a
        // character check — the rank record itself is incoherent otherwise.
        if (rank.numbered === true
            && rank.numberingGroup === 'source'
            && rank.inheritanceSource === 'none') {
            return {
                valid: false,
                reason: 'numbered rank with group "source" must declare an ' +
                    'inheritanceSource'
            };
        }

        return { valid: true };
    }

    /**
     * Decides whether a rank assignment may be deprecated.
     *
     * @param {Object} character
     * @param {string} rankId
     * @returns {{ valid: boolean, reason?: string }}
     */
    function canDeprecateRankAssignment(character, rankId) {
        if (!_isPlainObject(character)) {
            return { valid: false, reason: 'character is required' };
        }
        if (!_hasId(rankId)) {
            return { valid: false, reason: 'rankId is required' };
        }

        var assignments = Array.isArray(character.rankAssignments)
            ? character.rankAssignments
            : [];
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!a || a.rankId !== rankId) continue;
            if (a.isDeprecated === true) {
                return { valid: false, reason: 'assignment is already deprecated' };
            }
            return { valid: true };
        }
        return { valid: false, reason: 'character does not have this rank' };
    }

    // =========================================================================
    // 6. MULTI-SPOUSE POLICY
    // =========================================================================

    /**
     * Answers whether a rank permits its holder to have multiple spouses.
     *
     * Called by romance-commands._getExternalMultiPartnerFacts. Kept here so
     * the question is answered by rank policy, not by a cross-domain field
     * read. Today the answer is a direct field on the rank; the indirection
     * is what allows the policy to evolve (e.g. culture-conditional rank
     * pluralism) without touching romance.
     *
     * @param {Object} rank
     * @returns {boolean}
     */
    function allowsMultipleSpouses(rank) {
        if (!_isPlainObject(rank)) return false;
        return rank.allowsMultipleSpouses === true;
    }

    // =========================================================================
    // 7. NUMBERING GROUP CLASSIFICATION
    // =========================================================================

    /**
     * Classifies the numbering group key a rank assignment belongs to, given
     * the character being assigned and the inheritance source (if any).
     *
     * Returns the key used to bucket holders for numbering:
     *   - 'global'   -> all holders share one sequence
     *   - <sourceId> -> holders grouped by inheritance source character id
     *
     * @param {Object} rank
     * @param {string|null} sourceId   inheritance source character id, or null
     * @returns {string}
     */
    function classifyNumberingGroup(rank, sourceId) {
        if (!_isPlainObject(rank)) return 'global';
        if (rank.numbered !== true) return 'global';

        var group = rank.numberingGroup;
        if (group === 'parent' || group === 'spouse' || group === 'source') {
            if (_hasId(sourceId)) return sourceId;
            // No source available: fall back to global so the caller never
            // gets an ambiguous bucket. The assignment layer decides whether
            // to refuse the assignment outright; rules do not.
            return 'global';
        }
        return 'global';
    }

    // =========================================================================
    // 8. NUMBER DISPLAY
    // =========================================================================

    /**
     * Formats a raw number according to the rank's numberingType.
     *
     * Ordinal -> '1st', '2nd', '3rd', '4th'...
     * Roman   -> 'I', 'II', 'III'...
     * Reign   -> 'I', 'II', 'III'... (same as Roman; kept distinct so a
     *            future "Henry VIII" style formatter can specialise without
     *            touching the ordinal path)
     *
     * Not used for numbering arithmetic. rank-assignment.js owns the sequence.
     * This is a display-only helper.
     *
     * @param {number} n
     * @param {string} type   'ordinal' | 'roman' | 'reign'
     * @returns {string}
     */
    function formatNumber(n, type) {
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return '';
        if (type === 'roman' || type === 'reign') return _toRoman(n);
        return _toOrdinal(n);
    }

    /**
     * Formats a number as an English ordinal.
     *
     * Delegates to window.formatOrdinal (formatting.js) when present.
     * Falls back to an inline implementation with identical semantics.
     *
     * The 11th/12th/13th exception is handled correctly in both paths.
     *
     * @private
     * @param {number} n
     * @returns {string}
     */
    function _toOrdinal(n) {
        if (typeof window.formatOrdinal === 'function') {
            var delegated = window.formatOrdinal(n);
            return typeof delegated === 'string' ? delegated : '';
        }
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return '';
        var mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 13) return n + 'th';
        var mod10 = n % 10;
        if (mod10 === 1) return n + 'st';
        if (mod10 === 2) return n + 'nd';
        if (mod10 === 3) return n + 'rd';
        return n + 'th';
    }

    /**
     * Formats a number as a Roman numeral.
     *
     * Delegation chain:
     *   1. window.formatRomanFull (names.js) — 1-3999, full subtractive
     *   2. window.formatRomanNumeral (formatting.js) — 1-20, falls back to
     *      arabic above 20
     *   3. Local table — 1-39, falls back to arabic above 39
     *
     * The delegation gives full Roman coverage when names.js is loaded,
     * without duplicating the 1-3999 table. The local fallback keeps the
     * module safe in bare test harnesses that do not load names.js.
     *
     * @private
     * @param {number} n
     * @returns {string}
     */
    function _toRoman(n) {
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return '';

        if (typeof window.formatRomanFull === 'function') {
            var delegated = window.formatRomanFull(n);
            if (typeof delegated === 'string') return delegated;
        }

        if (typeof window.formatRomanNumeral === 'function') {
            var viaFormatting = window.formatRomanNumeral(n);
            if (typeof viaFormatting === 'string') return viaFormatting;
        }

        // Local fallback (1-39).
        if (n >= 40) return String(n);
        var table = [
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
        ];
        var out = '';
        var remaining = n;
        for (var i = 0; i < table.length; i++) {
            while (remaining >= table[i][0]) {
                out += table[i][1];
                remaining -= table[i][0];
            }
        }
        return out;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.RankRules = {
        // Shape
        applyDefaults: applyDefaults,

        // Validation
        validate: validate,
        validatePatch: validatePatch,
        validateInheritanceRule: validateInheritanceRule,

        // Assignment policy
        canAssignRank: canAssignRank,
        canDeprecateRankAssignment: canDeprecateRankAssignment,

        // Romance bridge
        allowsMultipleSpouses: allowsMultipleSpouses,

        // Numbering
        classifyNumberingGroup: classifyNumberingGroup,
        formatNumber: formatNumber
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankRules;
    }
})();
