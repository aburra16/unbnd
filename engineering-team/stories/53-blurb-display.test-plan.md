# Test Plan: Story 53 — Book detail blurb display (clamp + Read more / Read less + Open Library source link)

**Story:** `engineering-team/stories/53-blurb-display.md`
**ADR:** `engineering-team/decisions/0052-blurb-display.md` (Accepted)
**Date:** 2026-06-04

## Scope

Tests only (TDD red). Two surfaces:

1. **Seeder cap bump** — update the existing `capBlurb` cap assertions in `apps/seeder/test/description.test.ts` to the new `BLURB_MAX_CHARS === 2000` (ADR 0052 §5). `sanitizeDescription` tests unchanged.
2. **`<Blurb>` web component** — new `apps/web/test/components/blurb.test.tsx` pinning the testable behavior of the not-yet-written `apps/web/src/components/Blurb.tsx` (clamp + Read more/Read less toggle + Source link).

Out of scope for the Tester (Implementer / orchestrator own these): `apps/web/src/components/Blurb.tsx` / `Blurb.css`, `BookHeader.tsx` edit, `apps/seeder/src/description.ts` cap change, the e2e visual fixtures (`apps/web/e2e/visual/fixtures/index.ts`) and the `book-detail.png` baseline. None were touched.

## Coverage map

| Criterion (story AC) | Test name | Test file | Level |
|---|---|---|---|
| Long blurb → clamped + visible Read more | `renders a Read more control with aria-expanded=false when the blurb overflows` / `applies the clamp modifier class in the collapsed state` | `apps/web/test/components/blurb.test.tsx` | component |
| Read more expands inline → Read less, `aria-expanded` flips; Read less collapses | `flips to Read less with aria-expanded=true and removes the clamp on click` / `collapses again on a second click (Read less → Read more, clamp restored)` | `apps/web/test/components/blurb.test.tsx` | component |
| Short blurb (no overflow) → no control, full short blurb visible | `renders no Read more / Read less control when the clamped blurb does not overflow` / `still renders the full short blurb text` | `apps/web/test/components/blurb.test.tsx` | component |
| `openLibraryId` present → Source: Open Library external link to `https://openlibrary.org/works/{id}`, new tab, safe `rel` | `renders an external Source: Open Library anchor when openLibraryId is present` | `apps/web/test/components/blurb.test.tsx` | component |
| No `openLibraryId` → Source link absent (graceful) | `renders no Source link when openLibraryId is absent` | `apps/web/test/components/blurb.test.tsx` | component |
| Seeder cap raised 700 → 2000; `capBlurb` tests updated; `sanitizeDescription` unchanged | `pins the cap constant at 2000` + the over-cap / at-cap length assertions | `apps/seeder/test/description.test.ts` | unit |
| Collapsed right column ≤ cover (whitespace gone) | **Not unit-testable** (no layout in jsdom/happy-dom). Verified by the deliberate `book-detail.png` baseline — orchestrator's job, per ADR 0052 §6. | — | visual |

Edge cases covered beyond the AC:

- **No blurb at all** → component renders nothing (`renders nothing (no .bh-blurb) when there is no blurb`).
- **Source link is overflow-independent** → it renders with the toggle when the blurb overflows too (`renders the Source link independent of overflow (shown with the toggle too)`).
- **Seeder at-exact-cap (2000 chars)** returns unchanged (added to `returns text unchanged … when at or under the cap`).

## The measurement seam (documented for the Implementer)

ADR 0052 §2 detects overflow by reading `el.scrollHeight > el.clientHeight` on the `.bh-blurb` paragraph ref inside a `useLayoutEffect`, re-measured via a `ResizeObserver`. **happy-dom has no layout engine** — every element reports `scrollHeight === clientHeight === 0`, so a real measurement is always `0 > 0` → `false`, and the toggle would never render in tests.

The blurb tests therefore **stub the measurement at the DOM level**, not via a test-only prop:

- `stubOverflow(true|false)` defines `scrollHeight` / `clientHeight` getters on `HTMLElement.prototype` (configurable, restored in `afterEach`). `true` → `scrollHeight 400 > clientHeight 80`; `false` → `80 == 80`.
- A no-op `ResizeObserver` is installed in `beforeEach` (happy-dom ships none), so the component's observer wiring constructs/observes/disconnects without throwing.

**Assumption the Implementer must honor:** the component measures via a standard DOM read of `scrollHeight` / `clientHeight` on an `HTMLElement` (the ADR's ref seam). The stub is at the *prototype* level, so it applies whether the measured element is the `.bh-blurb` paragraph itself or a wrapper — no per-element wiring needed and **no test-only prop is required** (the ADR's preference: mock the DOM measurement, not add a prop). If the Implementer instead reads layout some other way (e.g. `getBoundingClientRect`), the seam assumption breaks and these tests would need a matching stub — but the ADR pins `scrollHeight`/`clientHeight`, so the prototype stub is the correct seam.

## Why the not-yet-existing module is a clean red, not a tsc wall

`Blurb.tsx` does not exist yet. A static `import { Blurb } from "../../src/components/Blurb"` would fail `tsc` (TS2307) and block CI's typecheck gate — a compile wall, not an assertion-level red. The test loads `Blurb` through an **opaque runtime specifier** (`await import(/* @vite-ignore */ "../../src/components/Blurb")`), mirroring `apps/seeder/test/_load.ts`. This hides the missing module from tsc's resolver, so:

- `pnpm -r typecheck` stays **clean** while `Blurb.tsx` is missing (confirmed below — all 11 projects Done), and
- each blurb test fails at the first `await loadBlurb()` with a readable `Failed to load url ../../src/components/Blurb. Does the file exist?` — an assertion-level red.

Once the Implementer creates `Blurb.tsx`, the dynamic import resolves and the tests exercise the real component. **No cleanup** is required: no `@ts-expect-error`, no shim to delete. (The Implementer may switch the loader to a plain static import once the module exists, but it is not required — the dynamic import works against the real module too.)

## Test infrastructure

- Runner: Vitest (workspace default). Web component tests under `apps/web/test/components/`, environment `happy-dom` + `@testing-library/react` + `@testing-library/jest-dom/vitest` (per `apps/web/vitest.config.ts` / `apps/web/test/setup.ts`).
- Seeder unit tests under `apps/seeder/test/`, loaded via the existing `_load.ts` opaque loader.
- No relay / Docker / network dependency. No real crypto. The component test mocks only DOM measurement (`scrollHeight`/`clientHeight`) and `ResizeObserver`.

## How to run

```
pnpm --filter @unbnd/seeder test
pnpm --filter @unbnd/web test
pnpm -r typecheck
```

## Verification

Confirmed RED for the right reason on 2026-06-04 (branch `story-53-blurb-display`).

### Seeder — `pnpm --filter @unbnd/seeder test`

```
FAIL test/description.test.ts > capBlurb > pins the cap constant at 2000
  expected 2000, received 700        (capBlurb's BLURB_MAX_CHARS is still 700)
FAIL test/description.test.ts > capBlurb > returns text unchanged (no ellipsis) when at or under the cap
  "a".repeat(2000) is ellipsized under the still-700 cap
Test Files  1 failed | 6 passed (7)
     Tests  2 failed | 49 passed (51)
```

All `sanitizeDescription` tests pass; all other `capBlurb` tests pass. The two reds are exactly the cap-pin and the at-cap (2000-char) assertion, which go green when the Implementer sets `BLURB_MAX_CHARS = 2000`. (The two `<= 2000` overflow-length tests pass under both 700 and 2000 — their inputs were lengthened to `"word ".repeat(800)` so they still genuinely overflow once the cap rises.)

### Web — `pnpm --filter @unbnd/web test`

```
FAIL test/components/blurb.test.tsx  (all 10 cases)
Error: Failed to load url ../../src/components/Blurb (resolved id: ../../src/components/Blurb). Does the file exist?
Test Files  1 failed | 52 passed (53)
     Tests  10 failed | 300 passed (310)
```

All 10 blurb cases red on the missing module (clean import-level red, not a vacuous pass). Every other web test passes.

### Typecheck — `pnpm -r typecheck`

```
Scope: 10 of 11 workspace projects
… apps/web typecheck: Done … apps/seeder typecheck: Done … apps/api typecheck: Done
(all 11 projects Done, clean)
```

The red set typechecks cleanly — the opaque-specifier loader keeps the missing `Blurb` module out of tsc's resolver.
