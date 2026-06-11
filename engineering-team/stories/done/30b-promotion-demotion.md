# Story 30b: Promotion demotion — remove a promoted book from the catalog

**Status:** Superseded by Story 80 (`engineering-team/stories/80-promotion-demotion.md`)
**Created:** 2026-06-01
**Type:** Feature
**Depends on:** Story 30 (`engineering-team/stories/done/30-trust-gated-promotion.md`) — the curator gate, the `promotions` queue, the `apps/promoter` worker, and the canonical librarian-signed catalog record.

> **Origin: gate decision (2026-06-01).** Carved out of Story 30. Story 30 ships promote-only (a community submission → librarian-signed canonical catalog record). 30b adds the **destructive inverse**: removing a promoted book back out of the catalog. Split because demotion needs deletion semantics (kind-5 tombstone on a librarian-signed record) that the promote path does not.

## Background

After Story 30, a curator (above the house-PoV trust gate) can promote a submission: the `apps/promoter` worker mints a librarian-signed canonical `BookRecord` at `39999:<librarian>:<slug>` and it appears in genre browse / search / shelves. There is no way to reverse this — to take a wrongly-promoted or later-retracted book back out of the catalog.

Demotion is destructive: the canonical record is a **librarian-signed** event, so removing it means a **NIP-09 kind-5 deletion** referencing that record (by `a`/`e`), signed by the librarian — i.e. it must go through the same off-path key-holding worker, not the always-on API. And the read surfaces (search index, genre browse, shelves) must honor the deletion so the book actually disappears.

## Acceptance criteria (to finalize at this story's planning gate)

- [ ] **AC-1 — Curator-gated Demote action.** A curator above the gate can request demotion of a promoted book; below-gate/anon is rejected server-side (mirrors the promote gate). Surfaced where the promoted state is shown.
- [ ] **AC-2 — Confirmation before the destructive act.** Demotion prompts a brief confirmation (unlike promote), per the "reserve confirmation for destructive actions" rule.
- [ ] **AC-3 — Worker-fulfilled kind-5 deletion.** The API enqueues a demote job (reuse/extend the `promotions` queue or a sibling); the `apps/promoter` worker publishes a librarian-signed NIP-09 kind-5 deletion referencing the canonical record, to local + dcosl. `LIBRARIAN_NSEC` stays out of the API.
- [ ] **AC-4 — Read surfaces honor the deletion.** After the kind-5 lands + the indexer re-runs, the book no longer appears in search / genre browse / shelves; it returns to the `/submissions` space (or a demoted state). The load-bearing unknown: confirm strfry/dcosl honor kind-5 for kind-39999 addressable records, and that the indexer/aggregate drop tombstoned records (teach them if not).
- [ ] **AC-5 — Idempotent / safe.** Re-demote is a safe no-op; a promote-after-demote re-mints cleanly (state machine in the queue).
- [ ] **AC-6 — Fixture-verified; honest degrade.** Worker-side tested with a fake signer + publisher (no real key, no live relay); deletion best-effort across relays with honest UX if it doesn't fully propagate.

## Open questions for the Architect
- Does strfry + dcosl honor NIP-09 kind-5 for kind-39999 addressable events, and does the indexer/search/genre/shelves read path drop tombstoned records today, or must it be taught? (The load-bearing unknown — demotion is only as good as deletion propagation + read-side honoring.)
- Queue model: extend `promotions` with a `kind` (promote|demote) + state machine, or a sibling table.
- What the submission reverts to (back to `/submissions` pending, or a distinct "demoted" state).

## Scope
**In:** the curator-gated Demote action + confirmation; a worker-fulfilled librarian-signed kind-5 deletion; read surfaces honoring it; idempotent state machine; fixture-verified.
**Out:** any change to the promote path shipped in Story 30; auto-demotion; demoting other namespaces; the `curatorTagCount` tag-signals extension and the worker stranded-job reaper (separate Story-30 follow-ups).

## Linked artifacts
- Parent story: `engineering-team/stories/done/30-trust-gated-promotion.md`
- ADR (parent): `engineering-team/decisions/0031-trust-gated-promotion.md`
- Relevant: PRD §2.7, NIP-09 (event deletion), ADR 0013 (search indexer).
- ADR / test-plan / review: (filled in as this story runs the gated flow)
