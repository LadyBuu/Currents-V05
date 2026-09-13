// js/core/storage-schema.js
(function() {
    'use strict';

    var SCHEMA_VERSION = 2;

    function createDefaultMasterDataOverride() {
        var defaultYear = (typeof window.TIME_CONSTANTS !== 'undefined')
            ? window.TIME_CONSTANTS.DEFAULT_YEAR
            : 1250;

        return {
            schemaVersion: SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            data: {
                characters: [],
                places: [],
                ranks: [],
                roles: [],
                locationTypes: [],
                governmentTypes: [],
                nameLists: {},
                cityNameParts: {},
                governments: [],
                households: [],
                residences: [],
                rankInheritanceRules: {},
                disasters: [],
                eventLog: [],
                currentYear: defaultYear,
                educationalInstitutions: [],
                educationalSubjects: {},
                subjectProgress: {}
            }
        };
    }

    function normalizeMasterData(envelope) {
        if (!envelope || !envelope.data) return envelope;

        var defaults = createDefaultMasterDataOverride().data;
        var source = envelope.data;
        var out = {};

        var arrayKeys = [
            'characters', 'places', 'ranks', 'roles', 'locationTypes',
            'governmentTypes', 'governments', 'households', 'residences',
            'disasters', 'eventLog', 'educationalInstitutions'
        ];
        for (var i = 0; i < arrayKeys.length; i++) {
            var k = arrayKeys[i];
            out[k] = Array.isArray(source[k]) ? source[k] : defaults[k];
        }

        var objectKeys = [
            'nameLists', 'cityNameParts', 'rankInheritanceRules',
            'educationalSubjects', 'subjectProgress'
        ];
        for (var j = 0; j < objectKeys.length; j++) {
            var ok = objectKeys[j];
            out[ok] = (source[ok] && typeof source[ok] === 'object' && !Array.isArray(source[ok]))
                ? source[ok]
                : defaults[ok];
        }

        out.currentYear = (typeof source.currentYear === 'number'
            && Number.isInteger(source.currentYear))
            ? source.currentYear
            : defaults.currentYear;

        // Field-level defaults per entity
        for (var c = 0; c < out.characters.length; c++) {
            var char = out.characters[c];
            if (!Array.isArray(char.relationships)) char.relationships = [];
            if (!Array.isArray(char.friends)) char.friends = [];
            if (!Array.isArray(char.moves)) char.moves = [];
            if (!Array.isArray(char.professions)) char.professions = [];
            if (!Array.isArray(char.adoptedParents)) char.adoptedParents = [];
            if (!Array.isArray(char.rankAssignments)) char.rankAssignments = [];
            if (char.isDeceased === undefined) char.isDeceased = false;
            if (!Array.isArray(char.apprentices)) char.apprentices = [];
            if (char.masterId === undefined) char.masterId = null;
            if (char.isMaster === undefined) char.isMaster = false;
            if (char.masterProfessionId === undefined) char.masterProfessionId = null;
            if (!char.apprenticeshipDetails) char.apprenticeshipDetails = {};
            if (!char.friendshipDetails) char.friendshipDetails = {};
            if (!char.appearance) char.appearance = {};
        }

        for (var p = 0; p < out.places.length; p++) {
            var place = out.places[p];
            if (place.governmentTypeId === undefined) place.governmentTypeId = null;
            if (place.governmentStyle === undefined) place.governmentStyle = null;
            if (!Array.isArray(place.leaderAssignments)) place.leaderAssignments = [];
        }

        for (var r = 0; r < out.ranks.length; r++) {
            var rank = out.ranks[r];
            if (rank.genderRestriction === undefined) rank.genderRestriction = 'either';
            if (rank.locationTypeId === undefined) rank.locationTypeId = null;
            if (rank.locationId === undefined) rank.locationId = null;
            if (rank.numbered === undefined) rank.numbered = false;
            if (rank.symbol === undefined) rank.symbol = '';
            if (rank.deprecateOnDeath === undefined) rank.deprecateOnDeath = false;
            if (rank.spouseInheritance === undefined) rank.spouseInheritance = null;
        }

        for (var g = 0; g < out.governmentTypes.length; g++) {
            var govType = out.governmentTypes[g];
            if (!Array.isArray(govType.allowedRankIds)) govType.allowedRankIds = [];
        }

        for (var h = 0; h < out.households.length; h++) {
            var household = out.households[h];
            if (!Array.isArray(household.departments)) household.departments = [];
            if (!Array.isArray(household.members)) household.members = [];
        }

        for (var ro = 0; ro < out.roles.length; ro++) {
            var role = out.roles[ro];
            if (role.genderRestriction === undefined) role.genderRestriction = 'both';
            if (!Array.isArray(role.specializations)) role.specializations = [];
            if (role.notes === undefined) role.notes = '';
        }

        return {
            schemaVersion: envelope.schemaVersion || SCHEMA_VERSION,
            savedAt: envelope.savedAt || new Date().toISOString(),
            data: out
        };
    }

    window.createDefaultMasterDataOverride = createDefaultMasterDataOverride;
    window.normalizeMasterData = normalizeMasterData;
})();