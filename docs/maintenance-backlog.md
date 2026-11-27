# Maintenance Backlog

This file tracks known issues and follow-up work that should not be lost between maintenance passes.

## Open issues

### Matchmaker does not identify locations

- **Area:** Matchmaker
- **Status:** Open
- **Reported behaviour:** Matchmaker is not identifying locations.
- **Next step:** Trace how Matchmaker loads, resolves, and displays location records. Check the location data source, identifier format, and any filtering or lookup logic. Reproduce the failure before changing the implementation.
- **Acceptance criteria:** Valid locations are identified and displayed consistently, and missing or invalid location references produce a clear empty/error state rather than silently disappearing.

## Follow-up maintenance

- Continue replacing generated numbered CSS classes (for example, `.gov-inline-N` and `.religion-inline-N`) with descriptive semantic classes, preserving rendered appearance.
- Audit tab JavaScript for remaining presentation styles. Tab modules should emit semantic classes and state attributes, not own visual styling.
- Check manager-specific selectors for accidental global leakage and scope them to their owning manager where necessary.
- Run browser-based visual checks across themes and responsive breakpoints after CSS ownership changes.

## CSS ownership convention

- `css/themes.css`: theme tokens, theme typography, and theme art direction.
- `css/common.css`: genuinely shared application components and utilities.
- Individual manager HTML files: that manager's shell, layout, and manager-specific component rules.
- Tab JavaScript: semantic classes and state attributes only.

