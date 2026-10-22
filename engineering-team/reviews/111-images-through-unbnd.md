# Review: Story 111 — Images are served through Unbnd

**Reviewer:** independent reviewer (rounds 1 to 3)
**Date:** 2026-10-22

## Round 1: FAIL, three blocking
1. **Two workers could not serve a cold page.** In imgproxy v4 a download holds its worker, and the 10 s request timeout includes the wait: 16 cold covers at once gave 11 errors after 10 s, and nginx kept the errors for a minute. **Fixed:** 16 workers, a 5 s download timeout, sources capped at 24 megapixels to stay inside 768 MB; errors are never cached. Re-run against real imgproxy and nginx: 16 cold covers, all 200, in 1.1 to 1.3 s; imgproxy at 35 MB.
2. **The cache key let one URL answer for another.** nginx keyed on the decoded URI while imgproxy checks the raw path, so a request for a variant (`%2Ewebp`, a doubled slash) stored imgproxy's 403 under the real URL's key. **Fixed:** the key is `$request_uri`, and only 200 (30 days) and 404 (1 minute) are cached. Re-run: the variants get 403 and are not cached; the real URL then goes MISS, HIT.
3. **Search results skipped the proxy.** The Search page's own card mapping did not carry `coverImage`. **Fixed**, with a test.

Non-blocking, fixed in the same round:
- The transform passes non-plain objects (a `Date`, anything with `toJSON`) through untouched and keeps a `__proto__` key from data an own key.
- Image fallbacks start over when the sources change (an avatar that stays mounted while its person or picture changes).
- The deploy's key step treats an empty value as missing and stops if `openssl` produces no key.
- nginx re-resolves imgproxy every 30 s, so a recreated imgproxy is found again.
- imgproxy's landing page answers 404.
- The ADR, story and DEPLOY.md describe what was built: keys made by the deploy, and a rotation re-fetches every image once.

Accepted and recorded: anyone can publish a kind-0 whose picture Unbnd will sign; the fetch limits bound what one source costs, and a rate limit on `/img` waits until abuse shows. The SSRF checks passed in round 1 (private, loopback, link-local, CGNAT and IPv6-mapped addresses, names resolving to private addresses, redirects to them, a pixel bomb, unsigned URLs).

## Round 2: FAIL, one blocking
The round 1 fixes held, each pinned by a test that fails on the red commit. Through the real chain (Caddy, nginx, imgproxy): Caddy passes escaped paths through raw and cleans `//` and `/./`; nginx forwards the request URI unchanged, so the cache key and the path imgproxy verifies are the same. Cold covers no longer queue in imgproxy; the remaining failures came from Open Library itself and were not cached.

**B4. A crafted image exhausted imgproxy's memory.** An interlaced 16-bit PNG of 750 KB decodes to the full 24-megapixel cap: four at once killed a 768 MB container. Anyone can publish a kind-0 picture pointing at such a file. **Fixed:** the cap is 12 megapixels and the limit 1 GB. Re-run with the reviewer's files, 16 at once: 24-megapixel files refused at once (21 MB in use); 12-megapixel files served, three rounds, 626 MB peak, no restart. The download timeout went from 5 to 8 s so a slow Open Library cover is still fetched and kept (N9).

Accepted and recorded: `/img/health` answers from outside (harmless, not cached); the nginx and deploy changes are checked by end-to-end runs rather than tests.

## Round 3: PASS
Confirmed independently with 16 concurrent requests per source, twice each, in a 1 GB container: 24-megapixel sources (interlaced or not, 750 KB or 19 MB) refused at about 20 MB in use; 12-megapixel interlaced 16-bit PNGs, the worst case under the cap, peaked at 576 to 596 MB, including three waves of 32 requests; no restart. The full chain (Caddy, nginx, imgproxy) still serves, caches and refuses as in round 2.

Accepted and recorded: formats with more bytes per pixel than 16-bit RGBA are untested against the cap; watch imgproxy's memory on staging after deploy.

## Quality gates (at HEAD)
- [x] typecheck, build and tests clean: api 1060 + 13 skipped, web 462, ui 20, all other packages unchanged; `caddy validate`, `nginx -t`, `docker compose config`.

## Verdict
**PASS.** After merge and deploy: check the keys were created, that `/img` serves a cover (MISS, then HIT), and imgproxy's memory in `show-status`.
