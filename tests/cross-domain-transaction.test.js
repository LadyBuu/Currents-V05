'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadCoordinator() {
    const source = fs.readFileSync(
        path.join(__dirname, '../js/core/cross-domain-transaction.js'),
        'utf8'
    );
    const window = {};
    const context = { window, module: { exports: {} }, Object };
    vm.runInNewContext(source, context, { filename: 'cross-domain-transaction.js' });
    return window.CrossDomainTransaction || context.module.exports;
}

function participant(name, log, options = {}) {
    let value = 0;
    return {
        name,
        prepare: options.prepare,
        snapshot() { log.push(name + ':snapshot'); return value; },
        apply() {
            log.push(name + ':apply');
            value = 1;
            if (options.applyThrows) throw new Error(name + ' apply failed');
            if (options.applyRejects) return { success: false, reason: name + ' rejected' };
            return true;
        },
        rollback(snapshot) {
            log.push(name + ':rollback');
            value = snapshot;
            if (options.rollbackThrows) throw new Error(name + ' rollback failed');
            if (options.rollbackRejects) return { success: false, reason: name + ' rollback rejected' };
            return true;
        },
        afterCommit() {
            log.push(name + ':afterCommit');
            if (options.afterCommitThrows) throw new Error(name + ' notification failed');
        },
        get value() { return value; }
    };
}

test('partial apply exception rolls back attempted participants in reverse order', () => {
    const tx = loadCoordinator();
    const log = [];
    const a = participant('A', log);
    const b = participant('B', log, { applyThrows: true });
    const result = tx.execute({ participants: [a, b] });
    assert.equal(result.code, 'TRANSACTION_ROLLED_BACK');
    assert.equal(result.rolledBack, true);
    assert.deepEqual(log.filter(x => x.endsWith(':rollback')), ['B:rollback', 'A:rollback']);
    assert.equal(a.value, 0);
    assert.equal(b.value, 0);
});

test('rollback failure is surfaced and does not claim rollback success', () => {
    const tx = loadCoordinator();
    const log = [];
    const a = participant('A', log, { rollbackThrows: true });
    const b = participant('B', log, { applyThrows: true });
    const result = tx.execute({ participants: [a, b] });
    assert.equal(result.code, 'ROLLBACK_FAILED');
    assert.equal(result.rolledBack, false);
    assert.equal(result.rollbackErrors[0].participant, 'A');
});

test('persistence failure rolls back participants and attempts compensating persistence', () => {
    const tx = loadCoordinator();
    const log = [];
    const a = participant('A', log);
    let saves = 0;
    const result = tx.execute({
        participants: [a],
        persist() { saves++; return saves === 1 ? false : true; }
    });
    assert.equal(result.code, 'TRANSACTION_ROLLED_BACK');
    assert.equal(result.rolledBack, true);
    assert.equal(saves, 2);
    assert.equal(a.value, 0);
});

test('compensating persistence failure is reported as rollback failure', () => {
    const tx = loadCoordinator();
    const log = [];
    const a = participant('A', log);
    let saves = 0;
    const result = tx.execute({
        participants: [a],
        persist() { saves++; return false; }
    });
    assert.equal(result.code, 'ROLLBACK_FAILED');
    assert.equal(result.rollbackErrors[0].participant, 'persistence');
});

test('after-commit exceptions are reported without undoing committed state', () => {
    const tx = loadCoordinator();
    const log = [];
    const a = participant('A', log, { afterCommitThrows: true });
    const b = participant('B', log);
    const result = tx.execute({ participants: [a, b], persist() { return true; } });
    assert.equal(result.code, 'COMMITTED');
    assert.equal(result.persisted, true);
    assert.equal(result.notificationErrors.length, 1);
    assert.equal(result.notificationErrors[0].participant, 'A');
    assert.equal(a.value, 1);
    assert.equal(b.value, 1);
    assert.equal(log.some(x => x.endsWith(':rollback')), false);
});

test('afterCommit runs after the active mutation window closes', () => {
    const tx = loadCoordinator();
    const log = [];
    const p = participant('A', log);
    let activeDuringAfterCommit = null;
    p.afterCommit = () => {
        activeDuringAfterCommit = tx.isActive();
        log.push('A:afterCommit');
    };

    const result = tx.execute({
        participants: [p],
        persist() { return true; }
    });

    assert.equal(result.success, true);
    assert.equal(activeDuringAfterCommit, false);
    assert.equal(log.includes('A:afterCommit'), true);
});

test('failure cases are exercised across one-, two-, and three-participant combinations', () => {
    for (const count of [1, 2, 3]) {
        const tx = loadCoordinator();
        const log = [];
        const participants = Array.from({ length: count }, (_, i) =>
            participant('P' + i, log, { applyThrows: i === count - 1 })
        );
        const result = tx.execute({ participants });
        assert.equal(result.code, 'TRANSACTION_ROLLED_BACK', 'participant count ' + count);
        assert.equal(result.rolledBack, true);
        assert.equal(log.filter(x => x.endsWith(':rollback')).length, count);
    }
});
