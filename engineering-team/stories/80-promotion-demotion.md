# Story 80: Demote a promoted book

**Status:** Planning
**Created:** 2026-06-09
**Type:** Feature
**Carries:** Phase 2 #30b (`promotion-demotion`, deferred; stub superseded → `done/30b-promotion-demotion.md`)
**Depends on:** Story 30 (promote), #77 (auto-promote), and the removal idiom settled in #79 / ADR 0077.

## Background
A promoted book is a **librarian-signed** canonical `BookRecord` at the addressable identity `39999:<librarian>:<slug>` (d-tag = slug, z-tagged to the `books` concept, `source: "community"`, `submitted-by` provenance). It got there through the promote path: a curator (house-vantage weight ≥ `curatorThreshold`) or the #77 auto-promote sweep enqueued a `promotions` row (UNIQUE slug, status machine `pending → promoting → done | failed`), and the off-path `apps/promoter` worker (the only holder of `LIBRARIAN_NSEC`) built, signed, published (local + dcosl), and reindexed it. There is **no way back**: a wrongly-promoted, junk-slipped, or later-retracted book cannot be taken out of the catalog. Phase 2 carved this off as #30b; the social loop needs its undo.

**What "in the catalog" means at read time** (where a demotion must take effect):
1. **Book detail** — `GET /api/books/:slug` parses the record via `parseBook`; a null parse → `404`.
2. **Browse / hydration** — `GET /api/books` (recent + `?slugs=` hydration, which the homepage trust-shelves and For-You hydrate through) filters null `parseBook` results.
3. **Search** — documents built by `buildBookDocument` (null → skipped). Index-on-write (`reindexBook`) does **no single-doc delete** (by design, ADR 0059 Q6: stale-row removal is the **batch indexer rebuild's** job — and its comments already anticipate "demoted"). So a demoted book leaves the live index only at the next batch rebuild, or via a provider delete taught for this story.
4. **Shelves / For-You workers** — hydrate display fields through the same record reads; a null record drops out (honest-empty).

**The mechanism precedent.** The Phase-2 stub (written 2026-06-01) assumed a NIP-09 **kind-5 deletion** and flagged the load-bearing unknown: "does strfry/dcosl honor kind-5 for kind-39999 addressable records, and do the read paths drop tombstoned records?" Since then, #79 / ADR 0077 settled the repo's removal idiom: **replace at the same addressable identity** (kind 39999 is parameterized-replaceable; the codebase already relies on same-d-tag republish for edits and reveals). The librarian republishing the record at `39999:<librarian>:<slug>` with a **delisted state** (no kind-5 needed) is relay-enforced, read-robust, and reversible by replacing again — the unknown evaporates. The Architect confirms or refutes this (Open Question 1), but the burden of proof now sits with kind-5, not against it.

**Critical interaction — auto-promote must not undo the demotion.** The very trust signals that auto-promoted a book (#77: curator count + average floor) still exist after a demotion. The #77 sweep skips any slug whose `promotions` row has **any** status, so the demotion must leave (or set) a `promotions` row state that keeps the sweep skipping — and the manual re-promote path must consciously clear it. A demote/auto-re-promote war would be the worst outcome of this story.

**Hard constraints:**
- `LIBRARIAN_NSEC` never enters the browser or the API process (ADR 0034 amendment). The API only **enqueues** a demotion intent; the worker signs and publishes — the same posture as promote (#30) and reveal (#78).
- Demotion is **destructive-facing** (a book leaves the catalog): curator-gated, confirmed, audited (who + when), and reversible (re-promote re-mints; the submitter-signed submission event is append-only on the relay and never deleted).
- The community's attached data (ratings, tag assertions, shelf entries z-/a-tagged to the book) is **never deleted** — it stays on the relay; reads that hydrate by slug simply skip the missing book (honest-empty), and all of it comes back if the book is re-promoted.

## User-facing description
As a curator, I want to demote a promoted book — pull it back out of the catalog — when promotion turns out to have been wrong (junk that slipped the gate, a duplicate, a misrepresented submission), so that the catalog stays trustworthy; and I want the book to return to the community-submissions space rather than vanish, so the decision is visible, auditable, and reversible.

## Acceptance criteria
Testable from the outside.

- [ ] A curator (house-vantage weight ≥ `curatorThreshold`) can demote a **promoted** book from the product: a new authenticated endpoint enqueues a demotion intent; the affordance appears only for curators and only on community-promoted books. Signed-out → `401`; below the gate → `403`; a book that is not a community-promoted record → refused. The same fail-closed gate as promote/reveal.
- [ ] Demotion is a **deliberate, confirmed** action in the UI (a brief confirm step, like #79's remove; unlike promote) — destructive actions get confirmation.
- [ ] The **API never touches the librarian key**: it writes a demotion intent (queue row recording `requested_by` = the curator's pubkey + the time); the off-path `apps/promoter` worker mints the librarian-signed demotion (publishes local + dcosl) and handles the search index. Auditable end to end: the queue row (who asked) + the librarian-signed event on the relay (what changed, when).
- [ ] After the worker fulfills, the book is **gone from every catalog read surface**: book detail (`404`/not-found), browse + `?slugs=` hydration (and therefore homepage shelves / For-You rows that hydrate through it), and search (removed from the live index by this story's chosen mechanism, not silently waiting indefinitely; if there is a propagation window, the UX is honest about it). The book's **submission** remains visible in the community-submissions space.
- [ ] **No auto-re-promote war:** after a demotion, the #77 auto-promote sweep does **not** re-enqueue the book (its `promotions`-table state keeps the sweep skipping it), even though its trust signals still cross the threshold.
- [ ] **Reversible + idempotent:** a deliberate manual **re-promote** of a demoted book works (re-mints the canonical record through the existing promote path; the attached ratings/tags/shelves data — never deleted — is live again). Demoting an already-demoted (or never-promoted) book is a safe no-op, not a confusing error.

## DList shapes touched
- The librarian-signed **demotion signal** for the canonical record at `39999:<librarian>:<slug>`. Exact wire shape is the Architect's call (Open Question 1): the precedent-favored **delisted-state replace** of the record at its own address (the #79 idiom; `parseBook`/`buildBookDocument` return null for it) vs the stub's original **kind-5 deletion** (requires confirming relay deletion semantics for addressable events end to end). Either way: minted by the worker, never the API.
- A demotion **intent** row (extend the `promotions` state machine or a sibling table — Open Question 2), recording the requesting curator.
- **Not touched:** the submitter-signed submission event, ratings, tag assertions, shelf assertions (append-only, all stay).

## Out of scope
- Demoting/delisting **seeded** (openlibrary-source) catalog records — an operator/curation-ops concern, not the community promote/demote loop.
- Auto-demotion (threshold-based) — demotion is a deliberate curator action, like reveal.
- Deleting community data attached to the book; any relay purge.
- Moderating individual ratings/tags (#79 did own-rating removal; #81 does contested tags).
- The #82 cleanup items; submitter notifications (Phase-2 carry-forward, still deferred).

## Open questions
For the Architect (Phase 2 — the ADR):
1. **Demotion wire mechanism: delisted-state replace vs kind-5.** The #79/ADR-0077 idiom (replace at the same addressable identity) applied here: the worker republishes the record at `39999:<librarian>:<slug>` carrying a delisted/demoted state; `parseBook` and `buildBookDocument` learn to return null for it (one predicate, every catalog read inherits — detail, browse, hydration, both indexer paths, both workers). Confirm this over kind-5 (whose relay-propagation semantics for addressable events were the stub's load-bearing unknown), and pin where the state lives on the wire so future record edits never accidentally resurrect a delisted book (the replace race with a later legitimate re-promote must be clean).
2. **Queue model.** Extend `promotions` (a `kind: promote|demote` or a status extension like `demoted`) vs a sibling `demotions` table (the `reveals` pattern). Must encode BOTH: (a) the #77 sweep keeps skipping a demoted slug, and (b) a deliberate manual re-promote can cleanly re-enter the promote state machine (today `enqueuePromotion` is idempotent on UNIQUE slug — a demoted row must not permanently block it).
3. **Search-index removal timing.** `reindexBook` deliberately has no single-doc delete (batch rebuild owns stale-row removal). Options: teach the provider seam a delete-by-id the worker calls on demotion; or accept the batch-rebuild window with honest UX. Decide, with the relay-cap/complexity trade-off explicit.
4. **The affordance + the demoted book's home.** Where the Demote action lives (book page, curator-only, community-source-only — likely near the claims/curation chrome), the confirm copy (calm gravity), and what the submissions space shows for a demoted book (back to plain pending? a quiet "was in the catalog" state?). Tokens only, no slop, ban-list-clean.

## Linked artifacts
- Phase-2 stub (superseded by this story): `engineering-team/stories/done/30b-promotion-demotion.md`
- Parent: `engineering-team/stories/done/30-trust-gated-promotion.md` + ADR 0031; #77 / ADR 0075 (auto-promote); #78 / ADR 0076 (the enqueue-and-worker-mints pattern); #79 / ADR 0077 (the removal idiom).
- ADR: `engineering-team/decisions/0078-promotion-demotion.md` (Accepted)
- Test plan: _pending (Tester)_
- Review: _pending (Reviewer)_
