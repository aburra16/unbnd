# Story 95: Authoring comments never render

**Origin:** operator staging review (2026-06-12): the `<!-- taxonomy-exempt: E -->` marker rendered as literal text on the wider-network guide entry.
**Block:** reader-guide refinement round 2 (book still open).

## Problem
HTML comments in guide content are authoring metadata — today that means the taxonomy-exemption marker the lint scanner reads (and excludes from scanning). The web formatter deliberately renders unknown constructs as literal text so they surface in review, and this one surfaced in production instead: the marker is a KNOWN construct the renderer was never taught.

A full audit of all 37 content files found exactly one stray artifact (this marker) and no other unsupported constructs (no bullet lists, deeper headings, blockquotes, code ticks, raw HTML, or italics).

## Acceptance criteria
1. Lines that are entirely an HTML comment are stripped from entry bodies and the landing at the load layer; they never reach the formatter. (Inline comments inside a sentence remain visibly wrong by design — they are not a sanctioned authoring form.)
2. The wider-network entry renders without the marker; the file itself keeps the marker (the scanner contract is untouched).
3. The standing content-integrity guard gains a rendered-output sweep over ALL production content: no rendered text contains `<!--`, unconsumed `**`, an unconsumed `](`, or a line-initial `#` — the whole class fails CI instead of waiting for an operator's eye.

## Out of scope
Teaching the formatter new constructs; changing the scanner.
