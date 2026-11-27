# Overall systems audit

Audit date: 2026-11-27  
Repository: `LadyBuu/Currents-V05`  
Branch reviewed: `main`

## Scope and confidence

This is a repository-wide **static architecture and risk audit**, not a claim that every function has been exhaustively tested. I enumerated the repository tree (498 entries), reviewed the canonical load order and core storage/integrity/transaction/maintenance modules, and inspected the diagnostics wipe/audit implementation plus the documented domain architecture and selected integration paths. The repository contains domain systems for characters/family, relationships, households/residences, locations, settlements/government, culture/religion, roles/ranks/apprenticeship/education/industry, crime/vendetta, disasters/events, names, selectors, and diagnostics.

No browser session, populated-world fixture, or automated test suite was run. Findings below distinguish directly observed behavior from risks requiring runtime confirmation. Existing domain documentation is substantial, but documentation is not proof of runtime correctness.

## Executive summary

The project has a deliberate layered architecture and meaningful safeguards: canonical state modules, command boundaries, explicit persistence, integrity/repair separation, a cross-domain transaction coordinator, and domain documentation. The largest system-wide risk is **referential integrity during destructive operations**: the wipe tool explicitly retains dependent records for several scopes, while the general integrity system does not cover every domain edge. A second risk is **failure recovery consistency**: some operations snapshot and restore carefully, but the diagnostics year setter does not restore in-memory state when persistence fails.

## Findings

### P1 — Changing the world year can leave memory and storage disagreeing after save failure
**Location:** `js/diagnostics/data-wipe.js`, year setter.

The setter mutates `masterData.data.currentYear`, calls `markDataDirty()`, then `saveMasterData()`. If save returns false, it reports failure but leaves the changed year in memory. The UI therefore says the change failed while the live world may already be using the new year; a later save can persist it unexpectedly.

**Recommended fix:** snapshot the old year, restore it on failed save, invalidate relevant caches if year-dependent, and ensure the dirty state is handled consistently. Add a test for storage quota/write failure.

### P1 — Several wipe operations knowingly retain records that may point to deleted entities
**Location:** `js/diagnostics/data-wipe.js`, wipe configuration.

The current descriptions explicitly retain:
- location types and records referring to locations when places are wiped;
- place/location types when settlements are wiped;
- government type definitions when government records are wiped;
- role category definitions when roles are wiped;
- historical event, crime, and vendetta records when characters are wiped;
- character progress when schools are wiped;
- enterprise type definitions when industries are wiped.

Some retained references may be intentional history or reusable definitions. The current wipe configuration alone does not establish that each is safe, and the general integrity audit does not prove all such references are valid. In particular, character deletion retaining crime/vendetta history needs a declared policy for live IDs versus historical snapshots.

**Recommended fix:** define per-field reference policy (live foreign key, historical snapshot, reusable definition, or intentionally detached). For each wipe, either block on live dependents, clear/reassign them, or preserve them as explicitly historical. Add post-wipe integrity validation before save and report retained dependencies to the user.

### P1 — General integrity auditing has known domain coverage gaps
**Location:** `js/core/integrity.js` and domain state validators.

The core integrity module documents that family parent-child edge integrity and genealogy cycles are not audited there. The crime validator checks vendetta household references but omits some crime location/perpetrator/victim references and vendetta death participant references. Other domains may have their own validators, but there is no single demonstrated end-to-end cross-domain audit covering all canonical references.

**Recommended fix:** build a reference inventory per domain and have the diagnostics audit report coverage, including which reference classes are intentionally historical. Add family-edge dangling-parent and cycle checks in the family domain.

### P2 — Failed wipe rollback does not fully restore the pre-operation persistence state
**Location:** `js/diagnostics/data-wipe.js`, catch path.

Wipes snapshot configured fields (and additional household-related fields) and restore those fields on failure. After restoring, the catch path calls `markDataDirty()`; that schedules another save of the restored in-memory data, but the function does not verify that this restoration save becomes durable. The UI reports the wipe failed, but if the original save partially succeeded or the restore save also fails, storage and memory can diverge.

**Recommended fix:** use a storage-level transactional write/rollback contract or explicitly report “in-memory rollback completed; durable restoration could not be confirmed.” Test failed writes and reload afterward. The existing cross-domain transaction service is synchronous and only as strong as participant snapshots/rollback; it is not automatically a replacement for durable storage atomicity.

### P2 — The diagnostics “data audit” is a small completeness checklist, not a global integrity audit
**Location:** `js/diagnostics/data-audit.js`.

It currently checks five conditions: characters with no parents, location, birth year, or gender, and governments with no leader. It does not scan general dangling IDs, duplicate IDs, hierarchy cycles, household/residence consistency, role/rank assignments, education references, crime references, or cross-domain wipe consequences. Its status line counts characters and places, while government checks also run against places, which may be confusing to interpret as a comprehensive audit.

**Recommended fix:** label it as a completeness checklist or expand it into separate categorized validators with severity, affected record, reference target, and safe repair availability.

### P2 — Cross-tab storage coordination prevents some overwrites but does not guarantee conflict-free editing
**Location:** `js/core/storage.js` (documented contract).

The storage contract explicitly says cross-tab coordination does not silently overwrite dirty local changes, but also does not prevent a later overwrite. This is a known limitation, not a defect hidden by the code. Concurrent edits in two tabs can still require user-facing conflict handling or a reload/merge policy.

**Recommended fix:** surface a conflict state when remote data changes while local data is dirty; require explicit reload/keep-local resolution, or introduce versioned compare-and-swap semantics.

### P2 — Transaction atomicity is conditional, not universal
**Location:** `js/core/cross-domain-transaction.js`.

The coordinator is synchronous, rolls participants back in reverse order, and reports rollback failures. Its own contract correctly states that atomicity depends on each participant snapshotting canonical data, indexes, and caches, and that external side effects cannot be rolled back. Audit all callers to confirm they honor this contract and defer irreversible effects until after commit.

**Recommended fix:** add tests for partial apply failure, rollback failure, persistence failure, and after-commit exceptions for every transaction participant combination.

### P3 — Settlement crime reporting uses different geographic scopes for incidents and vendettas
**Location:** `js/tabs/settlement-crime-tab.js`.

Incidents are queried for the selected location only; vendettas are unioned across households in the settlement and sublocations. This is documented behavior, but the mixed scope can mislead users reading the tab as a settlement-wide report.

**Recommended fix:** label each scope in the UI or make both views consistently location-only or subtree-wide, as product intent dictates.

### P3 — Settlement vendetta display can degrade to a partial result without clearly signaling it
**Location:** `js/tabs/settlement-crime-tab.js`.

If descendant-location lookup fails or returns no usable IDs, the code falls back to the selected location. That avoids a crash but may omit households in descendants. Distinguish “there are no descendants” from “the lookup failed,” and indicate partial results.

## Positive controls observed

- Storage has explicit load/save/import failure contracts and does not replace valid in-memory data on corrupt load.
- Save success is defined by an actual successful write; save wrappers can throw.
- The relationship domain is pulled into the canonical save blob at save time, with a corresponding reload path.
- Integrity finders are documented as pure; repair orchestration and persistence are separated.
- Maintenance distinguishes “scheduler ran” from “audit cycle succeeded,” and does not claim that marking dirty means durable save.
- Cross-domain transactions validate participants before mutation, include a participant in rollback before applying it, and report rollback failure rather than claiming false atomicity.
- Crime and settlement domains have explicit ownership boundaries and detailed documentation.

## Recommended order of work

1. Fix the year setter's failed-save rollback.
2. Define and implement wipe reference policies; run a post-wipe integrity check before saving.
3. Expand diagnostics beyond the five completeness checks, with domain-owned validators and explicit coverage.
4. Close integrity gaps in family edges and crime/vendetta references, preserving historical snapshots deliberately.
5. Add automated failure-path tests for storage, wipes, transactions, and cross-domain deletion.
6. Clarify settlement crime geographic scope and partial-result signaling.
7. Add a CI smoke check for script load order and missing required globals across each manager page.

## Coverage inventory

The repository tree includes the following system families, all included in the architecture inventory; not every function in every file was individually tested in this pass:

- Core/storage/schema/accessors/validation/integrity/maintenance/transactions
- Character identity, lifecycle, family, children, mortality, creation and deletion
- Relationships: friendship, romance, affairs, rivalry, jealousy, professional relationships and matchmaking
- Households, residences, assignment, staff, servants and household economy
- Locations, hierarchy and movement
- Settlements, government, law, economy, education, employment, features, prosperity, religion, crime and roles
- Government and government assignments/economy/laws
- Culture and culture generation/validation
- Religion, laws, inheritance and places of worship
- Roles, ranks and apprenticeship/professional knowledge
- Education, learning, history, annual processing and institution records
- Industry, enterprise types, economics, migration and annual processing
- Crime, vendettas and law integration
- Disasters and events/timeline/census/annual processing
- Names, selectors, matchmaker, UI managers and diagnostics

A true exhaustive audit requires executable tests with representative populated data and failure injection. This report is the static review baseline, not a certification that every listed system is defect-free.


## Follow-up transaction audit

The cross-domain transaction caller audit, including all 16 production call sites, the post-commit notification fixes, and remaining runtime-test limitations, is documented in [Cross-domain transaction audit](cross-domain-transaction-audit.md).

## Follow-up CSS and visual consistency audit

The presentation-layer review, including theme loading, duplicated manager shell rules, JavaScript-owned styling, generated class names, and the recommended standardisation sequence, is documented in [CSS and visual consistency audit](css-styling-audit.md).


## Re-audit comparison — 2026-11-27

Compared this baseline with the current source and the focused settlement/crime audit. The previously listed settlement crime-law null-data hazard is **fixed at source level**: `CrimeLawIntegration` treats a valid location without a settlement as having no settlement-level civil laws, while malformed law data for an existing settlement fails explicitly. Regression cases are present in `tests/crime-settlement-law.test.js`; execution remains unverified. The obsolete finding has been removed from the open findings and work order.

The validation source also now accepts lowercase hyphens in variable keys (`VARIABLE_KEY_REGEX: /^[a-z0-9_-]+$/`), resolving the reported `k-*` key rejection. This was checked against source; no runtime validation was performed.

No other prior open finding was removed: the current inspection did not establish that the remaining data-wipe, integrity-coverage, storage-conflict, transaction-test, or settlement-reporting items are fixed. The CSS audit and maintenance backlog remain source-review baselines; their reported items were not individually revalidated in this pass. This was a targeted re-audit, not a fresh exhaustive scan of every module.
