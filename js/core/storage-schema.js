// js/core/storage-schema.js
/**
 * =============================================================================
 * STILL WATERS - STORAGE SCHEMA (storage-schema.js)
 * =============================================================================
 *
 * Canonical shape of the persisted masterData envelope.
 *
 * CHANGE LOG:
 *   - Previous revision added governmentDepartments / governmentTypes /
 *     governmentHistory to both the default factory and the normalizer
 *     whitelist. Fresh installs no longer crash on the first government
 *     write, and existing saves preserve those arrays across reloads.
 *
 *   - Current revision adds religions to both places, for the exact same
 *     reason. Without it, normalizeMasterData drops data.religions on
 *     every load; the orchestrator's defensive repair then sets it to [];
 *     the next save writes [] back to storage; every religion the user
 *     created is silently lost on the next page reload.
 *
 *     The symptom users saw was "religions aren't getting saved" — the
 *     write side was always fine (saveMasterData persisted the full
 *     array), the read side was dropping it. Adding religions to the
 *     normalize whitelist makes loadMasterData return what was actually
 *     saved.
 *
 *   - Removed a duplicate 'governmentTypes' entry from the arrayKeys
 *     whitelist (it appeared at both the general-arrays position and
 *     the government-group position; the duplication was harmless but
 *     was a copy-paste artifact from the previous fix).
 * =============================================================================
 */

(function() {
    'use strict';

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

    var SCHEMA_VERSION = 3;

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(value) {
        if (value === null || typeof value !== 'object') return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function _isValidWorldYear(year) {
        if (typeof year !== 'number' || !Number.isFinite(year)) return false;
        if (!Number.isInteger(year)) return false;
        return year >= window.TIME_CONSTANTS.MIN_YEAR
            && year <= window.TIME_CONSTANTS.MAX_YEAR;
    }

    function _normalizeArrayField(value, fieldName) {
        if (_isMissing(value)) return [];
        if (Array.isArray(value)) return value;
        console.warn(
            'storage-schema.js: field "' + fieldName + '" is not an array ' +
            '(got ' + typeof value + '); replacing with [].'
        );
        return [];
    }

    function _normalizeObjectField(value, fieldName) {
        if (_isMissing(value)) return {};
        if (_isPlainObject(value)) return value;
        console.warn(
            'storage-schema.js: field "' + fieldName + '" is not a plain object ' +
            '(got ' + (Array.isArray(value) ? 'array' : typeof value) + '); replacing with {}.'
        );
        return {};
    }

    function _ensureArrayField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (_isMissing(obj[fieldName]) || !Array.isArray(obj[fieldName])) {
            obj[fieldName] = [];
        }
    }

    function _ensurePlainObjectField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (!_isPlainObject(obj[fieldName])) {
            obj[fieldName] = {};
        }
    }

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
    // DEFAULT FACTORY
    // =========================================================================

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

                // ─── Religion collections ─────────────────────────────────
                // FIX: religions was never declared here. Fresh installs
                // produced a masterData with data.religions === undefined;
                // the religion bootstrap's _verifyCanonical() repaired it
                // to [] on first init, but any load that ran BEFORE the
                // bootstrap (e.g. an auto-init at parse time) saw the
                // undefined shape. Adding it here makes a fresh install
                // start with religions: [] and never rely on the repair.
                religions: [],

                // ─── Government domain collections ────────────────────────
                governmentDepartments: [],
                governmentHistory: [],

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
    // NORMALIZATION
    // =========================================================================

    function normalizeMasterData(envelope) {
        if (!envelope || !envelope.data) return envelope;

        _requireTime();

        var defaults = createDefaultMasterDataOverride().data;
        var source = envelope.data;
        var out = {};

        var arrayKeys = [
            'characters', 'places', 'ranks', 'roles', 'locationTypes',
            'governmentTypes', 'governments', 'households',
            'householdPositions', 'householdAssignments',
            'religions',
            'governmentDepartments', 'governmentHistory',
            'enterprises', 'enterpriseTypes',
            'residences', 'disasters', 'eventLog',
            'educationalInstitutions', 'parentChildEdges',
            'pregnancyRecords', 'surrogacyArrangements', 'adoptionRecords'
        ];
        for (var i = 0; i < arrayKeys.length; i++) {
            var k = arrayKeys[i];
            out[k] = _normalizeArrayField(source[k], k);
        }

        var objectKeys = [
            'nameLists', 'cityNameParts', 'rankInheritanceRules',
            'educationalSubjects', 'subjectProgress', 'settlementData'
        ];
        for (var j = 0; j < objectKeys.length; j++) {
            var ok = objectKeys[j];
            out[ok] = _normalizeObjectField(source[ok], ok);
        }

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

        for (var p = 0; p < out.places.length; p++) {
            var place = out.places[p];
            if (!place || typeof place !== 'object') continue;

            if (place.governmentTypeId === undefined) place.governmentTypeId = null;
            if (place.governmentStyle === undefined) place.governmentStyle = null;

            _ensureArrayField(place, 'leaderAssignments');
        }

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

        for (var g = 0; g < out.governmentTypes.length; g++) {
            var govType = out.governmentTypes[g];
            if (!govType || typeof govType !== 'object') continue;
            _ensureArrayField(govType, 'allowedRankIds');
        }

        for (var h = 0; h < out.households.length; h++) {
            var household = out.households[h];
            if (!household || typeof household !== 'object') continue;
            _ensureArrayField(household, 'departments');
            _ensureArrayField(household, 'members');
        }

        for (var ro = 0; ro < out.roles.length; ro++) {
            var role = out.roles[ro];
            if (!role || typeof role !== 'object') continue;
            if (role.genderRestriction === undefined) role.genderRestriction = 'both';
            _ensureArrayField(role, 'specializations');
            if (role.notes === undefined) role.notes = '';
        }

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
    // EXPORTS
    // =========================================================================

    window.createDefaultMasterDataOverride = createDefaultMasterDataOverride;
    window.normalizeMasterData = normalizeMasterData;
    window.STORAGE_SCHEMA_VERSION = SCHEMA_VERSION;

})();
