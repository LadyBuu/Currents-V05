'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const bootstrap = fs.readFileSync(
    path.join(root, 'js/tabs/government-manager-bootstrap.js'), 'utf8'
);

test('Government Manager preserves the complete expected tab set', () => {
    const expected = ['details', 'departments', 'history', 'laws', 'economy'];
    const match = bootstrap.match(/var KNOWN_TAB_IDS = \[([\s\S]*?)\];/);
    assert.ok(match, 'Government bootstrap must declare KNOWN_TAB_IDS');
    const actual = Array.from(match[1].matchAll(/'([^']+)'/g), item => item[1]);
    assert.deepEqual(actual, expected, 'Government tab IDs changed or disappeared');

    const registrations = {
        details: 'government-details-tab.js',
        departments: 'government-departments-tab.js',
        history: 'government-history-tab.js',
        laws: 'government-civil-laws-tab.js',
        economy: 'government-economy-tab.js'
    };
    for (const [tabId, filename] of Object.entries(registrations)) {
        const source = fs.readFileSync(path.join(root, 'js/tabs', filename), 'utf8');
        assert.match(source, /var SCOPE\s*=\s*['"]government['"]/,
            `${filename} must register in the Government scope`);
        assert.match(source, new RegExp(`var TAB_ID\\s*=\\s*['"]${tabId}['"]`),
            `${filename} must declare the expected tab ID`);
        assert.match(source, /\b(?:TM|TabManager)\.register\(SCOPE,\s*TAB_ID,/,
            `${filename} must register its renderer with TabManager`);
    }
});
