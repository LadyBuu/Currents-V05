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

