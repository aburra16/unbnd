# Unbnd — PRD Addendum: MVP Phase 1 As-Built

**Status:** Phase 1 complete (staging live at https://staging.unbnd.ink)
**Date:** 2026-05-29
**Companion to:** `unbnd-prd.md` (original PRD). This records what actually shipped, where it diverged from the PRD, and the decisions made along the way. Section numbers mirror the PRD. Full rationale lives in `engineering-team/decisions/` (ADRs 0001–0016).

---

## Summary

All Phase-1 in-scope pillars (PRD §11.1) shipped and are verified live: real catalog, three-tier auth, both rating tiers, community classification, search, identity/profiles, GrapeRank trust-weighting, and the submission loop. Two architectural seams (search, trust) are **provider-agnostic behind CI-enforced guards**, so the planned Meili→Vespa and any trust-source change are one-adapter swaps. What's deferred is either **prerequisite-blocked** (needs a real librarian identity + a real trust graph + activity) or **polish/scale** — none of it is core to the MVP thesis. See `engineering-team/phase1-deferred-and-tradeoffs.md`.

**Delivery model:** built as 16 stories through a 5-phase cycle (PO → Architect → Tester → Implementer → Reviewer) with per-cycle PRs; each story has an ADR (`decisions/`), a review (`reviews/`), and (where relevant) a test plan.

---

## §5 Feature Specification — status

| PRD feature | Status | Notes / divergence |
|---|---|---|
| §5.1 Homepage | **Shipped (reduced)** | Hero + search + "Recently added" shelf + live genre grid from the taxonomy + CTA. **No fabricated trending/community shelves** — those need activity + GrapeRank and were rejected as fake. (ADR 0010) |
| §5.2 Search | **Shipped** | `/api/search` + as-you-type dropdown + `/search` results page. Title/author/subjects/applied-tags + ISBN; typo-tolerant. Provider-agnostic (`@unbnd/search`, Meili adapter). (ADR 0013) |
| §5.3 Genre browse | **Shipped** | `/genre/:slug` from net-positive tag-assertion consensus. Subgenre pills / fake curators dropped (fixture-era). (ADR 0010) |
| §5.4 Book detail | **Shipped (de-faked)** | Real cover (gradient fallback), metadata, genre/style chips (raw apply counts), ratings (raw + trust-weighted toggle), real reviews from rating text, classification control. Dropped the fabricated rating distribution, fake reviewers/trust tiers, and the claimed-author card. (ADR 0010, 0014) |
| §5.5 User profile | **Shipped (own profile)** | `/profile/me`: kind-0 avatar/name (sovereign), npub, "your submissions". Public `/profile/:handle` is still the fixture (retire later). Real activity (ratings/tags) deferred. (ADR 0012) |
| §5.6 Shelves / reading lists | **Deferred** | `BookShelf` schema exists (kind 39999); no UI/endpoints built. Phase 2. |
| §5.7 Authentication | **Shipped (full three-tier)** | Sovereign (NIP-07), custodial (email/pw), anonymous. (ADR 0003, 0004, 0006) |
| §5.8 Submission / author claim | **Shipped (submission); claim deferred** | Search-first dedup + write-path (community submissions in their own space) + public browse. Author **claim/verification** and trust-gated **promotion into the catalog** deferred (16b-ii). (ADR 0015, 0016) |

## §6 Data Model — as-built

- **§6.1 Protocol:** nostr DLists. kind-39998 **concept headers**, kind-39999 **items**, word-wrapper `["json", …]` content tag, `z`-tag → parent header, `a`-tag → target, stable address `kind:pubkey:dtag`, replaceable. (ADR 0001)
- **§6.2 Book record:** shipped as `@unbnd/schemas` `BookRecord`. Used for the librarian-seeded catalog **and** community submissions (different parent concept).
- **§6.3 Genre / §6.5 Genre tags / §6.6 Quality signals:** **superseded** by the unified **tag-assertion model** (ADR 0009): a curated `BookTag` taxonomy (type genre|style|signal, sensitivity normal|accusatory) + `BookTagAssertion` (kind 39999, target via `#a`, polarity apply/dispute, identity = author+book+tag). Per-genre concept headers were a misstep and were removed; genre membership is now assertions. Cycle-1 `BookGenreTag`/`BookQualitySignal` retired.
- **§6.4 Rating:** shipped (`BookRating`, kind 39999). Read API returns raw + optional trust-weighted view.
- **§6.7 Shelf:** schema only; no UI (deferred).
- **New concepts added:** `book-ratings`, `book-tags`, `book-tag-assertions`, `book-submissions`.

## §7 Catalog seeding — as-built

Open Library subjects API → librarian-signed kind-39999 `BookRecord`s → **dcosl** (`wss://dcosl.brainstorm.world/`). Local strfry syncs **down** (negentropy cron). ~1,960 books seeded across 8 genre buckets + the starter taxonomy + librarian baseline genre assertions. (ADR 0008) Search is populated by a separate **`apps/indexer`** that reads the relay → `@unbnd/search`. **ISBN search is effectively dormant** — OL *works* rarely carry ISBN-13.

## §8 Authentication — as-built (matches PRD §8 + the cycle-3 amendment)

- **Sovereign:** NIP-07 challenge/verify (kind-22242), audited `verifyEvent` (the `verifiedSymbol` memo landmine — verify only freshly-parsed bodies). (ADR 0004)
- **Custodial:** email/password; server generates a nostr keypair; nsec encrypted at rest (NIP-49) + a separate XChaCha20-Poly1305 server backup key; opaque SHA-256 sessions. Server signs on the user's behalf via the **§8.2 ephemeral wrap** — a process-local key wraps the nsec per session (XChaCha20), evicted on logout/rotation; **restart → fail-closed `401 reauth_required`**. (ADR 0003, 0006)
- **Anonymous:** read-only.
- No hand-rolled crypto (Applesauce-pattern / nostr-tools / `@noble/*`).

## §9 Trust & Curation — as-built (the most divergence vs PRD)

- **§9.1 GrapeRank scoring:** consumed via **NIP-85 kind-30382** from the Brainstorm stack (nosfabrica). Provider-agnostic `TrustProvider` (`apps/api/src/trust/`); Brainstorm adapter resolves an observer's service key via public `GET /setup/{observer}`, reads `rank`/100 from the nip85 relays (unioned). (ADR 0014)
- **§9.2 Trust-weighted ratings:** **shipped.** `GET /api/books/:slug/ratings?observer=` returns raw + a weighted view (weighted mean, trusted count, trust-ordered reviews).
- **§9.3 Trust-weighted genre tags / §9.4 quality-signal weighting:** **deferred** — tag/genre consensus stays **raw** in v1 (the seeded librarian is weight-0 from the stand-in house observer, so weighting would empty genres). Quality-signal *write UI* also deferred.
- **§9.5 House PoV + Personalization:** **shipped.** PoVBar with House⇄Yours toggle (persisted) + in-app self-serve **Personalize** (NIP-07 signs the Brainstorm challenge → `/user/graperank` → ~5-min build → poll → personalized). **House observer = nosfabrica** as a stand-in (a real librarian observer is deferred). **Deviation:** the house view **falls back to raw** when there's no trusted signal (vs strict "show none") — flagged for a product decision; the visible effect of weighting is **data-limited** today (nosfabrica trusts ~none of the current test raters).
- **Sensitivity gate:** accusatory tags (`ai-generated`, etc.) are **defined but hidden** at read time and never offered in the write picker. The full **trust+role gate** that would reveal them is deferred (shares mechanism with submission promotion — 16b-ii).

## §10 Technical Architecture — as-built

- **Monorepo (pnpm):** `apps/web` (Vite/React/TS), `apps/api` (Express/TS), `apps/seeder`, `apps/indexer`; `packages/schemas` (`@unbnd/schemas`), `packages/search` (`@unbnd/search`). esbuild single-file bundles for the api/seeder/indexer Docker images (resolves the TS-workspace-dep-at-runtime problem).
- **Prod stack (one droplet, `docker-compose.prod.yml`):** caddy (serves web + auto-TLS) → api → tapestry (data-layer image: strfry relay + Neo4j + nginx) + db (Postgres) + search (Meilisearch). `seeder` + `indexer` are `profiles:` one-off jobs.
- **Relays:** **dcosl** is the shared backbone (catalog + propagated community writes). The **local** strfry is the read source; the API dual-publishes accepted writes to dcosl + a `--dir up` cron backstop (ADR 0011). NIP-85 trust scores come from the **nip85** relays.
- **CI/CD:** GitHub Actions — `ci.yml` (typecheck/test/build) + `staging.yml` (build GHCR images → SSH deploy to the droplet, SHA-pinned). Public GHCR images.

## §11 Scope — what shipped vs deferred

- **§11.1 In scope:** all shipped (see §5/§9 above), with the noted reductions (no fake shelves, raw-default tag consensus, own-profile-only).
- **§11.2 Stretch:** search (shipped), trust-weighting (shipped). Shelves (deferred).
- **§11.3 Out of scope (Phase 2+):** unchanged — plus the items newly deferred during the build (see the deferred-items log).

## Decisions of record (ADRs)

0001 DList schemas · 0002 data-layer compose · 0003 custodial auth · 0004 NIP-07 · 0005 sovereign rating · 0006 custodial server-signing · 0007 staging deploy · 0008 catalog seed · 0009 classification (tag assertions) · 0010 web goes live · 0011 write up-sync · 0012 profile surface · 0013 catalog search (provider-agnostic) · 0014 GrapeRank personalize · 0015 submission dedup · 0016 submission write-path.

## Standing product/engineering invariants (held throughout)

- **No fake trust numbers** — raw counts until real GrapeRank data; weighted figures clearly labelled.
- **npub for display, hex internal.**
- **No hand-rolled crypto.**
- **No AI-slop copy/visuals** (ban list enforced in review).
- **Provider-agnostic seams** for search + trust (CI-guarded).
- **No silent fabrication** — empty/honest states over invented data.
