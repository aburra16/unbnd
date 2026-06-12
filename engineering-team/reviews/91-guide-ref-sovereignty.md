# Review: Story 91 — Your account is yours + the staying-current rule

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full suite green (integrity guard: 36 entries, 8 sections, every section published) · build ok · scan re-run: 37 files, 0 errors, 5 standing flags.
- [x] **The exemption mechanism, proven on its first live use**: the marked note's wall words scan clean, AND a planted em dash in the same file still errored during drafting (E-only, recorded in the draft commit). The wall holds everywhere else: zero wall words outside the one marked entry.

## Spec adherence (the brief's ACs)
- [x] The sovereignty entry is the complete calm explanation in exactly the AC's four parts (what you have now / what changes / what stays the same / what you become responsible for); "key" is introduced as "the key to your account" with what it does before any property of it; the close lands the register: "Keep it like the key it is."
- [x] The wider-network note is one clearly marked entry, opens by telling everyone else to skip it, and is the only place the wall words exist.
- [x] **The staying-current rule is in the review checklist** as a conditional section every future reviewer walks: a user-facing change updates its guide entry in the same story, or states why not.
- [x] **The inventory reconciles at zero gaps**: 36 published entries against the scope's 36 items, section by section, each with its recorded edit-pass diff. The PRD §10 zero-gaps metric is met before book close.

## The writing process
- [x] The edit pass's best catch this epic: "a lost copy cannot be reissued by anyone, including us" was simultaneously we-voice in a reference entry AND factually wrong for a custodial holder who still has their password. The replacement states the true risk: "a key that leaks cannot be un-leaked."
- [x] The landing's last forward reference resolved (the curator extension links For curators).

## Rider
- [x] The api suite gains 15s timeout headroom after the #90 gate's load-induced 5s timeout (isolation-green; a different class than the retired transport flake). One line, commented, measured against the failure it answers.

## Findings
### Blocking
_None._
### Non-blocking
1. The sovereignty entry stays silent on re-export behavior (the UI offers the reveal once; the deeper behavior is not surfaced on screen). Deliberate: the guide documents what the screen does. If the UI later surfaces re-export, the staying-current rule catches it.

## Verdict
**PASS** — Block 2 closes: the full reference is published, the wall held with exactly one marked door, the process rule that keeps it all true is now part of every future review.
