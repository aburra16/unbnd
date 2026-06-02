# Test Plan: Story 33 — Accusatory-tag gate (curator-gated write + ops reveal + filter-at-read)

**Story:** `engineering-team/stories/33-accusatory-tag-gate.md`
**ADR:** `engineering-team/decisions/0034-accusatory-tag-gate.md` (incl. the 2026-06-02 ops-only-trigger Amendment)
**Date:** 2026-06-02

All tests are fixture-driven, deterministic, and require no live relay, DB, key, or human. Trust
is the **fixture** `TrustProvider` (`FixtureTrustProvider`, a known observer with known weights over
a known key set), injected via DI — no intra-module `vi.mock` of the unit under test; the only
module mocks are the web's sibling api-client + session hook (mirroring the existing
`tag-control.test.tsx`). The worker reveal mint uses a FAKE librarian signer (no real
`LIBRARIAN_NSEC`) and a FAKE publisher (no relay). No `Date.now()` appears in any asserted output.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| Schema | `AccusatoryReveal` round-trip: kind-39999, `#a` book, `["t",tag]`, `["state",…]`, z=`accusatory-reveals`, d-tag `reveal--<book>--<tag>`; withdraw replaces at same address | `packages/schemas/test/AccusatoryReveal.test.ts` | unit |
| AC-1 | `canAssertAccusatory` flag on `GET /api/books/:slug/tags` is gate-aware (above→true, below→false, anon→false, degrade→false), computed once | `apps/api/test/routes/tags-accusatory-gate.test.ts` | route |
| AC-1 | `TagControl` offers accusatory tags ONLY when `canAssertAccusatory` true (false/absent/anon → not offered) | `apps/web/test/components/tag-control-accusatory.test.tsx` | component |
| AC-2 | `POST /api/tags` accusatory write — sovereign: anon 401, below 403 `below_gate` (not published), above published; reads sensitivity from the SIGNED EVENT `t` (crafted body can't smuggle) | `apps/api/test/routes/tags-accusatory-gate.test.ts` | route |
| AC-2 | `POST /api/tags` accusatory write — custodial: below 403 `below_gate` (not signed/published), above signed+published | `apps/api/test/routes/tags-accusatory-gate.test.ts` | route |
| AC-2 | a NORMAL genre/style write is UNAFFECTED for any signed-in user, both tiers; unknown slug → non-accusatory | `apps/api/test/routes/tags-accusatory-gate.test.ts` | route |
| AC-3 | `aggregateBookTagsWeighted` with NO/empty `revealedTagSlugs` → accusatory dropped (every existing caller + raw path unchanged) | `apps/api/test/tags/aggregate-reveal.test.ts` | unit |
| AC-3 | `GET /api/books/:slug/tags` with no reveal event → accusatory hidden | `apps/api/test/routes/tags-reveal-read.test.ts` | route |
| AC-4 | `aggregateBookTagsWeighted` with `(tag)` in `revealedTagSlugs` → that accusatory tag surfaces in `signals`, marked `revealed`; sibling stays hidden | `apps/api/test/tags/aggregate-reveal.test.ts` | unit |
| AC-4 | `GET /api/books/:slug/tags` batched reveal lookup surfaces a tag only when a LIVE `revealed` event exists; ONE batched `#a`-scoped query (no N+1); sibling/other-book unaffected | `apps/api/test/routes/tags-reveal-read.test.ts` | route |
| AC-4 | worker pure builder `buildAccusatoryRevealEvent` → correct header/`#a`/`#t`/`state`/d-tag | `apps/promoter/test/reveal-build.test.ts` | unit |
| AC-4 | operator trigger: `parseRevealArgs` (reveal vs `--withdraw` → state; slug threading) + `enqueueReveal` upsert idempotent on `UNIQUE(book,tag)` | `apps/promoter/test/reveal-cli.test.ts` | unit |
| AC-4 | `runRevealCycle` claims a pending row, librarian-signs (fake signer), publishes local+dcosl (fake publisher), marks done with `minted_id` | `apps/promoter/test/reveal-cycle.test.ts` | unit |
| AC-5 | revealed accusatory tag renders attributed to a review action, distinct from genre/style chips, NOT "community/trusted consensus", NO curator count/tally | `apps/web/test/components/tag-control-accusatory.test.tsx` | component |
| AC-6 | latest state `withdrawn` (superseding `revealed`) → hidden again; latest-per-d-tag keyed on `created_at`; no emergent count flips it; canonical assertions never mutated | `apps/api/test/routes/tags-reveal-read.test.ts`, `apps/api/test/tags/aggregate-reveal.test.ts` | route + unit |
| AC-6 | worker mints a `state:"withdrawn"` event at the SAME (book,tag) address (reversal); enqueue flip reveal→withdraw→reveal keeps ONE row | `apps/promoter/test/reveal-cycle.test.ts`, `apps/promoter/test/reveal-cli.test.ts` | unit |
| AC-7 | write gate closes on trust unavailable / no observer / throwing seam (403, never throws); picker flag → false on degrade; reveal never auto-fires (flood of assertions does not reveal) | `apps/api/test/routes/tags-accusatory-gate.test.ts`, `apps/api/test/routes/tags-reveal-read.test.ts` | route |
| AC-8 | whole story green under the fixture provider; `LIBRARIAN_NSEC`-not-in-`apps/api/src` guard stays green; ADR-0014 trust architecture guard stays green | (the fixture-driven suites above) + existing `apps/api/test/security/no-librarian-nsec-in-api.test.ts` + `apps/api/test/trust/architecture.test.ts` | guard |

## How the load-bearing assertions are made

- **Sensitivity-from-signed-event gate (AC-2).** The sovereign test crafts a body that LIES
  (`tagSlug: "literary-fiction"`, normal) while the client-signed event's `["t", …]` carries the
  ACCUSATORY `ai-generated`. The signer is below the gate. The assertion is `403 below_gate` and
  `publish` not called — proving the gate reads the asserted slug off the SIGNED EVENT, not the
  body. A NORMAL signed event from the same below-gate signer publishes (200), proving the branch
  is sensitivity-conditional, not a blanket gate. Both tiers covered; the custodial path reads the
  intent body's `tagSlug` (custodial has no client event) and is gated identically.
- **Filter-at-read: revealed vs withdrawn vs default-hidden (AC-3/AC-4/AC-6).** The route test
  injects a `query` that dispatches the three concept filters (`book-tags`, `book-tag-assertions`,
  `accusatory-reveals`). No reveal event → `ai-generated` absent (default-hidden). A live `revealed`
  event → it surfaces in `signals` with `revealed: true` and a sibling accusatory tag stays hidden.
  Two events at the same (book,tag) address (revealed then withdrawn) → hidden again; an out-of-order
  set proves the read keys on the LATEST `created_at`. A flood of 12 accusatory assertions with no
  reveal stays hidden (no emergent reveal). The reveal lookup is asserted to be ONE call, `#a`-scoped
  to the book (no N+1).
- **Canonical never mutated (AC-6).** The `aggregate-reveal` unit snapshots the assertion array,
  runs the aggregate hidden (no reveal) then surfaced (reveal set), asserts the surfaced tag's raw
  `applies` count is intact, and asserts `JSON.stringify(assertions)` is byte-identical before/after
  — the reveal changes only the injected set, never the events.
- **Worker mint with a FAKE key (AC-4/AC-6).** `runRevealCycle` is driven by injected
  `claimPending` / `sign` / `publishLocal` / `publishDcosl` / `markDone` / `markFailed`. The `sign`
  stub stamps a fixed id/pubkey/sig — no real `LIBRARIAN_NSEC`, no crypto. Assertions read the
  template handed to `sign` (header address, `#a`, `#t`, `state`, d-tag) and that `markDone` records
  the `minted_id`. A `withdrawn` row mints `state:"withdrawn"` at the same address. A both-relay
  publish failure marks `failed` and the run still resolves.
- **Both tiers (AC-2).** Sovereign (client-signed `{event}`) and custodial (server ephemeral-wrap
  via injected `custodialSign`) each have explicit below-gate-reject and above-gate-accept cases.

## Edge cases covered

- [x] Anonymous accusatory write → 401 (both the absence of session and the gate are exercised).
- [x] Unknown tag slug treated as non-accusatory (existing read-drop behavior preserved).
- [x] Trust seam throws / no provider / no observer → gate closes, picker flag false, never a 500.
- [x] Out-of-order reveal/withdraw events → latest `created_at` wins.
- [x] Emergent-reveal guard: a flood of accusatory assertions with no reveal stays hidden.
- [x] Idempotent operator trigger: reveal→withdraw→reveal keeps ONE `reveals` row.
- [x] Default-empty reveal set is byte-identical to omitting the argument (every existing caller
      unchanged).

## Migrated / co-existing tests (faithful, not weakened)

- **`apps/web/test/components/tag-control.test.tsx` — UNCHANGED, stays green.** Its "never offers
  accusatory tags in the picker" case now reads as the default-closed case (signed-in sovereign,
  `canAssertAccusatory` absent → not offered). New behavior lives in the sibling
  `tag-control-accusatory.test.tsx`; the original `BookTags` fixtures remain valid because the new
  fields are optional. No assertion was weakened.
- **`apps/api/test/routes/tags.test.ts` + `tags-weighted.test.ts` — UNCHANGED, stay green.** The
  added gate is sensitivity-conditional: their writes use normal/unknown tags, so the gate's normal
  branch leaves them untouched; the added `canAssertAccusatory` flag and reveal query are additive
  (extra response field / an ignored third query). No migration required.
- **`apps/api/test/tags/aggregate-weighted.test.ts` — UNCHANGED, stays green.** The new
  `revealedTagSlugs` argument is optional/default-empty, so all existing 3-arg calls are unchanged.
- No reveal/withdraw API-route tests exist or were added (2026-06-02 Amendment: the trigger is
  ops-only — a worker CLI, no `POST /api/tags/reveal`). The trigger is covered by the
  worker/ops tests (`reveal-cli` upsert + dispatch, `reveal-cycle` mint).

## Test infrastructure

- Runner: Vitest (workspace default). Tests live under each package's `test/` dir.
- Component tests: Vitest + Testing Library, role-scoped queries (`getByRole("option" | "combobox")`).
- Trust: `FixtureTrustProvider` injected as the route's `trust` dep — no Brainstorm, no relay.
- Worker: injected fake signer + fake publisher + fake queue — no real key, no relay, no DB.
- No `docker compose` dependency: every test is in-process and deterministic.

## How to run

```
pnpm --filter @unbnd/schemas test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/promoter test
pnpm --filter @unbnd/web test
pnpm -r test          # workspace gate (stops at the first failing package while red)
pnpm -r typecheck     # the CI build gate — see Verification
```

## Verification (intentionally RED)

Confirmed on 2026-06-02. Each suite fails because the schema / write-gate / read-filter /
worker-reveal / picker-flag / honest-render does not exist yet — NOT because of test bugs. The
existing suites (including the `LIBRARIAN_NSEC`-not-in-API guard and the ADR-0014 trust-architecture
guard) stay green.

Per-package red summary (`pnpm --filter <pkg> test`):

```
packages/schemas:  Test Files  1 failed | 11 passed (12)   (AccusatoryReveal.test.ts — module not built yet)
apps/api:          Test Files  3 failed | 79 passed | 2 skipped (84)   Tests 17 failed | 696 passed | 10 skipped
                     FAIL test/routes/tags-accusatory-gate.test.ts   (gate + flag not built → 200/undefined vs 403/true|false)
                     FAIL test/routes/tags-reveal-read.test.ts       (reveal query not built → revealed tag not surfaced)
                     FAIL test/tags/aggregate-reveal.test.ts         (revealedTagSlugs param + revealed marker not built)
apps/promoter:     Test Files  3 failed | 2 passed (5)
                     FAIL test/reveal-build.test.ts / reveal-cli.test.ts / reveal-cycle.test.ts  (reveal/* modules not built)
apps/web:          Test Files  1 failed | 48 passed (49)   Tests 3 failed | 279 passed
                     FAIL test/components/tag-control-accusatory.test.tsx  (picker offer + revealed render not built)
```

### `pnpm -r typecheck` — the PR-#74 rule

Per the role's typecheck rule, the red set was authored to contain **zero strip-able mock-shape type
bugs** (no wrong-arity `vi.fn`, no too-narrow table, no stub missing a parameter — the class that
passes vitest but breaks `tsc`/CI). Where a type error WAS avoidable without production code, it was
removed via test-local widenings that keep the runtime assertion failing:

- `apps/web` typechecks **fully clean** — the web mocks are typed against the real `lib/api.ts`
  shapes; `canAssertAccusatory` (on `BookTags`) and `revealed` (on `TagConsensus`) are applied via
  test-local `BookTagsR`/`RevealedSignal` widenings of the real exported types (the Implementer's
  field additions make them no-ops).
- `apps/api/test/tags/aggregate-reveal.test.ts` typechecks clean — the still-to-be-widened
  `aggregateBookTagsWeighted` 4th argument is threaded through a test-local typed alias of the real
  function (the Implementer's signature widening makes it a no-op).

The only residual `tsc` diagnostics are the irreducible **"feature module / export not created yet"**
class (`TS2307` module-not-found, `TS2305`/`TS2724` member-not-exported), identical to every prior
new-module red set in this repo (e.g. Story 32's `AuthorVerifiedAssertion` red set). These are
**also** visible to the runner as load failures, so they are NOT the hidden strip-able class the
PR-#74 rule guards against — they are the honest "the feature isn't implemented" signal, and the
Implementer clears them and the assertions together:

```
packages/schemas: test/AccusatoryReveal.test.ts — TS2307 ../src/AccusatoryReveal,
                  TS2724 BOOK_ACCUSATORY_REVEALS_HEADER_SLUG / buildBookAccusatoryRevealsHeaderAddress
apps/api:         test/routes/tags-reveal-read.test.ts — TS2305 toAccusatoryRevealEvent / AccusatoryReveal (@unbnd/schemas)
apps/promoter:    test/reveal-build.test.ts — TS2305 toAccusatoryRevealEvent / AccusatoryReveal; TS2307 ../src/reveal/build
                  test/reveal-cli.test.ts — TS2307 ../src/reveal/cli
                  test/reveal-cycle.test.ts — TS2307 ../src/reveal/cycle
apps/web:         (clean)
```

No EXISTING source or test file regresses under `tsc` — every diagnostic is in a new Story-33 test
file and names a Story-33 symbol the Implementer will create.
