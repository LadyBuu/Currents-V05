# Cross-domain transaction audit

**Scope:** static source audit of the transaction coordinator and every JavaScript file on the default branch. The scan covered 410 `.js` files and identified 16 production `CrossDomainTransaction.execute()` call sites. This is not a browser/runtime test report.

## Coordinator contract

`js/core/cross-domain-transaction.js`:

- Validates all participants before mutation.
- Runs participant preparation, then captures every participant snapshot before the first apply.
- Adds the currently executing participant to the rollback list before invoking its apply function, because apply may partially mutate and then fail.
- Rolls attempted participants back in reverse order.
- Runs optional persistence after all applies and before notifications. A failed persistence triggers rollback and a best-effort compensating save of restored state.
- Closes the active mutation window before invoking `afterCommit`.
- Treats `afterCommit` failures as notification failures. They do not undo a transaction whose data has already been persisted.

The last two points are important: an `afterCommit` callback must not require `CrossDomainTransaction.isActive()`, and a notification failure must be surfaced rather than misrepresented as a rollback.

## Production call-site inventory

| Area | Call sites | Snapshot / rollback scope | Persistence boundary |
|---|---:|---|---|
| Character creation | 2 | Canonical character collection and family edges; deferred family/religion effects are discarded on rollback | Deliberately caller-managed; character creation module documents persistence as out of scope |
| Character hard deletion | 1 | Full character collection, family edges, children records, household records, relationship records, and canonical enterprise records | Coordinator persistence callback |
| Location deletion | 1 | Government, religion, optional culture, character, household, settlement, and location stores | Coordinator persistence callback |
| Education annual learning | 1 | One student character and the relevant institution; deferred education, character, and role notifications | Per-student transaction is nested in an annual pipeline; the annual pipeline persists once. Single-institution processing explicitly does not persist |
| Education institution lifecycle | 1 | Institution state and character education fields | Coordinator persistence callback |
| Industry ownership / create / delete / lifecycle | 4 | Affected household records and enterprise records, with reverse-index restoration | Caller-managed by the IndustryCommands persistence contract |
| Industry annual processing | 1 | Enterprise and optional household records | Coordinator persistence callback by default; batch processing can opt out and save once after the batch |
| Household enterprise-index repair | 1 | Household enterprise indexes | Coordinator persistence callback |
| Industry owner succession | 1 | All affected enterprise records and optional household sale proceeds | Coordinator persistence callback |
| Role deletion | 1 | Role catalogue, relationship graph, and affected character profession assignments | Coordinator persistence callback |
| Character identity mutations | 2 | Target character record | Coordinator persistence callback |

The inventory distinguishes a transaction's in-memory rollback boundary from its persistence boundary. Character creation and ordinary Industry commands intentionally leave persistence to their documented caller/batch boundary; that is not evidence that the coordinator itself persisted those operations.

## Findings and changes

### Fixed: Household post-commit publishers rejected the coordinator's callback phase

The coordinator deliberately sets `isActive()` to false before calling `afterCommit`. However, HouseholdCommands' post-commit publisher methods required an active transaction:

- `commitTransactionUpdate`
- `commitTransactionEnterpriseIndexRepair`
- `commitTransactionEnterpriseOwnership`
- `commitTransactionLocationCleanup`

Industry and location participants invoked these methods from `afterCommit`, so the guard rejected the very phase in which they were meant to publish. Some callers ignored the returned failure; others converted it into a notification error. The active-window guards were removed from these post-commit-only publishers. Deferred mutation APIs still require an active transaction.

### Fixed: Location deletion did not flush or discard deferred character notifications

Character cleanup queues state changes while the transaction is active. The old location `afterCommit` called `notifyTransactionUpdate`, which itself required an active transaction, and ignored its failure. The queued changes were therefore not flushed after a successful deletion. The rollback path also left the queue intact.

Location deletion now flushes CharacterState's deferred changes after commit and discards them after rollback. It also discards deferred Household side effects and Religion command events on rollback. Household location cleanup publication now checks and reports its post-commit result.

### Verified: Existing participant snapshots cover the current cleanup implementations

- Character hard deletion snapshots the full canonical character collection, so RankIssues' edits to other characters' rank assignments are included. RelationshipState's full snapshot includes the apprenticeship relationship edges removed by ApprenticeshipCommands and the registered RelationshipIntegrations delete handler.
- Location deletion's Government and Location adapters retain the pre-apply arrays; their cleanup primitives build replacement arrays rather than mutating those original arrays. Religion cleanup creates replacement arrays and cloned changed records. Culture snapshots deep-clone its canonical records. Settlement snapshots its keyed store. Character and Household snapshots cover their canonical collections and rebuild their derived indexes on restore.
- Role deletion snapshots the affected character profession assignments as well as the relationship graph and role catalogue.
- Education and Industry participants use domain-specific snapshot/restore adapters and defer their notifications until after the coordinator has completed the data phase.

The hard-delete handler registry currently has one production registration, in RelationshipIntegrations, and its mutations are covered by the RelationshipState snapshot. The registry still accepts arbitrary functions without a declared snapshot contract. Any future handler that mutates another domain must either be added to the composite snapshot/rollback boundary or be rejected; the current registration signature does not enforce that automatically.

## Tests and remaining limits

`tests/cross-domain-transaction.test.js` covers partial apply failure, reverse rollback order, rollback failures, persistence failure and compensating persistence, post-commit exceptions, participant-count combinations, and the fact that `afterCommit` runs after the active window closes.

The tests have not been executed in this environment. No browser-level storage failure injection, reload verification, or end-to-end domain mutation tests were run. Therefore this closes the source-level caller audit and the concrete post-commit defects found in it, but it does not prove storage durability under real browser failures.
