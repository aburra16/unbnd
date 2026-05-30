# Unbnd — Phase 1 Deferred Items & Tradeoffs

**Date:** 2026-05-29 · Companion to `unbnd-prd-addendum-phase1.md`.
Detailed log of everything consciously deferred or traded off during MVP Phase 1, with rationale and Phase-2 implications. Intended as raw material for the Phase 2 PRD.

---

## 1. The keystone prerequisite (unblocks the most)

### Production librarian identity + secret management
- **Now:** the "librarian" / house identity is a **disposable staging key** (`LIBRARIAN_NSEC` in the droplet `.env`). It owns the catalog concept headers and signs seeded data.
- **Why it matters:** it gates (a) a real **house trust view** (the stand-in observer is currently nosfabrica, who doesn't trust our seeded librarian → weighting is mostly inert), and (b) **submission promotion / curator roles** (16b-ii). It's also a production-readiness blocker generally (key custody, rotation, HSM/Cowork secret, multi-sig?).
- **Phase 2:** decide the real librarian identity model + secret management before trust/curation can be meaningful. **Highest-leverage deferred item.**

## 2. Trust & curation (GrapeRank) gaps

| Item | Status / why deferred | Phase 2 note |
|---|---|---|
| **Trust-gated submission promotion + curator/role gate (16b-ii)** | Deferred — no real trust graph, throwaway librarian, ~no submissions; auto-cutoff would promote nothing. "Who grants curator" is security-sensitive. | Build once §1 + activity exist. The **same role gate** unlocks accusatory-tag visibility. Story `16b-submission-promotion.md`. |
| **Accusatory-tag visibility gate** | Accusatory tags (`ai-generated`, …) are defined but **hidden** + never offered in the write picker. The trust+role gate to reveal them isn't built. | Same mechanism as 16b-ii. |
| **Tag/genre trust-weighting** | v1 weights **ratings only**; tag consensus is raw. Seeded librarian is weight-0 from the stand-in house observer → weighting would empty genres. | Revisit with a real house observer + community tagging volume. |
| **Custodial personalization** | Custodial npubs have no follow graph → GrapeRank returns empty. v1 = house view only for them. | Needs a follow-graph mechanism (in-app follows publishing kind-3, or import). |
| **Real librarian house observer** | House observer is nosfabrica (stand-in, 94.8k-pubkey graph). | Swap to the real librarian once §1 lands + its graph is built. |
| **Admin trigger for arbitrary pubkeys** | Only sovereign **self-serve** trigger built (NIP-98 self-auth). Triggering *other* pubkeys (e.g. custodial) needs an Unbnd key whitelisted in Brainstorm. | For custodial personalization. |
| **Trust-weighted search ranking / homepage trust shelves** | Search ranks by provider-default relevance; homepage has no trust shelves. | Both depend on real trust data. |
| **House raw-fallback (open product decision)** | The house view falls back to **raw** when there's no trusted signal (so the catalog never looks empty) — a deliberate softening of strict "show none". | Decide: keep, or strict. One-line flip. |
| **Data caveat** | Trust-weighting is correct but **visibly inert** today — sparse ratings, untrusted test keys. | Value scales with real users + ratings. |

## 3. Submissions

- **Promotion into the canonical catalog** — deferred (16b-ii, see §2).
- **Author claim / verification** (PRD §5.8) — the "I am the author" toggle sets `source=author` + `authorPubkey`, but there's no verification/badge/edit-access flow.
- **OL metadata autofill** on submit, **cover preview** — not built.
- **Cosmetic artifact:** one "E2E Test Book" submission sits in the public list (from a live test with a discarded key; can't NIP-09 delete). Harmless; buries over time.

## 4. Profiles & identity

- **Public profile `/profile/:handle`** still renders the **fixture** (Mira Calloway). Only `/profile/me` is real. Retire the fixture route.
- **Real profile activity** — `/profile/me` shows submissions + an identity header; the user's ratings/tags aren't aggregated onto it yet.
- **Custodial avatar upload** — deferred (no media storage; sovereign uses kind-0 picture, custodial uses initials).
- **Account-menu dropdown** is sign-out-only; **Settings / Profile** entries are a placeholder for a future pass.

## 5. Search

- **Index-on-write** — the index is batch-built by `apps/indexer`; new books/tags appear only after a re-run. (Runbook: `ops/sync-runbook.md`.)
- **Tags-in-search** (story 13, drafted) — surface matching genre/community **tags** above book results + a generic tag-browse. Sequenced after GrapeRank.
- **ISBN search** is wired but dormant (OL works lack ISBN-13).
- **Faceted filters, pagination polish** — basic only.
- **Vespa migration** — the seam + CI guard are ready; the Vespa adapter itself is unwritten (intentionally — proving the seam with Meili was the point).

## 6. Write propagation

- **Up-sync cron install** — the API dual-publishes to dcosl (primary); the `unbnd-upsync` cron (durability backstop) is an **operator install** on the droplet (`ops/cron/unbnd-upsync`). Confirm it's installed.
- Community writes land on the **local** relay + dual-publish to dcosl; there is no per-user relay selection / outbox model (NIP-65) yet.

## 7. Platform / ops / cleanup

- **Orphaned web components** from the fixture→live swap (ActionBar, AuthorCard, GenreHeader, GenreControls, SubgenrePills, Pagination) — unused; cleanup chip spawned.
- **Seeder/indexer image freshness** — both are `profiles:` jobs the deploy doesn't pull; **`docker pull` before running**. Consider pinning runs to `$UNBND_IMAGE_TAG`.
- **Nav search everywhere** — present (compact in nav + hero); fine.
- **Ephemeral key-map expiry sweeper** — custodial session keys evict on logout/rotation but not on idle expiry (low priority).
- **strfry in CI** — gated relay integration tests are skipped in CI (no relay service); could add one.

---

## Key tradeoffs (decisions we'd revisit deliberately, not by accident)

1. **Provider-agnostic seams (search + trust).** Extra indirection + neutral types + a CI guard, vs. a direct SDK. Chosen because Meili→Vespa is a known near-term migration and trust sources may change. Payoff: each swap is one adapter file + an env flip.
2. **Local relay as the read source + dual-publish up.** Writers get instant read-back (local), dcosl is the shared backbone. Cost: a propagation step + eventual consistency (cron backstop). Alternative (write straight to dcosl, read via down-sync) was rejected — it regresses read-back latency.
3. **Raw counts by default; weighting only with real data.** Honest, but the trust feature looks inert until activity exists. We chose honesty over fabricated trust numbers.
4. **House = nosfabrica stand-in + ratings-only weighting + raw fallback.** Pragmatic so the catalog isn't empty; not the eventual model (real librarian observer + tag weighting).
5. **Separate submissions space, no auto-promotion.** Clean separation + decentralized-native; cost is that submissions aren't in the catalog until 16b-ii.
6. **Throwaway librarian key.** Bought build speed; not production-ready (see §1).
7. **esbuild single-file bundles** for TS-workspace-dep apps at runtime. Simple Docker images; the bundle inlines `@unbnd/schemas`/`@unbnd/search`.
8. **dcosl as the shared relay.** Probed open to non-librarian writes (no allowlist). If that changes, the write path needs a relay/policy rethink.
9. **One-droplet staging, no branch protection.** Fast iteration; `gh pr merge` doesn't gate on CI (process discipline compensates — see the build-status process note).

## Suggested Phase 2 sequencing (for the PRD author)

1. **Production librarian identity + secrets** (unblocks trust + curation).
2. **16b-ii** trust-gated promotion + curator/role gate (+ accusatory-tag visibility).
3. **Real house observer + tag/genre trust-weighting**; custodial personalization (follow graph).
4. **Tags-in-search**, trust-weighted ranking, homepage trust shelves.
5. **Shelves/reading lists**, author claim/verification, public profile + real activity.
6. **Vespa migration** (when brainstorm.world moves).
7. Platform: index-on-write, NIP-65 outbox, media storage (avatars/covers), cleanups.
