// js/core/storage-schema.js
/**
 * =============================================================================
 * STILL WATERS - STORAGE SCHEMA (storage-schema.js)
 * =============================================================================
 *
 * Canonical shape of the persisted masterData envelope.
 *
 * CHANGE LOG:
 *   - Previous revisions added governmentDepartments / governmentTypes /
 *     governmentHistory, religions, and cultures to both the default
 *     factory and the normalizer whitelist. Each was a fix for the same
 *     class of bug: the write side was fine, but normalizeMasterData
 *     dropped the field on load, the orchestrator repaired it to [], and
 *     the next save wrote [] back to storage, silently erasing every
 *     record the user created.
 *
 *   - Current revision adds relationships to both places. RelationshipState
 *     holds every romance, friendship, rivalry, and professional edge in a
 *     closure and signals mutations via markDataDirty(). The storage layer
 *     pulls RelationshipState.snapshot() into masterData.data.relationships
 *     before serializing (see storage.js DOMAIN STATE PULLING). Without
 *     "relationships" in the default factory and arrayKeys, the load path
 *     drops the field on every reload, and every relationship is lost.
 *
 *     Same bug class as religions / cultures. Same fix.
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

    var SCHEMA_VERSION = 4;

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
        throw new Error(
            'storage-schema.js: field "' + fieldName + '" must be an array; refusing to discard its value.'
        );
    }

    function _normalizeObjectField(value, fieldName) {
        if (_isMissing(value)) return {};
        if (_isPlainObject(value)) return value;
        throw new Error(
            'storage-schema.js: field "' + fieldName + '" must be a plain object; refusing to discard its value.'
        );
    }

    function _ensureArrayField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (_isMissing(obj[fieldName])) {
            obj[fieldName] = [];
            return;
        }
        if (!Array.isArray(obj[fieldName])) {
            throw new Error('storage-schema.js: nested field "' + fieldName + '" must be an array; refusing to discard its value.');
        }
    }

    function _ensurePlainObjectField(obj, fieldName) {
        if (!obj || typeof obj !== 'object') return;
        if (_isMissing(obj[fieldName])) {
            obj[fieldName] = {};
            return;
        }
        if (!_isPlainObject(obj[fieldName])) {
            throw new Error('storage-schema.js: nested field "' + fieldName + '" must be a plain object; refusing to discard its value.');
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
                religions: [],
                placesOfWorship: [],

                // ─── Culture collections ──────────────────────────────────
                // cultures: the top-level array the culture subsystem
                // persists into. Without it here and in the normalizer's
                // arrayKeys, every saved culture is dropped on the next
                // load. See the header.
                cultures: [],
                // cultureLocationAssociations: declared so the storage
                // layer preserves the field if the culture domain ever
                // promotes associations to a top-level collection. The
                // culture subsystem does not write to this today; its
                // location associations live inline on culture.locations.
                cultureLocationAssociations: [],

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

                // ─── Relationship domain collection ───────────────────────
                // relationships: the canonical top-level array for every
                // non-family relationship edge (romance, friendship,
                // rivalry, professional). RelationshipState reads and
                // writes this array via the save pull in
                // storage.js::_performSave. Without it here and in
                // arrayKeys, the normalizer drops the field on load and
                // every relationship is lost on the next reload — same
                // class of bug the cultures/religions entries fixed.
                relationships: [],

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
            'religions', 'placesOfWorship',
            'cultures',
            'cultureLocationAssociations',
            'governmentDepartments', 'governmentHistory',
            'enterprises', 'enterpriseTypes',
            'residences', 'disasters', 'eventLog',
            'educationalInstitutions', 'parentChildEdges',
            // FIX: relationships was never in the arrayKeys whitelist.
            // normalizeMasterData therefore dropped data.relationships
            // on every load; the next save wrote [] back; every
            // relationship the user created was silently lost on the
            // next page reload. Same class of bug the religions and
            // cultures entries fixed. See the header.
            'relationships',
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
        if (envelope._yearCoerced === true ||
            (!_isMissing(source.currentYear) && !_isValidWorldYear(source.currentYear))) {
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
