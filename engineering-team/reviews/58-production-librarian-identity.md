# Review: Story 58 — Production librarian identity (adopt + secure) and the house-observer swap enablers

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-05
**Diff:** `git diff 4987cb1...07d9453` (head `07d945376ba8b81e1718567765672af7ad737f0c`)
**Story:** `engineering-team/stories/done/58-production-librarian-identity.md`
**ADR:** `engineering-team/decisions/0057-production-librarian-identity.md`
**Test plan:** `engineering-team/stories/done/58-production-librarian-identity.test-plan.md`
**PR:** #104

## Verdict

**PASS**

A clean keystone story. The librarian worker holds `LIBRARIAN_NSEC` off the API behind a profile-gated compose service, the firewall is intact (no real curator value or business framing anywhere), kind-3 cannot reach dcosl, and the GrapeRank trigger is correctly ordered after a durable kind-3 publish and fully fail-open. Tests were not weakened. All gates green.

## Test integrity (critical)

- Tester red set = `33f3c1a`; Implementer green = `07d9453` (the next commit). Confirmed.
- `git diff 33f3c1a 07d9453 -- '**/*.test.ts'` → **empty**. No test file was modified, weakened, or deleted between red and green.
- The green commit touches only `src/`, `docker-compose.prod.yml`, `.env.production.example`, `docs/DEPLOY.md`, `ops/trust-seed-harness.md`, and `.github/workflows/staging.yml` (12 files, +875/-2). No test, no `package.json`/`tsconfig`/`vitest.config` from the red commit was altered.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/librarian test` — **40 passed** (5 suites).
- [x] `pnpm --filter @unbnd/relay test` — **18 passed** (3 suites, incl. the new `query.test.ts` REQ-send guard, 6 tests).
- [x] `pnpm -r test` — **all green**: schemas 145, relay 18, trust 23, indexer 14, web 307, librarian 40, promoter 28, seeder 121, shelves 26, api 790 passed / 10 skipped.
- [x] `pnpm -r typecheck` — every package clean (librarian included).
- [x] `pnpm --filter @unbnd/librarian build` (tsc) and `bundle` (esbuild, the Docker path) — both succeed.
- [x] `gh pr checks 104` — all green: Typecheck/test/build, Validate Caddyfile, Visual regression.
- ADR-0031 guard `apps/api/test/security/no-librarian-nsec-in-api.test.ts` — present and **green** (1 test).

## Secret hygiene (critical)

- `grep -rn LIBRARIAN_NSEC apps/api/src` → **none**. The string appears only in: the librarian worker (`apps/librarian/src/{env,main,profile-cycle,follows-cycle}.ts`), the compose `librarian` service env, and the seeder/promoter compose comments/env (pre-existing). ADR-0031 guard stays green.
- The `librarian` compose service is `profiles: ["librarian"]` + `restart: "no"` — it does NOT start with the normal stack and mirrors the seeder/promoter secret handling. It is the third service to hold the nsec, all off the internet-facing path.
- The worker decodes the nsec in-process (`main.ts` `decodeLibrarian`: `decode(nsec)` → `getPublicKey(sk)`), signs via `finalizeEvent(template, sk)` (`nostr-tools/pure`). No bespoke crypto, no DIY bech32/secp256k1. The nsec is never logged (log lines reference relay counts / seed counts only).

## Firewall (critical)

- `git diff 4987cb1 07d9453` contains **zero** 64-hex pubkeys and **zero** `npub1` literals.
- Test fixtures (red commit) use only synthetic repeated-char hex: `"a".repeat(64)`, `"b".repeat(64)`, `"1".repeat(64)`, `"e".repeat(64)`, etc. No suspect (multi-char) hex literal exists in any test.
- `.env.production.example` ships `SEED_CURATORS`, `LIBRARIAN_NAME`, `LIBRARIAN_ABOUT`, `LIBRARIAN_PICTURE_URL`, `LIBRARIAN_NIP05`, `TRUST_RELAYS`, `LIBRARIAN_GENERAL_RELAYS`, `PROFILE_RELAYS`, `BRAINSTORM_API_URL`, `RELAY_PUBLISH_TIMEOUT_MS` **empty/placeholder**, with a FIREWALL comment that membership + profile content are operator-supplied out of band.
- The only "business" matches in the diff are firewall warnings instructing implementers/operators NOT to embed real values. No grant/cohort/recruit/investor language leaked anywhere (code, tests, env, compose, docs, ADR, story).

## kind-3 builder + relay routing

- `follows-template.ts` `mergeSeedFollows`: pure deep-enough clone of `rawTags ?? []`; appends `["p", hex]` only when no existing `p` tag has `tag[1] === hex`; preserves every non-`p` tag, every existing `p` tag's relay-hint/petname payload, and order; `null` + N seeds ⇒ N `p` tags in input order. Input never mutated. Idempotent. Mirrors `apps/api/src/profile/follow-template.ts`.
- `buildLibrarianKind3Template`: kind 3, `content` preserved verbatim (`""` when no prior event), not `toWireTemplate`.
- `follows-cycle.ts`: kind-3 publish target is `[...trustRelays, ...generalRelays]` — **dcosl is not in that set**. The test `never targets dcosl with the kind-3` asserts `not.toContain(DCOSL)`, and the code honors it (dcosl is never added). kind-3-to-dcosl is impossible.

## kind-0 builder + relay routing

- `profile-content.ts` `buildLibrarianProfileContent`: sets both `name` and `display_name` from `LIBRARIAN_NAME`; emits `about`/`picture`/`nip05` only when truthy (empty string omitted). `buildLibrarianKind0Template`: kind 0, empty tags, JSON-stringified content. Deterministic.
- `profile-cycle.ts`: required `LIBRARIAN_NAME` (empty/whitespace → throws); kind-0 published to `[dcoslUrl, ...profileRelays]` (dcosl ∪ profile relays).

## GrapeRank trigger correctness + ordering + fail-open

- Ordering: `runFollowsCycle` publishes the durable kind-3 FIRST. A publish failure (`!result.ok`) throws, which gates the trigger entirely (test: durable-publish-failure asserts `authChallenge` was never called). Only on a confirmed publish does `triggerGrapeRank` run.
- Flow: `resolveTrustProvider(brainstorm)` → `trust.authChallenge(librarianHex)` (returns unsigned kind-27235 with the `brainstorm_login` tag, inside `BrainstormProvider`) → `sign(challenge)` with the librarian key (`finalizeEvent(template, sk)`) → `trust.personalize(librarianHex, signed)`. Tests assert the order publish → authChallenge → personalize, and that the event handed to `personalize` is a kind-27235 with `pubkey === LIBRARIAN`.
- Fail-open: a `null` challenge, a thrown `personalize`, and `personalize() === false` are each logged and swallowed; the cycle resolves (exit 0) and the kind-3 stays published. All three paths have tests.
- Adapter reuse: the worker imports only `resolveTrustProvider` and the `TrustProvider` type. No Brainstorm URL, no kind-27235 shape, no `/verify` body in the worker — all inside `BrainstormProvider`. No Brainstorm specifics leak.

## The @unbnd/relay query-send guard (fold-in)

- `connect.ts` `query`: the leading `REQ` `ws.send` is now wrapped in try/catch — on throw it clears the timer, deletes the sub, and rejects (`new Promise((res, rej) => …)`). Matches `publish`'s send-throw guard. The query-guard test is green; the other two relay suites (publish-resilience, resilient-relay) and the rest of `query.test.ts` regress-free.

## Config + ops

- `env.ts`: `parseSeedCurators` CSV→hex[], each `^[0-9a-f]{64}$`, empty/whitespace → hard error; `parseRelays` CSV with fallback; `DEFAULT_LIBRARIAN_GENERAL_RELAYS` is the profile set minus dcosl; `parseTimeoutMs`/`parseTrustProvider` validated. `follows` mode requires `SEED_CURATORS`; `profile` mode requires `LIBRARIAN_NAME`.
- Compose `librarian` env matches the ADR §1 config table exactly (12 keys, defaults included), `profiles:["librarian"]`, `restart:"no"`.
- `.env.production.example`: new keys empty/placeholder + firewall comment.
- Staging build matrix (`.github/workflows/staging.yml`) includes the `librarian` image (`apps/librarian/Dockerfile`).
- `docs/DEPLOY.md`: secret-management runbook (`age` encrypt-at-rest, root-only identity at mode 600, backup/rotation = re-encrypt the same nsec under a new identity, confirmed offline copy out of band, KMS/Vault deferred) and the 7-step swap+verify runbook (kind-0 → kind-3+GrapeRank → wait for scores → staged divergence check → set `HOUSE_OBSERVER_PUBKEY` → restart readers → re-verify). Accurate against the actual worker behavior and ADR §5. `ops/trust-seed-harness.md` cross-links it.

## Default unchanged

- `apps/api/src/config.ts` is NOT touched. `DEFAULT_HOUSE_OBSERVER` stays the interim nosfabrica pubkey (`be7bf5de…09420d0a`). The swap stays an operator `.env` override (`HOUSE_OBSERVER_PUBKEY`), config-only, no code change, repo default unchanged — exactly per ADR §5.

## House rules check

- [x] PRD scope discipline: nothing from §11.3 sneaks in (no payments, file hosting, ebook sales, social feed, reading progress). This is ops/identity standup only.
- [x] POV-first respected: the worker stands up the librarian identity; the per-POV trust read remains at query time and is untouched.
- [x] No new lint/typecheck/build tooling. One new workspace dep (`@unbnd/trust`) authorized by ADR §1 (mandatory `BrainstormProvider` reuse). No new npm dependency. `nostr-tools` pinned `2.10.4`.
- [x] No change to the trust machinery (`aggregate.ts`, providers, fixture, `RatingsPanel`/`GenrePill`) or the web app — verified by name-only diff (none touched).
- [x] Librarian pubkey resolved at runtime (`getPublicKey(sk)` from the decoded nsec), never hardcoded.

## Things tests can't catch

- No secrets committed; nsec only ever read from env and decoded at runtime.
- No leftover debug logging beyond intentional operator-facing `console.log`/`console.warn` (relay counts, fail-open notices) — appropriate for a one-off operator worker.
- No commented-out code.
- Error/edge paths handled: empty/invalid seed set, missing name, no reachable relays (`fanoutPublish` returns `{ok:false}`), best-effort existing-kind-3 read (per-relay try/catch), fail-open trigger.

## Findings

### Blocking

None.

### Non-blocking

1. **`docs/DEPLOY.md`** (secret-management code block) — one em dash in a shell-comment line (`# note the \`Public key:\` line it prints — that is the recipient.`). The no-slop rule targets shipped product copy and operator narrative; this is an inline comment inside a code block and is consistent with em-dash usage already present in DEPLOY.md. Optional: replace with a colon or period for strict adherence. Not blocking.
2. **`apps/librarian/src/profile-cycle.ts`** — the ADR §Impl notes mention the profile cycle could "verify resolvable (re-`REQ` the kind-0)"; the implemented cycle publishes and checks `result.ok` but does not re-query. The story acceptance criterion ("worker verifies the event lands / is resolvable") is satisfied by the publish-OK confirmation, and the test plan does not assert a re-read. Acceptable as shipped; an optional future hardening could add the re-`REQ` spot-check. Not blocking.

## Verdict

**PASS**
