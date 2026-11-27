# Maintenance Backlog

This file tracks known issues and follow-up work that should not be lost between maintenance passes.

## Open issues

### Matchmaker does not identify locations

- **Area:** Matchmaker
- **Status:** Open
- **Reported behaviour:** Matchmaker is not identifying locations.
- **Next step:** Trace how Matchmaker loads, resolves, and displays location records. Check the location data source, identifier format, and any filtering or lookup logic. Reproduce the failure before changing the implementation.
- **Acceptance criteria:** Valid locations are identified and displayed consistently, and missing or invalid location references produce a clear empty/error state rather than silently disappearing.

### Shared manager-shell CSS has duplicate owners

- **Area:** Shared manager UI / CSS
- **Status:** Open
- **Reported behaviour:** Topbar baselines and related shell rules are repeated across manager stylesheets and page-specific CSS, sometimes with a second baseline appended later in the file. The final appearance depends on stylesheet order and specificity.
- **Next step:** Audit `css/common.css` and every active manager entry point. Establish one shared definition in `common.css` for the topbar, sidebar, content pane, sub-tab strip, and toolbar button primitives. Retain only genuinely different page-layout rules locally. Remove duplicate baselines rather than layering overrides.
- **Acceptance criteria:** Each shared shell component has one canonical definition; manager-specific differences are explicit, scoped modifiers; no trailing duplicate baseline blocks remain; visual behaviour is consistent across managers and themes.

### Government department references a missing location

- **Area:** Government Manager / data integrity
- **Status:** Open
- **Reported warning:** `government-state.js` reports: `department govdept_1793726612099_zrwc3r9h references missing location place_1793720585683_27cg89lg` (reported at `js/government/government-state.js:1111`).
- **Next step:** Trace the department record and location lifecycle. Determine whether the location was deleted, its ID changed, or the department retained a stale reference. Repair the underlying record and add integrity handling so this is surfaced clearly and can be prevented or repaired.
- **Acceptance criteria:** The department references a valid location, or the application presents an explicit repair path for intentionally missing locations. No silent dangling reference remains.

### Government tabs repeatedly become unavailable

- **Area:** Government Manager / tab registration and bootstrap
- **Status:** Open, recurring regression
- **Reported behaviour:** Government tabs have become unavailable again despite previous fixes. This is a recurring issue and should not be treated as an isolated visual glitch.
- **Next step:** Trace the full tab lifecycle from script loading and self-registration through bootstrap configuration, tab availability checks, and rendering. Check for load-order races, missing registrations, stale tab IDs, and errors that abort registration. Add a regression test covering the complete expected tab set.
- **Acceptance criteria:** All intended Government tabs are registered and available on every normal page load. A missing tab produces a diagnosable error, and a regression test fails if any expected tab disappears.

### Dashboard organization needs improvement

- **Area:** Main dashboard
- **Status:** Open
- **Reported request:** The dashboard needs clearer organization and a more coherent information hierarchy.
- **Next step:** Audit the current dashboard structure, grouping, navigation, visual hierarchy, spacing, and responsive behaviour. Propose a revised information architecture before changing the layout; preserve existing functionality and entry points.
- **Acceptance criteria:** Related tools and information are grouped logically, primary actions are easy to find, visual hierarchy is consistent, and the dashboard remains usable on desktop and smaller screens.

### Console message: custom SVG icon registry loaded

- **Area:** Shared icons / console diagnostics
- **Status:** Verify whether action is needed
- **Reported message:** `icons.js loaded - 105 custom SVG icons available` at `js/core/icons.js:694`.
- **Next step:** Confirm this is an intentional one-time informational startup message. If it is, keep it at an appropriate log level or remove routine console noise; if it accompanies missing or unregistered icons, investigate those separately.
- **Acceptance criteria:** Normal startup does not produce misleading warnings or unnecessary console noise, and genuine icon-loading failures remain visible.

### Disaster casualty count contradicts the description

- **Area:** Disasters / event generation and display
- **Status:** Open
- **Reported example:** Flood `Motu1560`, Minor (severity 8), shows `Deaths: 0 / 229 (0%)`, while its description says the event claimed 18 lives.
- **Next step:** Trace how disaster casualties are generated, stored, summarized, and interpolated into descriptions. Ensure the description and casualty fields use the same authoritative value. Do not generate a narrative death toll independently from the recorded casualty count.
- **Acceptance criteria:** A disaster cannot simultaneously report zero deaths in its structured data and claim deaths in its description. Existing records with inconsistent values should be identifiable and repairable.

### Disaster deaths need manual number-or-percentage input

- **Area:** Disasters / event configuration
- **Status:** Open feature request
- **Requested behaviour:** Allow the user to set deaths manually, choosing either an absolute number of deaths or a percentage of the affected population.
- **Next step:** Add an explicit input mode (number or percentage), validate the entered value against the affected population, calculate and store a consistent absolute casualty count, and display the resulting count and percentage. Define rounding and population-change behaviour.
- **Acceptance criteria:** The user can choose either mode, enter a value, see the resulting casualty count before saving, and the saved disaster description and statistics agree. Values cannot exceed the affected population or fall below zero.

### Disaster location filters stop at type 2

- **Area:** Disasters / location selection
- **Status:** Open
- **Reported behaviour:** Cascading location filters currently stop at location type 2.
- **Next step:** Trace the location hierarchy and filter construction. Make the cascading selector follow the available descendant levels dynamically rather than hard-coding a two-level limit. Preserve parent-child constraints at every level.
- **Acceptance criteria:** All supported location hierarchy levels can be selected in sequence, and each selection narrows the next level to valid descendants. The selector handles locations with fewer levels without presenting dead-end or invalid options.

### Some tabs still use the no-renderer empty state

- **Area:** Tab registration / renderer coverage
- **Status:** Open
- **Reported evidence:** A comment in the HTML says that, until the missing renderer work is completed, corresponding tabs render the `no-renderer` empty state from `_buildEmptyState` in the bootstrap.
- **Next step:** Identify every affected tab and determine whether its renderer is missing, not registered, or registered under a mismatched ID. Replace placeholder states with working renderers or clearly mark intentionally unavailable tabs. Remove stale comments once the implementation is complete.
- **Acceptance criteria:** Every tab presented as available has a functioning renderer. No user-facing tab silently falls back to the generic no-renderer state.

### Crime tab click does nothing

- **Area:** Tab interaction / Crime
- **Status:** Open, blocking
- **Reported behaviour:** Clicking the Crime tab produces no visible response.
- **Next step:** Trace the click event from the tab control through navigation state, tab registration, renderer invocation, and any runtime errors. Check whether the tab is disabled, has a stale ID, or is missing its handler/renderer.
- **Acceptance criteria:** Clicking Crime reliably activates and renders the Crime tab, with errors surfaced if its data cannot load. Add a regression test for tab activation.

### Education tab is not loaded

- **Area:** Tab loading / Education
- **Status:** Open, blocking
- **Reported behaviour:** The Education tab is not loaded.
- **Next step:** Trace its script inclusion, load order, registration name, bootstrap configuration, and renderer availability. Check for script errors that prevent registration.
- **Acceptance criteria:** Education is included, registered, and rendered on normal startup. Add a regression check that verifies it is present in the expected tab set.

## Follow-up maintenance

- Continue replacing generated numbered CSS classes (for example, `.gov-inline-N` and `.religion-inline-N`) with descriptive semantic classes, preserving rendered appearance.
- Audit tab JavaScript for remaining presentation styles. Tab modules should emit semantic classes and state attributes, not own visual styling.
- Check manager-specific selectors for accidental global leakage and scope them to their owning manager where necessary.
- Run browser-based visual checks across themes and responsive breakpoints after CSS ownership changes.

## CSS ownership convention

- `css/themes.css`: theme tokens, theme typography, and theme art direction.
- `css/common.css`: canonical shared application shell and components, including topbar, sidebar, content pane, sub-tab strip, toolbar buttons, forms, modals, tabs, cards, and utilities.
- Individual manager HTML files: manager-specific layout differences and domain-specific component rules, scoped to that manager.
- Tab JavaScript: semantic classes and state attributes only.

