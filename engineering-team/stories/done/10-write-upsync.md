# Story 10: Propagate community writes to dcosl (write up-sync)

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature / correctness gap

## Background

Story 9 made staging a real, browsable, classifiable catalog. But there's a propagation gap discovered during its live verification:

- The seeder publishes catalog + taxonomy + baseline assertions **directly to dcosl** (the shared relay), so seeded data is globally visible.
- The local strfry (in the tapestry container) **syncs DOWN** from dcosl on a 5-min cron (`--dir down`, filtered to the librarian's events), and the API reads from that local relay.
- But **user-authored writes** — ratings and tag assertions, both kind-39999 events signed by the reader's own key (sovereign via NIP-07, custodial via the server-side ephemeral wrap) — are published by the API to the **local relay only** (`STRFRY_URL = ws://tapestry/relay`). Nothing pushes them UP to dcosl.

Result: a reader's rating or classification is readable on *this* droplet (immediate local readback works, verified in story 9), but it never reaches dcosl, so it's invisible to other clients and would be lost if the local relay's volume were rebuilt. Community contribution doesn't actually leave the box. This story closes that loop.

## User-facing description

As an Unbnd reader, when I rate or classify a book, my contribution should become part of the shared graph on dcosl — visible to other clients and durable beyond one server's local relay — not stranded on the droplet I happened to write through. As the operator, I want community writes to propagate to dcosl reliably (eventually, even if dcosl is briefly unreachable at write time), without slowing down the writer's own read-back.

Success: a freshly-applied rating/assertion is queryable **on dcosl** (not just the local relay) shortly after the write.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: A user-authored **rating** (kind 39999, z-tagged to the `book-ratings` concept) created through the API write path becomes queryable **on dcosl directly** after the write.
- [ ] AC-2: A user-authored **tag assertion** (kind 39999, z-tagged to `book-tag-assertions`) likewise becomes queryable on dcosl.
- [ ] AC-3: **Read-back is not slowed.** The writer still sees their own write immediately on staging (the local publish/readback loop keeps its current latency); propagation to dcosl must not block the write response.
- [ ] AC-4: **Resilient.** If dcosl is unreachable at write time, the local write still succeeds (local is the source of truth) AND the event still reaches dcosl eventually (retry/backstop) — no silent permanent loss.
- [ ] AC-5: **Scoped & validated.** Only events the API actually accepted/published propagate (the validated community writes). Propagation does not push arbitrary/unvalidated local events, and does not cause churn by needlessly re-pushing librarian/seed data already on dcosl.
- [ ] AC-6: **Idempotent.** Replaceable events (same d-tag identity) reconcile on dcosl without duplicates; re-running propagation is stable.
- [ ] AC-7: **Verified live on staging:** an end-to-end round-trip where a freshly-applied tag/rating is then read back **from dcosl** (queried directly, not via the local relay).

## DList shapes touched

- `kind:39999` — `bookRating` and `bookTagAssertion` items (**propagated**, not newly shaped). No schema change expected.
- No new concept headers (the `book-ratings` / `book-tag-assertions` headers already exist on dcosl from the seed).

## Open questions

To resolve with the operator / in the ADR — **the first one gates the whole design:**

1. **Does dcosl accept writes from non-librarian pubkeys?** We've only ever confirmed dcosl accepts the *librarian* key's writes. If dcosl gates writes by an owner/WoT allowlist, arbitrary reader pubkeys (and custodial-generated keys) may be **rejected**, and no client-side propagation can succeed — we'd need a different path (operator-run relay, allowlisting, or relay-level relaying). **Probe first** (publish a throwaway-key event to dcosl and check the OK frame) before committing the mechanism.
2. **Mechanism.** API **dual-publish** (publish each accepted write to dcosl as well as local — immediate, precisely scoped to validated events) vs a periodic **`strfry sync --dir up`** cron (decoupled, batch, but ~5-min lag and needs a filter that captures community writes while excluding the bulk seed). Likely a **hybrid**: dual-publish best-effort + a periodic up-sync as the eventual-consistency backstop.
3. **Async + retry.** If dual-publishing, how to keep it off the write's critical path (fire-and-forget vs a small queue) and where retry/backfill state lives (in-memory, a Postgres table, or just lean on the periodic up-sync as the retry).
4. **Up-sync filter.** If we add `--dir up`/`both`, the exact filter so it pushes the community writes (by kind + the ratings/assertions concept z-tags, authored by non-librarian keys) without re-pushing the whole local store.

## Out of scope

- Changes to the existing **down-sync** (it works).
- Write **ACL / anti-spam / rate-limiting** on dcosl, and moderation of community writes — separate concern.
- Production librarian identity / secret management (still parked).
- GrapeRank trust-weighting, search.

## Linked artifacts

- ADR: `engineering-team/decisions/0011-write-upsync.md` (to be written in the Architect phase)
- Test plan: `engineering-team/stories/10-write-upsync.test-plan.md` (Tester phase)
- Review: `engineering-team/reviews/10-write-upsync.md` (Reviewer phase)
