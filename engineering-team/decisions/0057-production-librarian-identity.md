# ADR 0057: Production librarian identity (adopt + secure) and the house-observer swap enablers

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/58-production-librarian-identity.md`

**Accepted 2026-06-05.** Stand up the engineering mechanisms that let the operator publish Unbnd's own librarian identity (kind-0 profile + kind-3 seed-follow list), register it for GrapeRank, manage its secret safely, and swap the house observer onto it. The librarian publishers ship as **one new profile-gated worker, `apps/librarian`**, with two subcommands — `profile` (publish kind-0) and `follows` (publish kind-3 + trigger GrapeRank) — mirroring the seeder/promoter pattern so `LIBRARIAN_NSEC` stays off the API (the ADR-0031 guard stays green). The decided values below let the Tester write the red set against pure builders + a mocked provider, and let the Implementer build with no further design calls. No change to the trust-weighting machinery (§2.5), no web/UI/API behavioral change, no catalog re-signing, no new DList shape.

## Context

This is the keystone for Lane 2 (PRD §2.0, §2.1). Every trust-consuming feature reads GrapeRank from the **house point of view**, and the hard ordering rule is that **the house-observer swap precedes every trust-consuming feature** (PRD §2.0). The active house observer today is the interim nosfabrica pubkey (`HOUSE_OBSERVER_PUBKEY` default `be7bf5de…09420d0a`, set in `apps/api/src/config.ts` `DEFAULT_HOUSE_OBSERVER`), a large borrowed Web of Trust used so the trust display could be built against real scores. The remaining work is to stand up Unbnd's **own** librarian identity and move the house trust graph onto it.

**Decision of record (PRD §2.1):** the existing staging librarian key is unmanaged, not compromised, so we **adopt it as the production identity**. No new key, no catalog re-sign — a new pubkey would change every `kind:pubkey:dtag` address and orphan every `#a`/z-tag cross-reference. This ADR therefore never generates a key; it builds the publishers + runbooks around the adopted key.

**The activation reality (by design, PRD §2.5):** swapping from nosfabrica (a large borrowed WoT) to the librarian (following a small seed set) makes the trusted-consensus view start sparse, so most book-detail signals fall to the **raw fallback labeled "community consensus"** until the seed graph and real ratings grow. This is the §2.5 raw-fallback-labeled decision of record, not a regression. The honest starting state is a thin graph from Unbnd's own curators.

### Quoted acceptance criteria (from the story)

- kind-3 builder: **exactly one `p` tag per configured seed curator**, deterministic, no I/O; **merge-preserving** on re-run (mirror `follow-template.ts`); published to the **trust relays + general relays, not dcosl** (dcosl rejects kind-3); relay routing asserted in tests.
- GrapeRank trigger: `/authChallenge`→sign kind-27235→`/verify`→`/user/graperank`, **signed by the librarian**, reusing `@unbnd/trust` `BrainstormProvider`, mocked in CI; signing via the existing `finalizeEvent` path (no hand-rolled crypto).
- kind-0 builder: valid kind-0 profile from config, deterministic; published to **dcosl + profile relays**; worker verifies it lands.
- Worker placement + hygiene: **profile-gated workers** that read `LIBRARIAN_NSEC` and do not run with the normal stack; the ADR-0031 guard (`apps/api/test/security/no-librarian-nsec-in-api.test.ts`) stays green (string `LIBRARIAN_NSEC` appears nowhere under `apps/api/src`).
- Runbooks: secret-management (encrypted-at-rest + backup/rotation + offline copy) and house-observer-swap + verify (with the **publish-kind-3 + register-GrapeRank-before-swap** sequencing) via `ops/trust-seed-harness.md`.
- Swap is **config-only** (set `HOUSE_OBSERVER_PUBKEY`, no code change), verified via the seed harness producing a reproducible weighted-vs-raw divergence from the librarian PoV.
- No-slop: unit tests for the two pure builders + the GrapeRank trigger (mocked); `pnpm -r typecheck` / `pnpm -r test` green; no change to the trust machinery or the web app; runbook copy honors the quality bar.

### Code this ADR reuses / integrates against (verified against source)

- **Worker pattern.** `apps/seeder/src/index.ts` (env loader, `connectResilientRelay`, decodes `LIBRARIAN_NSEC` → `finalizeEvent` sign path) and `apps/promoter/src/main.ts` (arg-dispatch subcommands: `promoter reveal …` vs the bare promote run — the model for our `profile`/`follows` subcommands). Compose: `seeder` (`profiles:["seed"]`), `promoter` (`profiles:["promote"]`), `shelves` (`profiles:["shelves"]`) in `docker-compose.prod.yml`.
- **Relay publish.** `apps/seeder/src/publish.ts` (hardened `connectRelay`, ADR 0056 §1) + `apps/seeder/src/resilient-relay.ts` (ADR 0056 §2) and the **duplicate** `apps/promoter/src/relay.ts` (basic `connectRelay` + `query`). The shared `@unbnd/relay` extraction is a logged ADR-0056 follow-up — see §6 below.
- **kind-3 merge.** `apps/api/src/profile/follow-template.ts` — `mergeFollow(rawTags, targetHex, action)` (clones, adds one `p` tag only if absent, preserves every other tag verbatim) and `buildKind3Template(tags, content, createdAt)` (kind-3, content preserved verbatim, not `toWireTemplate`). We mirror these worker-side for a **multi-target** seed merge.
- **kind-0 build.** `apps/api/src/profile/kind0.ts` — `buildProfileKind0Content(rawPrev, patch, nameFloor)` (whitelisted merge-preserve) + `buildKind0Template(content, createdAt)` (kind-0, empty tags). We mirror a worker-side librarian-flavored builder.
- **GrapeRank trigger.** `packages/trust/src/brainstorm.ts` — `BrainstormProvider.authChallenge(observerHex)` returns an unsigned kind-27235 template (with the `["t","brainstorm_login"]` tag the `/verify` endpoint expects), `personalize(observerHex, signedChallenge)` does `/authChallenge/{obs}/verify` (POST `{signed_event}`) → bearer token → `/user/graperank`. `packages/trust/src/index.ts` — `resolveTrustProvider({provider:"brainstorm", apiUrl, relays})`. This is the exact flow the worker drives for the librarian observer.
- **Config.** `apps/api/src/config.ts` — `HOUSE_OBSERVER_PUBKEY` (default nosfabrica), `TRUST_RELAYS` (default `wss://nip85.nosfabrica.com`, `wss://nip85.brainstorm.world`), `BRAINSTORM_API_URL` (default `https://brainstormserver.nosfabrica.com`), `TRUST_PROVIDER` (default `brainstorm`), `DCOSL_RELAY_URL`, `PROFILE_RELAYS` (default damus/primal/nos.lol/nostr.band + dcosl). The librarian signing path everywhere is `decode(nsec)` → `getPublicKey(sk)` → `finalizeEvent(template, sk)` (`nostr-tools/pure`).
- **Guard.** `apps/api/test/security/no-librarian-nsec-in-api.test.ts` scans `apps/api/src` for the literal `LIBRARIAN_NSEC`. The new worker lives under `apps/librarian/src`, **outside** that scan, so it does not trip the guard.

### DList shapes touched

- **kind:0** — librarian profile metadata (NEW worker publisher; from config; → dcosl + profile relays).
- **kind:3** — librarian contact list / seed-follow graph (NEW worker publisher; one `p` tag per configured seed curator, merge-preserving; → trust/nip85 relays + general relays, **not** dcosl).
- **kind:27235** — NIP-98 GrapeRank auth challenge, signed transiently by the librarian for `/verify` (not persisted to relays).
- **kind:30382** — Brainstorm trust attestation, **read** during scoring (unchanged; no write).
- **kind:39999** — librarian-signed BookRecords already on dcosl: **not re-signed, not touched** (the adopt decision keeps every address canonical).

No new DList shape or tag is introduced.

## Options considered

### Worker placement

#### Option A — one new `apps/librarian` worker with two subcommands (chosen)
A new profile-gated worker mirroring `apps/seeder`/`apps/promoter`. Entrypoint `apps/librarian/src/main.ts` arg-dispatches `librarian profile` (publish kind-0) and `librarian follows` (publish kind-3 + trigger GrapeRank), exactly as `apps/promoter/src/main.ts` dispatches `reveal` vs the bare promote run. One compose service `librarian` with `profiles:["librarian"]`, run via `docker compose --profile librarian run --rm librarian profile|follows`.

- **Pros:** mirrors the established off-API worker pattern; the two modes share env loading, the nsec decode, and the relay helper; one package, one image, one compose service; `LIBRARIAN_NSEC` is naturally outside `apps/api/src`. The two operations are tightly coupled (same identity, same secret, same runbook) and run back-to-back during the standup, so co-locating them is the lowest-surface honest factoring.
- **Cons:** two distinct operations in one binary (mitigated by clean subcommand dispatch + separate testable cycle modules, just like the promoter's `promote`/`reveal`/cycle split).

#### Option B — two separate workers (`apps/librarian-profile`, `apps/librarian-follows`)
- **Pros:** one operation per binary.
- **Cons:** duplicates the env loader, nsec decode, relay helper, package.json/tsconfig/esbuild, Dockerfile, and compose service across two trees for two ops the same operator runs minutes apart. More surface, more secret-holding images, no real isolation benefit (both hold the nsec anyway). Rejected.

#### Option C — extend the seeder or promoter
- **Pros:** no new package.
- **Cons:** the seeder is a long-running catalog loop and the promoter is a DB-queue worker; bolting identity publishing onto either muddies a focused worker and its tests. The promoter already carries `reveal`; adding profile/follows would overload it. Rejected for cohesion.

### The relay-client decision (third consumer)

#### Option A — extract `@unbnd/relay` now
Move the Story-57 hardened `connectRelay` + `connectResilientRelay` into a shared `packages/relay` package; migrate the seeder and the new librarian worker (and optionally the promoter) onto it.
- **Pros:** kills the duplication the seeder and promoter already carry; the librarian becomes the third consumer of one audited transport.
- **Cons:** widens this story well beyond identity standup — it touches the seeder (a verified hot path), the promoter, and adds a new package with its own ADR-worthy boundary. Risk/scope creep on the keystone story.

#### Option B — keep it minimal; defer the extraction (chosen)
The librarian worker publishes only ~2–3 short-lived events (one kind-0, one kind-3, plus a transient kind-27235 sign that never hits a relay). Use a small **worker-local** relay helper modeled on the promoter's basic `connectRelay` (`apps/promoter/src/relay.ts`) — enough to open a socket, `EVENT`→`OK`, and a one-shot `REQ` read for the fetch-existing-kind-3 step. Leave the `@unbnd/relay` extraction as its own clean follow-up (already logged on ADR 0056).
- **Pros:** keeps the keystone story focused; the librarian's publishes are short like the promoter's, so the auto-reconnect/bounded-retry resilience the seeder needs (a long loop over thousands of events) is low-value here. A failed standup publish is simply re-run by the operator — the operation is idempotent (merge-preserving kind-3, replaceable kind-0).
- **Cons:** adds a third copy of the basic relay helper, deepening the duplication the extraction will later retire. Accepted as a deliberate, logged trade.

## Decision

We chose **Option A (one `apps/librarian` worker, two subcommands)** for placement.

**Relay client — RESOLVED at the gate (2026-06-05): Option A, extract first.** Rather than a worker-local helper, the shared **`@unbnd/relay`** package is extracted first as its own story (**Story 59 / ADR 0058**), and the librarian worker imports it. `@unbnd/relay` is the UNION client: the Story-57 hardened `connectRelay` + `connectResilientRelay` (publish, reconnect/backoff) PLUS the one-shot `REQ` read the promoter's `relay.ts` already carries (which the librarian's fetch-existing-kind-3 merge step needs). The seeder and promoter migrate onto it in Story 59; this librarian worker is then a clean third consumer. Consequently: the `RELAY_PUBLISH_TIMEOUT_MS` "worker-local helper" framing below is dropped — the worker uses `@unbnd/relay`'s publish/timeout — and Story 58 depends on Story 59 landing first. The duplication-deepening trade of the rejected worker-local option no longer applies.

### 1. Worker placement, package layout, compose

**Package:** new `apps/librarian`, mirroring `apps/seeder` exactly:
- `package.json` name `@unbnd/librarian`, `"type":"module"`, scripts `dev`/`build`/`bundle`/`start`/`typecheck`/`test`, deps `@unbnd/schemas` + `@unbnd/trust` (workspace) + `nostr-tools` (pinned `2.10.4`) + `ws`; devDeps mirror the seeder (`esbuild` `0.24.2`, `tsx`, `typescript`, `vitest`, `@types/node`, `@types/ws`). `@unbnd/trust` is the one added workspace dep vs the seeder — justified because the GrapeRank trigger MUST reuse `BrainstormProvider` (no Brainstorm specifics may leak into the worker; the architecture-guard intent).
- `tsconfig.json`, `esbuild.config.mjs`, `Dockerfile`, `vitest.config.ts` copied from `apps/seeder` (entrypoint `src/main.ts` instead of `src/index.ts`).

**Entrypoint shape** (`apps/librarian/src/main.ts`), mirroring `apps/promoter/src/main.ts` arg dispatch:
```
const [, , subcommand] = process.argv;
if (subcommand === "profile") { await runProfile(); return; }
if (subcommand === "follows") { await runFollows(); return; }
throw new Error("usage: librarian <profile|follows>");
```
Each mode is a thin wiring function that loads env, decodes `LIBRARIAN_NSEC` (`decode` → `getPublicKey` → `librarianHex`), opens the relays it needs, and calls a separate, importable **cycle** module (`src/profile-cycle.ts`, `src/follows-cycle.ts`) so tests import the cycle with injected deps without executing `main()` — the promoter's `runPromotionCycle`/`runRevealCycle` split.

**Compose service** in `docker-compose.prod.yml`:
```
librarian:
  image: ghcr.io/aburra16/unbnd-librarian:${UNBND_IMAGE_TAG:-latest}
  profiles: ["librarian"]
  environment:
    - LIBRARIAN_NSEC=${LIBRARIAN_NSEC}
    - DCOSL_RELAY_URL=${DCOSL_RELAY_URL:-wss://dcosl.brainstorm.world/}
    - TRUST_RELAYS=${TRUST_RELAYS:-}
    - PROFILE_RELAYS=${PROFILE_RELAYS:-}
    - LIBRARIAN_GENERAL_RELAYS=${LIBRARIAN_GENERAL_RELAYS:-}
    - SEED_CURATORS=${SEED_CURATORS:-}
    - LIBRARIAN_NAME=${LIBRARIAN_NAME:-}
    - LIBRARIAN_ABOUT=${LIBRARIAN_ABOUT:-}
    - LIBRARIAN_PICTURE_URL=${LIBRARIAN_PICTURE_URL:-}
    - LIBRARIAN_NIP05=${LIBRARIAN_NIP05:-}
    - TRUST_PROVIDER=${TRUST_PROVIDER:-brainstorm}
    - BRAINSTORM_API_URL=${BRAINSTORM_API_URL:-https://brainstormserver.nosfabrica.com}
    - RELAY_PUBLISH_TIMEOUT_MS=${RELAY_PUBLISH_TIMEOUT_MS:-10000}
  restart: "no"
```
Run: `docker compose -f docker-compose.prod.yml --profile librarian run --rm librarian profile` then `… run --rm librarian follows`. Like the seeder/promoter it never starts with the normal stack (`profiles:` gate + `restart:"no"`). It is the **third** service to hold `LIBRARIAN_NSEC` (after seeder/promoter), all off the internet-facing path.

### 2. Config keys (exact keys, formats, defaults)

Reuse existing keys where they already carry the right meaning; add the minimum new ones. **No real values appear in the repo** — `SEED_CURATORS` and the profile fields are operator-supplied out of band (the two-document firewall); `.env.production.example` ships these keys with empty or placeholder values and a comment that membership/content is set out of band.

| Key | Format | Default | Used by | Notes |
|---|---|---|---|---|
| `LIBRARIAN_NSEC` | `nsec1…` bech32 | required | both modes | **Reused.** Decoded → `librarianHex` + signing key. Never logged. |
| `SEED_CURATORS` | CSV of 64-lowercase-hex pubkeys | required for `follows` | follows | **NEW.** One `p` tag per entry. Operator-supplied; the ADR never names a curator. Validated: each must match `^[0-9a-f]{64}$`, empty → hard error in `follows`. |
| `LIBRARIAN_NAME` | string | required for `profile` | profile | **NEW.** kind-0 `name` + `display_name`. |
| `LIBRARIAN_ABOUT` | string | optional | profile | **NEW.** kind-0 `about` (role description). |
| `LIBRARIAN_PICTURE_URL` | `https://…` URL | optional | profile | **NEW.** kind-0 `picture` (logo/avatar). Validated as `https?://` when set. |
| `LIBRARIAN_NIP05` | `name@domain` | optional | profile | **NEW.** kind-0 `nip05` (the apex NIP-05 the compose `APEX_ADDRESS` serves). Optional. |
| `TRUST_RELAYS` | CSV of `wss://…` | `wss://nip85.nosfabrica.com,wss://nip85.brainstorm.world` | follows | **Reused.** kind-3 publish target (the nip85 set the GrapeRank crawler reads — see §4). |
| `LIBRARIAN_GENERAL_RELAYS` | CSV of `wss://…` | `wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol,wss://relay.nostr.band` | follows | **NEW.** Additional broad relays the kind-3 lands on for general discoverability. Same default list as `PROFILE_RELAYS` minus dcosl (dcosl rejects kind-3). |
| `DCOSL_RELAY_URL` | `wss://…` | `wss://dcosl.brainstorm.world/` | profile | **Reused.** kind-0 publish target. |
| `PROFILE_RELAYS` | CSV of `wss://…` | damus/primal/nos.lol/nostr.band | profile | **Reused.** kind-0 publish target (unioned with dcosl). |
| `TRUST_PROVIDER` | `brainstorm`\|`fixture` | `brainstorm` | follows | **Reused.** `fixture` short-circuits the GrapeRank trigger to a logged no-op (no real Brainstorm). |
| `BRAINSTORM_API_URL` | URL | `https://brainstormserver.nosfabrica.com` | follows | **Reused.** Passed to `resolveTrustProvider`. |
| `RELAY_PUBLISH_TIMEOUT_MS` | int ms | `10000` | both | **NEW (small).** Per-publish OK timeout for the worker-local helper. |

**Relay routing (decided):**
- **kind-3** → `TRUST_RELAYS` (nip85) **+** `LIBRARIAN_GENERAL_RELAYS`, and **never** dcosl. dcosl is a DList/concept relay that rejects kind-3 (confirmed by the story + the seeder/promoter only ever publishing kind-39998/39999 there); the test asserts dcosl is absent from the kind-3 target set.
- **kind-0** → `DCOSL_RELAY_URL` **+** `PROFILE_RELAYS`.
- **GrapeRank crawler reachability:** Brainstorm's crawler reads the librarian's follows from the **nip85 relay set** (`TRUST_RELAYS`) — the same relays `BrainstormProvider` reads kind-30382 from, and the relays the `/setup` hint points at. Publishing kind-3 to `TRUST_RELAYS` is therefore the load-bearing routing requirement; the general relays are for broad client discoverability, not the crawler.

### 3. The two pure builders (signatures + location)

Both live in `apps/librarian/src/` as pure, no-I/O functions, unit-tested in isolation with fixtures. Signing is via the existing `finalizeEvent(template, sk)` path in the wiring layer — never inside the pure builder.

**kind-3 seed-follow builder** — `apps/librarian/src/follows-template.ts`:
```ts
// Merge a set of seed-curator pubkeys into the librarian's existing kind-3,
// preserving every other tag (mirrors apps/api/src/profile/follow-template.ts
// mergeFollow, generalized to many targets in one pass). Idempotent.
export function mergeSeedFollows(
  rawTags: string[][] | null,   // the librarian's existing kind-3 tags, or null
  seedCuratorHexes: readonly string[],
): string[][];

// Build the unsigned kind-3 template from merged tags. content preserved
// verbatim from the fetched event ("" when none) — kind-3 content may be a
// legacy relay-list JSON that must never be clobbered. Not toWireTemplate.
export function buildLibrarianKind3Template(
  tags: string[][],
  content: string,
  createdAt: number,
): NostrEventTemplate;
```
Semantics, cribbed verbatim from `mergeFollow`: deep-enough clone of `rawTags ?? []`; for each seed hex append `["p", hex]` **only if** no existing `p` tag has `tag[1] === hex` (idempotent union, never a duplicate, never flattens an existing `p` tag's relay-hint/petname payload or position); every non-`p` tag and every other `p` tag preserved verbatim and in order. Given `null` and N seeds, the result is N `["p", hex]` tags in input order. **Re-run merge-preserving:** the `follows` mode first does a one-shot `REQ` read of the librarian's existing kind-3 (kind 3, `authors:[librarianHex]`, `limit:1`) from `TRUST_RELAYS`; the newest is fed as `rawTags`/`content`, so a re-run drops no previously-followed pubkey and re-adds nothing already present.

**kind-0 profile builder** — `apps/librarian/src/profile-content.ts`:
```ts
// Build the librarian kind-0 content JSON from config. Only the known profile
// fields are emitted; empty/undefined optionals are omitted (no empty strings
// on the wire). Pure.
export function buildLibrarianProfileContent(fields: {
  name: string;          // LIBRARIAN_NAME -> name + display_name
  about?: string;        // LIBRARIAN_ABOUT
  picture?: string;      // LIBRARIAN_PICTURE_URL
  nip05?: string;        // LIBRARIAN_NIP05
}): Record<string, unknown>;

// Reuse the API's buildKind0Template shape (kind 0, empty tags, JSON content).
// Re-declared worker-side (do NOT import from apps/api — keeps the worker off
// any API coupling, same as the seeder mirrors rather than imports).
export function buildLibrarianKind0Template(
  content: Record<string, unknown>,
  createdAt: number,
): NostrEventTemplate;
```
`buildLibrarianProfileContent` sets both `name` and `display_name` to `LIBRARIAN_NAME` (the same name-floor invariant as `buildProfileKind0Content`), and emits `about`/`picture`/`nip05` only when non-empty. Output JSON is deterministic for a given config — the test pins the exact stringified content.

**Signing:** in both cycles, `finalizeEvent(template, sk)` (`nostr-tools/pure`) — the identical path the seeder and promoter use. No bespoke crypto (CLAUDE.md crypto policy).

### 4. GrapeRank trigger sequence (the `follows` mode)

The `follows` cycle, after the kind-3 publish, triggers GrapeRank for the librarian **by reusing the `@unbnd/trust` adapter** so no Brainstorm specifics leak into the worker (the architecture-guard intent — the worker only ever touches the neutral `TrustProvider` surface):

1. Resolve the provider: `const trust = resolveTrustProvider({ provider: "brainstorm", apiUrl: BRAINSTORM_API_URL, relays: TRUST_RELAYS })`. (When `TRUST_PROVIDER=fixture`, skip the trigger with a clear log — no live network in dev/CI.)
2. `const template = await trust.authChallenge(librarianHex)` → unsigned kind-27235 (Brainstorm-flavored, carries `["t","brainstorm_login"]`). `null` ⇒ fail-open log + return.
3. `const signed = finalizeEvent(template, sk)` — sign the challenge **with `LIBRARIAN_NSEC`** (the librarian is the observer).
4. `const ok = await trust.personalize(librarianHex, signed)` — drives `/authChallenge/{librarianHex}/verify` (POST `{signed_event}`) → bearer token → `/user/graperank`. Returns true when the run was queued.

**Ordering (decided):** publish the kind-3 to the trust relays **first** (so the crawler can see the librarian's follows), **then** trigger GrapeRank. The `follows` cycle is: read-existing-kind-3 → merge → publish kind-3 (to `TRUST_RELAYS` + general) → **only on a confirmed kind-3 publish** → trigger GrapeRank.

**Error handling (decided):** the kind-3 publish is the **durable** part — if it fails to the trust relays, the cycle errors non-zero so the operator re-runs (idempotent merge makes the re-run safe). The GrapeRank trigger is **best-effort / fail-open**: a `null` challenge, a thrown fetch, or `personalize` returning false is logged clearly (`[librarian] GrapeRank trigger did not queue; re-run 'librarian follows' or wait for the next crawl`) and the cycle still exits 0, because the durable follows are published and Brainstorm's crawler will pick them up on its own schedule; the trigger only nudges it sooner. The trigger is independently retryable by re-running `librarian follows` (the kind-3 re-publish is a no-op merge).

**Adapter reuse confirmation:** the worker imports only `resolveTrustProvider` + `finalizeEvent`. It constructs no Brainstorm URL, no kind-27235 shape, no `/verify` body — all of that stays inside `BrainstormProvider`. This honors the same guard intent as the API: backend specifics live in exactly one adapter.

### 5. `HOUSE_OBSERVER_PUBKEY` default + swap sequencing (decided)

**Repo/compose default stays nosfabrica (interim).** This story does **not** flip `DEFAULT_HOUSE_OBSERVER` in `apps/api/src/config.ts` and does **not** hardcode the librarian pubkey anywhere (CLAUDE.md "never hardcode the librarian pubkey"). The operator overrides `HOUSE_OBSERVER_PUBKEY` → the librarian hex via `.env` **only after** kind-0 + kind-3 are published, GrapeRank is registered, and scores are verified — so the swap never prematurely empties the weighted view. The swap is **config-only** (no code change): `apps/api` and `apps/shelves` already read `HOUSE_OBSERVER_PUBKEY`.

**Swap + verify runbook sequence** (lives in `docs/DEPLOY.md`, cross-linked from `ops/trust-seed-harness.md`):
1. Publish kind-0: `… --profile librarian run --rm librarian profile`; confirm resolvable (worker logs `{ok:true}`; spot-check a nostr client / the profile relays).
2. Publish kind-3 + trigger GrapeRank: `… --profile librarian run --rm librarian follows`; confirm the kind-3 landed on `TRUST_RELAYS` and the trigger queued (or note it will be crawled).
3. Wait for scores: poll until the librarian has kind-30382 scores from its own vantage (Brainstorm crawl latency — minutes, sometimes longer). Verify with the harness's `hasScores`-style check / a `/setup/{librarianHex}` probe.
4. Verify weighted-vs-raw from the librarian PoV using `ops/trust-seed-harness.md` (the seed-harness divergence check, now with `HOUSE_OBSERVER_PUBKEY` pointed at the librarian in a staged check).
5. Set `HOUSE_OBSERVER_PUBKEY=<librarian hex>` in `/opt/unbnd/.env`.
6. Restart the readers: `docker compose -f docker-compose.prod.yml up -d api` and re-run the `shelves` worker (`… --profile shelves run --rm shelves`) so the homepage cache recomputes from the new vantage.
7. Re-verify: the weighted view now reflects the librarian's seed graph; most signals correctly show labeled "community consensus" until the graph grows (PRD §2.5, by design).

This is the §2.0 hard ordering rule made operational: kind-3 + GrapeRank registration strictly precede the swap.

### 6. The relay-client decision — surfaced for the gate

The new worker is the **third** consumer of relay-publish code (seeder, promoter, librarian). Decided **Option B** (minimal worker-local helper now; defer `@unbnd/relay`). The librarian's publishes are few and short-lived like the promoter's, so the seeder's auto-reconnect/bounded-retry resilience is low-value here; a failed standup publish is simply re-run (idempotent). **Option A** (extract `@unbnd/relay` now, migrate seeder + librarian + promoter) is the cleaner long-term move but widens the keystone story across a verified hot path. **Recommendation: B**, but this is the one open call for the user at the gate — if the orchestrator/user prefers to retire the duplication now, A is legitimate and the extraction becomes its own ADR.

## Consequences

- **Enables:** the operator can publish the librarian's kind-0 + kind-3, register GrapeRank, and perform the config-only house-observer swap — unblocking §2.5's last unmet criterion ("Active house observer is the production librarian pubkey") and, transitively, every Lane-2 trust-consuming feature.
- **Constrains:** the librarian publishers must stay off the API forever (the ADR-0031 guard). All identity ops are operator-run, profile-gated, manual — no automation in this story.
- **New debt / follow-ups:** a third copy of the basic relay helper (the `@unbnd/relay` extraction, already logged on ADR 0056, now has three consumers — its own future ADR). The worker re-declares `buildKind3Template`/`buildKind0Template` shapes rather than importing from `apps/api` (deliberate, to keep the worker off API coupling, same as the seeder mirrors `follow-template`).
- **Affects existing fixtures?** No. No web fixtures change; the trust machinery, the fixture provider, and the web app are untouched.
- **New dependency?** No new npm dependency. One new **workspace** dep (`@unbnd/trust`) for the librarian worker, justified by the mandatory `BrainstormProvider` reuse (no Brainstorm specifics in the worker). Versions mirror the seeder (`nostr-tools` pinned `2.10.4`, no `^`).
- **PRD section change required?** No. This implements §2.1 as written and unblocks §2.5; no PRD claim is invalidated. The §2.1 "set librarian pubkey as `HOUSE_OBSERVER_PUBKEY`" is realized as an operator `.env` override (the repo default stays nosfabrica), consistent with §2.5 / §2.2.4 gating the *active* swap behind verification.

## Implementation notes

- **New package `apps/librarian`** — mirror `apps/seeder` (`package.json` `@unbnd/librarian`, `tsconfig.json`, `esbuild.config.mjs` with entry `src/main.ts`, `Dockerfile`, `vitest.config.ts`). Add `@unbnd/trust` to deps.
- **`apps/librarian/src/main.ts`** — arg-dispatch `profile`/`follows` (mirror `apps/promoter/src/main.ts`); thin wiring only.
- **`apps/librarian/src/env.ts`** — `env(name, fallback?)` loader (copy the seeder's), plus hex/URL validators for `SEED_CURATORS` (CSV → `string[]`, each `^[0-9a-f]{64}$`) and `LIBRARIAN_PICTURE_URL`.
- **`apps/librarian/src/follows-template.ts`** — pure `mergeSeedFollows(rawTags, seedHexes)` + `buildLibrarianKind3Template(tags, content, createdAt)` (semantics cribbed from `apps/api/src/profile/follow-template.ts`).
- **`apps/librarian/src/profile-content.ts`** — pure `buildLibrarianProfileContent(fields)` + `buildLibrarianKind0Template(content, createdAt)` (semantics cribbed from `apps/api/src/profile/kind0.ts`).
- **`apps/librarian/src/relay.ts`** — worker-local relay helper modeled on `apps/promoter/src/relay.ts` (open WS, `EVENT`→`OK` publish with `RELAY_PUBLISH_TIMEOUT_MS`, one-shot `REQ`→`EOSE` read for the existing-kind-3 fetch, `close()`). Injectable WebSocket factory for tests (mirror `apps/seeder/src/publish.ts` `createWebSocket` seam).
- **`apps/librarian/src/profile-cycle.ts`** — `runProfileCycle(deps)`: build content → template → `sign` → publish to dcosl + profile relays → verify resolvable (re-`REQ` the kind-0). Deps (`sign`, `publish`, `query`, `now`) injected; importable without running `main()`.
- **`apps/librarian/src/follows-cycle.ts`** — `runFollowsCycle(deps)`: read existing kind-3 (`REQ` kind 3 `authors:[librarianHex] limit:1`) → `mergeSeedFollows` → build → `sign` → publish to `TRUST_RELAYS` + general (assert dcosl absent) → on confirmed publish, GrapeRank trigger (`trust.authChallenge` → `sign` → `trust.personalize`), fail-open. Deps include the injected `TrustProvider` so the test passes a mock (no live Brainstorm).
- **`docker-compose.prod.yml`** — add the `librarian` service (§1) with `profiles:["librarian"]`, `restart:"no"`.
- **`.env.production.example`** — add `SEED_CURATORS`, `LIBRARIAN_NAME`, `LIBRARIAN_ABOUT`, `LIBRARIAN_PICTURE_URL`, `LIBRARIAN_NIP05`, `LIBRARIAN_GENERAL_RELAYS`, `RELAY_PUBLISH_TIMEOUT_MS` with empty/placeholder values and a comment that `SEED_CURATORS` + the profile content are operator-supplied **out of band** (no real values, ever).
- **`docs/DEPLOY.md`** — add the secret-management runbook and the house-observer-swap + verify runbook (§5); cross-link `ops/trust-seed-harness.md`.
- **CI image:** add an `unbnd-librarian` image build (mirror the seeder/promoter GHCR build) so compose can pull it. (Build wiring follows the existing worker pattern; no new tooling.)
- **Guard:** the new code is under `apps/librarian/src`, outside the `apps/api/src` walk in `no-librarian-nsec-in-api.test.ts` — confirm the guard stays green (it does not need editing).

### Testability (for the Tester)

- **kind-3 builder** (`follows-template.ts`): fixture seed sets — empty existing kind-3 ⇒ exactly N `p` tags in order; existing kind-3 with prior follows + relay hints ⇒ union preserves prior tags verbatim and adds only missing seeds; re-run with the merged result as input ⇒ no-op (idempotent); a seed already followed ⇒ no duplicate, payload intact; non-`p` tags preserved. Pure, no I/O.
- **kind-0 builder** (`profile-content.ts`): pinned config ⇒ exact content JSON; optionals omitted when empty; `name` == `display_name`. Pure.
- **GrapeRank trigger** (`follows-cycle.ts`): a **mocked `TrustProvider`** (the worker takes it as an injected dep) asserts the order `authChallenge` → sign → `personalize`, that the signed event is the librarian-signed challenge, and the fail-open paths (`null` challenge, throw, `false`) log + exit 0; the publish-before-trigger ordering is asserted by sequencing the mock calls. No real network, no real nsec (tests use a throwaway test key, not `LIBRARIAN_NSEC`).
- **Relay routing**: the cycle is handed an injected `publish` recording the target relay set; assert kind-3 targets = `TRUST_RELAYS ∪ general` and dcosl ∉ targets; kind-0 targets = dcosl ∪ `PROFILE_RELAYS`.
- **Worker entrypoint** stays thin (arg dispatch only); the cycles carry the logic and are imported directly.

### Runbooks (design level)

- **Secret-management runbook** (`docs/DEPLOY.md`): encrypt `LIBRARIAN_NSEC` at rest on the droplet using **`age`** (a single audited, dependency-light tool — `age -p`/recipient-key encrypt the value or the `.env` slice to `/opt/unbnd/secrets/librarian.nsec.age`, decrypt into the env only at `run --rm` time). Document: generation of the age recipient/identity, where the identity lives (root-only, `chmod 600`), the **backup/rotation** procedure (rotation = adopt is the decision of record, so rotation here means re-encrypting the same nsec under a new age identity, not minting a new key), and the **confirmed offline redundant copy held out of band** by the operator (paper/hardware, never in the repo). KMS/Vault explicitly deferred (PRD §2.1). The operator executes; engineering ships the runbook + the trivial `age` mechanics.
- **Swap + verify runbook** (`docs/DEPLOY.md`, cross-linked from `ops/trust-seed-harness.md`): the §5 seven-step sequence.

### Firewall (neutral phrasing only)

`SEED_CURATORS` membership and the librarian profile content are **operator-supplied out of band** — a business/community decision. This ADR, the repo, `.env.production.example`, and every test fixture contain **no real curator pubkey and no curator name**. Tests use synthetic hex pubkeys. This is stated explicitly so the Implementer and Tester never embed a real list.

### Risk section

- **Sparse-new-observer reality (by design).** Post-swap the librarian follows a small seed set, so the trusted-consensus view is thin and most signals show the **raw fallback labeled "community consensus"** (PRD §2.5). This is the honest starting state, not a defect; the swap runbook's step 7 calls it out so the operator expects it.
- **External Brainstorm dependency.** GrapeRank registration depends on Brainstorm's crawler reading the librarian's kind-3 from the nip85 relays and computing scores — which can take **minutes or longer**, and requires the follows to be crawlable (hence kind-3 → `TRUST_RELAYS` first, then trigger). The trigger is best-effort; the durable follows are what matter. The swap waits on real scores (runbook step 3) before flipping, so the swap never lands on an empty graph.
- **nsec in a new worker surface.** `LIBRARIAN_NSEC` now lives in a third worker. Mitigated identically to seeder/promoter: profile-gated (`profiles:["librarian"]`), `restart:"no"`, off the internet-facing API, never logged, decoded only at run time, and encrypted at rest per the secret runbook. The ADR-0031 guard keeps it off `apps/api/src`.

## Out of scope

- **Choosing seed curators**, **executing the live swap**, and **holding the offline secret copy** — operator actions; this ADR ships the mechanisms + runbooks.
- **Generating a new key / re-signing the catalog** — rejected by the §2.1 adopt decision.
- **Changing the trust-weighting machinery (§2.5)** — `aggregateBookTagsWeighted`, the community-vs-trusted labeling, the `TrustProvider` adapter, the fixture provider are untouched.
- **The `@unbnd/relay` shared-package extraction** — recommended deferred to its own ADR (relay-client Option A); revisit at the gate.
- **Flipping the repo default `HOUSE_OBSERVER_PUBKEY`** to the librarian — not done in this story; it stays nosfabrica, operator overrides via `.env` at swap time.
- **Automatic threshold promotion** of the seed graph and **KMS/Vault** secret management — deferred (PRD §2.1).
- **Any web / UI / API behavioral change** — none; the only API-adjacent effect is reading from the new vantage once the operator flips `HOUSE_OBSERVER_PUBKEY`.
