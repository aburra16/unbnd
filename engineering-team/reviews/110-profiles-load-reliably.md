# Review: Story 110 — Profiles load reliably

**Reviewer:** independent reviewer
**Date:** 2026-10-22

## Round 1: PASS, no blocking findings
Verified in a separate worktree: typecheck, tests and builds clean; the new tests fail on main (7 api, 1 web), except the guard that raw reads wait for every relay. Mutation checks: dropping the plain copy before `verifyEvent` or the single-flight fails tests. Verifying a plain copy is required: nostr-tools caches a verified flag on the event object, and an object spread copies it.

Live (read-only), with the default relays and the operator's pubkey: the picture was found 12 times out of 12, about 0.5 to 0.65 s after the first connection (main: 3 of 6, 3 s each).

Non-blocking, fixed after the verdict:
- A read in flight could overwrite a profile published while it ran. Entries carry a version that a publish bumps; an older read leaves a newer entry alone. Regression test added.
- A refresh that keeps failing retried on every request. It now waits a minute.
- Write relays are taken only from kind 10002 events.
- The reads before a profile or follow write also ask Unbnd's own relay, as display reads do.
- The web app retries an empty first answer on the next mount instead of keeping it for the session.
- A test pins that only a published kind-0 changes the cache.

Accepted and recorded: a kind-0 that exists with every field empty reads the same as "not found", so a profile emptied in another client stays cached until a restart or eviction (Unbnd's own writes are cached as written); `/api/profile/:id` has no rate limit, as before, though single-flight and the one-minute "no profile" entry make repeated lookups cheaper than on main.

## Quality gates (at HEAD)
- [x] typecheck, build and tests clean: api 1050 + 13 skipped, web 456, all other packages unchanged.

## Verdict
**PASS.**
