# Story 111: Images are served through Unbnd

**Origin:** book covers load slowly on staging, in the catalog and on a book's page, and the signed-in avatar is slow (2026-10-22).

## Problem
Every cover comes straight from Open Library at its large size. Most Open Library cover URLs redirect twice and end at an archive.org script that pulls the JPG out of a zip file on request: 1 to 1.5 seconds per cover on a good day, worse while archive.org recovers from an outage. A catalog page asks for dozens at once, at the large size (30 to 80 KB each), for cards a few hundred pixels tall. Profile pictures load from wherever the person put them, at full size: the operator's is a 2.5 MB animated GIF drawn at 30 pixels.

## Acceptance criteria
1. **An image proxy that only serves Unbnd's URLs.** imgproxy resizes images and serves only URLs the API has signed, through two presets: `cover` (fit within 400 by 600) and `avatar` (fill 144 by 144), as WebP, first frame only for animations. It never fetches from loopback, link-local or private addresses, so it cannot reach the API, database or relay containers.
2. **Each image fetched once.** An nginx cache in front of imgproxy keeps every resized image on disk (bounded, oldest out first) and lets one request fetch a missing image while others wait for it. A source that fails is not cached for long.
3. **The API hands out proxied URLs.** When the image proxy is configured, every JSON response under `/api` that carries an http(s) `coverUrl` also carries `coverImage`, and every http(s) `picture` also carries `pictureImage`: signed proxy URLs for the `cover` and `avatar` presets. The original fields are unchanged. Without the configuration, nothing is added.
4. **The app uses them, and falls back.** Book cards, the book page and avatars show the proxied image. If it fails to load, they show the original; if that fails, the gradient or initials as today.
5. **Ops.** Caddy routes `/img/*` to the cache. The signing key and salt live only in the droplet's `.env` and the API and imgproxy containers; a Staging ops task creates them when missing without printing them.

## Out of scope
- Open Graph images in link unfurls (crawlers fetch once; they keep the original URL).
- Images inside blurbs or other free text.
