'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadCrimeCommands(options = {}) {
    const recorded = [];
    const character = {
        id: 'perpetrator-1',
        name: 'Test Perpetrator',
        currentLocationId: 'unsettled-location'
    };
    const window = {
        CrimeConstants: {
            CRIME_TYPES: { MURDER: 'murder', EXECUTION: 'execution' },
            CODES: { VALIDATION: 'VALIDATION', NOT_FOUND: 'NOT_FOUND' },
            LAW_DOMAINS: { VIOLENCE: 'violence' },
            EVENTS: { CRIME_RECORDED: 'crimeRecorded' },
            getAllCrimeTypes() { return ['theft']; }
        },
        CrimeState: {
            recordCrime(data) {
                const crime = Object.assign({ id: 'crime-1' }, data);
                recorded.push(crime);
                return { success: true, data: crime };
            },
            hydrateFromMasterData() {}
        },
        SettlementState: {
            getSettlementData() {
                return options.settlement || null;
            }
        },
        SettlementLawQueries: {
            getCivilLaws() {
                options.civilLawQueryCalls = (options.civilLawQueryCalls || 0) + 1;
                return options.civilLaws === undefined ? null : options.civilLaws;
            }
        },
        ReligionLaws: {
            getLawsByReligion(id) {
                return options.religiousLaws || [];
            }
        },
        HouseholdCommands: {
            applyPerpetratorCrime() { return { success: true }; },
            applyVictimCrime() { return { success: true }; },
            applyExecutionToHousehold() { return { success: true }; }
        },
        SettlementGovernmentCommands: {
            recordCrimeImpact() { return { success: true }; }
        },
        getCurrentYear() { return 1924; },
        generateId() { return 'generated-id'; },
        killCharacter() { throw new Error('Not expected in generic crime test'); },
        logEvent() {},
        getCharacterById(id) { return id === character.id ? character : null; },
        getHouseholdById() { return null; },
        getCurrentLocationId(person) { return person.currentLocationId; },
        markDataDirty() {},
        dispatchEvent() {},
        getPlaceName(id) { return id; }
    };

    const context = {
        window,
        module: { exports: {} },
        console,
        isFinite,
        Object,
        Array,
        String,
        Number,
        Math,
        CustomEvent: function CustomEvent() {}
    };

    const lawSource = fs.readFileSync(
        path.join(__dirname, '../js/crime/crime-law-integration.js'),
        'utf8'
    );
    vm.runInNewContext(lawSource, context, {
        filename: 'crime-law-integration.js'
    });

    window.CrimeLawIntegration = context.module.exports =
        window.CrimeLawIntegration || context.module.exports;

    const commandSource = fs.readFileSync(
        path.join(__dirname, '../js/crime/crime-commands.js'),
        'utf8'
    );
    vm.runInNewContext(commandSource, context, {
        filename: 'crime-commands.js'
    });

    return {
        commands: window.CrimeCommands,
        recorded,
        window,
        character,
        options
    };
}

test('recordCrime succeeds at a valid location with no settlement record', () => {
    const harness = loadCrimeCommands();
    const result = harness.commands.recordCrime('unsettled-location', {
        type: 'theft',
        perpetratorId: 'perpetrator-1',
        reason: 'Test incident'
    });

    assert.equal(result.success, true, result.reason);
    assert.equal(result.data.crime.locationId, 'unsettled-location');
    assert.equal(result.data.legalEvaluation.lawful, true);
    assert.equal(result.data.legalEvaluation.civil.length, 0);
    assert.equal(result.data.legalEvaluation.religious.length, 0);
    assert.equal(harness.recorded.length, 1);
    assert.equal(harness.options.civilLawQueryCalls || 0, 0);
});

test('missing settlement means no civil laws but preserves follower religious laws', () => {
    const religiousLaw = {
        id: 'religious-theft-law',
        name: 'Religious Theft Rule',
        domain: 'violence',
        crimeMapping: { crimeType: 'theft', isEnforced: true }
    };
    const harness = loadCrimeCommands({ religiousLaws: [religiousLaw] });
    harness.character.religionId = 'religion-1';

    const result = harness.commands.recordCrime('unsettled-location', {
        type: 'theft',
        perpetratorId: 'perpetrator-1'
    });

    assert.equal(result.success, true, result.reason);
    assert.equal(result.data.legalEvaluation.civil.length, 0);
    assert.equal(result.data.legalEvaluation.religious.length, 1);
    assert.equal(result.data.legalEvaluation.religious[0].law.id, religiousLaw.id);
});

test('existing settlement with unavailable civil law data fails explicitly', () => {
    const harness = loadCrimeCommands({
        settlement: { id: 'unsettled-location', governmentType: 'republic' },
        civilLaws: null
    });

    const result = harness.commands.recordCrime('unsettled-location', {
        type: 'theft',
        perpetratorId: 'perpetrator-1'
    });

    assert.equal(result.success, false);
    assert.match(result.reason, /Civil law data is unavailable for existing settlement/);
    assert.equal(harness.recorded.length, 0);
});
