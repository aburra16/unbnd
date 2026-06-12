# Review: Story 95 — Authoring comments never render

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · web 443/443 · guide scan unchanged (37 files, 0 errors, 5 standing flags — the scanner still reads the raw marker, its exemption contract is untouched) · no visual baseline change (the captured section has no comments; rendering of captured pixels unchanged).
- [x] Browser-verified: the wider-network entry renders without the marker; no `<!--` anywhere in the rendered guide.

## Spec adherence
- [x] Comment-only lines stripped at the load layer for entries AND the landing; inline comments inside a sentence still render visibly wrong by design (not a sanctioned form).
- [x] The content file keeps the marker — one artifact, two readers (scanner sees it, renderer drops it), no drift surface added.
- [x] **The standing guard got stronger than the bug**: a rendered-output sweep now renders every production body through the real formatter and fails CI on the whole class — `<!--`, unconsumed `**`, unconsumed `](`, line-initial `#`. The audit that found only this one stray is now a permanent test, not a one-time comb.

## Findings
### Blocking
_None._
### Non-blocking
1. Honest gap named: the formatter's "unknown constructs render visibly wrong" philosophy assumed review eyes catch them, and this one reached production because the marked entry was authored and reviewed WITH the marker as an expected line. The sweep closes exactly that gap (expected-in-source, wrong-in-render).

## Verdict
**PASS** — the reader sees words, the machine sees its marker, and CI now knows the difference.
