# ADR 0082: The narrative lives under the scan; the formatter gains headings; three quiet doors

**Status:** Accepted
**Date:** 2026-06-11
**Story:** `engineering-team/stories/85-guide-narrative-doors.md`

## Decision
1. **The landing narrative is guide content**: `apps/web/src/guide/content/landing.md`, inside the Appendix M glob so the CI scan governs every sentence of it. The loader recognizes the root-level `landing.md` as the landing slot (`GuideContent.landing?: string`), exempt from the entry frontmatter rules (no anchor/name; it is not an entry and is never deep-linked below the page level). Entry files stay under section directories; the unknown-directory loud-throw is unchanged for everything else.
2. **The formatter gains exactly one construct**: a `## heading` line becomes a heading block (rendered h2, sentence case per taxonomy A4). Real document structure for the narrative's parts; A5's bolded pseudo-structure stays banned. The authoring README records the addition.
3. **The doors**: Footer gains `Guide` beside About; About gains one cross-link paragraph near the top ("New here? The guide walks through everything."); the auth method-select and welcome screens each gain one quiet muted line ("Want the tour first? Read the guide."). Interface microcopy: ban-list-clean, no taxonomy ceremony (the taxonomy governs prose; these are links).
4. **The writing process is enforced by commit shape**: the draft lands as its own commit; the taxonomy edit pass is a separate commit whose diff IS the recorded evidence; review re-runs the scan and judgment-reads the result. CI's Guide lint gate now has real content to scan.

## Consequences
Additive loader/formatter changes (tests extend #84's suites); three small surface touches; the first real content under the scan. No new dependency; no PRD change.

## Out of scope
Reference entries; contextual links; About prose beyond the one cross-link.
