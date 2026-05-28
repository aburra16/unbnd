# ADR 0005: Sovereign rating publish + generic publish/read-back core

**Status:** Proposed
**Date:** 2026-05-28
**Story:** `engineering-team/stories/5a-sovereign-rating-publish.md`

## Context

Story 5a is Unbnd's first write path: a sovereign (Tier 1) reader rates a book, the rating becomes a **signed** kind-39999 `BookRating` DList event **published to strfry**, and the book detail page reads it back as an honest, raw (unweighted) summary. It also builds the reusable publish/read-back plumbing later write stories (genre tags, quality signals, shelves, follows) and the custodial sibling (story 5b) will share.

### What already exists

- **`@unbnd/schemas` (ADR 0001).** Domain↔unsigned conversion is done: `toBookRatingEvent(rating)` produces an `UnsignedDListEvent<39999,"bookRating",…>` carrying `kind`, the named tags (`d`, `z`, `t`, `a`, `p`, `score`, `review-date`), `content` (the review text), a `payload` (word-wrapper), and a denormalized `parentHeader`. `fromBookRatingEvent` parses the reverse. **D-tag:** `rating--<bookSlug>--<raterPubkey[:8]>` (replaceable per `(rater, book)`). ADR 0001 §"Option B cons" and its scope line explicitly **deferred the unsigned↔wire bridge** (serializing `payload` into the `["json", …]` tag; adding `created_at`/`pubkey`/`id`/`sig`) to "whichever story first publishes a real event." **That is this story.**
- **Concept headers (`@unbnd/schemas/concept-headers`).** `buildBookRatingsHeaderAddress(librarianPubkey)` → `39998:<librarianPubkey>:book-ratings`. A rating's `z` tag points here; its `a` tag points at the book record `39999:<librarianPubkey>:<bookDTag>`. Both need the **librarian pubkey** at runtime.
- **`apps/api`** has `ws` (8.18) and a `probeStrfry` that already opens a WebSocket to `config.strfryUrl`. No publish or query helper yet. No librarian pubkey in `config`.
- **Books are still fixtures.** There is no book read API and no real kind-39999 *book record* in strfry yet. A rating's `a` tag is just a pointer; strfry accepts the rating regardless of whether the referenced book record exists. Read-back therefore groups ratings by the book's `t`/`a` value, independent of book-record seeding.

### Tapestry prior art (cited, not paraphrased)

- **Wire shape — `origin/concept-graph:BIBLE.md` §§5/8/9** (via ADR 0001): kind 39999 item; data in a `["json","…"]` tag in word-wrapper format `{word:{…}, <typeKey>:{…}}`; `content` reserved for human-readable text; `["z","39998:<pubkey>:<d-tag>"]` points to the parent header; the stable address is `<kind>:<pubkey>:<d-tag>`.
- **Publish transport — `origin/concept-graph:lib/publish.js`** (`publishEvent`, lines ~260–308): open a relay WebSocket, `ws.send(JSON.stringify(['EVENT', signedEvent]))`, resolve on the relay's `['OK', <id>, <accepted>, <msg>]` frame, retry with backoff on failure. This is the canonical strfry publish handshake we mirror.
- **Named-tags-mirror-JSON — `feat/pubkey-tagging-target` ADR 0001/0009** (via ADR 0001): load-bearing fields live on named event tags AND in the JSON, which acts as a schema-validated mirror. Our `toBookRatingEvent` already follows this; 5a only adds the JSON serialization step.

### CLAUDE.md invariants this design must honor

- **POV-first / read-time aggregation.** No precomputed "the book's rating" stored as a global field. Ratings are per-author events; the summary is computed at read time from whatever events strfry returns. (PRD §6.2 note in ADR 0001.)
- **No fake trust numbers.** The read-back is a raw count + raw arithmetic mean, labeled as a plain community average. No trust-weighted score, no GrapeRank number anywhere. Trust-weighting is a later personalization cycle (PRD §9.5).
- **Librarian pubkey resolved at runtime, never hardcoded.** It comes from config, not a literal in source — on either the server or the client.
- **No hand-rolled crypto.** Signature verification on submit goes through the audited stack (`nostr-tools.verifyEvent`, already used by ADR 0004's `verifySignedChallenge`). The client signs via the NIP-07 extension; the server never holds a key.
- **npub for display, hex internally.** Any reviewer identity shown in the UI is npub-derived; hex stays internal.
- **Decentralized-first.** Any valid signature from the session user's own pubkey is acceptable; no author gate.

## Options considered

The pivotal question: **who constructs the unsigned event, and how many round-trips?**

### Option A — Server builds the template; client signs; server validates and publishes

Two endpoints. (1) `POST /api/ratings/template` with `{bookSlug, score, reviewText?, reviewDate?}` and a session → the server resolves the librarian pubkey, builds the unsigned `BookRating` wire template (named tags + `["json",…]` tag + `created_at`) with the **session user's** pubkey as rater, and returns `{template}`. (2) The client calls `window.nostr.signEvent(template)` and `POST /api/ratings` with `{event}` → the server runs `verifyEvent`, checks `kind===39999` and `event.pubkey===session.pubkey`, parses it back via the schemas bridge to confirm a well-formed rating, then publishes to strfry and returns the refreshed summary. Read-back is `GET /api/books/:slug/ratings`.

**Pros**
- The librarian pubkey and the entire event shape stay **authoritative on the server**; the client contributes only a signature and never sees or hardcodes the librarian key.
- **Symmetry with story 5b.** The same server-side `buildRatingTemplate` + `publishEvent` core is reused; the *only* per-tier difference is the signing step (5a: client signs via round-trip; 5b: server signs in place). The generic core is "build template → sign → publish," with one swappable middle.
- On submit the server can re-derive the expected template and confirm the signed event matches it (only `created_at`/`id`/`sig`/`pubkey` differ), giving strong shape integrity for free.

**Cons**
- Two round-trips for one rating.
- A `template` endpoint that returns an unsigned event is mild new surface.

### Option B — Client builds the template; one POST of the signed event

The server exposes the librarian pubkey once (bootstrap/config endpoint); the client builds the `BookRating` via `@unbnd/schemas` (isomorphic), signs, and `POST /api/ratings {event}` in a single trip. The server independently re-validates the full shape it did not build.

**Pros**
- One round-trip; less server surface.
- Exercises the schemas builders on the client (they are already isomorphic).

**Cons**
- Ships the librarian pubkey to the browser and pushes template construction client-side, so the server must re-validate the *entire* shape from scratch (parse json tag, confirm `z`/`a` point at the expected librarian header/book address, confirm the d-tag matches `(rater, book)`) rather than diffing against a template it issued.
- **Breaks the 5b symmetry:** custodial signing is server-side, so 5b would have to build the template server-side anyway — Option B forks template construction into two places (client for sovereign, server for custodial). Option A keeps one builder.

### (Option C — publish straight from the browser to strfry, skip the API)

The client signs and opens its own WebSocket to strfry. Rejected: it removes the server's ability to validate writes, leaks the relay topology to the browser, can't be rate-limited at the app layer (cycle 5), and gives the read path no single choke point. Listed for completeness.

## Decision

We chose **Option A** — server builds the template, client signs, server validates and publishes — because it keeps the librarian pubkey and event shape authoritative server-side, and because the `buildRatingTemplate` + `publishEvent` core then drops into story 5b with only the signing step swapped (client round-trip → in-process custodial signer). The two-round-trip cost is negligible for a rating action and buys a clean, reusable, single-source-of-truth write core.

### Specifics

1. **`@unbnd/schemas` — the unsigned↔wire bridge (the piece ADR 0001 deferred to here):**
   - `toWireTemplate(unsigned: UnsignedDListEvent, createdAt: number): NostrEventTemplate` — returns `{ kind, created_at, content, tags }` where `tags` is `unsigned.tags` **plus** `["json", JSON.stringify(unsigned.payload)]`. No `pubkey`/`id`/`sig` (the signer adds those). `created_at` is injected by the caller (scripts cannot call `Date.now()`; the API passes it in — keeps the function pure and testable).
   - `fromWireEvent(event): UnsignedDListEvent` — reads the `["json",…]` tag back into `payload`, the `["z",…]` tag into `parentHeader`, and reconstructs the unsigned shape so `fromBookRatingEvent` can consume it. This is the read-path bridge.
   - Both are pure and hermetically testable (no relay, no signing).

2. **`config.ts` — `librarianPubkey`.** Add `LIBRARIAN_PUBKEY` (64-hex, validated like other hex). **Optional, no default** (a pubkey has no safe default). When unset, the rating endpoints return 503 `feature_unavailable`; `.env.example` documents it. This avoids baking a fake key into source and keeps boot working in envs that do not rate. (Whoever seeds the kind-39998 headers later uses the matching nsec; out of scope here.)

3. **`apps/api/src/nostr/` — the generic core:**
   - `publish.ts` → `publishEvent(config, signedEvent): Promise<{ ok: true; id: string } | { ok: false; reason: string }>`. Opens a WS to `config.strfryUrl`, sends `["EVENT", signedEvent]`, resolves on the matching `["OK", id, accepted, msg]`, times out (reuse the probe's timeout style), one retry with backoff. Generic over event kind.
   - `query.ts` → `queryEvents(config, filter): Promise<NostrEvent[]>`. Opens a WS, sends `["REQ", subId, filter]`, collects `["EVENT", subId, …]` until `["EOSE", subId]` (or timeout), closes. Generic.

4. **`apps/api/src/ratings/`:**
   - `template.ts` → `buildRatingTemplate(config, { raterPubkey, bookSlug, score, reviewText, reviewDate }, createdAt)`: validate score ∈ 1..5 (throw typed `ValidationError` → 400); resolve `librarianPubkey` from config (503 if absent); build the `BookRating` domain object (book address = `39999:<librarian>:<bookSlug>`, parent header = `buildBookRatingsHeaderAddress(librarian)`); `toBookRatingEvent` → `toWireTemplate`. Returns the template.
   - `validate.ts` → `validateSignedRating(config, event, sessionPubkey)`: `verifyEvent(event)` (freshly-parsed body — the ADR 0004 verifiedSymbol discipline applies), `kind===39999`, `event.pubkey===sessionPubkey` (403 on mismatch), `fromWireEvent`→`fromBookRatingEvent` parses and the score is in range. Returns the parsed `BookRating` or a typed failure.
   - `summary.ts` → `summarizeRatings(events): { count: number; average: number | null; ratings: PublicRating[] }`: parse each via the schemas bridge, **dedup by `raterPubkey` keeping the latest `created_at`** (defensive — strfry already keeps only the latest per `(author,d-tag)`), compute `count` and the raw arithmetic `average` (null when count 0). `PublicRating` exposes `npub` (never hex), `score`, `reviewText`, `reviewDate`. **No weighting, no trust field.**

5. **Routes — `routes/ratings.ts` (DI like `buildAuthRouter`):**
   - `POST /api/ratings/template` (session required → 401) → `{ template }` | 400 bad score | 503 unconfigured.
   - `POST /api/ratings` (session required) → `validateSignedRating` → `publishEvent` → `{ rating, summary }` | 400 invalid event/kind | 403 pubkey-mismatch | 502 publish-failed.
   - `GET /api/books/:slug/ratings` (public) → `queryEvents({ kinds:[39999], "#a":[bookAddress] })` filtered to `bookRating`-typed events → `summarizeRatings` → `{ count, average, ratings }`.
   - Wired in `index.ts` with `publishEvent`/`queryEvents` bound to `config`. All through the cycle-3 error sanitizer.

6. **Web — `apps/web`:**
   - `lib/api.ts`: `api.ratings.template(input)`, `api.ratings.submit(signedEvent)`, `api.ratings.list(bookSlug)`. Reuse the `SignedEvent` type from ADR 0004.
   - `routes/BookDetail.tsx` + a `RatingControl` component: 1–5 star control (inline hand-crafted SVG stars, brand tokens, **no icon library**) + optional short review textarea. On submit (sovereign session): `template` → `window.nostr.signEvent` → `submit` → reflect the returned summary. **Tier gating by session:** sovereign → active control; anonymous → a sign-in prompt linking `/auth`; custodial → a brief "We are finishing ratings for email accounts" note (the 5b placeholder). Copy follows the no-slop rules; the summary shows the raw average + count as plain stars and a number, never a trust label.

7. **Read-back honesty.** The summary endpoint and the UI show only `count` and raw `average`. The PRD §5.4 "trust-weighted rating" / "people you trust rate this X" wording is **not** implemented here and is not faked; it arrives with GrapeRank in a later cycle.

## Consequences

- **Enables** the first end-to-end write, and a generic `publishEvent`/`queryEvents`/`buildRatingTemplate` core that 5b (custodial) and later write stories reuse. 5b becomes "swap the client round-trip for an in-process signer."
- **Constrains:** read-back queries strfry live per request (no Neo4j read-model yet — a later optimization once the strfry→Neo4j sync covers ratings). The `LIBRARIAN_PUBKEY` feature-guard means rating is unavailable until that env is set.
- **Follow-ups:** trust-weighting (GrapeRank), the custodial path (5b), seeding the real kind-39998 headers + book records, and a Neo4j-backed read model.
- **Affects existing fixtures?** Yes — the `config.test.ts` literal fixtures and the `apps/api` route-test `Config` literal gain `librarianPubkey` (optional, so `undefined` is valid; fixtures stay green without it). `BookDetail` gains a rating control; its existing render tests may need a session-context wrapper. Listed for the Implementer; the Tester pins exact files.
- **New dependency?** No. `ws`, `nostr-tools`, `@unbnd/schemas` are all present. (`applesauce-core` is already in web from ADR 0004 if npub display is needed client-side.)
- **PRD section change required?** No, but a **note**: §5.4's "trust-weighted rating" is satisfied only in part (raw average now, weighting later). No PRD edit needed; the deferral is already implied by §9.5. Flag at 5a close-out if the wording should be softened.

## Implementation notes

- DList: kind **39999**, d-tag `rating--<bookSlug>--<raterPubkey[:8]>`, word-wrapper JSON `{ word:{slug,name,title,wordTypes:["word","bookRating"]}, bookRating:{bookSlug,bookAtag,score,reviewText?,reviewDate} }` serialized into the `["json",…]` tag; named tags `d/z/t/a/p/score/review-date`; `content` = review text; parent header `39998:<librarianPubkey>:book-ratings`. Cribbed from `origin/concept-graph:BIBLE.md` (wire shape) and `lib/publish.js` (transport).
- Implementer order (suggested): schemas bridge (`toWireTemplate`/`fromWireEvent`) → `nostr/publish.ts` + `nostr/query.ts` → `ratings/{template,validate,summary}.ts` → `routes/ratings.ts` + `index.ts` wiring → `config` `LIBRARIAN_PUBKEY` + `.env.example` → web `lib/api.ts` + `RatingControl`/`BookDetail`.
- The verify step must run on the freshly-parsed request body only (ADR 0004 verifiedSymbol landmine).

## Out of scope

Custodial server-side signing (5b); trust-weighting/GrapeRank; a Neo4j read-model for ratings; seeding real headers/book records; rate limiting (cycle 5); live subscriptions to the browser; genre tags / quality signals / shelves / follows.
