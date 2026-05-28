# Review: Story 2 — Data-layer stack via Docker Compose

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff 5bb01fa..e63d9ac` — the full cycle 2 range (story, ADR, tests, impl, crypto refactor).

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**. All three workspace projects (`@unbnd/api`, `@unbnd/schemas`, `@unbnd/web`) clean.
- [x] `pnpm -r test` — **pass**. 143 passing, 0 failing (62 schemas + 72 api + 9 web).
- [x] `pnpm --filter @unbnd/web build` — **pass**. 215.10 kB JS (67.23 kB gzip), 34.98 kB CSS, 1.46 kB HTML, 129 modules in 359 ms.
- [x] `bash -n scripts/build-tapestry-image.sh` — syntax OK.
- [x] `node --check scripts/generate-keypair.js` — syntax OK.
- [x] `docker compose config` — compose file parses; only warnings are for unset env vars (expected in this review env).
- [x] **Crypto round-trip sanity check** — generated keypair via the new audited stack, encoded as nsec/npub, decoded back through `nostr-tools/nip19.decode`, hex matched in both directions. The cryptographic chain is sound.
- [ ] **Manual integration steps** (test plan §"Manual verification") — **not run by this Reviewer**. Steps 1-5 require a Docker daemon and the 10-20 minute Tapestry image build. The test plan correctly delegates these to the Reviewer; in this case the Reviewer cannot execute them and notes the gap as a non-blocking caveat. See §Findings.

## Spec adherence

- [x] **AC-1** — `docker-compose.yml` at repo root declares `tapestry` and `search` services. Verified by reading the file and by running `docker compose config`.
- [x] **AC-2** — five host ports declared (`8080`, `7777`, `7474`, `7687`, `7700`). Whether each is *reachable* is the manual verification step the Reviewer can't run, but the declarations are correct.
- [x] **AC-3** — `.env.example` documents all 9 expected keys (3 required, 6 with defaults). `.gitignore` excludes `.env` (it already did before this story; the diff adds `.cache/` for the Tapestry source clone).
- [x] **AC-4** — `scripts/build-tapestry-image.sh` exists, is executable (`-rwxr-xr-x`), reads `scripts/tapestry-version.txt`, refreshes existing clones or clones fresh, tags `unbnd/tapestry-data-layer:latest` plus a short-SHA variant. Idempotency is implicit in the `git fetch + reset --hard` pattern. End-to-end build verification is the manual step.
- [x] **AC-5** — `apps/api/src/routes/health.ts` `buildHealthRouter` returns `200` when all four probes report `ok: true`, `503` otherwise. Verified by the `routes/health.test.ts` supertest suite (4 passing).
- [x] **AC-6** — `apps/api/src/search/SearchProvider.ts` declares the interface (`health()` only this cycle, per ADR scope). `apps/api/src/search/meili.ts` is the only concrete impl. `apps/api/src/search/index.ts` exports `resolveProvider` with a `meili | vespa | unknown` switch.
- [x] **AC-7** — compose declares four named volumes; not bound to host paths, so `docker compose down` preserves them. End-to-end persistence verification is the manual step.
- [x] **AC-8** — `docs/data-layer.md` covers all eight required sections (prerequisites, build, start, stop, reset, health, env reference, provider swap). `down -v` warning is present.

## ADR adherence

- [x] Files match the ADR's "File layout" implementation notes: `apps/api/src/{config,index}.ts`, `apps/api/src/{probes,routes,search}/`, `docker-compose.yml`, `.env.example`, `scripts/*`, `docs/data-layer.md`, `apps/api/test/*` — every path the ADR named is present.
- [x] Layering respected: `apps/api/src/probes/` depends only on `../config` and `./timeout`. `routes/health.ts` accepts deps via injection — no direct probe imports from the route module. `search/index.ts` exports the factory and re-exports the types.
- [x] No new dependencies the ADR didn't authorize. New runtime deps in `apps/api`: `neo4j-driver`, `ws` (both named in ADR §"New dependencies"). New devDeps in `apps/api`: `vitest`, `supertest`, `@types/*` (named). New root devDeps: `applesauce-core`, `nostr-tools` (added during the crypto refactor and documented in the ADR's new "Cryptographic library policy" section, which the Implementer also wrote).
- [x] **The three Implementer-phase refinements documented in the ADR's "Cryptographic library policy" section are all defensible and align with the ADR's intent.** Specifically: rewriting the keypair script to use Applesauce + nostr-tools instead of hand-rolled crypto is a strict improvement; adding `"type": "module"` to the root `package.json` is consistent with Unbnd's all-ESM posture; pinning crypto deps exactly (no `^`) matches the supply-chain deferred concern.

## DList integrity

N/A. This story does not touch DList event shapes. The schemas package from story 1 is untouched.

## UI integrity

N/A. This story does not touch `apps/web`. The fixtures, components, routes, and tests from cycle 1 remain unchanged. The smoke-test suite still passes against them.

## Cryptographic policy adherence — new check introduced this cycle

The ADR established a project-wide "Cryptographic library policy" rule during this cycle. The implementation honors it:

- [x] `scripts/generate-keypair.js` imports `generateSecretKey` and `getPublicKey` from `applesauce-core/helpers/keys` (which re-export from `nostr-tools/pure`, which uses `@noble/secp256k1`), and `nsecEncode` / `npubEncode` from `nostr-tools/nip19`. No hand-rolled curve math, no hand-rolled bech32.
- [x] Round-trip verification with the canonical decoder confirms the keys produced are valid nostr keys.
- [x] No other file in the diff contains cryptographic primitives that bypass the audited stack.
- [x] `applesauce-core@6.0.3` and `nostr-tools@2.10.4` are pinned to exact versions in the root `package.json` (no `^`, no `~`). The supply-chain deferred concern explicitly calls this out.
- [x] The policy is documented in three durable places: `CLAUDE.md` §"Cryptographic library policy", ADR 0002 §"Cryptographic library policy — project-wide rule established by this ADR", and `memory/feedback_unbnd_crypto_policy.md`. Future sessions will find the rule before writing crypto-touching code.

## Things tests can't catch

- [x] **No secrets.** `.env.example` contains placeholder dev values, clearly labeled as dev values (`tapestry-local-dev`, `local-dev-search-key`). `OWNER_PUBKEY` is blank with generation instructions. No real keys leak.
- [x] **No debug logging beyond the legitimate startup line.** Only `console.log` in the diff is `console.log(\`unbnd-api listening on :${config.port}\`)` in `apps/api/src/index.ts:28`, which is a standard Node service startup log preserved from the original stub.
- [x] **No commented-out code.** All stubs from the Tester phase were cleanly replaced.
- [x] **Error paths handled.** `loadConfig` throws with descriptive errors on missing/invalid env; `withTimeout` returns failed `ProbeResult` on rejection or timeout; each probe catches its own errors; the route's `Promise.allSettled` handles probe rejections gracefully.
- [x] **No race conditions.** Probes are independent; `Promise.allSettled` runs them in parallel without shared state. Driver/socket creation is per-call, so no pool concurrency to worry about.
- [x] **Security review of the new probes:**
  - `probeStrfry` opens a WS, then closes on `open` or `error`. No data sent. No way for a remote attacker to inject anything because the probe doesn't read or interpret anything from the relay beyond connection state.
  - `probeNeo4j` runs `RETURN 1 AS ok` against the bolt port using configured credentials. Safe; no user input enters the cypher.
  - `probeTapestry` does an HTTP GET. Safe; no user input enters the URL.
  - `MeiliProvider.health` does an HTTP GET with `Authorization: Bearer ${searchApiKey}`. Safe; the key comes from config validation.
- [x] **Supply chain integrity.** New crypto deps are pinned to exact versions; lockfile is committed; the ADR notes that lockfile freshness + `pnpm audit` belong in a future CI story.

## House rules check

- [x] **PRD scope discipline.** Nothing from §11.3 sneaks in. No payment paths, no file hosting, no UI changes, no Open Library import. Scope is exactly "stand up the data layer locally."
- [x] **POV-first respected.** The /health/data endpoint reports reachability per service, not "trusted state." Observer-agnostic.
- [x] **Decentralized-first respected.** Probes don't gate event acceptance; no author whitelist introduced.
- [x] **Filter-at-view-time respected.** N/A at the infrastructure level; no precomputed POV state.
- [x] **Cryptographic library policy respected.** See §"Cryptographic policy adherence" above.
- [x] **PRD §11.3 Out-of-Scope** undisturbed.
- [x] **No new lint/typecheck/build tooling without an ADR.** `vitest` was authorized by ADR 0001 (cycle 1); `supertest` is documented in this cycle's test plan §"Test infrastructure"; both crypto deps are explicitly authorized in this ADR's new "Cryptographic library policy" section.

## Findings

### Blocking

None.

### Non-blocking observations

1. **Manual verification steps from the test plan were not executed.** Steps 1-5 (build image, bring up stack, hit ports, run /health/data against a live stack, verify volume persistence) require a Docker daemon and the 10-20 minute Tapestry image build. The Reviewer in this session could not run them. The test plan correctly delegates these to manual verification; the gap is inherent to a review without a real environment. Before merging to a deployed environment, someone should execute these. Non-blocking because every gate that *can* be verified hermetically passes, and the implementation matches the ADR's design verbatim.

2. **`scripts/build-tapestry-image.sh` does not pre-flight check for the `docker` CLI.** If a developer runs the script without Docker installed, they'll get a less helpful error from `docker build` than a clean "please install Docker Desktop" prefix would give. Minor UX. A `command -v docker || { echo "error: docker not found"; exit 1; }` at the top would tighten this. Non-blocking.

3. **`apps/api/src/index.ts:27` carries an `eslint-disable-next-line no-console` comment** but ESLint is not configured for this project. The comment is harmless (esbuild ignores it) but stale — when ESLint *does* land via a future ADR, the directive will spring back to life and may or may not match the configured rules. Recommend dropping the directive in a small cleanup; replace with `// startup log` if a comment is wanted. Non-blocking.

4. **The ADR's "Cryptographic library policy" was added during the Implementer phase, not during the Architect phase.** This is borderline outside the role's normal scope, but the change is documented in the ADR itself with rationale, the user explicitly directed it, and the rule strengthens the project's security posture. The Reviewer notes this as a good-faith Implementer-phase amendment that the Architect role would have produced if the policy concern had been surfaced earlier. The pattern (Implementer surfaces a real concern → user directs the policy change → ADR amended in-cycle) is the right one and aligns with `engineering-team/roles/implementer.md`'s "If you find yourself needing to break the ADR, stop. Surface it to the user" guidance. The Implementer correctly surfaced; the user correctly directed; the artifact correctly records.

## Verdict

**PASS.**

Every hermetic gate is green. The implementation matches the story, the ADR (as amended with the Cryptographic library policy section), and the test plan. The crypto refactor strengthens security in a way that benefits every downstream cycle. The three non-blocking observations are quality-of-life polish that can land in any subsequent cycle without blocking this one.

The manual verification steps remain the only gap and should be executed against a real Docker environment before any production deployment uses this compose file. They are documented for that purpose; the Reviewer notes the deferral here.
