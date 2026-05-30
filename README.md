# Unbnd

A book discovery and curation platform built on [nostr](https://nostr.com). Readers find books through people they trust: ratings, reviews, and genre/style classification are signed events that belong to the reader and travel with them, weighted by a personal Web of Trust ([GrapeRank](https://github.com/NosFabrica)).

Staging: **https://staging.unbnd.ink** · Phase 1 (MVP) is complete — see `unbnd-prd-addendum-phase1.md`.

---

## What it is

Unbnd is a Goodreads-style catalog where the data is open and the curation is community-driven, with no central algorithm:

- **Catalog** of real books (seeded from Open Library), browsable by genre and searchable.
- **Ratings + reviews** from readers, shown raw or **trust-weighted** from your own vantage ("Personalize").
- **Classification** (genre / style / quality signals) applied by the community as signed tag-assertions, surfaced as honest raw consensus.
- **Submissions** — anyone can add a book (search-first dedup); submissions live in their own space until promoted.
- **Three ways to sign in:** a Nostr extension (NIP-07, you hold the key), email/password (we manage a key for you, exportable), or anonymous read-only.

Everything a user creates is a nostr event signed by their key, published to a shared relay — portable to any app that reads the same data.

## How it works (data model)

Books and their metadata are **DLists** — structured data layered on flat nostr events:

- **kind 39998** — *concept headers* (e.g. `books`, `book-tags`, `book-ratings`, `book-submissions`), owned by the librarian/house identity.
- **kind 39999** — *items* (a book record, a rating, a tag assertion, a submission), z-tagged to their parent concept, content carried in a word-wrapper JSON tag, addressed as `kind:pubkey:dtag` (replaceable).

Classification uses a **tag-assertion** model: a curated `BookTag` taxonomy (type genre|style|signal, sensitivity normal|accusatory) plus `BookTagAssertion` events (target a book via `#a`, polarity apply/dispute). Consensus is raw counts; accusatory tags are hidden until a trust+role gate exists.

Trust scores are **NIP-85 kind-30382** events produced by the Brainstorm GrapeRank service; Unbnd reads them and weights ratings from a chosen observer's vantage.

## Architecture

```
            ┌──────────── one droplet (docker compose) ────────────┐
 browser ── caddy (web, auto-TLS) ── api (Express) ── tapestry (strfry relay + Neo4j)
                                        │                 ▲  │
                                        ├── db (Postgres) │  └─ local relay = read source
                                        └── search (Meilisearch)
                                              ▲
 jobs (profiles): seeder, indexer ────────────┘
```

- **dcosl** (`wss://dcosl.brainstorm.world/`) is the shared relay backbone. The seeder publishes the catalog there; the local strfry syncs **down**; the API **dual-publishes** community writes **up** (plus a `--dir up` cron backstop).
- **Trust** scores come from the **nip85** relays + the Brainstorm API (`brainstormserver.nosfabrica.com`).
- **Search** and **trust** are **provider-agnostic** behind interfaces with CI guards, so the planned Meili→Vespa move (and any trust-source change) is a one-adapter swap.

## Monorepo layout (pnpm)

| Path | What |
|---|---|
| `apps/web` | Vite + React + TypeScript front end |
| `apps/api` | Express + TypeScript API (auth, ratings, tags, search, trust, submissions) |
| `apps/seeder` | One-off job: Open Library → librarian-signed book records → dcosl |
| `apps/indexer` | One-off job: local relay → `@unbnd/search` (build the search index) |
| `packages/schemas` | `@unbnd/schemas` — DList event shapes (BookRecord, BookRating, BookTag, …) |
| `packages/search` | `@unbnd/search` — provider-neutral search interface + Meili adapter |
| `apps/api/src/trust` | provider-neutral trust (`TrustProvider`) + Brainstorm/NIP-85 adapter |
| `engineering-team/` | PRD, ADRs (`decisions/`), stories, reviews, runbooks |

## Develop

Requires Node 22 + pnpm. The data layer (relay/Neo4j/Postgres/Meili) runs in Docker.

```bash
pnpm install
cp .env.example .env            # fill in required secrets (see the file)
docker compose up -d            # data layer (see docs/data-layer.md)
pnpm --filter @unbnd/api dev    # API on :8787
pnpm --filter @unbnd/web dev    # web on :5181 (proxies /api, /auth → API)
```

Quality gates (what CI runs):

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @unbnd/web build
```

Notable env vars (see `.env.example`): `STRFRY_URL`, `LIBRARIAN_PUBKEY`, `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `DCOSL_RELAY_URL`, `SEARCH_URL`/`SEARCH_PROVIDER`, `BRAINSTORM_API_URL`/`TRUST_RELAYS`/`HOUSE_OBSERVER_PUBKEY`.

## Deploy

GitHub Actions: `ci.yml` (typecheck/test/build on every branch) and `staging.yml` (build GHCR images on merge to `main`, then SSH-deploy to the droplet, SHA-pinned). Catalog seed and search index are run on the droplet as compose profile jobs (`--profile seed` / `--profile index`). See `docs/DEPLOY.md` and `ops/sync-runbook.md`.

## Conventions

- **No hand-rolled crypto** — Applesauce pattern / nostr-tools / `@noble/*`; `finalizeEvent`/`verifyEvent`.
- **npub for display, hex internal.** **No fake trust numbers** (raw counts until real GrapeRank data).
- **No AI-slop copy/visuals** (enforced in review).
- Feature-branch + PR per cycle; each story has an ADR + a review.

## Status & roadmap

Phase 1 (MVP) is live on staging. What shipped, what diverged, and what's deferred:

- `unbnd-prd.md` — original PRD
- `unbnd-prd-addendum-phase1.md` — as-built closeout
- `engineering-team/phase1-deferred-and-tradeoffs.md` — deferred items + tradeoffs (Phase 2 input)
- `engineering-team/decisions/` — ADRs 0001–0016

## License

TBD.
