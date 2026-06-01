# ADR 0031: Trust-gated submission promotion (canonical librarian-signed, worker-fulfilled)

**Status:** Proposed
**Date:** 2026-06-01
**Story:** `engineering-team/stories/30-trust-gated-promotion.md`

## Amendment (2026-06-01) — gate decisions pinned

Three gate questions left open in the original ADR are now decided. Folded into the
relevant Decision sections below; recorded here as the canonical record of the call:

1. **Explicit `submitted-by` provenance tag (additive `BookRecord` schema change) —
   ACCEPTED.** §5 previously left "mint the original submitter into the canonical record"
   open. Decided: yes. `@unbnd/schemas` `BookRecord` gains an OPTIONAL `submittedBy`
   field (type + builder); when set, `toBookRecordEvent` emits a single
   `["submitted-by", <submitterPubkeyHex>]` tag — **hex on the wire** (consistent with the
   `["p", <hex>]` author ref and every other nostr pubkey tag ref in the codebase; the
   API/web resolve hex→npub/name at the boundary, npub-out per the standing rule). The
   field is **additive and optional**: omitting it emits **no** `submitted-by` tag, so the
   seeder's catalog records (which never set `submittedBy`) and every existing record shape,
   validator, and fixture stay valid and unchanged. The promoter populates `submittedBy` =
   the original submission event's author (hex) when minting the canonical record. The
   book-read/API surfaces it as an optional passthrough (npub-out + Story-29 display
   resolution); the web optionally credits "submitted by …" as a **minimal** addition, not a
   new heavy surface. This supersedes §5's "without a new schema field" stance.
2. **The new `apps/promoter` app — CONFIRMED.** The separate key-holding worker app
   (already this ADR's recommendation, Option C / §1) is accepted as-is. No change.
3. **`CURATOR_THRESHOLD` default `0.5`, env-configurable, calibrated on staging — CONFIRMED.**
   The exact default is **not load-bearing** because it's env-tunable (mirroring the
   `PERSONALIZE_MIN_FOLLOWS=1` staging calibration): set it low enough on staging for an
   end-to-end promote test, then tune. Honest caveat: on the thin nosfabrica vantage,
   possibly **no one** (even the founder npub) clears `0.5` until the threshold is calibrated
   down — promotion is librarian/operator-only until then.

## Amendment (2026-06-01, remediation) — enriched `GET /api/submissions` list contract pinned

A re-review (CHANGES_REQUESTED) found Story 30's web feature was **not wired
end-to-end**: `GET /api/submissions` returns only the bare 16b-i row shape
(`toSubmission`: `slug, title, authorName, isbn13, coverUrl, publishYear, createdAt,
submitter`) and **never produces** the `canPromote` / `promotionStatus` / `signals`
fields the web (`apps/web/src/routes/CommunitySubmissions.tsx`) reads per row, and
**nothing calls** the per-slug `GET /api/submissions/:slug/signals` endpoint. The gate,
the queue, the worker, and the signals helper all existed in isolation but the **list
response the web actually consumes was never enriched** — the gap was masked because the
web tests fed pre-enriched mock rows rather than the real `api.submissions.list` shape.

This amendment **PINS the enriched list-response contract** so the Implementer and the web
agree exactly, and tightens the testable seams so the gap cannot recur. Folded into the
relevant Decision sections (§3 trust signals, new §3b list enrichment, §6 testable seams,
§7 ripple). The remainder of ADR 0031 **stands unchanged** (canonical librarian-signed
model; the `apps/promoter` worker; `LIBRARIAN_NSEC` API isolation; the fail-closed curator
gate; slug idempotency; `submitted-by` provenance; promote-only this cycle / demotion →
30b).

### Pinned: `GET /api/submissions` enriches each row, server-computed

The list handler must enrich the response with the three fields the web consumes, computed
**server-side** (the web is a pure renderer of this shape — it computes nothing):

1. **`canPromote: boolean` — a USER-LEVEL flag, computed ONCE per request.** It answers "is
   the SESSION USER above the curator gate?" — it does **not** vary per row. Compute it once:
   resolve the session user (`deps.sessionUser`), then
   `(await deps.trust.weights(houseObserverHex, [sessionUserHex])).get(sessionUserHex) ?? 0
   >= config.curatorThreshold`, using the **same `houseWeightOf` fail-closed degrade as the
   promote gate** (no provider / no observer / empty map / throwing seam → weight `0` →
   `false`). **Anon → `false`.**
   - **Placement decision (PINNED): stamp the SAME value on every row** (`row.canPromote`).
     Rationale: the web today reads `submission.canPromote` **per row**
     (`CommunitySubmissions.tsx` `PromoteCell`: `if (!submission.canPromote) return null;`),
     and the api type carries it per row (`SubmittedBook.canPromote`). The cleaner shape is
     top-level/once, but to keep the Implementer + the **already-shipped web** in agreement
     **without a web refactor**, the value is computed **once** and **copied onto each row**
     — identical on every row. (The Implementer MAY additionally expose it top-level; the
     load-bearing contract is that **the per-row field exists and is the same correct
     once-computed value**.)
2. **`promotionStatus: "pending" | "promoting" | "done" | "failed" | null` per row** — derived
   from the `promotions` table (§1). `null` (or absent) when the slug was never enqueued. Read
   it with **ONE batched query keyed by the listed slugs**, NOT N per-row queries: e.g.
   `SELECT slug, status FROM promotions WHERE slug = ANY($1)` over the page's slugs, built into
   a `Map<slug, status>` and looked up per row. A new injected DB seam (mirroring
   `enqueuePromotion`), e.g. `readPromotionStatuses(slugs: string[]) =>
   Promise<Map<string, PromotionStatus>>`, keeps it testable and the route handler pure.
3. **`signals: SubmissionSignals | null` per row** — the existing
   `computeSubmissionSignals` (`apps/api/src/submissions/signals.ts`) house-vantage compute
   (curator count + identities + weighted average), honest `null` when none / degraded.
   **Decision (v1, justified):** because submission volume is effectively zero, the list
   handler **computes signals for the listed rows inline on the list response now** — the
   simplest correct wiring (each row: query `{ kinds:[KIND], "#a":[39999:<lib>:<slug>] }` →
   `computeSubmissionSignals`, exactly as the `/:slug/signals` endpoint does). Fail-closed →
   `null` per row.

#### Perf follow-up (LOGGED, not shipped now)

Computing signals inline for every listed row is **O(rows) relay queries on one request** —
fine at ~zero volume, a **known scaling edge** as submissions grow. The follow-up, recorded
here so it is not lost: move signals off the bulk list to **LAZY per-row fetch** (the web
hits the existing `GET /api/submissions/:slug/signals` per visible row, on demand) **or** a
**bounded / cap'd enrichment** (compute only the first N rows, lazy-load the rest). The
`/:slug/signals` endpoint is **kept precisely as the lazy seam for this future** — it is not
dead code, it is the migration target. This is logged, not shipped now (no premature
optimization at zero volume).

### Pinned: the testable contract (this is what let the gap through)

There MUST be a test that the **REAL `GET /api/submissions` list endpoint PRODUCES** all
three fields, exercised against the route (DI: fixture `TrustProvider`, fake `sessionUser`,
fake `readPromotionStatuses`, fake `query`) — **not** a component test fed pre-enriched mock
rows:
- **`canPromote`** is **gate-aware**: `true` for an above-gate session, `false` for a
  below-gate session, `false` for anon, `false` on trust degrade (empty/absent provider).
- **`promotionStatus`** reflects the `promotions` rows: a slug with a `done` row → `"done"`;
  a slug with no row → `null`/absent; the read is the **single batched** `WHERE slug =
  ANY(...)`, asserted as one call over the page's slugs (not N).
- **`signals`** is **computed/honest-null**: fixture weights over a known above-gate rater
  set → real `curatorRatingCount`/`curators`/`trustedAverage`; empty weights / no trusted
  rater → `signals: null`.

The **web tests must source rows from the real `api.submissions.list` response shape** (or a
fixture generated from it), so a row missing `canPromote`/`promotionStatus`/`signals` fails
the test rather than silently rendering nothing. Pre-enriched mock rows are what masked this
gap; they are no longer sufficient on their own.

### Non-blocking follow-ups the reviewer logged (recorded so they are not lost)

- **`curatorTagCount` tag-signals extension** — `computeSubmissionSignals` returns
  `curatorTagCount: 0` today (the assertions-header read is not wired; ratings + tags share
  the kind-39999 `#a` query but tag aggregation is unimplemented). Wiring the above-threshold
  tag-asserter count is a future, non-blocking extension. Not shipped this cycle.
- **Worker stranded-job / `failed`-retry reaper** — a job stuck in `promoting` (a worker run
  died mid-flight) or left `failed` has no automatic recovery; the cron's next run can retry
  `failed` rows under a max-attempts cap, and a stranded `promoting` row needs a reaper. This
  is a **runbook or future story** item, recorded here; not blocking Story 30.

## Context

Community submissions ship today (Stories 16a / 16b-i, ADR 0016). A submission is a
**user-signed** kind-39999 `BookRecord` z-tagged to the librarian's `book-submissions`
concept header — deliberately separate from the librarian-seeded catalog, which is
**librarian-signed** kind-39999 records z-tagged to the librarian's `books` header
(`apps/seeder/src/index.ts`, `mapWorkToBookRecord` → `toBookRecordEvent` → `finalizeEvent`
with `LIBRARIAN_NSEC`). Submissions never appear in genre browse, search, or shelves.

Story 30 (PRD §2.7) decides **which submissions become first-class catalog entries** and
how: promote = republish the book as a **librarian-signed** `BookRecord` under the `books`
header so it is indistinguishable from a seeded entry, gated by an **emergent curator gate**
(a session user's own GrapeRank weight from the house observer's vantage ≥ a configurable
threshold), with **trust signals** as decision support. Promotion is **manual** (a human
Promote action), never auto-threshold (Phase 3).

**The load-bearing constraint (Story 30 Open Question 1 / Flags for the gate):** the API
holds **no** librarian secret. `apps/api/src/config.ts:142-151` exposes only `LIBRARIAN_PUBKEY`
(validated 64-hex public key); the sole `finalizeEvent` in the API
(`apps/api/src/index.ts:133-146`, `custodialSign`) signs the **session user's own** event with
that session's ephemeral-wrapped key (ADR 0006) — never a librarian key. `LIBRARIAN_NSEC`
lives **only in the seeder** (`apps/seeder/src/index.ts:55-63`). So "republish signed by the
librarian" has no runtime mechanism in the API as built.

### Submission storage model (what the worker reads — confirmed in code)

`apps/api/src/routes/submissions.ts` confirms a submission is a kind-39999 `BookRecord`
**signed by the submitter** (sovereign → NIP-07 client-sign; custodial → `custodialSign`
ephemeral-wrap), z-tagged to `buildBookSubmissionsHeaderAddress(librarian)` (lines 72-75).
`GET /api/submissions` reads `{ kinds:[39999], "#z":[book-submissions addr], limit:200 }`
(line 180) and `toSubmission` (lines 50-68) parses each via `fromBookRecordEvent`, exposing
`slug, title, authorName, isbn13, coverUrl, publishYear, createdAt` + `submitter` (the
event's npub). **The distinguishing facts:** (a) event author (submitter vs. librarian),
(b) parent header (`book-submissions` vs. `books`), (c) the `source` tag. The slug is the
Story 16a collision-safe identity (`buildBookRecordDTag(slug) === slug`,
`packages/schemas/src/BookRecord.ts:74-76`). **This is exactly the input the worker needs:**
the submitter's signed event under the `book-submissions` header, addressable by
`39999:<librarian>:<slug>` once promoted (the librarian's d-tag is the same slug).

### Existing seams this reuses (no new trust math, no new crypto)

- **Trust gate / signals:** `TrustProvider.weights(observerHex, targetHexes)`
  (`apps/api/src/trust/types.ts:49-52`) — best-effort, returns an **empty map** on backend
  failure, never throws. Observer resolution mirrors `apps/api/src/routes/ratings.ts:277-281`
  (explicit `?observer=` else `config.houseObserverPubkey`, default nosfabrica
  `config.ts:71`). The fixture provider (`apps/api/src/trust/fixture.ts`) gives deterministic
  weights for CI (ADR 0017).
- **Trust-weighted average:** `weightedRatings(deduped, weights, observerNpub)`
  (`apps/api/src/ratings/summary.ts:148-166`) — already returns `{ average, trustedCount,
  ratings }` and null when no rater is trusted. The above-threshold tag count reuses the same
  pattern as `aggregateBookTagsWeighted` (`apps/api/src/tags/aggregate.ts:120`).
- **Identity display (AC-2):** `GET /api/profile/:id` (`apps/api/src/routes/profile.ts`,
  ADR 0012) + the web `useProfileMeta` hook resolve npub → kind-0 name best-effort; the honest
  fallback is `shortNpub` (`apps/web/src/routes/CommunitySubmissions.tsx:16-18`). Story 29
  resolution path, no new resolver.
- **Postgres:** `apps/api/src/db/{schema.ts,migrations.ts,index.ts}` — embedded-TypeScript
  idempotent migrations (`IF NOT EXISTS`), `createDb(DATABASE_URL)`, `db.transaction(...)`.
  Both API and a worker reach Postgres via `DATABASE_URL` (compose: `db:5432`,
  `docker-compose.prod.yml:36`).
- **Publish/propagate:** `withUpSync(localPublish, dcoslPublish)`
  (`apps/api/src/nostr/propagate.ts`) is how catalog-class records reach dcosl; the seeder
  publishes **directly to dcosl** (`docker-compose.prod.yml:97-108`, `--profile seed`) and the
  local relay syncs them down. The seeder bundles via esbuild
  (`apps/seeder/esbuild.config.mjs`) into one ESM file; its compose service uses
  `profiles:["seed"]`, `restart:"no"`.

**Constraints honored:** CLAUDE.md §1 POV-first (the gate is the **session** user's own
weight from the house vantage), §2 decentralized-first (the gate is emergent, not an
administered role; submissions stay permissionless), §3 filter-at-view-time. Crypto policy:
no hand-rolled crypto; signing via nostr-tools `finalizeEvent` (mirror the seeder), secret
runtime-resolved. No new trust-weighting math. No raw GrapeRank numbers in any surface (tier
strings / honest counts only). Copy reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

### Gate decisions baked in (user, 2026-06-01)

1. **Canonical / librarian-signed model** — promote republishes a librarian-signed kind-39999
   `BookRecord` at the canonical address `39999:<librarian>:<slug>` under the `books` header.
   The librarian key is a **notary**; the promotion **decision** is the emergent curator gate.
   (NOT read-time promotion.)
2. **Separate key-holding worker (option B)** — the internet-facing API enqueues a job; a
   separate worker holding `LIBRARIAN_NSEC` (off the internet-facing path) builds + signs +
   publishes the canonical record. `LIBRARIAN_NSEC` is **never** added to the API process.
3. **Promote-only this cycle**; demotion → Story 30b.
4. **Accepted v1 reality:** on the thin graph (nosfabrica interim house), effectively only the
   librarian/founder clears the gate at first. House-observer swap stays deferred.

## Options considered

### Option A — Read-time / view-time promotion (REJECTED)

Mark a submission "promoted" in Postgres and have the catalog read paths union promoted
submissions into the `books` view at query time. No librarian signing, no new key surface.

- **Pro:** no librarian secret anywhere; trivial idempotency (a row flag).
- **Con:** breaks the canonical model the user chose. The promoted book is **not** a real
  catalog record — it stays submitter-signed under `book-submissions`, so every catalog read
  path (genre browse, search index, shelves, ratings `a`-tag at `39999:<librarian>:<slug>`)
  would need a special-case union and a parallel "is-it-promoted" lookup. It never propagates
  to dcosl as a catalog entry, so the wider network can't see it as cataloged. It contradicts
  AC-3/AC-4 ("a librarian-signed record under the `books` header, so the existing catalog read
  paths pick it up with no special-casing"). **Rejected per gate decision 1.**

### Option B — API holds a librarian signer (REJECTED)

Add `LIBRARIAN_NSEC` to the API env; `POST /promote` resolves the gate then signs the
canonical record in-process via a `PrivateKeySigner`, publishing through the existing
`withUpSync` path.

- **Pro:** simplest pipeline (no queue, no second process); promotion is instant.
- **Con:** puts a secret that can **mint canonical catalog entries** on the internet-facing,
  curator-gated API process. The control would be only the gate + the route handler; any RCE
  or auth bug on the public surface becomes catalog-forgery. **Rejected per gate decision 2:**
  `LIBRARIAN_NSEC` must never be on the API.

### Option C — API enqueues; a separate key-holding worker fulfills (CHOSEN)

The curator-gated API `POST /api/submissions/:slug/promote` resolves the gate then **inserts
a row into a Postgres `promotions` queue** (idempotent on slug). A separate worker —
holding `LIBRARIAN_NSEC`, off the internet-facing path — polls/claims pending jobs, reads the
submission event, builds the canonical `BookRecord` under the `books` header, librarian-signs
it via `finalizeEvent`, publishes it (local relay + dcosl, mirroring the seeder), and marks
the job `done` (recording the canonical record id). The promoted-state surface is the job
status plus the existence of the librarian record at `39999:<librarian>:<slug>`.

- **Pro:** the librarian secret lives in a process with **no inbound internet path**; the only
  way to enqueue is through the gate + human action. Canonical model satisfied (first-class
  `books` record, picked up by existing read paths with no special-casing). Postgres is already
  the shared substrate both processes reach via `DATABASE_URL`. Idempotency is natural (unique
  on slug + the slug-keyed d-tag replaces). Both halves are fixture-testable in isolation.
- **Con:** promotion is **not instant** — there's a pending→promoting→in-catalog latency the UX
  must represent honestly. A second deployable (worker app + compose wiring + a cron trigger)
  to operate. Accepted.

## Decision

We chose **Option C** — API enqueues, a separate key-holding worker fulfills — because it is
the only option that satisfies both gate decisions (canonical librarian-signed record AND
`LIBRARIAN_NSEC` never on the API) while reusing the shipped trust seams and the seeder's
proven signing/publish pattern.

### 1. The enqueue → worker pipeline

**Queue mechanism — a Postgres `promotions` table** (migration `0003_promotions`, same
embedded-TS idempotent pattern as `apps/api/src/db/migrations.ts`):

```sql
CREATE TABLE IF NOT EXISTS promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,           -- idempotency key (= book d-tag)
  requested_by    CHAR(64) NOT NULL,              -- curator hex (audit/provenance)
  status          TEXT NOT NULL DEFAULT 'pending' -- pending | promoting | done | failed
                    CHECK (status IN ('pending','promoting','done','failed')),
  canonical_id    TEXT,                           -- the librarian record's event id, once published
  error           TEXT,                           -- last failure reason when status='failed'
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
```

`UNIQUE(slug)` makes the enqueue idempotent: a second `POST /promote` for the same slug
collides on the unique constraint and is reported as "already queued / already in the catalog"
(AC-7), never a duplicate row. A new drizzle table mirrors this in `apps/api/src/db/schema.ts`
(`promotions`).

**The worker — a new `apps/promoter` app (NOT an extension of the seeder).** Justification:
the seeder is a one-shot batch importer (`restart:"no"`, run once via `--profile seed`, walks
Open Library subjects); the promoter is a **recurring queue consumer** with a distinct
lifecycle, a DB dependency (`DATABASE_URL` — which the seeder has no business holding), and a
distinct trigger cadence. Bolting a queue loop onto the seeder would entangle two unrelated
jobs and give the batch importer a Postgres credential. `apps/promoter` **mirrors the seeder's
mechanics**: esbuild single-ESM bundle (`apps/promoter/esbuild.config.mjs`, copy of the
seeder's), a compose service with `profiles:["promote"]` + `restart:"no"`, and a **cron
trigger** (the operator's cron runs `docker compose --profile promote run --rm promoter`
periodically — the same "off the internet-facing path, periodically fired" shape the story
references for unbnd-upsync). It signs exactly as the seeder does
(`finalizeEvent(template, sk)` after `decode(LIBRARIAN_NSEC)`).

**Worker loop (per run):**
1. Claim pending jobs: `UPDATE promotions SET status='promoting', attempts=attempts+1,
   updated_at=NOW() WHERE id IN (SELECT id FROM promotions WHERE status='pending'
   ORDER BY created_at LIMIT N FOR UPDATE SKIP LOCKED) RETURNING *` (concurrency-safe; a single
   cron run is single-instance, but `SKIP LOCKED` keeps it correct if ever run concurrently).
2. For each claimed job: read the submission event from the relay
   (`{ kinds:[39999], "#z":[book-submissions addr], "#d":[slug] }`, or by author+slug),
   parse via `fromBookRecordEvent`, and **build the canonical record** with
   `mapSubmissionToCatalogRecord(submission, booksHeader, requestedBy)` (new pure fn in
   `apps/promoter/src/build.ts`) → `toBookRecordEvent` → `finalizeEvent(sk)`.
3. Publish to the **local relay AND dcosl** (mirror the seeder's `publish`), so it propagates
   like every catalog record.
4. On success: `UPDATE promotions SET status='done', canonical_id=<eventId>, updated_at=NOW()`.
   On failure: `status='failed', error=<reason>` (the cron's next run can retry `failed` rows
   below a max-attempts cap, or leave them for inspection — implementer's call within this
   shape).

**Secret handling:** `LIBRARIAN_NSEC` is set in the **promoter's** compose env only
(`docker-compose.prod.yml`, `promoter` service — alongside the seeder's existing use), decoded
at runtime via `decode()` (CLAUDE.md "resolved at runtime, never hardcoded"). The API service
block gains **no** `LIBRARIAN_NSEC`. A guard test (see Testable seams) asserts the string
`LIBRARIAN_NSEC` never appears under `apps/api/src`.

### 2. The curator gate (API)

**`POST /api/submissions/:slug/promote`** in `apps/api/src/routes/submissions.ts`:

1. Resolve session user (`deps.sessionUser(cookie)`). Anon → **401** `no_session`.
2. Resolve the house observer (mirror `ratings.ts:277-281`: `config.houseObserverPubkey`;
   no `?observer=` override on a write gate — the gate is always the **house** vantage per
   AC-1).
3. Compute the caller's own weight:
   `const w = (await deps.trust.weights(houseHex, [user.pubkeyHex])).get(user.pubkeyHex) ?? 0;`
4. **Gate:** `w >= config.curatorThreshold` → enqueue (insert `promotions` row,
   `requested_by = user.pubkeyHex`); on the `UNIQUE(slug)` collision → **200**
   `{ status: "already" }` (idempotent, AC-7). Below threshold → **403** `below_gate`. The gate
   is **server-enforced**, not merely UI-hidden (AC-3).
5. **Honest degrade (AC-6):** trust unavailable (`deps.trust` absent, `weights` returns empty,
   or `houseObserverPubkey` unset) → `w` is `0` → gate **closes** → 403. The provider seam
   never throws; the route wraps the call defensively so a degraded vantage closes the gate
   rather than erroring.

**Threshold config:** `config.curatorThreshold` (env `CURATOR_THRESHOLD`), validated in
`loadConfig` as a number in `(0,1]` (GrapeRank weights are clamped to `(0,1]`,
`fixture.ts:46`). **Default: conservative non-zero.** Pinned default `0.5` — a meaningful
positive house-PoV influence; the implementer/PO may tune at the gate. With the interim
nosfabrica house observer over our seeded keys, effectively no real user clears `0.5` today,
so promotion is **librarian/operator-only at first** (accepted v1 reality, gate decision 4).
Setting `CURATOR_THRESHOLD` changes who clears the gate, who is counted in signals, and who may
promote, with no code change (AC-5).

### 3. The trust signals (API read)

Extend the submission read so a submission detail carries decision-support signals computed
from the **house observer's** vantage. New read seam (in `submissions.ts`, or a small
`apps/api/src/submissions/signals.ts` helper for testability):

For a given submission slug, with `addr = 39999:<librarian>:<slug>`:
- Query ratings (`{ kinds:[39999], "#a":[addr] }`) → `dedupeRatings` →
  `weights(houseHex, raterHexes)` → `weightedRatings(...)` for the **trust-weighted average**
  + `trustedCount` (the count of above-weight raters). Reuse verbatim; no new math.
- Query tag-assertions (`{ kinds:[39999], "#a":[addr] }` on the assertions header) → reuse the
  `aggregateBookTagsWeighted` weighting to count **above-threshold tag-asserters**.
- **Above-threshold curator identities:** the set of rater/asserter hexes whose
  `weights(houseHex, hex) >= curatorThreshold`, returned as **npubs** (web resolves npub →
  display via `useProfileMeta`, honest `shortNpub` fallback — Story 29). No raw GrapeRank
  numbers; counts + identities + the weighted average only.

Signal shape returned to the web:
```jsonc
{
  "signals": {
    "trustedAverage": 4.2 | null,        // weightedRatings.average, null when no trusted rater
    "curatorRatingCount": 0,             // raters at/above the gate
    "curatorTagCount": 0,                // tag-asserters at/above the gate
    "curators": ["npub1…", "npub1…"]     // distinct above-gate identities, [] when none
  } | null                                // null = honest "no trusted signal yet" (degrade)
}
```

**Honest degrade (AC-6):** trust unavailable / no observer / empty weights →
`signals: null` (web renders "no trusted signal yet"), **never** a fabricated count or a raw
average presented as trusted. This exactly mirrors how `ratings.ts` sets `weighted = null`
on any trust failure (`ratings.ts:291`).

### 3b. The enriched `GET /api/submissions` list contract (PINNED — 2026-06-01 remediation)

§3 above defines the **per-slug** signal compute (`computeSubmissionSignals`, exposed lazily
at `GET /api/submissions/:slug/signals`). The web (`CommunitySubmissions.tsx`) renders the
**list** route, so the **list** response — not just the per-slug endpoint — must carry the
decision-support and gate fields. The original spec wired the gate, queue, worker, and
signals helper in isolation but never enriched the list the web reads; this section closes
that gap. **The web computes nothing — it renders this shape verbatim.**

`GET /api/submissions` enriches each row with three server-computed fields:

1. **`canPromote: boolean`** — USER-level, computed **ONCE per request** (not per row) via the
   same `houseWeightOf(sessionUserHex) >= config.curatorThreshold` used by the promote gate
   (§2), with the identical fail-closed degrade (no provider / no observer / empty map /
   throw → `0` → `false`). **Anon → `false`.** PINNED placement: the once-computed value is
   **stamped on every row** (`row.canPromote`, identical on all rows), because the shipped web
   reads it per row (`SubmittedBook.canPromote`, `PromoteCell`). The Implementer MAY also
   expose it top-level, but the load-bearing contract is the **per-row field carrying the same
   correct once-computed value**. This avoids a web refactor.

2. **`promotionStatus: "pending" | "promoting" | "done" | "failed" | null`** per row — derived
   from the `promotions` table (§1) via **one batched read** keyed by the listed slugs
   (`SELECT slug, status FROM promotions WHERE slug = ANY($1)` → `Map<slug, status>`), **never
   N per-row queries**. Injected as a new DB seam (mirroring `enqueuePromotion`), e.g.
   `readPromotionStatuses(slugs: string[]) => Promise<Map<string, PromotionStatus>>`. `null`
   /absent when the slug was never enqueued. This is the same authoritative job state §4 reads
   for the per-submission view.

3. **`signals: SubmissionSignals | null`** per row — `computeSubmissionSignals` (§3) per listed
   row, honest `null` when none/degraded. **v1 decision (justified by ~zero submission
   volume): compute inline on the list response now** — simplest correct (each row: ratings
   query at `39999:<lib>:<slug>` → `computeSubmissionSignals`). **Perf follow-up (logged, not
   shipped):** inline signals is O(rows) relay queries per list request — a known scaling
   edge. As volume grows, move signals to **lazy per-row fetch** via the existing
   `GET /api/submissions/:slug/signals` (kept expressly as this lazy seam) **or** a bounded
   /cap'd enrichment (first N rows inline, the rest lazy). Not optimized prematurely at zero
   volume.

**Honest degrade across all three:** trust unavailable / no observer → `canPromote:false`
and `signals:null` on every row; the DB seam absent → `promotionStatus` absent/`null`. The
list route never 500s on a degraded vantage — it returns honest falses/nulls (the same
posture as the gate and the per-slug signals endpoint).

### 4. Promoted-state, idempotency, UX-pending

**Idempotency key = the slug** (Story 16a collision-safe `title--author--suffix`, ISBN-13
derived). The canonical d-tag is the slug (`buildBookRecordDTag(slug) === slug`), and kind-39999
is addressable/replaceable — so re-promote **replaces** under the same
`39999:<librarian>:<slug>` (the relay keeps the latest per address), producing **one**
canonical record (AC-7). Two independent guards make double-promote safe:
- `promotions.slug UNIQUE` rejects a second enqueue (200 `already`).
- Even if two jobs ran, both publish to the **same address** → one canonical record.

**Promoted-state is known two ways** (belt + suspenders, both honest):
- The `promotions` row `status` (`pending|promoting|done|failed`) — the authoritative job
  state, read by the curator's submission view.
- The existence of the librarian record at `39999:<librarian>:<slug>` under the `books` header
  — the ground truth the catalog read paths already use (a promoted book simply appears in
  genre browse / search / shelves with no special-casing, AC-4).

**UX states** (`apps/web/src/routes/CommunitySubmissions.tsx` + a submission-detail surface):
- Below-gate / anon: **no Promote affordance** (and the server 401/403s a direct request).
- Above-gate, not yet promoted: a **Promote** action.
- `pending` / `promoting`: **"Promotion queued"** (the worker hasn't run / is running) — honest
  about the latency; mirrors a building/pending pattern.
- `done` (or the `books` record exists): **"In catalog"** with a link to the catalog entry.
- `failed`: **"Promotion didn't go through"** (re-offer Promote; no silent failure).

Copy is illustrative and will be reviewed against `memory/feedback_unbnd_copy_and_visual.md`
(no em dashes, no declarative negatives, no SaaS chrome) before strings ship. No new icon
library, no hex literal outside `tokens.css`; the Promote action reuses existing button tokens.

### 5. Provenance

The canonical record is **librarian-signed** (the submitter is no longer the event author), so
provenance must be carried in the payload to stay honest. **Decision (additive `BookRecord`
schema change — pinned in the 2026-06-01 amendment, supersedes the earlier "no new field"
framing):**
- Set **`source: "community"`** — already a valid `BookSource` enum value
  (`packages/schemas/src/BookRecord.ts:13`). This is the honest signal that the book entered the
  catalog by community submission + curator promotion, not the Open Library seed.
- Mint the **original submitter** directly into the canonical record via a dedicated provenance
  tag, so the credit survives independent of the queryability of the surviving submission event
  or the `promotions.requested_by` (the promoter, who is **not** the submitter). This is an
  **additive, optional** schema change in `@unbnd/schemas` `BookRecord.ts`:

  - **Type:** add an OPTIONAL field to the `BookRecord` domain type:
    ```ts
    readonly submittedBy?: HexPubkey;   // original submission event's author (hex)
    ```
    and a matching optional `submittedBy?: string | null` on the wire payload
    (`BookRecordPayload["bookSubmission"]`), populated `record.submittedBy ?? null` like
    `authorPubkey`.
  - **Builder (`toBookRecordEvent`):** emit a single tag **only when set**, mirroring the
    existing `["p", record.authorPubkey]` conditional:
    ```ts
    if (record.submittedBy) tags.push(["submitted-by", record.submittedBy]);
    ```
    Tag shape on the wire: `["submitted-by", <submitterPubkeyHex>]` — **HEX**, consistent with
    the `["p", <hex>]` author ref and every other nostr pubkey tag ref in the codebase. The
    `d`-tag (= slug, `buildBookRecordDTag`) and all existing tags are untouched; this is a clean
    additive tag slot.
  - **Reader (`fromBookRecordEvent`):** map the payload field back through (optional).
  - **Additive / optional / seeded-records-unaffected:** when `submittedBy` is unset, **no**
    `submitted-by` tag is emitted and the payload field is `null`. The seeder's catalog records
    (`apps/seeder`, `mapWorkToBookRecord`) never set it, so they emit no `submitted-by` tag and
    remain byte-compatible with today's shape — no validator, fixture, or existing-record break.
- **Promoter:** `mapSubmissionToCatalogRecord(...)` sets `submittedBy` = the original submission
  event's author (hex) when minting the canonical record. (`source:"community"` as before.)
- **Read path (optional passthrough):** the catalog/book read can expose the submitter — hex
  resolved to **npub** at the API boundary + Story-29 display resolution (`useProfileMeta`,
  honest `shortNpub` fallback) — so the web can credit "submitted by …". Kept additive/optional:
  a seeded record with no `submitted-by` tag simply has no submitter to surface.

This honors the PO's lean (`source:"community"` + a real submitter reference) by minting the
credit *into the canonical record itself*. Ripple from this schema change is captured in §6
(testable seams) and §7 (ripple/files).

### 6. Testable seams (fixture/CI-verifiable — load-bearing)

**API (mirror existing route tests — DI, no intra-module `vi.mock`):**
- `buildSubmissionsRouter` already takes injected `config, sessionUser, publish, query`
  (`submissions.ts:34-43`); add injected **`trust: TrustProvider`** and a **`enqueuePromotion`**
  DB seam (a thin fn over the `promotions` insert, injected like `query`). Tests use the
  **fixture `TrustProvider`** (`TRUST_PROVIDER=fixture`, deterministic `TRUST_FIXTURE`) + a fake
  session + a fake enqueue. Assert: above-gate session → enqueue called once + 200; below-gate →
  403, **no** enqueue; anon → 401; trust-empty/absent → 403 (gate closes); double-promote → second
  call returns `already`, enqueue not duplicated. Signals: with fixture weights over a known
  curator key set, assert `curatorRatingCount`/`curators`/`trustedAverage`; with empty weights,
  assert `signals: null`.
- **The REAL list endpoint produces the enriched shape (§3b) — load-bearing, this is the test
  whose absence let the gap through.** Exercise `GET /api/submissions` **against the route**
  (DI: fixture `TrustProvider`, fake `sessionUser`, a fake `readPromotionStatuses`, fake
  `query`) — **NOT** a component test fed pre-enriched mock rows. Assert each row carries:
  - **`canPromote`** is **gate-aware**: above-gate session → `true` on every row; below-gate
    session → `false`; anon → `false`; trust empty/absent → `false` (fail-closed). Assert it is
    computed **once** (the trust seam is hit once for the session user, not once per row).
  - **`promotionStatus`** reflects `promotions` rows: a slug with a `done` row → `"done"`; a
    slug with no row → `null`/absent; the read is the **single batched** `WHERE slug = ANY(...)`
    over the page's slugs (assert one `readPromotionStatuses` call, not N).
  - **`signals`** is computed / honest-null: fixture weights over a known above-gate rater set
    → real `curatorRatingCount`/`curators`/`trustedAverage`; empty weights / no trusted rater
    → `signals: null`.
- **Web tests source rows from the real `api.submissions.list` shape** (or a fixture generated
  from it), so a row missing `canPromote`/`promotionStatus`/`signals` fails the test rather
  than silently rendering nothing. Pre-enriched hand-written mock rows alone are **no longer
  sufficient** — that masking is what hid the end-to-end gap.
- **`@unbnd/schemas` (provenance tag):** a unit test on `toBookRecordEvent` asserting it emits
  exactly one `["submitted-by", <hex>]` tag when `submittedBy` is set (hex on the wire, matching
  the input), and emits **no** `submitted-by` tag when `submittedBy` is unset (seeded-record
  shape preserved). A `fromBookRecordEvent` round-trip asserting the field maps back. This pins
  the additive/optional contract.
- **Worker:** test the pure builder `mapSubmissionToCatalogRecord(...)` directly (correct
  `books` header address, `source:"community"`, slug-preserving d-tag, and `submittedBy` set to
  the original submission event's author hex → the minted record carries
  `["submitted-by", <submitterHex>]`). Test the loop by
  injecting **(a)** a fake queue-reader (returns a claimed pending job), **(b)** a fake librarian
  **signer** (a deterministic stub, NO real `LIBRARIAN_NSEC`), **(c)** a fake **publisher** (no
  live relay). Assert: it builds the correct canonical record, signs it, publishes to local +
  dcosl, marks the job `done` with `canonical_id`, and is **idempotent** (running twice yields one
  address / replaces, second is a safe no-op). Mirror the seeder's test structure
  (`apps/seeder` has `vitest`).
- **Guard:** a test asserting `LIBRARIAN_NSEC` never appears under `apps/api/src`
  (the secret-leak guard for gate decision 2). The **ADR 0014 architecture guard**
  (`apps/api/test/trust/architecture.test.ts`) stays green — this feature consumes only the
  neutral `TrustProvider`; no Brainstorm/NIP-85/30382 specifics leak.

All of the above run with **no Brainstorm call, no relay, no human** (AC-8).

### 7. Ripple / new files

**New:**
- `apps/promoter/` — new app: `package.json` (mirror seeder; add `@unbnd/schemas`, `nostr-tools`,
  `postgres`/drizzle for the queue, `ws`), `src/index.ts` (the loop), `src/build.ts`
  (`mapSubmissionToCatalogRecord`), `src/publish.ts` (relay connect, copy seeder), `src/queue.ts`
  (claim/mark over `promotions`), `esbuild.config.mjs` (copy seeder), `Dockerfile` (copy
  seeder's), `vitest` tests.
- `apps/api/src/db/migrations.ts` — append migration `0003_promotions` (the table above).
- `apps/api/src/db/schema.ts` — add the `promotions` drizzle table + `PromotionRow` types.
- `apps/api/src/submissions/signals.ts` — the signal-compute helper (or inline in the route,
  but a helper is more testable).
- `apps/promoter/.../Dockerfile` + GHCR build wiring (CI mirrors the seeder image build).

**Changed:**
- `packages/schemas/src/BookRecord.ts` — add the OPTIONAL `submittedBy?: HexPubkey` field to the
  `BookRecord` type + the matching `submittedBy?: string | null` wire payload field; emit
  `["submitted-by", <hex>]` in `toBookRecordEvent` only when set; map it back in
  `fromBookRecordEvent`. Additive/optional — seeded records (no `submittedBy`) emit no tag and are
  unchanged. (+ a `packages/schemas` test, see §6.)
- `apps/promoter/src/build.ts` — `mapSubmissionToCatalogRecord(...)` sets `submittedBy` = the
  submission event author hex (listed under New, this is the behavior detail).
- `apps/api/src/routes/submissions.ts` — add `POST /api/submissions/:slug/promote` (the gate +
  enqueue), the per-slug `GET /api/submissions/:slug/signals` read, and the `trust` +
  `enqueuePromotion` deps. **Remediation (§3b): enrich the `GET /api/submissions` list handler**
  — read the session user, compute `canPromote` **once** via `houseWeightOf`, do the **single
  batched** `readPromotionStatuses(slugs)` read, compute `signals` per row via
  `computeSubmissionSignals`, and stamp `canPromote`/`promotionStatus`/`signals` onto each row
  (`toSubmission` extended, or enriched after the map). Inject a new
  **`readPromotionStatuses(slugs: string[]) => Promise<Map<string, PromotionStatus>>`** DB seam
  (mirroring `enqueuePromotion`).
- `apps/api/src/db/index.ts` (+ wherever `enqueuePromotion` is wired) — back
  `readPromotionStatuses` with the batched `WHERE slug = ANY(...)` query over `promotions`.
- `apps/api/src/config.ts` — add `curatorThreshold` (env `CURATOR_THRESHOLD`, validated `(0,1]`,
  default `0.5`).
- `apps/api/src/index.ts` — pass `trust` + an `enqueuePromotion` (DB-backed) into
  `buildSubmissionsRouter`.
- `apps/web/src/routes/CommunitySubmissions.tsx` (+ a submission-detail surface) — render
  signals, the gated Promote action, and the pending→in-catalog states **from the enriched
  list rows** (`canPromote`/`promotionStatus`/`signals` now arrive on each row — the web reads,
  never computes).
- `apps/web/src/lib/api.ts` — add `submissions.promote(slug)`; the `SubmittedBook` type carries
  `canPromote?: boolean`, `promotionStatus?: string | null`, `signals?: SubmissionSignals`
  (already present in the shipped type) — **confirm `submissions.list()` returns this enriched
  shape from the real endpoint** (§3b), not just the bare 16b-i fields. (A lazy
  `submissions.signals(slug)` reader against `GET /:slug/signals` is the perf-follow-up seam,
  not wired now.)
- **Book read path (optional `submitted-by` passthrough):** the catalog/book read (API book
  route + its web BookDetail surface) optionally surfaces the submitter (hex→npub at the API
  boundary + Story-29 display resolution) so the web can credit "submitted by …". Kept
  **minimal/optional** — not a new heavy surface; seeded records with no `submitted-by` tag
  simply render nothing.
- `docker-compose.prod.yml` (and `docker-compose.yml` for local) — add the `promoter` service
  (`profiles:["promote"]`, `restart:"no"`, `DATABASE_URL`, `LIBRARIAN_NSEC`, `DCOSL_RELAY_URL`,
  `STRFRY_URL`, `LIBRARIAN_PUBKEY`); add `CURATOR_THRESHOLD` to the `api` env. **Do NOT** add
  `LIBRARIAN_NSEC` to the `api` service.
- The operator cron (the unbnd-upsync-style trigger) gains a periodic
  `docker compose --profile promote run --rm promoter`.

**Existing tests that change:** `apps/api/test/routes/submissions*.test.ts` (new gate/enqueue/
signals cases + DI for `trust`/`enqueuePromotion`/`readPromotionStatuses`; **plus the
remediation test that the REAL `GET /api/submissions` produces gate-aware `canPromote`,
batched `promotionStatus`, and computed/honest-null `signals` — §3b/§6**); the trust
architecture guard test stays green (assert, don't change); new
`apps/api/test/.../no-librarian-nsec-in-api` guard; **web `CommunitySubmissions` tests sourced
from the real `api.submissions.list` shape, not pre-enriched mock rows (§6)**; new
`apps/promoter/test/*`.

## Consequences

- **Enables:** curator-judged catalog growth; a promoted book is a real first-class catalog
  record (genre browse, search, shelves, ratings `a`-tag all work with no special-casing); the
  feature is fully fixture-verifiable in CI.
- **Constrains:** promotion is asynchronous (worker-fulfilled) — the UX must show a pending
  state honestly; operating a second deployable + its cron.
- **Debt / follow-ups:** **demotion → Story 30b** (kind-5 tombstone on a librarian record).
  The worker's retry/backoff policy for `failed` jobs is left to the implementer within the
  shape above. The house-observer swap (`HOUSE_OBSERVER_PUBKEY` → production librarian) stays
  deferred; the gate is built/verified against the fixture provider regardless.
  **Remediation follow-ups (2026-06-01, logged not shipped):** (a) **inline list-signals →
  lazy/bounded** as submission volume grows (move per-row signals to the existing
  `GET /:slug/signals` lazy fetch or a first-N cap — §3b perf note); (b) **`curatorTagCount`
  tag-signals extension** (`computeSubmissionSignals` returns `0` until the assertions-header
  read is wired — reviewer-logged, non-blocking); (c) **worker stranded-job / `failed`-retry
  reaper** (a `promoting` row from a died run, or a `failed` row, has no auto-recovery — a
  runbook/future-story item, reviewer-logged).
- **Affects existing fixtures?** Yes (after implementation): the web `CommunitySubmissions`
  fixtures gain signal + promoted-state shapes; `apps/api/test` submission fixtures gain
  `promotions`/trust-fixture cases. `packages/schemas` gains a **new** test for the additive
  `submittedBy` field / `submitted-by` tag (§6), but the change is additive/optional — existing
  `BookRecord` fixtures and seeded-record shapes are **unchanged** (no `submittedBy` → no tag).
- **New dependency?** No new *runtime* package — `apps/promoter` reuses `nostr-tools`, `postgres`,
  `drizzle-orm`, `ws`, `@unbnd/schemas`, esbuild (all already in the repo). A new *app*, not a
  new dependency.
- **PRD section change required?** No. This implements §2.7 as written; it does not touch the
  out-of-scope siblings (§2.8 accusatory picker, §2.9 search re-rank/shelves, §2.10 trust-tier
  badge) or any PRD §11.3 surface.

## Out of scope

Automatic threshold promotion (Phase 3); demotion / un-promote (Story 30b); the accusatory-tag
write picker + reveal (§2.8); the trust-tier badge / verified-author (§2.10); trust-weighted
search re-rank + homepage trust shelves (§2.9); a manually-assigned curator/editor role; the
house-observer swap; any new trust-weighting math; new lint/typecheck/build tooling. The worker's
retry/backoff tuning is deferred to implementation. (The dedicated `submitted-by` schema tag,
previously flagged here as open, is now **in scope** — accepted in the 2026-06-01 amendment, §5.)
