#!/usr/bin/env node
/**
 * fix-year-helpers.js
 * 
 * Codemod: replace duplicated `_getCurrentYear` and `_calculateAge` fallback
 * definitions across the codebase with delegating versions.
 * 
 * Usage:
 *   node fix-year-helpers.js           # dry run — shows what would change
 *   node fix-year-helpers.js --apply   # write changes to disk
 * 
 * Scope: all .js files under js/ recursively.
 * Skips: node_modules, trash/, no touch/, js/core/time.js (canonical owner).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const JS_DIR = path.join(ROOT, 'js');
const APPLY = process.argv.includes('--apply');

// Files to skip — canonical owner + archived copies
const SKIP_PATHS = [
    path.normalize('js/core/time.js'),
    path.normalize('js/core/family-accessors.js'), // handle manually (see notes)
    path.normalize('js/core/query-helpers.js'),    // handle manually
    path.normalize('js/core/modals-core.js'),      // handle manually
    path.normalize('js/core/accessors.js'),        // handle manually
];

function shouldSkip(filePath) {
    const rel = path.normalize(path.relative(ROOT, filePath));
    if (SKIP_PATHS.some(s => rel === s)) return true;
    if (rel.includes('node_modules')) return true;
    if (rel.includes('trash')) return true;
    if (rel.includes('no touch')) return true;
    if (rel.includes('.min.js')) return true;
    return false;
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'trash' || entry.name === 'no touch') continue;
            walk(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            if (!shouldSkip(full)) out.push(full);
        }
    }
    return out;
}

/**
 * Match a function definition that:
 *   - is named _getCurrentYear (with or without leading underscores)
 *   - has an empty parameter list
 *   - contains `return 1250` somewhere in its body
 * 
 * Uses brace-matching rather than regex-only, because JS bodies can contain
 * nested braces (though these specific functions rarely do).
 */
function findFunctionByContent(source, namePattern, requiredContent) {
    const matches = [];
    const re = new RegExp(`function\\s+${namePattern}\\s*\\([^)]*\\)\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(source)) !== null) {
        const start = m.index;
        const bodyStart = m.index + m[0].length - 1; // position of '{'
        const bodyEnd = matchBrace(source, bodyStart);
        if (bodyEnd === -1) continue;
        const body = source.slice(bodyStart, bodyEnd + 1);
        if (body.includes(requiredContent)) {
            matches.push({ start, end: bodyEnd + 1, body });
        }
    }
    return matches;
}

function matchBrace(source, openIndex) {
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = openIndex; i < source.length; i++) {
        const c = source[i];
        const next = source[i + 1];

        if (inLineComment) {
            if (c === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (c === '*' && next === '/') { inBlockComment = false; i++; }
            continue;
        }
        if (inString) {
            if (c === '\\') { i++; continue; }
            if (c === stringChar) inString = false;
            continue;
        }
        // detect string open
        if (c === '"' || c === "'" || c === '`') {
            inString = true;
            stringChar = c;
            continue;
        }
        if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
        if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }

        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

const DELEGATE_GET_CURRENT_YEAR = `function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}`;

const DELEGATE_CALCULATE_AGE = `function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}`;

function processFile(filePath) {
    let source = fs.readFileSync(filePath, 'utf8');
    const original = source;
    const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const changes = [];

    // --- _getCurrentYear replacements ---
    // Match `_getCurrentYear`, `__getCurrentYear`, `getCurrentYearLocal`, etc.
    // We're conservative: only match names starting with underscore.
    const currentYearMatches = findFunctionByContent(source, '_+getCurrentYear', 'return 1250');
    if (currentYearMatches.length > 0) {
        // Replace from the last match backward to avoid index shifts
        for (let i = currentYearMatches.length - 1; i >= 0; i--) {
            const m = currentYearMatches[i];
            source = source.slice(0, m.start) + DELEGATE_GET_CURRENT_YEAR + source.slice(m.end);
        }
        changes.push(`${currentYearMatches.length}× _getCurrentYear`);
    }

    // --- _calculateAge replacements ---
    const calcAgeMatches = findFunctionByContent(source, '_+calculateAge', 'return 0');
    if (calcAgeMatches.length > 0) {
        for (let i = calcAgeMatches.length - 1; i >= 0; i--) {
            const m = calcAgeMatches[i];
            source = source.slice(0, m.start) + DELEGATE_CALCULATE_AGE + source.slice(m.end);
        }
        changes.push(`${calcAgeMatches.length}× _calculateAge`);
    }

    if (source !== original) {
        if (APPLY) fs.writeFileSync(filePath, source, 'utf8');
        return { rel, changes };
    }
    return null;
}

// --- Main ---
const files = walk(JS_DIR);
console.log(`Scanning ${files.length} .js files under js/ ...\n`);
console.log(APPLY ? 'MODE: APPLY (writing changes)\n' : 'MODE: DRY RUN (pass --apply to write)\n');

let touchedFiles = 0;
let totalGetYear = 0;
let totalCalcAge = 0;

for (const f of files) {
    try {
        const result = processFile(f);
        if (result) {
            touchedFiles++;
            console.log(`  ${result.rel}`);
            for (const c of result.changes) console.log(`      → ${c}`);
            for (const c of result.changes) {
                if (c.includes('_getCurrentYear')) totalGetYear += parseInt(c, 10);
                if (c.includes('_calculateAge')) totalCalcAge += parseInt(c, 10);
            }
        }
    } catch (e) {
        console.error(`  ! ${path.relative(ROOT, f)}: ${e.message}`);
    }
}

console.log(`\n--- Summary ---`);
console.log(`Files touched:           ${touchedFiles}`);
console.log(`_getCurrentYear replaced: ${totalGetYear}`);
console.log(`_calculateAge replaced:   ${totalCalcAge}`);
if (!APPLY) {
    console.log(`\nNo files were written. Re-run with --apply to apply.`);
}