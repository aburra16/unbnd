# ADR 0034: Accusatory-tag gate — sensitivity-conditional curator write gate + librarian-signed reveal

**Status:** Accepted
**Date:** 2026-06-02
**Story:** `engineering-team/stories/done/33-accusatory-tag-gate.md`

## Amendment 2026-06-02 — reveal trigger is ops-only (no librarian-session API endpoint, no in-app reveal UI)

A subsequent gate decision changed the **reveal/withdraw trigger** only. The original draft chose
trigger Option A (a `POST /api/tags/reveal` + `…/withdraw` API endpoint gated to a session whose
pubkey equals the librarian pubkey, with an optional in-app reveal UI). That is **superseded**:

**The reveal/withdraw trigger is OPERATOR-ONLY for v1.** There is **no** `POST /api/tags/reveal`,
**no** `POST /api/tags/withdraw`, and **no** in-app reveal button. The rationale is key hygiene:
keep the librarian key out of any browser entirely. The user keeps the librarian identity offline;
the worker already holds `LIBRARIAN_NSEC`. Requiring the operator to hold a *browser session as the
librarian pubkey* (trigger Option A) put the librarian identity on the public session path; the
ops-only trigger removes that.

This amendment promotes what was recorded as **trigger Option B (Ops/worker-only trigger)** to the
chosen design. The trigger is now an **operator action on the droplet** — a worker subcommand / small
CLI, mirroring how the promoter is operator-run — that upserts the `reveals` row and lets the worker
mint the librarian-signed event off the API. See the **Amended trigger** block folded into the
Decision below (§4), the updated Options/Decision, and the updated testable-seams + ripple list.

**Unchanged by this amendment** (everything except the trigger): the sensitivity-conditional write
gate on `POST /api/tags` (§1), the `canAssertAccusatory` picker signal (§2), the `AccusatoryReveal`
event schema + `accusatory-reveals` concept header and the read-filter in `aggregate.ts` (§3) —
including the `GET /api/books/:slug/tags` batched reveal lookup, which **stays** (it is how a revealed
tag surfaces, independent of how the reveal was triggered) — the honest tag-only attributed render
(§5), honest degrade (§6), the `reveals` table + migration `0004`, the worker reveal job-kind in
`apps/promoter`, `LIBRARIAN_NSEC` worker-only, fixture-verifiability, and the defamation/moderation
rationale. Net surface change: the **API/web reveal surface shrinks** (no reveal endpoint, no reveal
UI); the **worker/ops surface carries the trigger**.

## Gate decisions (2026-06-01, baked in)

The user resolved the story's four open gate questions before this ADR. They are decisions of
record here, not options:

1. **Reveal mechanism = a librarian-signed "accusatory-reveal" event** per (book, tag), minted
   via the off-the-API worker (the ADR-0031 `apps/promoter` key-isolation pattern;
   `LIBRARIAN_NSEC` never on the API). The read path surfaces an accusatory tag only when a live
   reveal event exists. Reversible (withdraw → the read path hides it again). Filter-at-read; the
   underlying curator assertions are never mutated.
2. **Librarian-only reveal** — only the librarian/operator identity can trigger a
   reveal/withdraw; the librarian key stays in the worker. **(Amended 2026-06-02:** the trigger is
   an **operator action on the droplet** — a worker subcommand / CLI — **not** a librarian-session
   API endpoint. No reveal endpoint, no in-app reveal UI; the librarian key never enters a browser.
   See Amendment above and §4.**)**
3. **Write gate = sensitivity-conditional** server-side curator gate on `POST /api/tags`: an
   accusatory write requires `houseWeightOf(session) ≥ CURATOR_THRESHOLD` (fail-closed,
   server-enforced, both tiers); a normal genre/style write is unchanged. Reuse
   `CURATOR_THRESHOLD` (no new env). Anon 401, below 403 `below_gate`.
4. **Revealed tag renders tag-only, attributed to a review action** ("reviewed/surfaced," never
   "community consensus"); underlying curator counts are not shown. Apply/dispute polarity is kept
   on the accusatory write for schema consistency, but **reveal (not a polarity tally) is the sole
   visibility control**.

## Context

This is PRD §2.8: accusatory tags (`ai-generated`, `possibly-ai-generated`) stay behind a
**manual, explicit gate** in Phase 2, never an automatic/emergent trust-consensus reveal.
Automated/emergent reveal and automated AI-detection are Phase 3 (PRD §3). Two things ship: a
trust-gated accusatory **write** picker, and an explicit, auditable, attributable **read-time
reveal**.

The classification substrate already exists (ADR 0009, ADR 0010):

- **Sensitivity is on the wire.** `packages/schemas/src/BookTag.ts:10` defines
  `TagSensitivity = "normal" | "accusatory"`; the taxonomy element carries it
  (`["sensitivity", class]`). The accusatory tags are **defined** in the librarian taxonomy —
  `apps/seeder/src/taxonomy.ts:30-31` declares `ai-generated` / `possibly-ai-generated` as
  `type:"signal"`, `sensitivity:"accusatory"`.
- **Hidden at read time today.** `apps/api/src/tags/aggregate.ts:172` drops accusatory tags from
  the aggregate: `if (!el || el.sensitivity === "accusatory") continue; // hide unknown +
  accusatory`. `GET /api/books/:slug/tags` (`apps/api/src/routes/tags.ts:82-124`) therefore never
  surfaces an accusatory tag. **This story makes that drop conditional on a live reveal.**
- **Absent from the write picker.** `apps/web/src/components/TagControl.tsx:58-67` filters the
  taxonomy to `(genre|style) && sensitivity !== "accusatory"`. **This story offers accusatory
  tags to above-gate curators.**
- **No server gate on the tag write today.** `POST /api/tags` (`apps/api/src/routes/tags.ts:163`)
  accepts any signed-in user's assertion for any tag slug — sovereign (client-signed `{event}`)
  and custodial (server ephemeral-wrap, ADR 0006). The only barrier keeping accusatory tags out
  is the UI picker exclusion, which is not enforcement. **This story adds the server-side gate.**

**The gate to reuse (ADR 0031 / Story 30).** `apps/api/src/routes/submissions.ts:282-291`
implements `houseWeightOf(callerHex)`: the session user's own weight from the **house observer's**
vantage (`deps.trust.weights(houseHex, [callerHex])`), resolving to `0` on any degrade (no
provider / no observer / empty map / throwing seam) so the gate **closes**. The promote route
(`:296-321`) gates on `weight < threshold → 403 below_gate`, anon → `401 no_session`, with
`config.curatorThreshold` (env `CURATOR_THRESHOLD`, validated `(0,1]`, default `0.5`,
`config.ts:153-157`). The list route exposes a once-computed user-level `canPromote` flag
(`:217-228`). This ADR reuses **all** of it: the same `houseWeightOf` helper, the same threshold,
the same fail-closed posture, the same `canPromote`-style flag pattern.

**The off-the-API signer pattern (ADR 0031).** `LIBRARIAN_NSEC` lives **only** in the worker.
`apps/promoter/src/main.ts:36-41` decodes it at runtime; `apps/api` holds only `LIBRARIAN_PUBKEY`.
The promoter is a cron-fired, queue-consuming worker: the API enqueues a Postgres row
(`promotions`, idempotent on slug), the worker claims pending jobs
(`FOR UPDATE SKIP LOCKED`, `apps/promoter/src/queue.ts:26-46`), reads the source event, builds +
librarian-signs a kind-39999 record (`finalizeEvent`, `main.ts:64-65`), publishes to local +
dcosl (`apps/promoter/src/index.ts:99-105`), and marks the job `done`. A guard test asserts
`LIBRARIAN_NSEC` never appears under `apps/api/src`. ADR 0033 (verified-author) just established
the precedent of a **new dedicated concept header** + a worker-minted librarian-signed kind-39999
event for this exact class of curator/librarian-authored overlay.

**The trust seam + fixture (ADR 0014 / 0017).** `apps/api/src/trust/types.ts:49-52`:
`weights(observerHex, targetHexes)` returns an empty map on backend failure, never throws. The
fixture provider (`TRUST_PROVIDER=fixture` + `TRUST_FIXTURE`) gives a known observer known weights
over a known key set, so both sides of the threshold are CI-testable with no Brainstorm, no relay,
no human. The ADR-0014 architecture guard (`apps/api/test/trust/architecture.test.ts`) keeps
Brainstorm/NIP-85 specifics inside `brainstorm.ts`; this feature consumes only the neutral
provider, so the guard stays green.

**Architecture invariants (CLAUDE.md).** POV-first (§1): the write gate is the **session** user's
own weight from the house vantage. Decentralized-first (§2): accusatory assertions are still
permissionless events; the gate is at write **authorization** and the reveal is an explicit signed
action, not an administered allowlist of people. Filter-at-view-time (§3): the reveal is applied
at **read time** in the tag aggregate; canonical assertions are never mutated. Librarian pubkey is
resolved at runtime, never hardcoded. No raw GrapeRank number on any surface.

### The defamation / moderation rationale (engineering-framed; the FIREWALL)

This is **moderation design and product risk, not legal or business opinion.** An accusatory tag
like `ai-generated` is a **factual claim about a specific named work and, by implication, its
author** — unlike a genre or rating (subjective, low-harm if wrong), a wrong accusatory tag is a
reputational harm to a real person. Auto-revealing such a claim on a raw or trust-weighted count
of curator assertions (a) has **almost no statistical basis** — a dozen accounts agreeing is not
evidence a book is AI-generated — and (b) would make the **platform the publisher** of an
unverified accusation surfaced by an automatic rule no human stood behind. The design mitigations,
each an AC:

1. **Gate the write** to trusted curators (raises assertion quality — AC-1/AC-2).
2. **Never auto-reveal** — visibility requires an explicit, attributable human action, so every
   surfaced accusation traces to an accountable identity who chose to stand behind it (AC-4).
3. **Reversible + auditable** — a contested reveal can be withdrawn and the trail inspected
   (AC-6); the reveal is a durable, signed, timestamped, attributable event.
4. **Honest presentation** — a revealed tag is shown as a reviewed/surfaced signal, not as
   "community consensus" (AC-5).

Emergent/automated reveal is deferred to Phase 3 precisely because it would require a
statistically defensible, lower-exposure detection-or-consensus model this phase does not build.

### DList shapes referenced (ADR 0009 baseline)

- `kind:39998` `book-tags` — the taxonomy registry (supplies `sensitivity`).
- `kind:39998` `book-tag-assertions` — the assertion concept header.
- `kind:39999` `BookTagAssertion` — the curator assertion (`["a", bookAtag]`, `["t", tagSlug]`,
  `["t", tagType]`, `["polarity", ±1]`, `["p", asserterHex]`; d-tag
  `tagassert--<bookSlug>--<tagSlug>--<asserter8>`). **Unchanged** by this ADR — accusatory and
  normal assertions use the same shape; the new gate is at the route, the new reveal is a separate
  event.

## Options considered

### Reveal mechanism (gate decision 1 already fixed it to a signed event; alternatives recorded for the record)

#### Option A — Librarian-signed "accusatory-reveal" event per (book, tag), worker-minted (CHOSEN)

A reveal is a **librarian-signed kind-39999** event under a new dedicated `accusatory-reveals`
concept header, referencing the book by `#a` and the tag by `#t`, with a `state` of `revealed` |
`withdrawn`. It is minted via an explicit librarian-only trigger through the **off-the-API worker**
(extend `apps/promoter` with a `reveal` job-kind). The read path surfaces an accusatory tag iff a
**live** reveal (latest event for that (book, tag) is `revealed`) exists.

- **Pro:** the most auditable shape — every reveal/withdraw is a durable, signed, timestamped,
  attributable record on the wire, reversible, and it reuses the proven ADR-0031 mint + the
  ADR-0033 dedicated-header precedent. The API holds **no** reveal-signing secret. Lowest
  defamation exposure: every visible accusation traces to an explicit librarian action.
  Filter-at-view-time by construction; canonical assertions never touched.
- **Con:** reveal is asynchronous (worker-fulfilled) — a small pending latency. A second job-kind
  on the worker + a new queue path + a new concept header. Accepted (the same shape promotion
  already pays for).

#### Option B — Server-side review-queue + reveal flag (REJECTED)

Accusatory assertions land in a Postgres review queue; a reviewer flips a `revealed` boolean;
the read path joins it.

- **Con:** the audit record is **server-side state**, not a signed portable event — weaker against
  decentralized-first (§2), more admin-panel-shaped, and the reveal does not propagate to dcosl.
  Rejected per gate decision 1.

#### Option C — Config/allowlist of revealed (book, tag) pairs (REJECTED)

A static list in config controls visibility.

- **Con:** least auditable — no per-reveal actor/timestamp, no reversible trail, requires a deploy
  to change, indefensible if a reveal is ever challenged. Rejected per gate decision 1.

### Worker integration — extend `apps/promoter` vs. a sibling worker

#### Option A — Extend `apps/promoter` with a `reveal` job-kind (CHOSEN)

Add a `kind` column to the queue (`promote` | `reveal-accusatory` | `withdraw-accusatory`) and a
second cycle function (`runRevealCycle`) in the same worker. Reuse its relay connections, its
`LIBRARIAN_NSEC` decode, its esbuild bundle, its compose service + cron profile.

- **Pro:** one key-holding deployable, one secret surface, one cron, one Dockerfile. The
  promoter is already "the librarian's off-internet signer"; revealing is the same job class
  (read a source event → librarian-sign an overlay event → publish local + dcosl). No new
  compose service, no second `LIBRARIAN_NSEC` env.
- **Con:** the worker grows a second responsibility; the queue table gains a discriminator.
  Mitigated by a clean `kind`-dispatched cycle and isolated `src/reveal/*` modules. Accepted.

#### Option B — A new sibling `apps/revealer` worker (REJECTED)

A second key-holding worker dedicated to reveals.

- **Con:** doubles the secret surface (a second process with `LIBRARIAN_NSEC`), a second compose
  service, a second cron, a second Dockerfile/CI image — all to run a job that is mechanically
  identical to promotion. The only thing isolated by a separate process is a few hundred lines
  that share every dependency. The marginal isolation is not worth a second copy of the most
  sensitive credential. Rejected — extending the existing single key-holder is the safer,
  simpler call.

### The librarian-only trigger auth (amended 2026-06-02 — Option B is now CHOSEN; Option A superseded)

#### Option A — API enqueue gated to a session whose pubkey === `config.librarianPubkey` (SUPERSEDED — was CHOSEN in the original draft)

A new `POST /api/tags/reveal` (and `…/withdraw`) resolves the session user and enqueues a `reveal`
job **only if** the session pubkey equals the configured librarian pubkey
(`deps.config.librarianPubkey`); anon → `401`, any other signed-in user → `403 not_librarian`.
The worker (cron) then mints the signed reveal. The librarian key never reaches the API — the API
only checks **identity equality** against the public `LIBRARIAN_PUBKEY` it already holds, then
enqueues a row exactly like promotion.

- **Pro:** auditable (the enqueue row records `requested_by` = the librarian hex + timestamp);
  reuses the exact enqueue→worker pipeline; no new auth primitive; the API still holds only the
  public key. The librarian signs in with their own session (the same NIP-07 / custodial session
  every user has) and the operator identity is the librarian pubkey — clean and self-consistent
  with "the librarian is one author among many."
- **Con (the decisive one):** requires the operator to hold a **browser session as the librarian
  pubkey** to trigger. That puts the librarian identity on the public session path / in a browser,
  for a credential the user keeps offline. The Amendment 2026-06-02 gate decision ruled this out:
  the librarian key must never enter a browser. **Superseded.**

#### Option B — Ops/worker-only trigger: a worker subcommand / CLI on the droplet (CHOSEN — amended 2026-06-02)

The reveal/withdraw is triggered by an **operator action on the droplet**, mirroring how the
promoter cron is operator-run. There is **no** API route and **no** in-app UI. The operator runs a
worker subcommand / small CLI that **upserts the `reveals` row** (`book_slug`, `tag_slug`,
`state: revealed|withdrawn`, `requested_by` = the recorded librarian hex actor); the worker then
mints the librarian-signed `accusatory-reveal` / withdraw event (`finalizeEvent` with
`LIBRARIAN_NSEC`, off the API) and publishes to local + dcosl, exactly as the promote cycle does.

- **Pro:** **zero** new API attack surface and the librarian key never touches a browser — it stays
  worker-side, decoded at runtime exactly as the promoter already does it. The trigger and the
  signer live in the same operator-run, off-internet-facing process. Still fully auditable: the
  `reveals` row records `requested_by` + timestamps and the **signed event** on the wire is the
  durable, attributable record (the ground truth the read path consults). Idempotent via the
  `reveals` `UNIQUE(book_slug, tag_slug)` upsert. Testable as a pure enqueue/upsert + a worker mint
  with a fake signer and fake publisher — no route harness needed.
- **Con:** no in-product affordance — the reveal is an ops runbook step, not a UI button. Accepted:
  for a rare, accountable, defamation-bearing operator action, an ops trigger is the correct and
  safest v1 shape (it matches how promotion is effectively operator-run today), and it keeps the
  most sensitive credential entirely off the browser/session path.

## Decision

We chose: **(reveal) Option A — a librarian-signed `accusatory-reveal` kind-39999 event per
(book, tag), worker-minted; (worker) Option A — extend `apps/promoter` with a reveal job-kind;
(trigger) Option B (amended 2026-06-02) — an operator-run worker subcommand / CLI on the droplet
that upserts the `reveals` row, with the worker minting the signed event off the API. No reveal API
endpoint, no in-app reveal UI.** (The original draft chose trigger Option A — a librarian-session
API endpoint; that is superseded by the Amendment above.)

This is the only combination that satisfies every gate decision: a durable signed auditable
reversible reveal, `LIBRARIAN_NSEC` never on the API **and never in a browser**, librarian-only
reveal, the canonical assertions never mutated, the write gate reusing `CURATOR_THRESHOLD`
fail-closed for both tiers, and an honest tag-only render — all by reusing shipped seams (the
ADR-0031 gate + queue + worker, the ADR-0033 dedicated-header precedent, the ADR-0009 aggregate,
the ADR-0014/0017 trust fixture) and introducing **no** new crypto and **no** new trust math.

### 1. The write gate — `POST /api/tags`, sensitivity-conditional, both tiers

The route (`apps/api/src/routes/tags.ts:163`) gains a **sensitivity branch** that runs **before**
either tier path, so it applies identically to sovereign (client-signed `{event}`) and custodial
(server ephemeral-wrap) writes.

**Resolving the asserted tag's sensitivity.** The route reads the **librarian taxonomy** (the
`book-tags` concept it already queries for `GET /api/tags`) and looks up the asserted `tagSlug`:

```ts
// Build deps gain `trust` (mirroring submissions). The router resolves the
// asserted tag's sensitivity from the librarian taxonomy.
const taxonomy = parseTaxonomy(await deps.query({ kinds: [KIND], "#z": [tagsConcept()] }));
const el = new Map(taxonomy.map((t) => [t.slug, t])).get(assertedTagSlug);
const isAccusatory = el?.sensitivity === "accusatory";
```

- `assertedTagSlug` is taken from `req.body.tagSlug` for the **custodial** path (the intent) and,
  for the **sovereign** path, from the validated event's `["t", tagSlug]` tag (the first `t` tag,
  which `BookTagAssertion` emits as the tag slug — `BookTagAssertion.ts:75-77`). The route reads it
  off the signed event so a crafted accusatory event cannot bypass the gate by lying in the body.
- **Unknown slug** (not in the taxonomy) → treat as **non-accusatory** (the existing behavior;
  unknown tags are already dropped at read by `aggregate.ts:172`). The gate is specifically the
  accusatory branch; it does not newly reject genre/style/unknown writes.

**The branch:**

- `isAccusatory === false` → **unchanged.** Any signed-in user writes exactly as today (both
  tiers). Anon still `401` as today. No new rejection on the normal path.
- `isAccusatory === true` → **curator-gated**, reusing the ADR-0031 `houseWeightOf` helper
  (lift it into `tags.ts`, identical body): resolve the session user (`deps.sessionUser`); anon →
  `401 no_session`; `houseWeightOf(user.pubkeyHex) < (config.curatorThreshold ?? 0.5)` →
  `403 below_gate` (mirroring `submissions.ts:306-310`); at/above → proceed to the existing tier
  path (sovereign validate+publish, or custodial sign+publish). This holds for **apply and
  dispute** polarity alike (asserting an accusatory tag at all is the gated action).

**Honest degrade (AC-7).** `houseWeightOf` resolves to `0` on any trust degrade (no provider, no
observer, empty map, throwing seam) → accusatory write closes (`403`). The `weights` seam never
throws; the gate wraps it defensively. A trust outage **never** opens the accusatory write.

**Contract (write gate):**

| Tag sensitivity | Session | Result |
|---|---|---|
| normal (genre/style/unknown) | anon | `401 no_session` (as today) |
| normal | any signed-in | accept (unchanged, both tiers) |
| accusatory | anon | `401 no_session` |
| accusatory | signed-in, weight `< CURATOR_THRESHOLD` (incl. degrade → 0) | `403 below_gate` |
| accusatory | signed-in, weight `≥ CURATOR_THRESHOLD` | accept (both tiers) |

### 2. The write picker offer — the web signal

The web must know whether to offer accusatory tags **before** the user writes (AC-1), without
leaking a raw weight. Reuse the `canPromote` pattern (ADR 0031 §3b): a **once-computed,
user-level boolean** stamped by the API.

- **Add `canAssertAccusatory: boolean`** to the existing tags read the picker already consumes.
  `GET /api/books/:slug/tags` (or a small `GET /api/tags/abilities` if the implementer prefers a
  book-independent surface) computes it **once** from the session user:
  `canAssertAccusatory = (await houseWeightOf(sessionUserHex)) >= (curatorThreshold ?? 0.5)`,
  anon → `false`, any degrade → `false` (fail-closed). No raw number is exposed — only the
  boolean.
- `TagControl.tsx` reads the flag and, when `true`, includes the accusatory signal tags in the
  picker `options` (a new `optgroup` "Signals", offered **only** when `canAssertAccusatory`), in
  addition to the existing genre/style groups. When `false` (or absent), the picker is **exactly
  as today** — genre/style only, accusatory excluded. The server gate (§1) is the real enforcement;
  the picker flag is the honest affordance.

The flag degrades fail-closed identically to the write gate, so the picker and the gate agree.

### 3. The accusatory-reveal event + read-filter change

**New concept header** (ADR-0033 precedent — a dedicated header keeps the reveal scan clean):
`BOOK_ACCUSATORY_REVEALS_HEADER_SLUG = "accusatory-reveals"` +
`buildBookAccusatoryRevealsHeaderAddress(librarianPubkey)` in
`packages/schemas/src/concept-headers.ts`.

**Reveal event shape** (`packages/schemas/src/AccusatoryReveal.ts`, new) — a **librarian-signed
kind-39999** addressable/replaceable event, identity `(book, tag)`:

- d-tag: `reveal--<bookSlug>--<tagSlug>` (deterministic; **one** address per (book, tag), so a
  withdraw replaces the reveal at the same address — replaceable-to-state, no separate kind-5).
- `["z", "39998:<librarian>:accusatory-reveals"]` — the new header.
- `["a", "39999:<librarian>:<bookSlug>"]` — the target book (filter via `#a`).
- `["t", <tagSlug>]` — the revealed tag (filter via `#t`).
- `["state", "revealed" | "withdrawn"]` — the visibility state.
- JSON mirror `{ word:{…,wordTypes:["word","accusatoryReveal"]}, accusatoryReveal:{ bookSlug,
  bookAtag, tagSlug, state } }`. Author = the **librarian** (the only signer; attribution is the
  signature itself).

**Reversal (gate decision 1 / AC-6).** Withdraw = re-mint the **same address** with
`state:"withdrawn"`. Because the d-tag is `(book, tag)`-keyed and kind-39999 is replaceable, the
relay keeps the **latest** event per address, so a withdraw cleanly supersedes the reveal with a
durable, timestamped, signed withdrawal record (the trail is the event history). No separate
tombstone kind needed; the canonical assertions are untouched.

**Read-filter change** (`apps/api/src/tags/aggregate.ts`). `aggregateBookTagsWeighted` gains an
injected **reveal set** — the set of tag slugs currently revealed for *this book*:

```ts
export function aggregateBookTagsWeighted(
  assertions, taxonomy, weights,
  revealedTagSlugs: ReadonlySet<string> = new Set(), // NEW, default empty = today's behavior
)
```

Line 172 becomes conditional:

```ts
if (!el) continue;                                    // unknown still dropped
if (el.sensitivity === "accusatory" && !revealedTagSlugs.has(slug)) continue; // hidden UNLESS revealed
```

A revealed accusatory tag flows into `result.signals` like any signal, carrying a marker so the
web renders it honestly (see §4). The default-empty argument means **every existing caller and
the raw `aggregateBookTags` path are unchanged** (AC-3 hidden-by-default is preserved).

**The book-tags read computes the reveal set with NO N+1** (AC-4, perf). `GET
/api/books/:slug/tags` already does two parallel queries (taxonomy + assertions,
`tags.ts:86-89`). Add a **third parallel query** scoped to this one book:

```ts
deps.query({ kinds: [KIND], "#z": [accusatoryRevealsConcept()], "#a": [bookAddr] })
```

Reduce the returned reveal events to the latest per (book, tag) d-tag, keep those whose latest
`state === "revealed"`, collect their `tagSlug`s into `revealedTagSlugs`, and pass that set to
`aggregateBookTagsWeighted`. This is **one batched filter per book read** (not per tag), authored
by the librarian only — N+1-free by construction.

### 4. The reveal trigger (operator-only, on the droplet) + worker

**Amended 2026-06-02.** The original draft put the trigger on the API as a librarian-session
endpoint (`POST /api/tags/reveal` / `…/withdraw`). That is **superseded**: the trigger is now an
**operator action on the droplet**, mirroring how the promoter cron is operator-run, and the
librarian key never enters a browser. **There is no reveal/withdraw API route and no in-app reveal
UI in v1.**

**Operator trigger** — a worker subcommand / small CLI run on the droplet (mirroring the promoter
cron pattern; concrete invocation shape, finalized in `docs/DEPLOY.md` at implementation time):

```sh
# reveal an accusatory tag for a book
docker compose -f docker-compose.prod.yml --profile promote run --rm promoter \
  reveal --book <book-slug> --tag <tag-slug>

# withdraw a previously revealed tag (same command, --withdraw)
docker compose -f docker-compose.prod.yml --profile promote run --rm promoter \
  reveal --book <book-slug> --tag <tag-slug> --withdraw
```

(The exact subcommand name / flag spelling and whether it rides the existing `--profile promote`
service or a sibling `--profile reveal` one are the implementer's call **within this shape**; the
load-bearing contract is: operator-run, on the droplet, in the key-holding worker, no API, no UI.)

What the subcommand does — **two steps, mirroring `enqueuePromotion` → mint**:

1. **Upsert the `reveals` row** (the same `enqueueReveal(bookSlug, tagSlug, state, requestedBy)`
   upsert seam the draft already specified — now invoked from the CLI, not an HTTP route): insert /
   replace the `reveals` queue row keyed on (book, tag) with `state ∈ revealed|withdrawn` and
   `requested_by` = the **librarian hex** (the recorded operator/actor for audit/provenance). The
   `UNIQUE(book_slug, tag_slug)` upsert makes a re-trigger and reveal→withdraw→reveal flips
   idempotent — the latest intent wins.
2. **The worker mints + publishes** (unchanged from the draft): the reveal cycle claims the pending
   `reveals` row, builds the librarian-signed `accusatory-reveal` (or withdraw) kind-39999 event
   (`finalizeEvent` with `LIBRARIAN_NSEC`, decoded worker-side at runtime — **off the API, off the
   browser**), and publishes to local + dcosl, then marks the row `done` with `minted_id`. A
   withdraw is the same path with `state:"withdrawn"` minted at the same on-the-wire address.

The CLI may invoke the upsert-then-run-cycle inline (a single operator command that both upserts and
mints in one process run), or upsert + let the next cron tick mint — either satisfies the shape; the
upsert is idempotent and the cycle is `FOR UPDATE SKIP LOCKED`-safe regardless.

**Operator runbook note** (to be written into `docs/DEPLOY.md` at implementation time): document the
reveal/withdraw invocations above; that the actor is the librarian identity (recorded as
`requested_by`); that the effect is asynchronous through the worker mint (the tag surfaces on book
detail once the live `revealed` event exists); that withdraw is the reversal; and that the operation
is idempotent (safe to re-run).

**Queue** — extend the existing Postgres queue rather than a new table is acceptable, but for
clarity this ADR specifies a **sibling `reveals` table** (migration `0004_reveals`, same embedded
idempotent pattern as `promotions`):

```sql
CREATE TABLE IF NOT EXISTS reveals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_slug     TEXT NOT NULL,
  tag_slug      TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('revealed','withdrawn')),
  requested_by  CHAR(64) NOT NULL,                 -- librarian hex (audit/provenance)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','minting','done','failed')),
  minted_id     TEXT,                              -- the librarian reveal event id, once published
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (book_slug, tag_slug)                     -- one live intent per (book,tag); re-trigger replaces
);
CREATE INDEX IF NOT EXISTS idx_reveals_status ON reveals(status);
```

`UNIQUE(book_slug, tag_slug)` + an upsert (`ON CONFLICT (book_slug, tag_slug) DO UPDATE SET
state=…, status='pending', updated_at=NOW()`) make re-triggering and reveal→withdraw→reveal flips
idempotent: the latest intent wins; the worker mints the matching signed event at the same
on-the-wire address.

**Worker** — extend `apps/promoter` with a `reveal` job-kind (worker Option A):

- `apps/promoter/src/reveal/build.ts` — a pure `buildAccusatoryRevealEvent({ librarianPubkey,
  bookSlug, tagSlug, state })` → `toAccusatoryRevealEvent(...)` → `toWireTemplate`. No key, no IO.
- `apps/promoter/src/reveal/queue.ts` — `claimPendingReveals` / `markRevealDone` / `markRevealFailed`
  (mirror `queue.ts`, `FOR UPDATE SKIP LOCKED`).
- `apps/promoter/src/reveal/cycle.ts` — `runRevealCycle(deps)`: claim pending reveals, build the
  librarian-signed event for each (the same injected `sign` = `finalizeEvent(template, sk)` the
  promoter already holds), publish to local + dcosl (reuse the promoter's relay connections), mark
  `done` with `minted_id`. A withdraw is just a reveal job with `state:"withdrawn"` — same path,
  different `state` on the minted event.
- `apps/promoter/src/main.ts` runs `runPromotionCycle` **and** `runRevealCycle` per cron run (or a
  `--profile reveal` selector; implementer's call within the shape). `LIBRARIAN_NSEC` stays the
  worker's, decoded at runtime; the API gains **no** secret — the guard test stays green.

**The read path surfaces a tag iff the latest minted reveal event for (book, tag) is
`state:"revealed"`** (§3). The queue row is the *intent / job status*; the **signed event** is the
ground truth the read path consults, exactly as promotion's ground truth is the librarian record,
not the `promotions` row.

### 5. Honest render (AC-5)

A revealed accusatory tag arrives in `signals` with a marker (e.g. `consensus.revealed === true`
on the `TagConsensus`, or surfaced in a separate `revealedSignals` array — implementer's call;
the load-bearing contract is the web can tell it apart). The web (`TagControl.tsx` /
BookDetail classification block) renders it:

- **Visually distinct** from genre/style chips — a separate treatment using existing brand tokens
  (no new icon library, no hex literal outside `tokens.css`).
- **Attributed to a review action**, never "community consensus." Copy is **tag-only** — the
  revealed tag name plus a short attribution that it was **surfaced by a review**, with **no**
  curator count and **no** apply/dispute tally shown (gate decision 4 / Open Question 3). The
  existing "Community consensus" / "Trusted consensus" label (`TagControl.tsx:76`) is **not**
  applied to a revealed accusatory chip — it gets its own honest "reviewed" framing.
- **Copy** is illustrative in this ADR and **must** pass `memory/feedback_unbnd_copy_and_visual.md`
  (no em dashes, no declarative negatives, no rhetorical contrasts, no hedged openers, no generic
  SaaS chrome) before any string ships. Candidate framing to refine, not final: a small label such
  as "Reviewed signal" near the chip. No "consensus," no headcount, no "a dozen people said so."

### 6. Honest degrade (AC-7) — consolidated

- **Write gate** closes on trust failure: `houseWeightOf → 0 → 403`. Never throws.
- **Picker flag** `canAssertAccusatory` → `false` on any degrade. The picker offers no accusatory
  tags.
- **Reveal never auto-fires.** There is **no count, threshold, or trust-consensus path** that
  reveals a tag. Reveal requires the librarian trigger → worker mint → a live `revealed` event,
  and nothing else. A trust outage, an empty weight map, or a flood of curator assertions
  **cannot** reveal a tag.
- **Accusatory stays hidden absent a live reveal**, from every vantage (House or `?observer=`),
  preserving `aggregate.ts:172` for the unrevealed case.

## Consequences

- **Enables:** trusted curators can assert accusatory signals (server-enforced, both tiers); the
  librarian can deliberately, reversibly, auditably surface an accusation per (book, tag); readers
  only ever see an accusatory tag a human stood behind, framed honestly; the whole flow is
  fixture-verifiable in CI.
- **Constrains:** reveal is asynchronous (worker latency between trigger and visibility — the UX
  shows nothing until the live reveal event exists, which is the honest state); the book-tags read
  gains one more parallel relay query (the reveal scan, batched per book — no N+1); the worker
  grows a second job-kind and the DB a second queue table.
- **Debt / follow-ups:** (amended 2026-06-02) the reveal/withdraw trigger is an **ops runbook step**
  — an operator-run worker subcommand / CLI on the droplet (trigger Option B), **not** an in-app
  action; there is no reveal endpoint or button in v1. An in-product affordance (e.g. a future
  librarian-session API route, the superseded trigger Option A) is a possible later addition **only**
  if the librarian-key-off-the-browser constraint is revisited — not planned. Worker retry/backoff for
  `failed` reveal jobs follows the promoter's existing posture (a future reaper, ADR-0031-logged).
  Phase-3 emergent reveal remains explicitly unbuilt.
- **Affects existing fixtures?** Yes (after implementation): `apps/api/test` tag-route fixtures
  gain the reveal-query DI, the sensitivity-branch cases, and the `canAssertAccusatory` flag;
  `apps/web` `TagControl` tests gain the offered-accusatory and revealed-render cases sourced from
  the real read shape; `packages/schemas` gains a new `AccusatoryReveal` test;
  `apps/promoter/test` gains the reveal build + cycle tests. Existing `aggregate.ts` callers are
  unchanged (default-empty reveal set), and existing normal-tag write tests are unaffected (the
  normal branch is unchanged).
- **New dependency?** No. `apps/promoter` already has `nostr-tools`, `postgres`, `ws`,
  `@unbnd/schemas`, esbuild; the API reuses the existing trust seam and DB. New schema + a new
  concept header are additive, not a new package.
- **PRD section change required?** No. This implements PRD §2.8 as written and touches no §11.3 /
  §3-deferred surface (no payments, file hosting, ebook sales, bounty marketplace,
  print-on-demand, social feed, reading progress, federation, email, **no automated AI-detection,
  no automatic/emergent reveal**).

## Testable seams (fixture/CI-verifiable — load-bearing, AC-8)

All run with **no Brainstorm call, no relay, no human**, via DI (no intra-module `vi.mock`),
mirroring the submissions route tests.

**Write gate (`tags.ts`):** `buildTagsRouter` deps gain injected **`trust: TrustProvider`**.
Tests use the fixture provider (`TRUST_PROVIDER=fixture`, deterministic `TRUST_FIXTURE`) + a fake
`sessionUser` + a fake `query` returning a known taxonomy (with `ai-generated` accusatory). Assert,
for **both tiers**:
- accusatory write, anon → `401`; below-gate session → `403 below_gate`, **not** published;
  above-gate session → published (sovereign validate+publish path and custodial sign+publish path).
- **normal** (genre/style) write is **unaffected**: anon → `401` (as today), any signed-in →
  published, regardless of weight.
- the sovereign accusatory gate reads sensitivity from the **signed event's** `t` tag (a crafted
  event cannot bypass via the body).
- honest degrade: empty/absent trust → accusatory `403` (gate closes); normal unaffected.

**Picker flag:** the read endpoint produces `canAssertAccusatory` gate-aware: above-gate → `true`,
below-gate → `false`, anon → `false`, degrade → `false`; computed **once** per request (trust seam
hit once for the session user).

**Hidden-by-default read (AC-3):** `aggregateBookTagsWeighted` with the **default-empty** reveal
set drops accusatory tags exactly as today, from House and `?observer=` vantages; the raw
`aggregateBookTags` path is unchanged.

**Reveal flips exactly one (book, tag) visible (AC-4):** with a fixture reveal set
`{ "ai-generated" }` for one book, that book's `GET /api/books/:slug/tags` surfaces `ai-generated`
in `signals` (with the revealed marker) and **only** that tag; a sibling accusatory tag with no
reveal stays hidden; a different book is unaffected (the reveal scan is `#a`-scoped per book).

**Reversal hides it (AC-6):** the read path keys on the **latest** reveal event per (book, tag) —
a `withdrawn` event superseding a `revealed` one at the same address returns the tag to hidden; a
unit test on the latest-per-d-tag reduction asserts the supersede.

**Canonical never mutated (AC-6):** the assertion events handed to `aggregateBookTagsWeighted` are
identical before and after a reveal/withdraw; reveal changes only the injected set. (No code path
writes/deletes a `BookTagAssertion` during reveal — assert the reveal route/worker never touches
the assertions header.)

**Operator trigger (AC-4) — amended 2026-06-02 (no API route).** The trigger is no longer an HTTP
route, so there are **no** reveal/withdraw API-route tests. Instead test the trigger as its two
seams: **(a)** the `enqueueReveal(bookSlug, tagSlug, state, requestedBy)` **upsert** — a fresh
(book, tag) inserts a `pending` row with `state:"revealed"` and `requested_by` = the librarian hex;
a re-trigger / a `withdrawn` flip **upserts the same row** (idempotent via
`UNIQUE(book_slug, tag_slug)`), the latest intent winning — verified against a real/fake DB; **(b)**
the CLI subcommand parsing/dispatch (reveal vs. `--withdraw` → the correct `state`, book/tag slug
threading) as a pure function. No session, no `config.librarianPubkey` equality check, no
`403 not_librarian` path — those were properties of the removed API route.

**Worker reveal-mint (AC-4/AC-6):** test the pure `buildAccusatoryRevealEvent(...)` (correct
header address, `#a` book, `#t` tag, `state`, slug-deterministic d-tag). Test `runRevealCycle` by
injecting **(a)** a fake reveal-queue reader (a claimed pending reveal), **(b)** a fake librarian
**signer** (deterministic stub, **no** real `LIBRARIAN_NSEC`), **(c)** a fake **publisher** (no
live relay): assert it builds the right event, signs it, publishes local + dcosl, marks the row
`done` with `minted_id`; a `withdrawn` intent mints a `state:"withdrawn"` event at the same
address (idempotent re-run replaces).

**Guards:** the **`LIBRARIAN_NSEC` never in `apps/api/src`** guard stays green (the reveal trigger
holds only the public key). The **ADR-0014 architecture guard**
(`apps/api/test/trust/architecture.test.ts`) stays green (this feature consumes only the neutral
`TrustProvider`; no Brainstorm/NIP-85/30382 leak).

## Implementation notes — ripple / new files

**New:**
- `packages/schemas/src/AccusatoryReveal.ts` — the reveal event type, `toAccusatoryRevealEvent` /
  `fromAccusatoryRevealEvent`, `buildAccusatoryRevealDTag(bookSlug, tagSlug)` (= `reveal--<book>--<tag>`),
  `state` ∈ `revealed | withdrawn`; export from `packages/schemas/src/index.ts` (+ a unit test).
- `packages/schemas/src/concept-headers.ts` — `BOOK_ACCUSATORY_REVEALS_HEADER_SLUG =
  "accusatory-reveals"` + `buildBookAccusatoryRevealsHeaderAddress(librarianPubkey)`.
- `apps/api/src/db/migrations.ts` — append migration `0004_reveals` (the table above);
  `apps/api/src/db/schema.ts` — the `reveals` drizzle table + `RevealRow`/`RevealStatus` types;
  `apps/api/src/db/index.ts` — back `enqueueReveal(bookSlug, tagSlug, state, requestedBy)` (upsert
  on the unique key) and (if the read uses it) any reveal-status read. (The `reveals` table /
  migration / `enqueueReveal` upsert are **unchanged by the 2026-06-02 amendment**; only the
  *caller* moves from an API route to the operator CLI.)
- `apps/promoter/src/reveal/{build,queue,cycle}.ts` — the reveal job-kind (pure builder, queue
  claim/mark, `runRevealCycle`); `apps/promoter/test/reveal/*`. **(Amended 2026-06-02)** the worker
  also carries the **operator trigger**: a `reveal` subcommand / CLI entry (e.g.
  `apps/promoter/src/reveal/cli.ts` + a `main.ts` arg dispatch) that parses `--book` / `--tag` /
  `--withdraw`, calls the `enqueueReveal` upsert, and runs the reveal cycle. This is where the
  reveal/withdraw trigger lives now — not on the API.

**Changed:**
- `apps/api/src/routes/tags.ts` — (a) inject `trust: TrustProvider` into `TagsDeps` (the
  `enqueueReveal` injection is **dropped** — the API no longer triggers reveals; per the 2026-06-02
  amendment the upsert is called from the worker CLI, not a route); (b) add the `houseWeightOf`
  helper (lift from `submissions.ts`); (c) add the **sensitivity-conditional gate** in
  `POST /api/tags` (resolve sensitivity from the taxonomy; accusatory → curator-gated both tiers,
  normal → unchanged); (d) compute `canAssertAccusatory` once and include it on the book-tags read
  response; (e) add the **third parallel reveal query** to `GET /api/books/:slug/tags`, reduce to
  the live revealed slug set, pass it to the aggregate. **(f) is REMOVED** by the 2026-06-02
  amendment: **no** `POST /api/tags/reveal` / `POST /api/tags/withdraw` route is added.
- `apps/api/src/tags/aggregate.ts` — `aggregateBookTagsWeighted` gains the optional
  `revealedTagSlugs: ReadonlySet<string> = new Set()` arg; line 172 becomes the conditional
  (unknown dropped; accusatory dropped **unless** revealed). Add the revealed marker on the
  surfaced `TagConsensus` (or a `revealedSignals` array). `aggregateBookTags` (raw) passes the
  default-empty set — unchanged.
- `apps/api/src/index.ts` — pass `trust` into `buildTagsRouter` (the DB-backed `enqueueReveal` is
  **no longer wired into the router** per the 2026-06-02 amendment; the upsert is invoked by the
  worker CLI instead — wire it into the `apps/promoter` CLI entry, not the API).
- `apps/web/src/components/TagControl.tsx` — read `canAssertAccusatory`; when true, offer the
  accusatory signal tags in a new "Signals" optgroup; render a revealed accusatory tag with the
  honest "reviewed" treatment (distinct from genre/style chips, brand tokens only, no consensus
  label, no count); copy reviewed against the no-slop rule. **(No reveal button / in-app reveal UI
  is added** — the 2026-06-02 amendment makes the trigger ops-only; the web is read/render +
  the write picker only.**)**
- `apps/web/src/lib/api.ts` — `BookTags`/read type carries `canAssertAccusatory?: boolean` and the
  revealed marker. **(Amended 2026-06-02:** the `tags.reveal(...)` / `tags.withdraw(...)` web
  callers and the librarian UI affordance are **REMOVED** — there is no reveal endpoint for the web
  to call.**)**
- `docker-compose.prod.yml` / `docker-compose.yml` — the existing `promoter` service's cron also
  runs the reveal cycle (no new service, no new `LIBRARIAN_NSEC` env beyond the promoter's). The
  `api` service gains **no** `LIBRARIAN_NSEC`. **(Amended 2026-06-02)** the same `promoter` service
  also hosts the operator reveal subcommand, run on demand via
  `docker compose -f docker-compose.prod.yml --profile promote run --rm promoter reveal --book <slug> --tag <slug> [--withdraw]`
  (mirroring the promote cron run pattern) — document the invocation in `docs/DEPLOY.md`.
- `docs/DEPLOY.md` — **(added by the 2026-06-02 amendment)** the operator runbook note for the
  reveal/withdraw CLI: the invocations above, the librarian as recorded actor (`requested_by`), the
  asynchronous worker-mint effect, withdraw as the reversal, and the idempotent (safe-to-re-run)
  property. Written at implementation time.

**Existing tests that change:** `apps/api/test/routes/tags*.test.ts` (new sensitivity-gate cases
both tiers + the normal-unaffected case + DI for `trust` **only** — the `enqueueReveal` router DI is
dropped; the reveal-query read; `canAssertAccusatory`). **(Amended 2026-06-02)** the **reveal/withdraw
API-route tests are REMOVED** (no `POST /api/tags/reveal` route, no `403 not_librarian` /
session-equality cases); the trigger is instead covered by **worker/ops tests** in `apps/promoter` —
the `enqueueReveal` upsert (idempotent on the unique key), the CLI arg dispatch (reveal vs.
`--withdraw`), and the existing `runRevealCycle` mint with a fake signer + fake publisher.
`apps/api/test/tags/aggregate*.test.ts` (the revealed-set conditional, default-empty unchanged,
latest-per-d-tag reveal reduction) is **unchanged**; `apps/web` `TagControl` tests (offered-accusatory
+ revealed-render, sourced from the real read shape) are **unchanged**, with **no reveal-UI test**
(there is no reveal UI); the `LIBRARIAN_NSEC`-not-in-API guard and the ADR-0014 guard **stay green**
(assert, don't change); new `packages/schemas` + `apps/promoter` reveal tests (now including the CLI
+ upsert seams).

## Out of scope

ANY automatic/emergent trust-consensus reveal (Phase 3); automated AI-detection; accusatory tags
on anything but books; the general curator-role system (this reuses the Story-30 emergent house-PoV
gate as-is); the house-observer swap; a `normal`-signal write picker or any change to genre/style
writing; new lint/typecheck/build tooling. Worker retry/backoff tuning follows the promoter's
existing posture (deferred to implementation).
