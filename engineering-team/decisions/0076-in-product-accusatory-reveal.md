# ADR 0076: In-product accusatory reveal — a curator-gated enqueue + a curator-only gated view

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/78-in-product-accusatory-reveal.md`

## Context
An accusatory tag (`sensitivity: "accusatory"`) is dropped from the read aggregate for **everyone** unless a live librarian reveal exists for that (book, tag): `aggregateBookTagsWeighted` (`apps/api/src/tags/aggregate.ts:186`) `continue`s past it unless `revealedTagSlugs.has(slug)`. A reveal is a `reveals` Postgres row (intent) the off-path worker mints into a librarian-signed kind-39999 reveal event (`state: revealed|withdrawn`, d-tag `reveal--<book>--<tag>`); the read gate then surfaces it with `revealed: true`.

Today only the **operator CLI** enqueues a reveal (`apps/promoter/src/reveal/cli.ts` → `enqueueReveal` in the worker's `queue.ts`, an `ON CONFLICT (book_slug, tag_slug)` upsert that always re-queues — the toggle). The api has **no** `enqueueReveal`. The tags router already holds the reusable gate: `houseWeightOf(hex) ≥ curatorThreshold` (powering `canAssertAccusatory`), `isAccusatorySlug`, `sessionUser`, and `revealsConcept`. `/api/tags` returns the full taxonomy (accusatory slugs included). **Hard constraint (ADR 0034 amendment):** the librarian key lives only in the worker — the api enqueues, the worker signs.

**The crux:** the read gate hides unrevealed accusatory tags from *everyone*, including curators. A curator therefore cannot *see* a gated concern to decide whether to reveal it. For a sensitive accusation ("AI generated"), revealing **blind** — without seeing the substantiation (who/how many trusted curators flagged it) — is the wrong product. So the in-product reveal needs a **curator-only view of gated accusatory tags**; the **public** gate stays exactly as is.

## Decision

### 1. A curator-only gated view (the read addition)
`aggregateBookTagsWeighted` gains a 5th param `includeGatedAccusatory = false`. When `true`, an unrevealed accusatory tag is **included** (not `continue`d) and marked `revealed: false, gated: true` (carrying its real `applies`/`disputes`/`trusted`). The `/api/books/:slug/tags` route passes `includeGatedAccusatory = canAssertAccusatory` (the same once-computed curator flag). So:
- **Non-curators / signed-out:** `false` → today's behavior exactly (gated tags invisible). **The public gate is unchanged.**
- **Curators:** see the gated accusatory tags with their substantiation, marked `gated: true`, so they can decide to reveal.
`TagConsensus` gains an optional `gated?: boolean` (only on a curator-visible unrevealed accusatory tag). This is the minimal, additive, gated-by-`canAssertAccusatory` read change — it does not weaken the public gate.

### 2. The reveal endpoint (curator-gated enqueue)
`POST /api/books/:slug/tags/:tagSlug/reveal` on the tags router (it already has the gate + accusatory check):
1. `sessionUser(cookie)` → no session → `401`.
2. `isAccusatorySlug(tagSlug)` → false → `400` (only accusatory tags are gated/revealable).
3. Gate: `houseWeightOf(user.pubkeyHex) ≥ curatorThreshold` → below → `403 below_gate` (same gate as the write picker).
4. `enqueueReveal(slug, tagSlug, state, requestedBy = user.pubkeyHex)`; return `{ status }` (`queued`|`updated`).
- Body `{ state: "revealed" | "withdrawn" }` (default `revealed`; validate the enum) → AC-5 (reveal **and** withdraw, symmetric with the CLI).
- **`requestedBy` is the curator's pubkey** (the real actor — the audit-trail improvement; the operator path recorded the librarian). No schema change (`requested_by char(64)`).

### 3. `enqueueReveal` on the api
New `apps/api/src/db` helper (drizzle), mirroring the worker's upsert: `INSERT … ON CONFLICT (book_slug, tag_slug) DO UPDATE SET state, requested_by, status='pending', minted_id=NULL, error=NULL, updated_at=NOW()` → `{ status: inserted ? "queued" : "updated" }`. Always re-queues (the worker re-mints the new state — that's how `revealed↔withdrawn` toggles). The worker, signed event, and read gate are otherwise unchanged.

### 4. Web affordance (TagControl)
For curators (`canAssertAccusatory`), the book tag area renders accusatory tags with a reveal control: a `gated: true` tag shows a **Reveal** action; a `revealed: true` tag (the existing reviewed treatment) shows a **Withdraw** action. `api.tags.reveal(slug, tagSlug, state)` posts the endpoint. The worker mints asynchronously, so the control shows a calm just-requested/pending state (the tag's public visibility flips on the next read after the event publishes). Non-curators see nothing new. Tokens only; calm-gravity copy (a sensitive action).

## Consequences
- **Enables:** a curator reveals/withdraws an accusatory tag from the book page, *seeing the substantiation first*, gated + audited + reversible — no operator shell.
- **Public gate unchanged:** non-curators never see a gated accusatory tag; the `includeGatedAccusatory=false` default preserves every existing caller and `aggregateBookTags`.
- **Audit improved:** `requested_by` now records the curator; the gate event stays librarian-signed; the librarian key never leaves the worker.
- **Scope nuance vs the story:** the story said "no read-gate change"; this adds a *curator-only* gated view (the public gate is untouched) because reveal is unusable otherwise. Flagged for the PO at the gate.
- **Affects existing fixtures?** `TagConsensus` gains an optional `gated?` (additive). The aggregate's new param defaults to today's behavior. Tests asserting the public tags shape are unaffected; the gated-view tests are new.
- **New dependency?** No. **PRD change?** No (§5.2/§5.7).

## Implementation notes
- `apps/api/src/tags/aggregate.ts`: add `includeGatedAccusatory = false` (5th param); when true, include unrevealed accusatory tags with `revealed:false, gated:true`. `TagConsensus`/`BookTags` types gain optional `gated?: boolean`.
- `apps/api/src/routes/tags.ts`: pass `includeGatedAccusatory: canAssertAccusatory` into the book-tags aggregate; add `POST /api/books/:slug/tags/:tagSlug/reveal` (gate + accusatory check + `enqueueReveal`); add `enqueueReveal` to `TagsDeps`.
- `apps/api/src/db/index.ts`: `enqueueReveal(bookSlug, tagSlug, state, requestedBy)` (drizzle upsert, mirrors the worker). `apps/api/src/index.ts`: wire it into `buildTagsRouter`.
- `apps/web/src/lib/api.ts`: `TagConsensus` gains `gated?`; `api.tags.reveal(slug, tagSlug, state)`.
- `apps/web/src/components/TagControl.tsx` (+ CSS): curator reveal/withdraw controls on gated/revealed accusatory tags; pending state; tokens-only, calm copy.
- No change to `apps/promoter` (CLI + worker), the read gate for the public, or the signed-event shape.

## Out of scope
- Changing the public read gate; automatic reveal; moving the librarian key; demotion/rating-removal/contested-tag; non-accusatory tags.
