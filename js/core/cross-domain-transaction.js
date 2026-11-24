/**
 * =============================================================================
 * STILL WATERS - CROSS-DOMAIN TRANSACTIONS
 * =============================================================================
 *
 * Coordinates synchronous mutations across domain state modules.
 *
 * A participant must provide:
 *   name: unique domain name
 *   prepare(context): optional validation; MUST NOT mutate
 *   snapshot(context): return an exact restorable snapshot; MUST NOT mutate
 *   apply(context): perform the staged domain mutation
 *   rollback(snapshot, context): restore canonical data, indexes and local caches
 *   afterCommit(context): optional event publication / notifications only
 *
 * Transaction-level options:
 *   participants: ordered participant array
 *   context: shared operation context
 *   persist(): optional single durable save after all applies
 *
 * Important limits:
 *   - Synchronous only. Async work, UI prompts and network operations belong
 *     outside the transaction.
 *   - A participant's apply may partially mutate before throwing. It is
 *     therefore included in rollback before apply is invoked.
 *   - Rollback runs in reverse participant order.
 *   - afterCommit runs only after every apply and persistence succeed.
 *   - A rollback failure is surfaced as ROLLBACK_FAILED. The service never
 *     claims atomicity when a participant cannot restore its snapshot.
 *   - Atomicity is only as strong as each participant's snapshot/rollback.
 *     Participants must include canonical records, indexes and relevant
 *     in-memory caches. External side effects cannot be rolled back here.
 *   - The service does not call markDataDirty itself. Participants should
 *     stage changes without publishing events; persistence is coordinated
 *     once through options.persist.
 *
 * =============================================================================
 */
(function () {
    'use strict';

    var _active = false;
    var _sequence = 0;

    function _result(success, code, details) {
        return Object.assign({
            success: success,
            code: code
        }, details || {});
    }

    function _errorMessage(error, fallback) {
        return error && error.message ? error.message : fallback;
    }

    function _validate(options) {
        if (!options || typeof options !== 'object') {
            return 'Transaction options are required.';
        }
        if (!Array.isArray(options.participants) ||
            options.participants.length === 0) {
            return 'At least one transaction participant is required.';
        }

        var names = Object.create(null);
        for (var i = 0; i < options.participants.length; i++) {
            var p = options.participants[i];
            if (!p || typeof p.name !== 'string' || !p.name.trim()) {
                return 'Every participant requires a non-empty name.';
            }
            if (names[p.name]) {
                return 'Duplicate transaction participant: ' + p.name;
            }
            names[p.name] = true;
            if (typeof p.snapshot !== 'function' ||
                typeof p.apply !== 'function' ||
                typeof p.rollback !== 'function') {
                return 'Participant "' + p.name +
                    '" requires snapshot, apply and rollback functions.';
            }
            if (p.prepare !== undefined && typeof p.prepare !== 'function') {
                return 'Participant "' + p.name + '" has an invalid prepare function.';
            }
            if (p.afterCommit !== undefined &&
                typeof p.afterCommit !== 'function') {
                return 'Participant "' + p.name +
                    '" has an invalid afterCommit function.';
            }
        }

        if (options.persist !== undefined &&
            typeof options.persist !== 'function') {
            return 'persist must be a function.';
        }
        return null;
    }

    function execute(options) {
        var invalid = _validate(options);
        if (invalid) return _result(false, 'INVALID_TRANSACTION', { reason: invalid });
        if (_active) {
            return _result(false, 'TRANSACTION_IN_PROGRESS', {
                reason: 'Nested or concurrent transactions are not supported.'
            });
        }

        _active = true;
        var transactionId = options.id ||
            ('cross-domain-' + (++_sequence));
        var context = options.context || {};
        var participants = options.participants;
        var snapshots = [];
        var attempted = [];
        var rollbackErrors = [];
        var failure = null;
        var persisted = false;
        var persistAttempted = false;

        try {
            // Validate every participant before taking snapshots or mutating.
            for (var i = 0; i < participants.length; i++) {
                if (participants[i].prepare) {
                    var prepared = participants[i].prepare(context);
                    if (prepared === false ||
                        (prepared && prepared.success === false)) {
                        return _result(false, 'PREPARATION_FAILED', {
                            transactionId: transactionId,
                            participant: participants[i].name,
                            reason: prepared && prepared.reason
                                ? prepared.reason
                                : 'Participant preparation rejected the transaction.'
                        });
                    }
                }
            }

            // Capture all snapshots before the first mutation.
            for (var j = 0; j < participants.length; j++) {
                snapshots.push(participants[j].snapshot(context));
            }

            // Include the currently executing participant before calling apply:
            // apply is allowed to mutate and then throw.
            for (var k = 0; k < participants.length; k++) {
                attempted.push(k);
                var applied = participants[k].apply(context);
                if (applied === false ||
                    (applied && applied.success === false)) {
                    failure = {
                        participant: participants[k].name,
                        reason: applied && applied.reason
                            ? applied.reason
                            : 'Participant apply rejected the transaction.'
                    };
                    break;
                }
            }

            if (!failure && options.persist) {
                persistAttempted = true;
                var saveResult = options.persist(context);
                if (saveResult !== true &&
                    !(saveResult && saveResult.success === true)) {
                    failure = {
                        participant: 'persistence',
                        reason: saveResult && saveResult.reason
                            ? saveResult.reason
                            : 'Transaction persistence failed.'
                    };
                } else {
                    persisted = true;
                }
            }

            if (failure) {
                for (var r = attempted.length - 1; r >= 0; r--) {
                    var index = attempted[r];
                    try {
                        var restored = participants[index].rollback(
                            snapshots[index], context
                        );
                        if (restored === false ||
                            (restored && restored.success === false)) {
                            rollbackErrors.push({
                                participant: participants[index].name,
                                reason: restored && restored.reason
                                    ? restored.reason
                                    : 'Rollback rejected.'
                            });
                        }
                    } catch (rollbackError) {
                        rollbackErrors.push({
                            participant: participants[index].name,
                            reason: _errorMessage(rollbackError, 'Rollback threw.')
                        });
                    }
                }

                // If a durable save was attempted and failed, persist the
                // restored in-memory state as a best-effort compensation.
                if (persistAttempted && !persisted) {
                    try {
                        var compensation = options.persist(context);
                        if (compensation !== true &&
                            !(compensation && compensation.success === true)) {
                            rollbackErrors.push({
                                participant: 'persistence',
                                reason: compensation && compensation.reason
                                    ? compensation.reason
                                    : 'Could not persist restored state.'
                            });
                        }
                    } catch (compensationError) {
                        rollbackErrors.push({
                            participant: 'persistence',
                            reason: _errorMessage(
                                compensationError,
                                'Could not persist restored state.'
                            )
                        });
                    }
                }

                return _result(false,
                    rollbackErrors.length ? 'ROLLBACK_FAILED' : 'TRANSACTION_ROLLED_BACK', {
                        transactionId: transactionId,
                        failedParticipant: failure.participant,
                        reason: failure.reason,
                        rolledBack: rollbackErrors.length === 0,
                        rollbackErrors: rollbackErrors
                    });
            }

            // The transaction is fully committed once persistence succeeds.
            // Close the active window before publishing notifications: listeners
            // may synchronously rebuild state and re-render UI, and must observe
            // the committed state as an ordinary post-transaction read.
            _active = false;

            var notificationErrors = [];
            for (var n = 0; n < participants.length; n++) {
                if (!participants[n].afterCommit) continue;
                try {
                    participants[n].afterCommit(context);
                } catch (notificationError) {
                    notificationErrors.push({
                        participant: participants[n].name,
                        reason: _errorMessage(
                            notificationError,
                            'Post-commit notification failed.'
                        )
                    });
                }
            }

            return _result(true, 'COMMITTED', {
                transactionId: transactionId,
                participants: participants.map(function (p) { return p.name; }),
                persisted: persisted,
                notificationErrors: notificationErrors
            });
        } catch (error) {
            // Exceptions during prepare/snapshot occur before mutation. An
            // exception during apply is caught here and rolled back below.
            if (attempted.length === 0) {
                return _result(false, 'TRANSACTION_SETUP_FAILED', {
                    transactionId: transactionId,
                    reason: _errorMessage(error, 'Transaction setup failed.')
                });
            }

            for (var q = attempted.length - 1; q >= 0; q--) {
                var rollbackIndex = attempted[q];
                try {
                    var rollbackResult = participants[rollbackIndex].rollback(
                        snapshots[rollbackIndex], context
                    );
                    if (rollbackResult === false ||
                        (rollbackResult && rollbackResult.success === false)) {
                        rollbackErrors.push({
                            participant: participants[rollbackIndex].name,
                            reason: rollbackResult && rollbackResult.reason
                                ? rollbackResult.reason
                                : 'Rollback rejected.'
                        });
                    }
                } catch (rollbackException) {
                    rollbackErrors.push({
                        participant: participants[rollbackIndex].name,
                        reason: _errorMessage(rollbackException, 'Rollback threw.')
                    });
                }
            }

            if (persistAttempted && !persisted) {
                try {
                    var exceptionCompensation = options.persist(context);
                    if (exceptionCompensation !== true &&
                        !(exceptionCompensation &&
                            exceptionCompensation.success === true)) {
                        rollbackErrors.push({
                            participant: 'persistence',
                            reason: exceptionCompensation && exceptionCompensation.reason
                                ? exceptionCompensation.reason
                                : 'Could not persist restored state.'
                        });
                    }
                } catch (exceptionCompensationError) {
                    rollbackErrors.push({
                        participant: 'persistence',
                        reason: _errorMessage(
                            exceptionCompensationError,
                            'Could not persist restored state.'
                        )
                    });
                }
            }

            return _result(false,
                rollbackErrors.length ? 'ROLLBACK_FAILED' : 'TRANSACTION_ROLLED_BACK', {
                    transactionId: transactionId,
                    reason: _errorMessage(error, 'Transaction failed.'),
                    rolledBack: rollbackErrors.length === 0,
                    rollbackErrors: rollbackErrors
                });
        } finally {
            _active = false;
        }
    }

    window.CrossDomainTransaction = Object.freeze({
        execute: execute,
        isActive: function () { return _active; }
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrossDomainTransaction;
    }
})();
