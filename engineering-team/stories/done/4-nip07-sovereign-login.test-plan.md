# Test Plan: Story 4 — NIP-07 sovereign login

**Story:** `engineering-team/stories/done/4-nip07-sovereign-login.md`
**ADR:** `engineering-team/decisions/0004-nip07-sovereign-login.md`
**Date:** 2026-05-28

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 challenge endpoint | `routes/auth-nostr.test.ts` | component (mocked deps) |
| AC-2 verify endpoint | `routes/auth-nostr.test.ts` + `auth/nostr.test.ts` | component + unit |
| AC-3 single-use / expiry | `db/integration.test.ts` (challenges) | integration |
| AC-4 audited signature verification | `auth/nostr.test.ts` | unit |
| AC-5 sovereign schema (nullable + CHECK) | `db/integration.test.ts` (sovereign create/load) | integration |
| AC-6 returning-user dedup + npub | `db/integration.test.ts` + `routes/auth-nostr.test.ts` | integration + component |
| AC-7 web flow | `apps/web/test/routes/auth-nostr-connect.test.tsx` | component |
| AC-8 sign-out/in | reuses cycle-3 session revoke (integration) | integration |
| AC-9 no key on server | `auth/nostr.test.ts` (verify takes only a signed event) + inspection | unit + review |

## The security suite (`auth/nostr.test.ts`)

The point of the cycle. Builds a real NIP-42 event with a fixture keypair, JSON round-trips it (so no nostr-tools `verifiedSymbol` memo is carried — the ADR landmine), and asserts:
- honest event → ok, returns pubkey + challenge
- tampered pubkey → rejected
- tampered content → rejected
- wrong kind → rejected
- missing challenge tag → rejected
- stale `created_at` beyond the skew window → rejected
- junk input (null, `{}`, partial) → rejected

This is what distinguishes Unbnd's verify from Tapestry's reference handler, which never checks the signature.

## Hybrid strategy (unchanged from cycle 3)

Hermetic suites run everywhere: `auth/nostr.test.ts`, `routes/auth-nostr.test.ts` (DI-mocked `nostrChallenge`/`nostrVerify`), `config.test.ts`, the web flow test, infra. The real-Postgres suite (`db/integration.test.ts`) gates on `DATABASE_URL` — now wired into CI (postgres:16 service), so the sovereign-user and challenge behaviors run automatically there.

## Edge cases

- [x] tampered pubkey / content / kind / missing-tag / stale-time / junk (nostr)
- [x] challenge consumed exactly once (replay → false)
- [x] unknown challenge → not consumed
- [x] sovereign user: null email + null key material; tier='sovereign'
- [x] repeat pubkey loads the same row (no duplicate)
- [x] verify 401 generic on failure; challenge 400 on malformed pubkey
- [x] sovereign `PublicUser.email` is null; npub present, hex never exposed
- [x] custodial login null-guard (a null password column → 401), forced by nullable schema
- [x] PUBLIC_ORIGIN default + override (config)

## How to run
```
pnpm -r test
docker compose up -d db && DATABASE_URL=postgres://unbnd:unbnd@localhost:5432/unbnd pnpm --filter @unbnd/api test
```

## Verification — failing-for-the-right-reason

Confirmed 2026-05-28. Typecheck clean workspace-wide.

`pnpm --filter @unbnd/api test`: 12 failed / 122 passed / 9 skipped.
- 7 × `verifySignedChallenge not implemented` (nostr stub)
- 4 × `expected 404 to be 200/401/400` (the `/auth/nostr/*` handlers not yet added to `buildAuthRouter`)
- 1 × `.env.example` missing `PUBLIC_ORIGIN=`
- 9 skipped = the integration suite (no local Docker; runs in CI)

`pnpm --filter @unbnd/web test`: 1 failed / 15 passed. The failure is the NIP-07 flow test (the stub `onConfirm` navigates without calling `api.auth.nostr`). The no-extension case passes against the stub (it already handles a missing `window.nostr`) — an end-state guard the Implementer preserves.

## Notes for the Implementer

Order: `auth/nostr.ts` (verifySignedChallenge: shape → verifyEvent → skew → challenge tag) → `auth/challenges.ts` (issue/consume/sweep) → `auth/users.ts` (createOrLoadSovereignUser: truncated-npub display name) → `routes/auth.ts` (add the two handlers; 400 on bad pubkey, 401 generic on verify fail) → `index.ts` (wire `nostrChallenge`/`nostrVerify`: challenge issues into the challenges table; verify runs verifySignedChallenge then consumeChallenge then createOrLoadSovereignUser + issueSession, all transactional) → `.env.example` (add `PUBLIC_ORIGIN`) → `apps/web` AuthNostrConnect (challenge → signEvent → verify → navigate).

ADR refinement to record at close-out: `email` is also made nullable (sovereign users have none), and the tier CHECK + `PublicUser.email` reflect that — the ADR's §4 migration text covered the encrypted columns but not email.
