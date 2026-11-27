================================================================================
STILL WATERS — SETTLEMENT AND CRIME MODULE AUDIT
================================================================================

Audit date: 2026-11-27
Scope: Settlement Manager integration and the Crime/Vendetta subsystem in
Currents-V05. This is a source review, not a browser-driven runtime test.

Existing subsystem documentation:
  - js/settlement/settlement-docs.txt
  - js/crime/crime-docs.txt

This addendum records the focused integration review and findings. It does
not replace either subsystem document.

1. ARCHITECTURE SUMMARY

Settlement data is owned by the Settlement domain. Its crime-rate query
(js/settlement/settlement-crime-queries.js) derives a rate from settlement
inputs; it does not own incident records.

Crime incidents and vendettas are owned by CrimeState
(js/crime/crime-state.js), with CrimeCommands orchestrating side effects and
persistence, CrimeLawIntegration evaluating legal consequences, and
CrimeQueries providing read-only statistics.

The Settlement Manager's crime tab
(js/tabs/settlement-crime-tab.js) is a presentation/integration layer. It
combines settlement crime-rate information with CrimeQueries incident and
vendetta lists, household membership, and modal entry points.

2. SETTLEMENT CRIME TAB BEHAVIOUR

- Incident list: reads crimes for the selected location only through
  CrimeQueries.getCrimesByLocation(locationId). It intentionally does not
  include incidents from child locations. This is documented in the tab's
  source comment and should be treated as a product-scope decision.
- Vendetta list: enumerates households at the selected settlement and its
  sublocations, then unions their unresolved vendettas by vendetta ID.
  This can show an internal feud or a feud between a local household and an
  outside household. The create-vendetta action is narrower: it receives
  only household IDs enumerated for the selected settlement.
- Household enumeration de-duplicates household IDs and sorts by name.
  If sublocation enumeration fails or returns no usable IDs, it falls back
  to the selected location only. This fallback may omit households in
  descendants; it avoids throwing but can produce an incomplete list.
- Vendetta lookup requests includeResolved:false. Resolved vendettas are
  therefore not shown in this tab.
- The tab delegates modal mutations and requests a tab refresh through its
  completion callback. It does not subscribe directly to SettlementState.

3. CRIME STATE INTEGRITY CHECKS

CrimeState.validateIntegrity() checks:
- crime record IDs and duplicate/index consistency;
- year and solved/solvedAt consistency;
- vendetta status and lifecycle timestamps;
- escalation threshold consistency;
- death-entry shape/year;
- references from vendettas to household IDs;
- consistency of derived crime and vendetta indexes.

The integrity check does not, in the reviewed implementation, validate every
crime's locationId, perpetratorId, or victimId against live records. It also
does not validate each vendetta death's character/household references.
These are potential audit-coverage gaps, not proof that stored data is
currently corrupt.

4. FINDINGS / RISKS

S1 — Settlement vendetta list can be incomplete when descendant lookup fails.
Severity: low / conditional.
The tab falls back to [locationId] if getAllSubLocationIds throws or yields
an empty/invalid result. If the settlement has descendants containing
households, the displayed vendetta union will omit those households.
Recommendation: surface a partial-data warning when the fallback is used,
or distinguish “no descendants” from “descendant query failed.”

C1 — Crime integrity validation omits several live-reference checks.
Severity: medium / data-audit coverage.
The validator checks vendetta household references, but does not check crime
location/perpetrator/victim references or vendetta death participant
references. Deleted characters or locations could therefore remain embedded
in crime history without this validator reporting them.
Recommendation: add reference checks that explicitly distinguish live
foreign keys from intentional historical snapshots. Do not blindly delete
historical records: crime/vendetta records preserve names and may be
narratively meaningful after a character or location is removed.

C2 — Settlement crime incidents are location-local, not subtree-wide.
Severity: informational / expected behaviour.
A settlement view does not aggregate incidents from child locations, unlike
its household-based vendetta union. This is intentional per source comments,
but may surprise users who interpret “settlement crime” as all subordinate
places.
Recommendation: retain the current behavior if intended; label the scope in
the UI. If changing it, aggregate descendant IDs and de-duplicate incident
IDs explicitly.

C3 — Crime-law integration distinguishes absent settlements from broken law data.
Severity: resolved at source level; runtime test execution pending.
Confirmed: SettlementLawQueries.getCivilLaws returns null when no settlement
record exists, while CrimeLawIntegration.getApplicableLaws previously
iterated civilLaws.length without a null guard. This caused recordCrime to
return a TypeError-derived failure for a valid location without a settlement.

Implemented policy:
- No SettlementState record for a valid location means there is no
  settlement-level civil jurisdiction, so CrimeLawIntegration uses an empty
  civil-law list. The crime can still be recorded.
- Character-specific follower religious laws remain applicable without a
  settlement record; settlement-wide theocratic law cannot apply without a
  settlement record.
- If a settlement record exists but its civil-law query returns null or a
  non-array value, evaluation fails explicitly. Broken law data is not
  silently reclassified as a lawless settlement.
- If the settlement-data query dependency itself is unavailable, evaluation
  fails explicitly rather than confusing a missing dependency with an absent
  settlement.

Regression coverage was added in tests/crime-settlement-law.test.js for
recording at a location without a settlement, preserving follower religious
laws, and rejecting null civil-law data for an existing settlement. The test
file has been added but has not been executed in this environment.

5. DATA-LIFECYCLE NOTES

- CrimeState owns canonical crime/vendetta arrays and indexes; callers should
  use CrimeCommands/CrimeState APIs rather than directly editing arrays.
- CrimeState mutation primitives mark data dirty; CrimeCommands owns workflow
  commit behavior, and CrimeCommands.persist() is the domain persistence
  boundary.
- Vendetta household IDs are referential fields. Household deletion must
  either block while referenced, explicitly detach/resolve references, or
  preserve an intentional historical representation. Leaving a dangling ID
  without a declared policy is not safe.
- Snapshot names (for example perpetratorName, victimName, household names)
  are intentionally historical and should not be refreshed from live data.
- The Settlement Manager's crime-rate calculation and the Crime subsystem's
  incident records are distinct concepts. Wiping or recalculating one must
  not silently erase the other.

6. VERIFICATION LIMITS

Reviewed source files include the Settlement Manager HTML, settlement crime
tab/helpers/bootstrap, settlement crime query, crime state/commands/queries,
vendetta compatibility shim, and the existing settlement/crime subsystem
documentation.

No browser interaction or automated test suite was run as part of this source review. The source-level regression tests now cover the no-settlement crime-recording policy and its failure boundary; they still need execution in the project's test environment. The other conditional risks above should be confirmed with populated-data tests using a settlement with nested locations, a missing descendant query, and deleted character/location references.
================================================================================
