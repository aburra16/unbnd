# ADR 0070: Link unfurls and per-book metadata (oEmbed)

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/72-link-unfurls-oembed.md`

## Context
A shared `/book/:slug` link is how a Founding Curator's curation travels (social-loop PRD §5.5; Block 2 gate). Today it cannot: the web app is a static SPA served by **Caddy** at the edge (`deploy/Caddyfile` — `handle { root * /srv; try_files {path} /index.html; file_server }`), and `apps/web/index.html` carries one **static** Open Graph block (`<title>Unbnd</title>`, `og:title "Unbnd"`, `og:image /og-image-1200.png`) for every route. So every book link unfurls identically. There is no SSR, no head-management library, and Caddy reverse-proxies only `/api/*`, `/auth/*`, `/health*` to the Express API (`api:8787`).

Social unfurl crawlers (`facebookexternalhit`, `Twitterbot`, `Slackbot`, `Discordbot`, `WhatsApp`, `TelegramBot`, `LinkedInBot`, `redditbot`, …) **do not execute JavaScript** — Open Graph / Twitter-card metadata is fundamentally something a server must deliver in the initial HTML. A real human, by contrast, never sees the OG tags and wants the fast static SPA. These two consumers have opposite needs on the same URL.

Constraints:
- **The human read path must not regress** (PRD quality bar — humans keep Caddy's static `file_server`; no Node in the hot path for real users).
- **Raw rating only** (AC-4). An unfurl has no viewer, so a per-observer trust-weighted number is meaningless and a POV violation. This is the same raw-vs-weighted invariant as #70–#71 (filter-at-view-time: with no viewer there is no filter, so raw is the only honest value).
- **No new infra dependency**, no new runtime tooling, no new npm package without justification.
- Reuse the existing per-book reads: book record (`apps/api/src/routes/books.ts:42`, model `apps/api/src/books/effective.ts:23` `PublicBook`), raw ratings (`apps/api/src/ratings/summary.ts:rawFromParsed` → `{ count, average }`), raw tag consensus (`apps/api/src/routes/tags.ts:226`, no observer → raw `applies/disputes`).

DList: read-only. `kind:39999` book record (under `39998:<librarian>:books`) and the `book-ratings` raw aggregate. No event written, no new kind. Librarian pubkey resolved at runtime via `config.librarianPubkey` (never hardcoded), as in the existing read routes.

## Options considered

### Option A — Caddy bot-aware reverse-proxy to a dedicated Express unfurl service
Add a `handle /book/*` block in the Caddyfile, *before* the SPA catch-all, with a User-Agent matcher: a recognized crawler is reverse-proxied to a new Express route (`GET /unfurl/book/:slug`) that returns a tiny purpose-built HTML document — per-book OG + Twitter tags, an oEmbed discovery `<link>`, and nothing else (crawlers need no SPA JS). Every non-crawler request falls through to the unchanged `try_files … /index.html` static path. The oEmbed JSON endpoint (`GET /api/oembed?url=…`) rides the existing `/api/*` proxy — no Caddy change for it.
- **Pros:** The human static path is byte-for-byte unchanged (zero perf/risk regression for real users). The crawler gets a clean, server-rendered card document with always-fresh raw data. Reuses every existing read function. No new infra, no new dependency. An *unrecognized* crawler simply gets today's generic site card — graceful degrade, never worse than now. Clean module boundary: the "unfurl document" is a distinct artifact, not a mutated SPA shell. This is the well-trodden "dynamic rendering" pattern, applied to exactly the consumer it's correct for (JS-blind social crawlers).
- **Cons:** A User-Agent allowlist is a small maintenance surface (new crawler UAs appear). Mitigated by a generous case-insensitive regex (`bot|crawl|spider|preview|embed|unfurl|facebookexternalhit|slack|discord|whatsapp|telegram|twitter|…`) and by graceful degrade on a miss.

### Option B — Move SPA serving into Express; inject meta into index.html for everyone
Replace Caddy's `file_server` with Express serving `apps/web/dist`, and on `/book/:slug` read the book and template OG tags into a cloned `index.html` for **all** requests (human + bot).
- **Pros:** No UA detection; everyone gets correct tags; one code path.
- **Cons:** **Regresses the human read path** — every page load now goes through a Node string-template instead of Caddy's static serving. Node becomes the web front door; Caddy's efficient static/compression/caching posture is lost and the blast radius of an API hiccup grows to "the whole site is down." Against the quality bar (don't put Node in the hot path for data a human never sees). Rejected.

### Option C — Edge worker (Cloudflare) HTML rewrite
Intercept at the edge, fetch metadata, rewrite the head.
- **Pros:** Scales, offloads origin.
- **Cons:** A whole new vendor/infra dependency and deploy surface for a single-droplet staging app. Over-engineered now; revisit only if crawler load ever justifies it. Rejected.

### Option D — Build-time prerender per slug
Enumerate slugs at CI, emit one HTML per book.
- **Cons:** Breaks on every new submission (catalog ~11k and growing), ratings/tags go stale immediately, build artifacts explode. The story explicitly warns against this. Rejected.

## Decision
We chose **Option A** — a Caddy bot-aware reverse-proxy to a dedicated Express unfurl service, plus an `/api/oembed` JSON endpoint.

It is the only option that keeps the human static path untouched while giving JS-blind social crawlers a correct, always-fresh, per-book card, with no new infra, no new dependency, and graceful degrade for unrecognized crawlers. Open Graph for social crawlers genuinely requires server-delivered tags, and those crawlers are exactly the consumer dynamic-rendering is correct for.

## Consequences
- **Enables:** rich per-book unfurls on the platforms curators post to; a discoverable oEmbed endpoint; a clean, pure, unit-testable card model reused by both the HTML head and the oEmbed JSON.
- **Constrains / makes harder:** introduces a User-Agent allowlist to maintain (bounded, regex-based, degrades gracefully). The unfurl HTML and oEmbed must HTML/attribute-escape all book-derived strings (a title may contain `"`/`<`) — a security requirement called out for the Implementer.
- **New follow-up / debt:** the crawler allowlist will need occasional additions; documented in the route. A future production cut-over will set `PUBLIC_BASE_URL` for the apex.
- **Affects existing fixtures?** No. New tests only; no change to existing event/response fixtures.
- **New dependency?** **No.** HTML is assembled by a small pure renderer (no template engine); oEmbed is plain JSON; UA matching is a Caddy directive. The only config addition is an env var `PUBLIC_BASE_URL` (the absolute origin for `og:url`/`og:image`/oEmbed `provider_url`), parsed in `apps/api/src/config.ts` like the other optional env (honest-empty if unset → unfurl falls back to a relative/skipped absolute URL and the generic card).
- **PRD section change required?** No. This implements §5.5 as written.

## Implementation notes
Concrete; the Implementer reads this.

**1. Pure card model + renderers (fully unit-testable, no I/O).**
- New `apps/api/src/unfurl/card.ts`:
  - `type BookCard = { slug; title; authorName; coverUrl: string | null; ratingLabel: string | null; topTags: string[]; canonicalUrl: string }`.
  - `buildBookCard(book: PublicBook, raw: { count: number; average: number | null }, tags: RawConsensus, baseUrl: string): BookCard`.
    - `ratingLabel`: when `raw.count > 0 && raw.average != null` → `"★ " + average.toFixed(1) + " · " + count + " ratings"`; when `raw.count === 0` → **`null`** (AC-5, honest-empty — never "0.0").
    - `topTags`: from the raw consensus, net-positive `(applies − disputes) > 0`, sorted by net desc then name, take **3**. Genres first, then styles/signals (Architect's call; reuse `apps/api/src/routes/tags.ts` consensus shape, **no observer → raw**, AC-4).
    - `canonicalUrl`: `${baseUrl}/book/${slug}`.
  - `renderUnfurlHtml(card: BookCard, baseUrl: string): string` → a minimal HTML5 document. Head carries: `<title>`, `og:title` (book title), `og:description` (author + ratingLabel + topTags joined with ` · `, ratingLabel omitted when null), `og:image` (absolute `coverUrl` when present, else the existing `/og-image-1200.png` absolute), `og:url` (canonicalUrl), `og:type "book"`, `twitter:card "summary_large_image"` (or `summary` when no cover), and the oEmbed discovery link: `<link rel="alternate" type="application/json+oembed" href="${baseUrl}/api/oembed?url=<urlencoded canonicalUrl>" title="<title>">`. Body: a single human-readable `<h1>`/cover fallback (crawlers ignore it; it is also the no-JS fallback). **Every interpolated value MUST be HTML-text-escaped and, in attributes, attribute-escaped** — add a tiny local `escapeHtml`/`escapeAttr` (no dependency).
  - `toOEmbed(card: BookCard, opts: { maxwidth?; maxheight? }): object` → oEmbed 1.0 **`type: "link"`** payload: `{ version: "1.0", type: "link", title, author_name: authorName, provider_name: "Unbnd", provider_url: baseUrl, thumbnail_url: coverUrl ?? undefined }`, plus our structured extras `rating: ratingLabel ?? undefined, tags: topTags`. `"link"` (not `"rich"`) avoids returning embeddable HTML — no injection surface.

**2. Express routes.** New `apps/api/src/routes/unfurl.ts` → `buildUnfurlRouter(deps)` where `deps` injects the existing read functions (DI, so tests pass fakes — same pattern as `homepage-shelves.ts`): `readBook(slug)`, `readRawRatings(slug)`, `readRawTags(slug)`, and `config` (for `librarianPubkey`, `publicBaseUrl`). Mount in `apps/api/src/app.ts` alongside the other routers.
  - `GET /unfurl/book/:slug` → `200 text/html` with `renderUnfurlHtml`. **Unknown slug (no catalog book) → serve the generic site card** (the existing static OG values, no book-specific fields) — satisfies AC-6 "no fabricated book card." Never throws to the crawler; on read error, degrade to the generic card.
  - `GET /api/oembed` → reads `?url=`, **validates** it is `${publicBaseUrl}/book/<slug>` (same-origin, `/book/` path) — reject other origins/paths with `400` (no SSRF; we only parse the slug, we never fetch the url). Unknown slug → `404` (oEmbed spec). Otherwise `200 application/json` with `toOEmbed`. Honor `format` (`json` only; `xml` → `501`).

**3. Caddy.** `deploy/Caddyfile`, in the `{$SITE_ADDRESS}` site, add **before** the SPA `handle {}` catch-all:
```
handle /book/* {
    @crawler header_regexp User-Agent (?i)(facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|redditbot|pinterest|googlebot|bingbot|embedly|bot|crawl|spider|preview|unfurl|embed)
    handle @crawler {
        rewrite * /unfurl{uri}
        reverse_proxy api:8787
    }
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
}
```
The human path stays the static SPA; `/api/oembed` already proxies via the existing `handle /api/*`.

**4. Config.** `apps/api/src/config.ts` — add optional `publicBaseUrl` from `env.PUBLIC_BASE_URL` (validate it parses as an absolute http(s) URL; honest-empty/undefined if unset). Add `PUBLIC_BASE_URL=https://staging.unbnd.ink` to the droplet env (`docker-compose.prod.yml` api service) at deploy — an ops note, not code.

**5. Caching (open Q3).** Read-on-request, reusing the existing read paths (no trust computed on the request path). Add a small in-process TTL cache (a `Map<slug, {card, expires}>`, TTL ~300s — slow-changing data, no new dependency) inside the unfurl router to absorb crawler bursts. Keep it optional/behind a tiny helper so it is easy to test (inject `now()`).

## Out of scope
- The "value before account" read behavior on the landing page (the full book page readable with no account + the single write-action prompt) — sibling story #73.
- Unfurls for any route other than `/book/:slug`.
- An `xml` oEmbed format (return `501`), and oEmbed `type: "rich"` embeds.
- Per-book OG tags for *human* requests (intentionally not served — humans get the SPA; only crawlers get the card document).
- A production apex cut-over (only `PUBLIC_BASE_URL` wiring is noted).
