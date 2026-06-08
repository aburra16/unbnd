# Story 78: In-product accusatory reveal

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
Some tags are *accusatory* (`sensitivity: "accusatory"` — e.g. `ai-generated`, `possibly-ai-generated`). They are **hidden at read time** unless a live librarian *reveal* exists for that (book, tag): `aggregate.ts` drops an accusatory tag from the consensus unless `revealedTagSlugs` contains it, and `resolveRevealedSlugs` (in `tags.ts`) keeps the latest `revealed`/`withdrawn` reveal event per (book, tag). A reveal is recorded as a `reveals` Postgres row (the intent/job) that the off-path worker mints into a **librarian-signed** kind-39999 reveal event (the auditable ground truth on the relay); the read-time gate then surfaces the tag, attributed to a review action (never community consensus).

Today the only way to trigger a reveal is an **operator-only CLI** (`docker compose … promoter reveal --book … --tag … [--withdraw]`). Phase 3 §5.2/§5.7 calls for an **in-product, trust-gated** reveal: a curator should be able to reveal (and withdraw) an accusatory tag from the book page, not only an operator at a shell.

The pieces exist. The curator gate (`houseWeightOf(callerHex) ≥ curatorThreshold`) already powers `canAssertAccusatory` (the accusatory write picker) and the promote gate. The `enqueueReveal(bookSlug, tagSlug, state, requestedBy)` + worker-mint path already exists. So this story adds a curator-gated API endpoint that enqueues a reveal exactly as the operator CLI does — reusing the worker, the signed event, and the read-time gate untouched — plus the in-product affordance.

**Hard constraint (ADR 0034 amendment):** the librarian key never enters the browser or the API process. The API only enqueues the intent; the off-path worker signs the reveal event. This story does not move the key.

This is a sensitive surface (an accusation like "AI generated"). It stays curator-gated, audited (who + when), and reversible. Serves the Founding Curator (journey 4.1 step 4; §5.2 book-detail actions).

## User-facing description
As a curator, I want to reveal (or withdraw) a gated accusatory tag on a book from the book page itself, so that I can surface a substantiated concern in the moment — without asking an operator to run a command — while the action stays gated to curators, recorded to me, and reversible.

## Acceptance criteria
Testable from the outside.

- [ ] A curator (a signed-in user whose house-vantage weight ≥ `curatorThreshold`) can trigger a reveal of a gated accusatory tag for a book from within the product (a new authenticated endpoint + a book-page affordance), not only via the operator CLI.
- [ ] The reveal action is restricted to above-threshold curators: a signed-out user or a below-threshold user cannot reveal (the endpoint refuses; the affordance is absent), reusing the same gate as the accusatory write picker.
- [ ] After the reveal is fulfilled (the worker mints + publishes the librarian-signed reveal event), the accusatory tag becomes visible at read time through the **existing** auditable gate — no change to the read path or the aggregate.
- [ ] The audit trail is kept: the reveal records the **requesting curator** (their pubkey + the time) on the `reveals` row, and the gate event remains librarian-signed on the relay (author + timestamp + state). The librarian key never reaches the browser or the API.
- [ ] A curator can also withdraw a reveal in-product (the same state machine: `revealed` ↔ `withdrawn`), so the in-product control is symmetric with the operator CLI and the read-time gate hides the tag again.
- [ ] The operator CLI still works as a fallback (unchanged).

## DList shapes touched
- Writes (via the **existing** worker) the librarian-signed kind-39999 accusatory-reveal event (`state: revealed|withdrawn`, d-tag `reveal--<book>--<tag>`, under the `accusatory-reveals` concept). No new shape.
- The API enqueues a `reveals` Postgres row (the requesting curator in `requested_by`); no schema change (the column is already `char(64)`).
- Reads the taxonomy to confirm the target tag is accusatory before gating/enqueuing.

## Out of scope
- Any change to the read-time gate / `aggregate.ts` / `resolveRevealedSlugs` (already works; this only adds an enqueue source).
- Automatic / threshold-based reveal — a reveal is a deliberate curator action, never automatic.
- Moving the librarian signing key onto the API or browser (it stays in the worker — hard constraint).
- Demotion (#80), rating removal (#79), contested-tag treatment (#81).
- Revealing non-accusatory tags (normal tags are never gated; there is nothing to reveal).

## Open questions
For the Architect (Phase 2):
1. **Endpoint shape + gate reuse.** A new authenticated endpoint (e.g. `POST /api/books/:slug/tags/:tagSlug/reveal` with a `state`/`withdraw` flag) that reuses `houseWeightOf` + `curatorThreshold` (the `canAssertAccusatory` gate), validates the tag is accusatory, and calls `enqueueReveal(slug, tagSlug, state, requestedBy = the curator's pubkey)`. Confirm the exact route + body + reuse of the existing enqueue.
2. **`requested_by` = the curator (audit).** Today the operator path records the librarian hex in `requested_by`; for in-product it should record the **curator's** pubkey (the real actor) — the audit-trail improvement, no schema change. Confirm.
3. **The async UX.** The worker mints asynchronously, so the tag surfaces only after the reveal event publishes. The Architect/Design decide the affordance (where in `TagControl` / the book tag area), its `canAssertAccusatory`-gated visibility, and the pending/just-requested state (calm gravity, no jargon).

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
