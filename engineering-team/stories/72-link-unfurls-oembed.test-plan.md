# Test Plan: Story 72 — Link unfurls and per-book metadata (oEmbed)

**Story:** `engineering-team/stories/72-link-unfurls-oembed.md`
**ADR:** `engineering-team/decisions/0070-link-unfurls-oembed.md`
**Date:** 2026-06-07

## Coverage map
Two test levels. The bulk is the **pure card model** (`buildBookCard` / `renderUnfurlHtml` / `renderGenericHtml` / `toOEmbed`) — no I/O, every branch fixture-testable. The **route** layer (supertest + DI fakes) covers wiring, the no-book fallback, the oEmbed endpoint, and the same-origin security gate.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (per-book metadata: cover, title, author) | `it("emits per-book og:title, og:url, and an absolute og:image")` + `it("serves an HTML document with the book's og:title, canonical url, and oEmbed link")` | `test/unfurl/card.test.ts`, `test/routes/unfurl.test.ts` | unit + integration |
| AC-2 (raw rating + top tags in metadata) | `it("puts the author, raw rating, and tags into og:description")` + `it("takes the top 3 net-positive tags …")` | `test/unfurl/card.test.ts` | unit |
| AC-3 (discoverable oEmbed endpoint + payload) | `it("advertises a machine-discoverable oEmbed link …")`, `it("returns a version-1.0 link type …")`, `it("returns the oEmbed link payload for a valid same-origin book url")` | both files | unit + integration |
| AC-4 (raw only, no trust number/tier/label) | `it("never carries a trust/observer-weighted number — the card is raw by construction")`, `it("shows the raw community rating and tags, never a trust-weighted number")`, `it("never returns an embeddable html field … and no trust number")` | both files | unit + integration |
| AC-5 (no ratings → omit rating, no fake 0.0) | `it("returns a null rating label when there are no ratings …")`, `it("omits the rating from og:description when the card has no rating")`, `it("omits the rating field when the card has no rating")` | `test/unfurl/card.test.ts` | unit |
| AC-6 (unknown slug → no fabricated card) | `it("serves the generic site card … when the slug has no book")`, `it("returns 404 for a same-origin book url whose slug has no catalog book")`, `it("emits the generic site card with no fabricated book-specific title")` | both files | unit + integration |
| AC-7 (humans still get the SPA) | **config-level** — see Edge cases / "AC-7" below | `deploy/Caddyfile` | config review + smoke |

## Edge cases
- [x] Hostile book title (`& " < <script>`) — `renderUnfurlHtml — escapes book-derived strings` asserts HTML-text + attribute escaping (security, ADR 0070). No raw markup reaches the document.
- [x] Cover present vs absent — `summary_large_image` vs `summary` twitter:card.
- [x] Tag with `disputes ≥ applies` — excluded (no net-positive consensus).
- [x] oEmbed `url` from a foreign origin — `400` (no SSRF; slug parsed, url never fetched).
- [x] oEmbed `url` same-origin but not a `/book/` path — `400`.
- [x] oEmbed `format=xml` — `501` (only `json` supported).
- [x] Rating average rounding — `toFixed(1)` of 4.25 (test accepts 4.2/4.3 for JS half-even).
- **AC-7 (human SPA untouched):** not a vitest assertion — it is a property of the Caddy routing (only a crawler User-Agent on `/book/*` is reverse-proxied to `/unfurl/…`; every other request keeps `try_files … /index.html`). Verified by reviewing the `deploy/Caddyfile` diff in the Review phase and a post-deploy smoke (`curl` with a browser UA returns the SPA `index.html`; `curl` with a `facebookexternalhit` UA returns the card document). The unfurl route is additive and never touches the static path, so no vitest regression is possible here.

## Test infrastructure
- Test runner: Vitest. Unit at `apps/api/test/unfurl/`, integration at `apps/api/test/routes/`.
- The card model is pure (no relay/DB); the route uses express + supertest + `vi.fn` DI fakes (`readBook`, `readRawRatings`, `readRawTags`) — no intra-module `vi.mock`, mirroring `homepage-shelves.test.ts`.
- Reuses existing types: `PublicBook` (`apps/api/src/books/effective.ts`), `RawBookTags`/`RawTagConsensus` (`apps/api/src/tags/aggregate.ts`). The Implementer wires the real readers to `parseBook` + `rawFromParsed` + `aggregateBookTags` (raw, no observer) in `apps/api/src/app.ts`.
- No new dependency. `config.publicBaseUrl` is read in Implementation (the test passes it via the cast `baseConfig`).

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/unfurl/card.test.ts test/routes/unfurl.test.ts
pnpm --filter @unbnd/api test
pnpm -r typecheck
```

## Verification
The new tests fail with the current stub code. Confirmed 2026-06-07:

```
 ❯ test/unfurl/card.test.ts        (16 tests | 11 failed)
 ❯ test/routes/unfurl.test.ts      ( 8 tests |  7 failed)
```

`pnpm -r typecheck` is clean (0 errors). No regressions: the only failing files in the api suite are the two new unfurl files (`2 failed | 103 passed | 2 skipped`). The handful of green assertions inside the new files are stub coincidences (e.g. `ratingLabel` null, empty `topTags`, `{}` oEmbed has no `html`) that remain correct after Implementation.
