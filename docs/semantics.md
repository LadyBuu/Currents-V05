# Semantic Rules

This document defines the project-wide semantic conventions used by the Still Waters codebase.

These rules apply across core, domain, state, persistence, query, and UI modules. Individual modules may define additional domain-specific rules, but they must not contradict these conventions.

## 1. Value Semantics

`null` and `undefined` mean that a value is missing or unavailable.

The following are legitimate values and must never be treated as missing merely because they are falsy:

* `0`
* `''`
* `false`

Do not use `||` as a defaulting mechanism when the left-hand value may legitimately be `0`, `''`, or `false`.

Use explicit `null`/`undefined` checks or the nullish coalescing operator (`??`) where appropriate.

For example:

```js
const year = value ?? DEFAULT_YEAR;
```

not:

```js
const year = value || DEFAULT_YEAR;
```

unless the domain explicitly defines all falsy values as invalid.

Empty arrays and empty objects are valid values unless the relevant domain explicitly defines them as invalid.

## 2. Temporal Semantics

Years are integer values within the configured `MIN_YEAR` and `MAX_YEAR` range.

Year `0` is valid.

Negative years are valid when permitted by `MIN_YEAR`.

Fractional years are invalid.

A missing year is represented by `null` or `undefined`, not by `0`.

Temporal calculations must distinguish between a legitimate zero result and an impossible or unavailable result.

For example:

* Age `0` means a person is legitimately zero years old.
* Age `null` means the requested age cannot be calculated.
* A duration of `0` means the duration is legitimately zero.
* `null` means the duration is invalid, impossible, or unavailable.

## 3. Impossible Chronology

Chronologically impossible calculations return `null`, not `0`.

Examples include:

* Calculating a person's age before their birth.
* A succession occurring before the successor's birth.
* A reign ending before it begins.
* A child being born before a parent.
* Any other calculation where the requested temporal relationship cannot exist under the domain rules.

`0` must remain available to represent a real zero-length or zero-value result.

Callers must not reinterpret `null` as `0`.

## 4. Dependency Semantics

Missing required dependencies are errors and must fail loudly.

A missing function, module, accessor, or required data infrastructure must not silently become:

* `null`
* `undefined`
* `[]`
* `{}`
* a fabricated default
* an alternate implementation
* an unrelated fallback

Optional dependencies are permitted only when the dependency is intentionally optional and the optional contract is explicitly documented.

A load-order problem is not missing domain data.

For example, if `getCharacterById()` is required but unavailable, returning `null` is incorrect because it makes a missing dependency indistinguishable from a character that does not exist.

## 5. Presentation Ownership

CSS owns presentation.

JavaScript owns behavior and logical UI state.

JavaScript should generally toggle classes, attributes, and semantic state rather than directly defining visual presentation through inline styles.

Avoid using JavaScript to define:

* layout
* spacing
* colors
* typography
* transitions
* visibility styling
* responsive presentation

CSS should determine how a state looks.

JavaScript should determine which state the component is in.

For example:

```js
element.classList.toggle('collapsed', isCollapsed);
```

rather than constructing presentation through:

```js
element.style.maxHeight = '0';
element.style.padding = '0';
element.style.display = 'none';
```

Exceptions are permitted where a value is inherently dynamic and cannot reasonably be represented by a CSS class, such as a measured height or dynamically calculated position. Such cases should remain narrowly scoped.

## 6. Query and Audit Purity

Functions whose names and contracts indicate that they find, inspect, query, calculate, or audit data must not mutate canonical data unless mutation is explicitly part of their documented contract.

In particular:

* `find*()` functions do not mutate.
* `audit*()` functions do not mutate.
* Query functions do not repair data.
* Validation functions do not silently repair data.
* Read operations do not trigger persistence.

Detection and repair are separate operations.

For example:

```js
const problems = findBrokenRankAssignments();
```

may report broken assignments, but must not modify them.

A separate operation performs the repair:

```js
repairBrokenRankAssignments();
```

This separation ensures that audits are repeatable, testable, and trustworthy.

## 7. Canonical Ownership

Every domain concept has one canonical owner.

The module that owns a concept defines its meaning, rules, and authoritative operations.

Other modules consume that meaning rather than recreating it.

Examples:

* Time semantics belong to `time.js`.
* Canonical data access belongs to the accessor/storage boundary.
* Location semantics belong to the world/location domain.
* Relationship semantics belong to the relationship domain.
* Rank semantics belong to the rank domain.
* Presentation belongs to UI/formatting modules.
* Persistence belongs to storage.
* Runtime interaction state belongs to state modules.

Convenience wrappers are permitted when they provide a genuinely useful interface, but they must delegate to the canonical owner rather than implement competing semantics.

There must not be multiple independent definitions of the same domain rule.

## 8. Derived Data and Caches

Caches contain disposable derived data.

A cache must never become a second source of truth.

Cached data must be invalidated when its canonical source changes.

Cache invalidation must not redefine domain semantics or silently repair canonical data.

If canonical data is replaced rather than mutated in place, the appropriate cache invalidation mechanism must be triggered.

## 9. Persistence and Mutation

Saving data and changing data are separate responsibilities.

Persistence modules are responsible for reading and writing stored data.

Domain mutation operations are responsible for changing canonical data according to domain rules.

Saving unchanged data does not, by itself, mean that domain data changed.

A save operation must not be used as a substitute for cache invalidation or change notification.

## 10. Failure Versus Missing Data

The following distinction must be preserved throughout the application:

**Missing data** is a valid domain condition.

**Missing infrastructure** is an application error.

For example:

```text
Character does not exist
→ null

Character exists but has no birth year
→ null

Required character accessor is not loaded
→ error

Required storage service is unavailable
→ error
```

Never use an empty result to conceal an infrastructure failure.

## 11. Compatibility Code

Legacy aliases and compatibility wrappers may remain temporarily during migration.

They must delegate to the canonical implementation.

They must not introduce alternative semantics.

Compatibility code should be removed once its consumers have migrated.
