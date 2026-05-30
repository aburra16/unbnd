# ADR 0020: Real public profile at `/profile/:npub` — public by-pubkey twins + Substack-link display, retire the Mira fixture

**Status:** Proposed
**Date:** 2026-05-30
**Story:** `engineering-team/stories/20-public-profiles.md`

## Context

Story 19 (ADR 0019) made the signed-in user's **own** `/profile/me` real: server-enriched shelf grid, honest activity counts, account-dropdown nav. The last fixture in the app is the **public** profile route. `apps/web/src/routes/Profile.tsx` still renders the hard-coded Mira Calloway record from `apps/web/src/data/profile-fixtures.ts` for any `/profile/:handle`. It is the only screen lying to users.

This story makes the public profile real for **any** user, keyed by npub, and retires the Mira fixture. It is the trust-independent core (Lane 1) of **phase2-prd §2.4 "Public profiles + real activity"**: identity header, public shelves, and activity counts for a target user, all read from that user's own events. It also folds in **phase2-prd Appendix C-1 "External writing link"**, scoped to a Substack link (display only).

The eight acceptance criteria (paraphrased): real identity header from kind-0 with no Mira data (AC-1); initials+npub fallback for a target with no kind-0, page still renders shelves/counts (AC-2); public shelves for the **target** user as the Story-19 enriched grid, unresolvable books omitted + recounted (AC-3); honest activity counts author-scoped to the **target**, a failing single count hidden not faked, a true `0` shown (AC-4); the Mira `ProfileRecord` + `getProfileRecord` gone and `Profile.tsx` no longer importing the fixture (AC-5); invalid/unresolvable npub → honest `NotFound` (AC-6); "Writes on Substack" link on **both** `/profile/:npub` and `/profile/me` when kind-0 carries the field (AC-7); malformed Substack URL ignored, light validation only (AC-8).

This is almost entirely **wiring existing pieces**. The story is the public, by-pubkey twin of Story 19's session-scoped surface; the pure functions Story 19 built (`groupOwnShelves`, the `parseBook → PublicBook` enrichment, `countOwnRatings`, `countOwnAppliedTags`) work unchanged for a target pubkey. Only the author filter and the gate change.

### User-gate decisions already made (honored, not re-litigated)
- **Routing:** `/profile/:npub` (npub-addressed; nip05-handle addressing deferred to a later story). The current `:handle` param on `Profile.tsx` becomes `:npub`.
- **Substack storage:** in kind-0 content under a dedicated `substack` field. THIS story only **displays** it (reads from kind-0). The SET / kind-0 write is the next story (21). This ADR names the field key so 21 writes the same key; no write path is designed here.
- **Custodial users with no kind-0** → initials+npub fallback profile for everyone (not sovereign-gated).
- **Q4** (un-authenticated full author-scan per npub) → resolved in Decision 4 below.

### Architecture invariants check (CLAUDE.md)
- **POV-first:** N/A — every read here is `authors:[targetHex]`, a single author's own events. No trust weighting, no GrapeRank, no observer parameter. "Who is this true for?" — exactly one author, the target. Shelves are public-only (Story 18), so there is no privacy filter and no per-POV column to compose. The trust-tier badge (the one trust-dependent §2.4 element) stays out (see Scope).
- **Decentralized-first:** honored — the public reads accept the target's signed events as-is; nothing is gated by "verified"/"approved". A target who never published a kind-0 still gets a profile (AC-2). The reads do not gate on who the *viewer* is (un-authenticated).
- **Filter at view time:** honored — counts and enrichment are computed on read from raw DList events. Decision 4 keeps that and adds only a short pubkey-keyed TTL cache on the public reads, with an explicit invalidation story (time only).
- **Librarian pubkey resolved at runtime:** honored — every concept handle is built from `deps.config.librarianPubkey` via the existing `lib()` accessor (shelves.ts, profile-stats.ts). No hardcode. The Mira fixture's `FIXTURE_LIBRARIAN_PUBKEY` is removed with the fixture.
- **No new tooling:** none added. `pnpm -r typecheck` + Vitest stay the gates.

### DList shapes
No new shape. All reads are existing kinds, keyed by the **target** pubkey, plus a kind-0 read on public relays. Identical shapes to ADR 0019, author swapped from session to target:
- `kind:0` — NIP-01 user metadata (identity header + the new `substack` field). Read path exists: `apps/api/src/nostr/profile.ts` (`fetchProfileMeta`/`parseKind0`) + `GET /api/profile/:id`.
- `kind:39999` under `39998:<librarian>:book-shelves` — the target's public shelves (`authors:[targetHex]`).
- `kind:39999` under `39998:<librarian>:books` — catalog enrichment (`parseBook → PublicBook`).
- `kind:39999` under `39998:<librarian>:book-ratings` — counts (`authors:[targetHex]`).
- `kind:39999` under `39998:<librarian>:book-tag-assertions` — counts (`authors:[targetHex]`).

### Tapestry prior art
The relevant patterns were already cribbed into this codebase by ADRs 0009/0012/0018/0019 and are reused verbatim — no fresh survey is warranted because no new shape is introduced. The single-author "my events" read (`git show origin/feat/communities:COMMUNITY_RECORDS_DLIST.md`) is realised by `groupOwnShelves` + the `authors:[…]` filter; the latest-wins dedupe/polarity (`git show origin/feat/pubkey-tagging-target:engineering-team/decisions/0009-...`) is realised by `countOwnRatings`/`countOwnAppliedTags`. The TTL-cache shape in Decision 4 mirrors `apps/api/src/trust/brainstorm.ts` (`Cached<T> = { value, at }` + a `now() - at < TTL_MS` freshness check).

---

## Decision 1 — Public endpoints: by-pubkey twins, new thin handlers, shared pure functions

Expose two **un-gated** public reads in the `/api/profile/:npub` namespace, parallel to the session-gated `/api/profile/me/stats` and `/api/shelves/mine`:

```
GET /api/profile/:npub/shelves   → 200 { shelves: EnrichedShelf[] }
GET /api/profile/:npub/stats     → 200 { stats: { booksRated?, reviews?, tagsApplied? } }
```

Both resolve `:npub` → hex, then run the **exact same pure functions** Story 19 built, author-scoped to the target instead of the session user:
- **`/shelves`:** `groupOwnShelves(events)` over `{ kinds:[39999], "#z":[shelvesConcept()], authors:[targetHex] }`, then the same batch-enrich step from `shelves.ts` (one catalog read over the distinct slugs, `parseBook → PublicBook`, omit-unresolved + recount). Returns the same `EnrichedShelf` shape. Shelves are public-only (Story 18), so no privacy filter.
- **`/stats`:** `countOwnRatings(...)` + `countOwnAppliedTags(...)` over the target's ratings/tag-assertion events, each read **wrapped independently** so a single failing source omits only its field — the same per-field `{ ok }`/optional-field pattern in `profile-stats.ts`. Present `0` = true zero (rendered); absent = read failed (hidden). Never a fabricated `0`.

### Option A — new thin public handlers, observer = path param (chosen)
Add a public, un-gated handler for each twin. The shelves twin lives in `routes/shelves.ts` (it already imports `groupOwnShelves` + `parseBook`); the stats twin lives in `routes/profile-stats.ts` (it already imports `countOwnRatings`/`countOwnAppliedTags`). Each public handler:
1. `toHex(req.params.npub)` (reuse the `toHex` helper already in `routes/profile.ts` — extract it to a tiny shared `nostr/npub.ts` so all three routes share one validator);
2. on `null` → respond with a structured `404 { error: { code: "not_found", … } }` (see invalid-npub handling below);
3. on `503` if no librarian (mirror the existing guards);
4. run the shared pure function author-scoped to the resolved hex;
5. return the existing response shape.

The session-gated `/me` handlers are **unchanged**: they resolve the author from the session; the public handlers resolve it from the path param. Same pure core, two thin entry points differing only in *where the author comes from* and *whether a session is required*.

- **Pros:** zero change to the audited `/me` handlers and their tests; the pure functions are already the shared seam, so there is nothing more to share; each twin sits in the file that already owns its imports (no new cross-module wiring); the public/gated boundary is explicit per-route (a public read can never accidentally inherit session gating, and the `/me` read can never accidentally accept an arbitrary author). The `toHex` extraction is the only refactor and it removes a duplication.
- **Cons:** two small new handlers (~25 lines each) rather than one parametrised handler. Acceptable — the gating and author-source genuinely differ, so a single handler would need a branch on "session vs param" that muddies the boundary CLAUDE.md asks us to keep crisp.

### Option B — one parametrised handler per resource, author = session-or-param (rejected)
Make a single `/shelves` handler take an optional `:npub`; when absent, fall back to the session user; when present, use the param and skip the gate.
- **Pros:** one handler per resource.
- **Cons:** the handler now carries a `if (param) { public } else { session-gated }` fork — the exact "session-gated author scan bolted onto a public-by-id route" muddle ADR 0019 Decision 2 (Option B) already rejected for the same reason. It risks a refactor later flipping the gate on the wrong branch and leaking either an arbitrary-author scan behind the session route or a session read behind the public route. The boundary is safety-relevant; keep it physical.

**Chosen: Option A.** New thin public handlers; shared pure functions; `toHex` extracted to one validator. The PO recommended exactly this namespace (`/api/profile/:npub`, `/api/profile/:npub/shelves`, `/api/profile/:npub/stats`); this confirms it and rejects the `?owner=` alternative for namespace consistency.

### npub→hex resolution + invalid-npub handling (AC-6)
Reuse the existing `toHex` (`routes/profile.ts` L18-27): accepts a 64-char hex or a valid `npub` bech32, returns lowercase hex or `null`. Extract to `apps/api/src/nostr/npub.ts` and import in all three routes.

- **Invalid syntax** (`toHex` → `null`): the existing `/api/profile/:id` returns `400 invalid_pubkey`. For the two new twins, return `404 { error: { code: "not_found", message: "No such profile." } }` rather than `400`, because the web `/profile/:npub` route maps an unresolvable segment to the honest `NotFound` page (AC-6), and a 404 reads more naturally as "no such profile" than a 400 "bad request". (The existing identity endpoint keeps its 400 for back-compat; the web layer treats both non-200s as NotFound — see Decision 3.)
- **Valid npub, no events** (well-formed but the target has no shelves / no ratings): **not** an error. `/shelves` → `{ shelves: [] }`, `/stats` → `{ stats: {} }` (or present-`0` where a read genuinely returned zero). This is the honest empty state, the same one a real user with an empty profile produces. AC-2/AC-3/AC-4 want the page to render, not 404, in this case.
- **Hex never leaves the wire:** the resolved hex is used only as the `authors:` filter; responses carry `EnrichedShelf` (no hex, no parent header — `toPublicBook` strips both) and integer stats. The identity twin (`/api/profile/:id`) already returns npub, never hex.

### Response shapes (reused verbatim from ADR 0019)
```ts
// shelves twin — identical to GET /api/shelves/mine
type EnrichedShelf = { slug: string; name: string; count: number; books: PublicBook[] };
// → { shelves: EnrichedShelf[] }

// stats twin — identical to GET /api/profile/me/stats
type Stats = { booksRated?: number; reviews?: number; tagsApplied?: number };
// → { stats: Stats }
```
The web `api.ts` adds `api.profile.shelves(npub)` and `api.profile.stats(npub)` returning these existing types (`Shelf[]` and `ProfileStatsResponse`). No new web type.

---

## Decision 2 — Substack display: extend `parseKind0`/`ProfileMeta`, render on read with light URL validation

**Field key:** dedicated `substack` key in kind-0 content (Q2). Rationale: keeps the "Writes on Substack" label honest, leaves the standard `website` field free for a general homepage, and gives story 21 an unambiguous key to write. The displayed label is fixed as "Writes on Substack".

**Server (read):** extend `ProfileMeta` (`apps/api/src/nostr/profile.ts`) with `substack?: string`, parsed in `parseKind0` from `content.substack` via the existing `str()` helper, then **light-validated**: keep it only if it parses as an `http:`/`https:` URL. The validation lives in the parse so a malformed value never reaches the wire (AC-8):

```ts
function httpUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try { const u = new URL(s); return (u.protocol === "http:" || u.protocol === "https:") ? s : undefined; }
  catch { return undefined; }
}
// meta.substack = httpUrl(content.substack);
```
`URL` is the platform global (Node + browser) — no new dependency, no hand-rolled parsing, no domain verification. Add `substack?: string` to the web `ProfileMeta` (`apps/web/src/lib/api.ts`) too so the typed shape carries it through.

**Web (display):** both `Profile.tsx` (public) and `ProfileMe.tsx` (own) render a single text link when `meta?.substack` is present:
```tsx
{meta?.substack && (
  <a className="me-substack" href={meta.substack} target="_blank" rel="noopener noreferrer">
    Writes on Substack ↗
  </a>
)}
```
The `↗` is a typographic glyph (allowed by the design rules); no icon library, no new hex literal — the link reuses `--u-amber` via a class in the existing profile CSS. When the field is absent (or was dropped by validation), nothing renders — no empty placeholder (AC-7/AC-8). Copy "Writes on Substack" is plain; reviewed against `memory/feedback_unbnd_copy_and_visual.md` (no banned construction). Belt-and-suspenders: because validation already happens server-side in `parseKind0`, the web only ever receives a well-formed value or `undefined`; the web does not re-validate.

**No write path here.** This ADR designs only the read + display. Story 21 ("Edit your Nostr profile — set Substack + safe kind-0 merge") writes the same `substack` key through the same `ProfileMeta` shape, via the audited signer stack (NIP-07 for sovereign, server-side ephemeral wrap for custodial) with a merge-don't-clobber of the existing kind-0 fields. Flagged for 21; not designed now.

---

## Decision 3 — Web `/profile/:npub`: rewire `Profile.tsx` to the live reads, reuse the ProfileMe layout, retire the fixture

Rewrite `Profile.tsx` so the public and own views are visually consistent — derive the public view from the `ProfileMe` layout (same `Avatar`, same shelves grid via `BookGrid`/`toCardBook`, same `ProfileStats`, same npub-display fallback, same Substack link). The PO does not mandate sharing one component; the cheapest path that guarantees consistency is a small shared presentational piece, but the Implementer may instead mirror the JSX. The ADR requires the *treatment* match, not a specific extraction.

`Profile.tsx` becomes:
1. `const { npub } = useParams()` (param renamed `handle` → `npub`; update the route in `App.tsx` to `/profile/:npub`).
2. Resolve identity via the existing **public** endpoint, not the session-scoped `useProfileMeta` keyed to the logged-in user. `useProfileMeta(npub)` already calls `api.profile.get(idOrNpub)` (the public `/api/profile/:id`) and caches per-id — it is npub-keyed, not session-keyed, so it is the right hook to reuse here for the target's identity header (avatar, name, nip05, about, and now `substack`).
3. Fetch the target's public shelves (`api.profile.shelves(npub)`) and counts (`api.profile.stats(npub)`) in an effect; render shelves via `toCardBook` + `BookGrid` (Story-19 treatment) and counts via the same present-fields-only `statCells` logic in `ProfileMe`.
4. **Identity always renders** (the public endpoint always returns npub): a target with a kind-0 shows name/picture/nip05/about (AC-1); a target with none shows the `Avatar` initials + npub fallback (AC-2). No Mira data anywhere.
5. **Honest NotFound (AC-6):** if `:npub` does not resolve (the `/api/profile/:npub/...` twins answer 404, or the identity read fails on an invalid segment), render the existing `NotFound` route. A valid npub with empty shelves/counts is **not** NotFound — it renders the header + empty states. The Implementer distinguishes "invalid/unresolvable" (→ NotFound) from "valid but empty" (→ render) by the 404 vs 200-empty distinction from Decision 1.

### Fixture retirement (AC-5, Q1) — precise scope
`apps/web/src/data/profile-fixtures.ts` currently backs **only** the Mira public-profile mock; grep confirms its consumers are the public-profile surface and nothing else load-bearing. Retire precisely:
- **Delete** from `profile-fixtures.ts`: the `mira` `ProfileRecord`, the `profileRecords` map, and `getProfileRecord`. The `ProfileRecord`, `ProfileShelfFixture`, `ProfileActivity(Kind)`, and `GenreAffinity` **types/data** in that file exist only to feed the Mira mock and its components — they go too, leaving the file empty. **Delete the file** once nothing imports it.
- **`Profile.tsx`:** drop the `getProfileRecord` import and the `TrustCard` / `GenreAffinity` / `ProfileShelves` / `ProfileActivity` / `ProfileHeader` fixture-driven components (all of which type against `profile-fixtures`). These are fixture-only renderers with no live data path this story builds:
  - `TrustCard` → dropped (trust-tier badge is out of scope, §2.4 / §2.5; trust is not live).
  - `GenreAffinity` → dropped (genre-affinity chart is out of scope, §2.4).
  - `ProfileActivity` → dropped (activity feed is out of scope, §2.4 / PRD §11.3).
  - `ProfileShelves` (fixture cover-row) → replaced by the live `BookGrid` grid.
  - `ProfileHeader` (fixture-typed) → replaced by the `ProfileMe`-style header (`Avatar` + name + npub).
  These five components and their CSS become unused after the rewrite. **Removing the now-dead components is in scope** (they only exist to render the fixture; leaving them is dead code). The Implementer deletes each component file + CSS once `Profile.tsx` stops importing it and confirms no other route imports it (grep shows none do).
- **`apps/web/src/data/fixture-constants.ts`:** `FIXTURE_MIRA_PUBKEY` exists "for the `/profile/mira-calloway` route" (its own comment). After retirement it is unused — remove `FIXTURE_MIRA_PUBKEY` (verify `FIXTURE_LIBRARIAN_PUBKEY` is still used elsewhere before touching it; grep shows it backs other book fixtures, so **leave `FIXTURE_LIBRARIAN_PUBKEY`**). Remove only the Mira constant.
- **Dangling links (Q1):** grep finds **no** in-app link to `/profile/mira-calloway` (the only consumer was `Profile.tsx` via the route param). No byline/homepage link to sweep. Confirmed: nothing else points at the Mira handle, so there is no dead nav to fix beyond the route itself. (If the Implementer finds one during the change, remove/repoint it — but the survey says there is none.)

The Implementer must verify each deletion against a fresh grep at implementation time (the file may have grown other consumers); the test plan should include a "no import of `profile-fixtures` remains" assertion (AC-5).

---

## Decision 4 — Q4 caching/abuse: short pubkey-keyed in-memory TTL cache on the two public reads

The public twins are full author-scoped strfry scans, now triggerable by **any** un-authenticated visitor on **any** npub (the same cost profile as Story-19 Q3, but publicly reachable). Trivial at staging volume, but the public reachability is a mild amplification surface: a script can fan out distinct npubs and force a scan each.

### Decision: add a short in-memory TTL cache keyed by `targetHex` on each public read (chosen over accept-at-volume)
Mirror the `BrainstormProvider` cache shape (`apps/api/src/trust/brainstorm.ts`): a `Map<string, { value, at }>` per twin, freshness check `now() - at < TTL_MS`, `now` injectable for tests. Suggested TTLs: **60s** for `/shelves`, **60s** for `/stats` (short enough that a user's new shelf/rating heals within a minute; long enough to collapse a burst of repeat hits on the same npub). The cache key is the resolved hex (so npub and hex forms of the same target share an entry). Invalidation is **time-only** — acceptable because these are single-author reads with no per-POV dimension and no correctness requirement for instantaneous freshness (a profile that updates within 60s is fine; CLAUDE.md's "cache only with a clear invalidation story" is satisfied by the bounded TTL).

Why not accept-at-volume: the cache is ~15 lines per twin, reuses an in-repo pattern, and turns the repeat-hit amplification (refreshes, crawlers, a shared profile link getting traffic) from N scans into one-per-minute-per-npub. It does **not** defend against a distinct-npub flood (each new npub still scans once) — that is a rate-limit concern, explicitly **out of scope** and noted below as the residual surface. The cache is the cheap, correct-enough mitigation for the common case; a global rate-limit/WAF is the right tool for the flood case and is a deployment-layer follow-up, not an app-code decision for this story.

**Documented residual abuse surface:** an unauthenticated caller can still force one author-scan per *distinct* npub (cache misses), and the kind-0 identity read (`/api/profile/:id`) fans out to public relays per distinct id. At staging volume this is fine. If it ever gets hot in production, the mitigation is an edge/ingress rate-limit on `/api/profile/*`, not more app caching. Flagged for the user; not built here.

### Alternative — accept at current volume, no cache (rejected)
Defensible (Story 19 deferred its own caching), but Story 19's read was session-gated (only the signed-in user could trigger it, on their own pubkey). Public reachability changes the threat model enough that the in-repo TTL pattern is worth the ~15 lines now rather than after an incident.

---

## Decision 5 — Invariants (confirmation)

- **npub-display / hex-internal:** the public reads use the resolved hex only as an `authors:` filter; responses carry `EnrichedShelf` (no hex, no parent header) + integer stats + the npub-bearing identity payload. No hex leaks. Honored.
- **Honest empty states / no fabricated counts:** the per-field optional-stats shape (absent → hidden, true `0` → shown) and omit-unresolved-shelf-books-+-recount carry over verbatim from ADR 0019. A valid-but-empty profile renders empty states, not NotFound; only an unresolvable npub is NotFound. No `0` is invented. Honored.
- **Derive UI from existing components:** identity via `Avatar`; shelves via `toCardBook` + `BookGrid`/`BookCard`; counts via `ProfileStats`; Substack as a plain text link with a `↗` glyph. No new component, no new icon library, no new hex literal. The fixture-only `TrustCard`/`GenreAffinity`/`ProfileActivity`/`ProfileShelves`/`ProfileHeader` are removed, not replaced with new chrome. Honored.
- **No hand-rolled crypto:** read-only story; no signing, no key handling. npub→hex uses the existing `nostr-tools/nip19` `decode` already in `routes/profile.ts`. URL validation uses the platform `URL`. Honored.
- **No new tooling / no new dependency:** none. Honored.
- **No provider-seam leakage:** the trust provider is untouched (no trust-weighting in this story). The TTL cache is a local Map in the route layer, not a provider. Honored.
- **Scope confirmation:** read + Substack-**display** only. **Out:** kind-0 write / Substack SET / profile-settings UI (story 21); chronological activity feed; genre-affinity chart; trust-tier badge; follow button + follower/following counts; nip05-handle addressing; private/encrypted shelves; any top-nav change. None creep in.

---

## Consequences

- **Enables:** a real, honest public profile for any npub; the last fixture leaves the app. Establishes the public by-pubkey twin pattern (param-observer, un-gated, shared pure core) that later public surfaces can follow. Names the kind-0 `substack` field key that story 21 will write.
- **Constrains:** the two public twins are now part of the API surface; their response shapes are the same `EnrichedShelf`/`Stats` shapes as the `/me` reads, so the two must continue to evolve together (a shape change to one is a shape change to both — acceptable, they share the pure functions).
- **Follow-ups / debt:**
  - Story 21 (kind-0 write / Substack SET) writes the `substack` key through this `ProfileMeta` shape via the audited signer stack with merge-don't-clobber. Designed there.
  - Residual abuse surface (distinct-npub flood, per-id relay fan-out) is mitigated only for repeat hits by the TTL cache; an ingress rate-limit on `/api/profile/*` is the production tool if it gets hot. Deployment-layer, flagged not built.
  - The TTL cache adds a small per-twin Map; invalidation is time-only (60s). If a "force refresh my own public profile" need ever appears it would need a cache-bust, not built now.
- **Affects existing fixtures?** **Yes — retires one.** `apps/web/src/data/profile-fixtures.ts` is deleted in full (Mira `ProfileRecord`, `profileRecords`, `getProfileRecord`, and the fixture-only types). `apps/web/src/data/fixture-constants.ts` loses `FIXTURE_MIRA_PUBKEY` (keeps `FIXTURE_LIBRARIAN_PUBKEY`). The fixture-only components `TrustCard`, `GenreAffinity`, `ProfileActivity`, `ProfileShelves`, `ProfileHeader` (+ their CSS) become dead and are removed. Implementer re-greps before each deletion.
- **New dependency?** No. `URL` is a platform global; npub decoding uses the already-present `nostr-tools/nip19`.
- **PRD section change required?** No. This is the trust-independent Lane-1 subset of phase2-prd §2.4 + the Substack-display slice of Appendix C-1, as the story scopes it. No claim invalidated; the held-for-later §2.4 elements (feed, genre chart, trust badge, follows) stay out.

---

## Implementation notes

- **New: `apps/api/src/nostr/npub.ts`** — extract the `toHex(id)` helper (the `HEX64` regex + `nip19.decode` npub branch) currently inline in `routes/profile.ts` L9-27. Export `toHex`. Import it in `routes/profile.ts` (replacing the inline copy), `routes/shelves.ts`, and `routes/profile-stats.ts`.
- **`apps/api/src/nostr/profile.ts`** — add `substack?: string` to `ProfileMeta`; add a `httpUrl(v)` helper (parse via `URL`, keep only `http:`/`https:`); set `meta.substack = httpUrl(content.substack)` in `parseKind0`; include it in the all-empty check.
- **`apps/api/src/routes/shelves.ts`** — add a public handler `GET /api/profile/:npub/shelves`: `toHex` → 404 `not_found` on null; 503 if no librarian; query `{ kinds:[39999], "#z":[shelvesConcept()], authors:[hex] }`; reuse the existing `groupOwnShelves` + batch-enrich block (factor the enrich block into a local helper so both `/mine` and the public twin call it); wrap in the Decision-4 TTL cache keyed by hex. Leave `GET /api/shelves/mine` untouched.
- **`apps/api/src/routes/profile-stats.ts`** — add a public handler `GET /api/profile/:npub/stats`: `toHex` → 404 on null; 503 if no librarian; run the same two per-field-wrapped reads as `/me/stats` but `authors:[hex]`; return `{ stats }`; wrap in the TTL cache keyed by hex. Factor the "run + wrap" block so `/me/stats` and the public twin share it (author passed in). Leave the session-gated `/me/stats` route's gating untouched.
- **TTL cache** — mirror `apps/api/src/trust/brainstorm.ts`: `const cache = new Map<string, { value: T; at: number }>()`; check `now() - at < 60_000`; `now` injectable via deps for tests (add `now?: () => number` to the relevant `Deps`, default `Date.now`). One cache per twin.
- **`apps/api/src/index.ts`** — the new public handlers live in the already-mounted `buildShelvesRouter` / `buildProfileStatsRouter`; no new `app.use`. If `now` becomes a dep, thread it through the existing `buildShelvesRouter(userEventDeps)` / `buildProfileStatsRouter({…})` calls.
- **`apps/web/src/lib/api.ts`** — add `substack?: string` to `ProfileMeta`; add `api.profile.shelves(npub)` → `{ shelves: Shelf[] }` (`/api/profile/${enc(npub)}/shelves`) and `api.profile.stats(npub)` → `{ stats: ProfileStatsResponse }` (`/api/profile/${enc(npub)}/stats`).
- **`apps/web/src/App.tsx`** — change the route to `<Route path="/profile/:npub" element={<Profile />} />`.
- **`apps/web/src/routes/Profile.tsx`** — rewrite per Decision 3: `useParams<{ npub }>()`; `useProfileMeta(npub)` for identity; effect fetching `api.profile.shelves(npub)` + `api.profile.stats(npub)`; render `Avatar` + name + npub + (nip05/about) header, the Substack link, `statCells`-filtered `ProfileStats`, and `BookGrid`(`toCardBook`) shelves; `NotFound` when the npub is unresolvable (404 from the twins) — distinguish from valid-but-empty (render empty states). Drop all `profile-fixtures` imports.
- **`apps/web/src/routes/ProfileMe.tsx`** — add the Substack link (`meta?.substack`) to the header, identical markup to `Profile.tsx` (AC-7 on `/profile/me`). No other change.
- **Delete (after re-grep confirms no remaining importers):** `apps/web/src/data/profile-fixtures.ts`; `apps/web/src/components/{TrustCard,GenreAffinity,ProfileActivity,ProfileShelves,ProfileHeader}.tsx` + their `.css`. Remove `FIXTURE_MIRA_PUBKEY` from `apps/web/src/data/fixture-constants.ts` (keep `FIXTURE_LIBRARIAN_PUBKEY`).
- **Profile CSS** — add a `.me-substack` (or shared) class using `--u-amber`; no new hex literal. Reuse existing profile CSS for the header/shelves layout.

## Out of scope

- The kind-0 **write** path / Substack **SET** / profile-settings UI (story 21).
- Chronological activity feed; genre-affinity chart; trust-tier badge; follow button + follower/following counts; nip05-handle addressing `/profile/:handle`; private/NIP-44 shelves; any top-nav change.
- Edge/ingress rate-limiting on `/api/profile/*` (deployment-layer; the residual distinct-npub-flood mitigation, flagged in Consequences, not built here).
