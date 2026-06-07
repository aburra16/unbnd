# Review: Story 72 — Link unfurls and per-book metadata (oEmbed)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `62b88f0`)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: `test/unfurl/card.test.ts` 16/16, `test/routes/unfurl.test.ts` 8/8; api full `105 passed | 2 skipped`.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] `caddy validate --config deploy/Caddyfile --adapter caddyfile` — **"Valid configuration"**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test (AC-1…AC-6), plus AC-7 covered by config structure + `caddy validate` (the unfurl route is additive and never touches the static path; a vitest test cannot exercise Caddy UA-routing). Coverage map in the test plan.
- [x] No criterion silently dropped.
- [x] No behavior beyond the story. The unfurl service is purely additive; no existing route or response changed.

## ADR adherence (0070)
- [x] Option A implemented as decided: Caddy bot-aware `handle /book/*` → reverse-proxy recognized crawlers to the Express `/unfurl/...`; humans fall through to the unchanged static SPA. oEmbed rides the existing `/api/*` proxy.
- [x] Pure card model (`buildBookCard`/`renderUnfurlHtml`/`renderGenericHtml`/`toOEmbed`) separated from the route; DI router like `homepage-shelves.ts`; raw-only by construction (no trust seam wired).
- [x] Security notes honored: HTML + attribute escaping of every book-derived string; oEmbed `url` same-origin validated (slug parsed, url never fetched — no SSRF); oEmbed `type:"link"` (no embeddable `html`).
- [x] **No new dependency.** Improved on the ADR: reused the existing `config.publicOrigin` (`PUBLIC_ORIGIN`, already in `docker-compose.prod.yml`) instead of adding a `PUBLIC_BASE_URL` env. Documented in the test plan.
- [~] **Deviation:** the optional in-process TTL cache (ADR §5) was **not** implemented — see Non-blocking 1.

## DList integrity
- [x] No event shapes written. Reads only: `kind:39999` book record (`#z` books concept + `#d` slug), the `book-ratings` raw aggregate (`#a` book address, `BOOK_RATING_KIND` 39999), and the raw tag consensus. Librarian pubkey resolved at runtime via `config.librarianPubkey` (`readers.ts`), never hardcoded; address conventions match `books.ts`/`ratings.ts`/`tags.ts`.

## UI integrity
- [x] No `apps/web` change. The unfurl HTML is a server-rendered crawler artifact (brand tokens are not in play); copy is the existing site description + factual book fields. No em dashes in emitted copy.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code in the diff.
- [x] Error paths: `/unfurl/book/:slug` catches and serves the generic card (never throws to a crawler); `/api/oembed` 400/404/501 branches covered; honest-empty when the librarian is unconfigured.
- [x] Security: same-origin oEmbed validation (no SSRF), HTML/attr escaping (no injection), `type:"link"` (no embeddable HTML). Path traversal n/a (slug used only in a relay `#d`/`#a` filter and an escaped URL).
- [x] Concurrency: stateless read-only handlers; no shared mutable state.

## House rules check
- [x] PRD scope: no out-of-scope surface — reuses existing cover URLs, hosts no files (PRD §11.3 safe).
- [x] POV-first: raw-only is the correct no-viewer choice (an unfurl has no observer to weight for); consistent with #70–#71.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **ADR §5 deviation — TTL cache deferred (`apps/api/src/routes/unfurl.ts`).** The ADR listed an *optional* in-process TTL cache to absorb crawler bursts; it is not implemented. Justification: the equivalent human read paths (`/api/books/:slug`, `/ratings`, `/tags`) are themselves uncached read-on-request, so caching *only* the crawler path would be inconsistent, and crawler load is unobserved (YAGNI). The ADR framed the cache as optional, so this is within its latitude. *Recommendation: accept the deferral; revisit a shared read cache across the book-read paths if/when crawler or page load warrants it (one follow-up, not per-route bespoke caching).*
2. **Ops / deploy — `PUBLIC_ORIGIN` must be the public https origin.** The cards' `og:url`/`og:image` and the oEmbed same-origin validation derive from `config.publicOrigin` (default `http://localhost:5181`). On staging the droplet `.env` must set `PUBLIC_ORIGIN=https://staging.unbnd.ink`, else cards carry localhost URLs and oEmbed rejects real links. Not a code change — a **deploy-checklist item**, plus a post-deploy smoke: `curl -A "facebookexternalhit/1.1" https://staging.unbnd.ink/book/<slug>` returns the card document; a browser UA returns `index.html`.
3. **Product coherence — card uses the canonical record, not `effectiveBook` (`apps/api/src/unfurl/readers.ts`).** `readBook` returns the canonical catalog record; the book-detail page renders `effectiveBook` (author-verified overlays). For a verified-author-edited book the card title/cover could differ from the page. Accepted trade-off (the card avoids the heavier 4-read + trust-verification path; edits are rare). *Recommendation: revisit only if author edits become common.*
4. **Minor — oEmbed niceties.** `maxwidth`/`maxheight` are parsed and plumbed to `toOEmbed` but not applied (no-op for `type:"link"`); `thumbnail_width`/`thumbnail_height` are omitted though the oEmbed spec SHOULDs them when `thumbnail_url` is present (we don't know cover dimensions). Cosmetic; safe to leave.

## Verdict
**PASS** — all gates green, all ACs covered, ADR/house-rules adhered to, security handled. The one ADR deviation (deferred optional cache) is justified and surfaced; the `PUBLIC_ORIGIN` item is an ops/deploy note to carry forward, not a code defect.
