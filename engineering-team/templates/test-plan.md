# Test Plan: Story <n> — <title>

**Story:** `engineering-team/stories/<n>-<slug>.md`
**ADR:** `engineering-team/decisions/<NNNN>-<slug>.md`
**Date:** <DATE>

## Coverage map
Map each acceptance criterion to a test.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 | `it("does X when Y")` | `apps/web/src/.../foo.test.ts` | unit |
| AC-2 | `it("renders Z given W")` | `apps/web/src/.../bar.test.tsx` | component |
| AC-3 | `it("publishes the DList event")` | `apps/api/src/.../baz.test.ts` | integration |

## Edge cases
Things not in the acceptance criteria but still worth covering.

- [ ] Empty input.
- [ ] Concurrent calls.
- [ ] strfry relay unreachable.
- [ ] DList parent header missing.
- [ ] User has not personalized PoV yet (House view is in effect).

## Test infrastructure
- Test runner: Vitest (lives at `apps/web/test/...` and `apps/api/test/...`).
- Browser/component flow: Vitest + Testing Library, optionally Playwright for end-to-end. Set per-ADR if Playwright is introduced.
- Tapestry data layer: `docker compose up` brings strfry on :7777, Neo4j on :7687, Meilisearch on :7700. Tests that need a relay assume the stack is running locally.
- Fixtures: `apps/web/src/data/*-fixtures.ts` for UI; integration tests should seed strfry with a small, deterministic set of events from `test/fixtures/events/`.

## How to run

```
pnpm --filter @unbnd/web test
pnpm --filter @unbnd/api test
pnpm -r test
```

For end-to-end (when configured):
```
pnpm --filter @unbnd/web test:e2e
```

## Verification
The new tests fail with the current code. Confirmed on <DATE> at commit <hash>:

```
<paste the failing test output here>
```
