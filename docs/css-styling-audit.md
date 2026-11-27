# CSS and visual consistency audit

Audit date: 2026-11-27  
Repository: `LadyBuu/Currents-V05`  
Branch reviewed: `main`

## Scope and limits

This is a static presentation-layer audit, building on the repository-wide systems audit. The current tree contains 16 active HTML entry points, 7 active CSS files, 75 tab JavaScript modules, and 395 JavaScript files overall. This pass inspected all 16 active HTML files, all 7 active CSS files, all 75 tab modules for presentation leakage, and selected high-volume modal modules. The quarantined `no touch/` tree was not treated as active application code.

No browser session, screenshot comparison, accessibility scanner, or responsive/theme runtime test was available. Findings describe source structure and likely visual inconsistencies; they do not claim that every visual defect has been reproduced in a browser.

## Executive summary

The application already has a useful visual foundation: `themes.css` owns a broad token system, `common.css` provides shared structural components, and the theme file defines canonical colour and typography tokens plus legacy aliases. The main problem is not the absence of a design system. It is that the design system is applied unevenly.

Page styling currently has several competing homes: shared stylesheets, large inline style blocks in HTML, page-specific external stylesheets, and presentation embedded directly in JavaScript-generated markup. That fragmentation has produced duplicated shell rules, opaque generated class names, inconsistent font loading, and different sizing conventions between managers.

The most important correction is to make every active page consume the same theme and shared shell, then keep genuinely page-specific styling in that page's own style block. JavaScript should express state through semantic classes and attributes, not define presentation.

## Findings

### P1 — Theme typography is not actually consistent across manager pages

**Locations:** `css/themes.css:85-88`; `index.html:12-18`; all other active HTML entry points.

The theme tokens specify Newsreader, Instrument Sans, and IBM Plex Mono. Only `index.html` loads those web fonts. The other 15 active HTML pages load the theme tokens but do not load the font files, so they silently fall back to Georgia, system UI fonts, and platform monospace fonts.

This means the same theme tokens do not produce the same typography across the application. Font metrics affect line wrapping, card height, button width, and perceived density, so this is not merely cosmetic.

**Recommended fix:** load the same font families and weights consistently on every active page, or deliberately change the shared tokens to a local/system stack. The existing Nexus font imports are the obvious source of truth if external font loading is intended.

### P1 — The Government Manager duplicates the entire theme stylesheet

**Locations:** `GovernmentManager.html:14-15`; `css/government-manager.css:1-1416`.

The first 1,416 lines of `css/government-manager.css` are an exact line-for-line copy of `css/themes.css`. The Government Manager loads this combined file and `common.css`, rather than loading `themes.css` directly. The remaining lines contain Government Manager page styles, including 113 generated `.gov-inline-N` classes.

This creates a second copy of the theme system. A theme fix can reach every other page but miss the Government Manager, or a later edit can make the duplicate diverge. The page stylesheet's own comment also says shared theme tokens come from `themes.css`, which its HTML does not load.

**Recommended fix:** make the Government Manager load `themes.css` and `common.css` like the other pages, then keep only its page-specific rules in its own HTML style block. Remove the duplicated theme prefix from the page-specific source.

### P2 — Page-specific CSS ownership is inconsistent

**Locations:** active HTML entry points and `css/{government,household,location,religion}-manager.css`.

Twelve active HTML pages still contain large inline style blocks, totalling approximately 234 KB and 7,480 lines. The largest are Character Manager (about 47.9 KB), Events Manager (46.2 KB), Culture Manager (39.8 KB), Education Manager (21.4 KB), and Settlement Manager (19.7 KB).

Household, Location, and Religion instead place page-specific rules in external manager CSS files. Government has a hybrid file containing a duplicate theme system plus page rules. This differs from the accepted project convention: shared components and themes belong in shared CSS; page-specific styling belongs with its page.

**Recommended fix:** standardise ownership without turning every page into one giant global stylesheet:
- `themes.css`: theme tokens, theme art direction, typography tokens.
- `common.css`: genuinely shared app shell, buttons, forms, modals, tabs, cards, and utilities.
- Each manager HTML: its own shell/layout and manager-specific component rules.
- Tab JavaScript: semantic classes and state attributes only.

Keep domain-specific selectors scoped to their manager so one page cannot accidentally restyle another.

### P2 — Shared manager-shell rules are copied and overridden repeatedly

**Locations:** `css/common.css`; `css/household-manager.css:10,459-462`; `css/location-manager.css:18,328-331`; `css/religion-manager.css:26,818-821`; `css/government-manager.css:1429,1660-1662`.

The same topbar baseline is repeated near the end of the Household, Location, and Religion stylesheets. The Government stylesheet has a similar baseline, while `common.css` already defines shared topbar and button primitives. Some pages also define their own versions earlier in the file, then append another baseline later.

These layers make the final appearance depend on source order and specificity rather than a clear component contract. They also make small changes expensive because the same component has several owners.

**Recommended fix:** define the shared topbar, sidebar, content pane, sub-tab strip, and toolbar button once in `common.css`. Keep only genuinely different page layout rules local. Remove duplicate baseline blocks rather than adding more overrides.

### P2 — JavaScript still owns too much presentation

**Locations:** `js/tabs/*.js`; `js/households/modals-residence.js`; `js/education/modals-education.js`; `js/religion/modals-religion.js`.

All 75 tab modules were scanned. Together they contain 158 literal `style=` attributes in generated markup, in addition to direct `.style` property writes. The largest selected modal sources still emit substantial inline styling: `modals-residence.js` contains about 315 style-attribute occurrences and `modals-education.js` about 217.

This conflicts with the documented presentation-ownership rule in `docs/semantics.md`: CSS owns appearance; JavaScript owns behavior and state. Inline styles make responsive changes, theme support, and consistent spacing harder to maintain.

**Recommended fix:** replace fixed presentation values with semantic classes, such as `is-hidden`, `is-expanded`, `has-warning`, `is-selected`, or domain-specific component modifiers. Keep inline styles only for genuinely dynamic measured values or calculated positions.

### P2 — Generated numbered class names obscure component meaning

**Locations:** `css/government-manager.css:1664-1909`; `css/religion-manager.css:824-866`; `js/religion/modals-religion.js`.

Government styling contains 113 numbered `.gov-inline-N` classes. Religion styling contains 39 numbered `.religion-inline-N` classes, with the modal source referring to these generated names extensively.

The classes technically separate CSS from markup, but they are not a maintainable component vocabulary. A rule such as `.religion-inline-11` says nothing about whether it is an error panel, warning, field, or action row. It also makes safe deduplication and theme review difficult.

**Recommended fix:** rename these to semantic component classes (for example `.religion-form__field`, `.religion-alert--danger`, `.government-history-row`) and consolidate repeated declarations into shared primitives.

### P2 — Visual scales vary between managers

**Locations:** `css/household-manager.css`; `css/location-manager.css`; `css/religion-manager.css`; Government Manager generated rules.

The code mixes pixel and rem-based design values for equivalent shell elements. For example, Location uses a 16px base font and several pixel-based spacing values, while Household and Religion use rem-based typography and spacing. Topbar baselines are repeated with both pixel and rem values. Generated Government and Religion rules also use very small text sizes, down to 0.45rem.

The result is a different density and hierarchy between managers, even where they share the same visual components.

**Recommended fix:** define a small, documented spacing and type scale in shared tokens. Use rem for typography and spacing, reserve px for borders and genuinely pixel-sensitive details, and establish minimum readable sizes for metadata and controls.

### P3 — Status and overlay colours bypass the theme tokens

**Locations:** `css/household-manager.css:245-393`; `css/location-manager.css:180`; `css/religion-manager.css:835,853,862`.

Most page styles use theme tokens, but some status colours and overlays still use hardcoded fallbacks or literal values such as `#b54a4a`, `#c87040`, and `rgba(0,0,0,0.8)`. The Religion stylesheet's header claims that no hardcoded colours are used, but its generated rules contradict that claim.

**Recommended fix:** define semantic tokens for danger, warning, overlay, and muted states, then use those tokens consistently. Retain literal black/white only for deliberate print output where theme colours would reduce legibility.

### P3 — Nexus stylesheet is not linked by any active HTML page

**Location:** `css/nexus.css`; `index.html:17-20`.

The repository contains `css/nexus.css`, but none of the 16 active HTML pages links it. The Nexus page instead has its own sizeable inline style block. The stylesheet may be stale or may represent an incomplete extraction.

**Recommended fix:** compare its selectors with the current Nexus inline rules, then either complete the extraction and link it or remove the unused file. Do not keep two competing sources for the same page.

### P3 — Event-tab style initialisers are empty

**Locations:** `js/tabs/events-adoption-tab.js`, `events-deaths-tab.js`, `events-disaster-tab.js`, `events-stork-tab.js`, and `events-surrogacy-tab.js`.

These modules call `_ensureStyles()`, but the functions are empty. Their styles are expected to come from the Events Manager page stylesheet. This is not necessarily a rendering defect, but the function name and call imply that the tab initialises styles when it does not.

**Recommended fix:** remove the empty functions and calls, or replace them with a documented style-contract check. Keep actual event-tab styling in one clearly identified owner.

## Positive controls

- `themes.css` has a coherent canonical token set and legacy aliases, including dark/light and named themes.
- `common.css` is intended to be structural and mostly consumes theme tokens rather than defining a competing palette.
- Most manager pages load `themes.css` before `common.css`.
- The page-specific stylesheets generally use the theme tokens for backgrounds, text, borders, and accents.
- The Nexus stylesheet includes reduced-motion and print-oriented rules, although the file is currently unlinked.
- The semantics document already states the correct ownership rule: CSS owns presentation; JavaScript owns behavior and logical UI state.

## Recommended implementation order

1. **Unify typography and theme loading.** Ensure all active pages load the same font families and the same theme stylesheet.
2. **Remove Government theme duplication.** Give Government the same shared stylesheet stack as the other managers.
3. **Consolidate the app shell.** Establish one topbar/sidebar/content/sub-tab implementation in `common.css`, then remove copied baselines.
4. **Standardise page-style ownership.** Move page-specific styles into each page's style block, retaining only genuinely shared rules in common CSS.
5. **Replace generated numbered classes.** Start with Government and Religion.
6. **Migrate high-volume inline styles out of JavaScript.** Start with Residence and Education modals, then work through the tab modules.
7. **Standardise spacing, type sizes, status colours, and overlays.**
8. **Resolve the unlinked Nexus stylesheet and remove no-op style initialisers.**
9. **Run visual regression checks** across every manager, light/dark and representative named themes, desktop/mobile widths, modal states, empty states, and long-content states.

## Verification status

This audit is source-based. The 16 active HTML entry points, 7 active CSS files, and 75 tab modules were inspected for stylesheet ownership, token usage, duplicated shell rules, and inline presentation. Selected high-volume modal files were also inspected. The remaining JavaScript files were not exhaustively reviewed for every presentation string.

No visual or browser tests were run. The next implementation pass should include screenshot comparisons at fixed viewport sizes and at least the default dark, light, and one named theme before declaring the styling system congruent.
