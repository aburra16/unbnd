# Epic-scoped doc folders — a future option (not yet applied)

> **Status for Unbnd:** NOT applied. Unbnd's Phase-1 and Phase-2 artifacts are **flat** — `stories/<n>-<slug>.md` (+ `stories/done/`), `decisions/<NNNN>-<slug>.md`, `reviews/<n>-<slug>.md` — and all the harness docs (README, roles, workflows) describe that flat layout. This file documents the epic-folder convention as a **going-forward option** if and when story-number collisions across parallel feature branches become a real problem. Adopting it is a deliberate, separate migration — don't half-apply it.

## What the convention is

Upstream (the Tapestry harness this was ported from) scopes stories, ADRs, and reviews into **per-epic folders** rather than one flat namespace:

- `stories/<epic>/<n>-<slug>.md` (+ `.test-plan.md`)
- `decisions/<epic>/<NNNN>-<slug>.md`
- `reviews/<epic>/<n>-<slug>.md`
- `epics/<epic>.md` — one umbrella per epic
- shipped epics move under `stories/done/<epic>/`, `decisions/done/<epic>/`, `reviews/done/<epic>/` (one `git mv` per area, on the directory)

Numbers are **scoped per epic** — they restart inside each folder and may repeat across epics, because the *paths* are disjoint. That disjointness is the point: two parallel branches each producing a "Story 8" at `stories/8-*.md` is a guaranteed merge conflict; under epic folders, `stories/epic-a/8-*.md` and `stories/epic-b/8-*.md` never collide.

## Why Unbnd hasn't adopted it

Unbnd's Phase 1 and Phase 2 ran as a mostly-linear single-stream build, so the flat global numbering never collided in practice, and every existing cross-reference (`**Story:**` paths, bare "ADR 0015" mentions, story↔test-plan↔ADR↔review links) assumes the flat layout. Migrating would rewrite those references for no current benefit.

## When to reconsider

Adopt epic folders if Unbnd starts running **multiple long-lived feature branches in parallel** that each generate their own stories/ADRs/reviews and keep colliding on the same integer-at-the-same-path during merges. At that point:

1. Do it as its own change (its own story/ADR), not bundled with feature work.
2. Update the mechanistic harness docs (`README.md`, `roles/product-owner.md`, `roles/reviewer.md`, `workflows/1-planning.md`, `workflows/5-review.md`, `workflows/6-book-close.md`) to describe the epic-scoped scheme.
3. **Pure-move, no renumber.** Keep every existing file's number so all cross-references still resolve; bucket existing flat docs into epic folders with `git mv` only. New work numbers per-epic from there.

Until that day, the flat layout is the source of truth and the rest of this harness matches it.
