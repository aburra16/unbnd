# ADR 0099: Covers and profile pictures go through a signed, cached image proxy

**Status:** Accepted
**Date:** 2026-10-22
**Story:** `engineering-team/stories/111-images-through-unbnd.md`

## Context
Covers are Open Library URLs at the large size; most redirect twice and are cut out of zip files by an archive.org script on every request (1 to 1.5 s each). Profile pictures are arbitrary URLs at full size. The catalog grew to about 159,000 books (ADR 0097), so most covers a reader sees have never been seen by anyone before them.

## Decision
1. **imgproxy** (`darthsim/imgproxy:v4.0.17`) resizes. It runs only on the compose network and only in presets mode (`IMGPROXY_ONLY_PRESETS=true`): `cover` = fit within 400 by 600, `avatar` = fill 144 by 144 with smart gravity. Output is WebP (in the URL), animations keep one frame. Signed URLs only (`IMGPROXY_KEY`, `IMGPROXY_SALT`). Source addresses on loopback, link-local and **private** networks are refused (`IMGPROXY_ALLOW_PRIVATE_SOURCE_ADDRESSES=false`; its default is `true`, which would let a signed URL reach `db`, `api` or `tapestry`). Sources are capped at 20 MB and 50 megapixels, with a 10 s download timeout and 2 workers.
2. **Signing in the API.** `imageProxyUrl(src, preset)` builds `/img/<signature>/<preset>/<base64url(src)>.webp`, the signature being imgproxy's: URL-safe Base64 of HMAC-SHA256 (`node:crypto`) over the salt and the path, keyed by the key. Signing is what keeps the proxy from being a free image service for anyone: profile pictures and author covers may sit on any host, so an allowlist of sources cannot close it.
3. **One place adds the URLs.** A response transform on `/api` walks each JSON body and, beside every http(s) `coverUrl` and `picture`, adds `coverImage` and `pictureImage`. Books reach the client through many routes and are merged with author overlays late, so the last moment before sending is the one place every final cover passes through. It copies the body rather than changing it in place (bodies can hold cached objects). Without `IMAGE_PROXY_KEY` and `IMAGE_PROXY_SALT` it does nothing, so local development and tests are unchanged.
4. **nginx** (`nginx:1.30.6-alpine`) caches imgproxy's output on a volume: at most 5 GB, unused entries dropped after 90 days, successes kept 30 days, misses 1 minute; `proxy_cache_lock` so a missing image is fetched once; stale entries served while one refresh runs or when the source fails. Caddy sends `/img/*` to it.
5. **The client prefers the proxy and falls back.** Cards, the book page and avatars use `coverImage` and `pictureImage`; on a load error they switch to the original URL, then to the gradient or initials.
6. **Keys.** `IMAGE_PROXY_KEY` and `IMAGE_PROXY_SALT` (64 hex characters each) live in the droplet `.env`; compose passes them to the API and to imgproxy. A Staging ops task `image-keys` adds them with `openssl rand` when missing and never prints them.

## Alternatives rejected
- **Resizing in the API with sharp and a disk cache.** The fetch rules that keep a proxy safe (redirect limits, private-address checks after every redirect, size and pixel limits, decoder hardening) would be code we own and audit; imgproxy is built around them.
- **Unsigned imgproxy with an allowlist of sources.** Fine for Open Library covers, but profile pictures and author covers come from any host.
- **A Caddy cache plugin.** Needs a custom Caddy build; nginx's cache is a stock image and long proven.
- **Smaller Open Library sizes only (`-M.jpg`).** Saves bytes but keeps the archive.org round trip on every first view.

## Consequences
- Two containers on the droplet (imgproxy, within a few hundred MB; nginx, a few MB) and up to 5 GB of disk.
- The first view of each cover still waits for Open Library once; every later view, by anyone, comes from the droplet.
- If the proxy is down, images load from their origins as before.
