# ADR 0039: Visual-regression harness — Playwright route-mocking, Linux-canonical baselines

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/done/39-visual-regression-harness.md`

**Approved 2026-06-03** at the architecture gate. Gate decisions confirmed: (1) Playwright pinned to the current stable at implementation time with the matching `mcr.microsoft.com/playwright:v<version>-jammy` image tag, both recorded in the README; (2) threshold starts at `maxDiffPixelRatio: 0` (true zero-diff), loosened only with recorded evidence; (3) logged-out-only baseline this story, logged-in variants a clean later addition.

This is a refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03). It resolves the harness-design open question the story carries; it does not relitigate 0038. ADR 0038 sub-decision 2 already approved the one tooling addition this work makes (Playwright `toHaveScreenshot` as a dev dependency plus a dedicated CI job). The epic is `engineering-team/epics/0001-design-system-overhaul-ready.md`; this is epic story 2, the proof gate the rest of the epic depends on.

## Context

Epic 0001 is a staged sequence of behavior-preserving refactors whose operating principle is "same pixels, better structure": stories 3 through 14 (color, type, spacing, breakpoints, motion, primitives, icons, layout, theming) each change internal structure while rendering byte-identical output. Type-checks (`pnpm -r typecheck`) and unit tests (`pnpm -r test`) do not prove pixels are unchanged. ADR 0038's audit found the smoking gun for trust-only enforcement: live `--u-bg` / `--u-line` / `--u-danger` references in `AuthorEdit.css`, `AuthorBadge.css`, `ClaimControl.css` that silently fall back, accumulated because "no visual change" was a reviewer's claim, never a gate. This story stands up the gate, captures baselines from current `main`, and wires CI to fail on any pixel diff. It changes no app styling or behavior; that identity is what the first baseline captures.

### The central constraint and why it is hard

The key screens render live, point-of-view-dependent, time-varying data. All app data flows through one seam: `apps/web/src/lib/api.ts`. `authFetch()` (line 271) calls the native `fetch` against `` `${base}${path}` `` where `base = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "")` (line 3). Every call targets an absolute same-origin path: `/api/*` (catalog, ratings, tags, search, profile, shelves, homepage, foryou, trust) and `/auth/*` (`/auth/me`, signup, login, nostr challenge/verify). In a production build with `VITE_API_URL` unset, every request is same-origin to `/api` and `/auth`.

A baseline must be reproducible across runs. A real backend cannot produce one, by the `CLAUDE.md` POV-first invariant: a book's displayed rating, the curators shown, the search result set, and a profile's surface are all per-POV aggregates that change as events arrive. Two observers can correctly see two different ratings for the same book. So the harness must serve **fixed** content without a live backend, and per the story's hard constraint, **production code must not change to serve tests**.

The fetch fan-out per screen is wide, not one call. Investigated directly:

- **Every screen** renders `<Nav>`, which calls `useSession()` → `GET /auth/me` (`apps/web/src/hooks/useSession.ts`), and `SearchBox`, which calls `GET /api/search` on keystroke (no fetch at rest).
- **Home** (`routes/Home.tsx`): `GET /api/books?limit=18`, `GET /api/tags`, `GET /api/homepage/shelves`, `GET /api/foryou`, plus `PoVBar`/`useTrustView` → `GET /api/trust/status`.
- **BookDetail** (`routes/BookDetail.tsx`): `GET /api/books/:slug`, `GET /api/books/:slug/tags`, `useTrustView` → `GET /api/trust/status`, `RatingsPanel` → `GET /api/books/:slug/ratings`.
- **Profile** (`routes/Profile.tsx`): `GET /api/profile/:npub/shelves`, `/stats`, `/claimed-books`, `useProfileMeta` → `GET /api/profile/:npub`, `FollowButton` → `GET /api/profile/follows/:target`.
- **Search** (`routes/Search.tsx`): `GET /api/search?q=…` for `q.length >= 2`.
- **AuthWelcome** (`routes/AuthWelcome.tsx`): no fetch. Static content inside `<Nav>` is the only data dependency.
- **Submit** (`routes/Submit.tsx`): no fetch at rest (search-first; `DuplicateCheck` fetches only on input), `useSession` via `<Nav>`.

A further determinism trap found in the code: `BookCard` renders `<img className="book-cover-img" src={book.coverUrl} alt="" loading="lazy" />` (`components/BookCard.tsx:34`), and real `coverUrl`s point at external `covers.openlibrary.org`. An external image is a network dependency and a flake source. The fixtures resolve this by omitting `coverUrl` on every fixture book, so the deterministic token-gradient cover placeholder renders (`coverFrom`/`coverTo`/`coverInk` from `view-model.ts`), which is exactly the output the later color-token story must hold stable anyway.

### Constraints that bind this design

- **Production code must not change to serve tests** (story hard constraint; if a seam were unavoidable it is an explicit, escalated ADR decision, see Decision below — it is not needed).
- **No new tooling beyond Playwright** (ADR 0038 sub-decision 2 is the only approved addition; `CLAUDE.md` "no new lint/typecheck/build tooling without an ADR").
- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- **`main` stays shippable**; the job must be green (zero-diff) the moment it lands on current `main`.
- In-repo prior art governs (ADR 0038): the `@unbnd/trust` package shape and the `readFileSync`-grep CI guard pattern (`packages/trust/test/architecture.test.ts`). The Tapestry branch survey does not apply — this is front-end test infrastructure, no DList shape.

### Verified current state

- `apps/web` builds to static assets via `pnpm --filter @unbnd/web build` (`tsc --noEmit && vite build`) and previews with `vite preview --port 4173` (`apps/web/package.json`). The prod Dockerfile serves `apps/web/dist` from Caddy. The build is a static SPA; serving it for capture needs no backend.
- `@unbnd/ui` is already a dependency of `apps/web` and `main.tsx` imports `@unbnd/ui/styles/tokens.css` — Story 38 (epic story 1) has merged, as the story's dependency states.
- CI is a single workflow `.github/workflows/ci.yml` with a `test` job (typecheck, `pnpm -r test`, build web; Postgres service) and a `caddyfile` job. `staging.yml` deploys on CI success. No Playwright anywhere in the lockfile today.
- The web vitest suite uses `happy-dom` and a `test/setup.ts`; there is no existing E2E/browser-test layer and no existing `fetch` mock harness to extend.

## Options considered

### Option A — Playwright route-mocking of `/api` + `/auth/*` at the network layer (CHOSEN)

The Playwright test serves the **unmodified** production build (`vite preview`) and, before each navigation, installs `page.route('**/api/**', …)` and `page.route('**/auth/**', …)` handlers that fulfill every request from committed JSON fixtures. The app's `fetch` calls are intercepted by the browser context; the app receives canned, fixed responses and renders deterministically. A catch-all handler returns a documented default (for `/auth/me`, a signed-out 401-shaped body so `useSession` resolves to `signed-out`; for any unmapped `/api` path, an empty-but-valid shape) so an unanticipated fetch fails closed to a known state rather than hanging or hitting a real network.

- Pros: touches **zero production code** — the entire determinism story lives in the test layer, which is exactly the story's preferred outcome. Fixtures are plain committed JSON owned by the test suite. The interception sees the full fan-out (Nav `/auth/me`, `useTrustView` `/api/trust/status`, panel sub-fetches) uniformly via glob patterns, so adding a screen does not mean hand-stubbing each call. No backend, no Docker, no Postgres in the visual job. Matches the in-repo principle that the web app only ever talks to its own `/api` + `/auth` seam.
- Cons: the fixtures must cover the real fan-out, so a fixture set that is too thin renders an error/loading state instead of the intended screen (mitigated: each spec asserts a content sentinel is visible before `toHaveScreenshot`, so a missing fixture fails the test loudly rather than capturing a blank). Fixtures are a parallel source of truth for response shapes that can drift from `apps/api` (mitigated: fixtures are typed against the exported response types in `lib/api.ts` so a shape change is a typecheck error in the test).

### Option B — A fixture/seed mode in the app

Add an app-level flag (env var or query param) that swaps `lib/api.ts` to return canned data, or a build mode that bundles fixtures.

- Pros: deterministic content with no per-test wiring; the same path could power local demos.
- Cons: **violates the hard constraint** — it is a production-code seam. It puts test concerns into `lib/api.ts` (the most load-bearing module), creates a branch that ships in the bundle, and risks the seam being reachable in production. It also weakens the proof: the harness would be capturing a code path that is not the real one, so "same pixels" would be proven against fixture-mode rendering, not the shipped fetch path. Rejected: the determinism belongs in the test layer, and Option A delivers it there at no production cost. (If a seam were ever genuinely unavoidable, ADR 0038 and the story require it be an explicit, escalated decision with its tradeoff stated — it is not, so none is taken.)

### Option C — Static fixtures served to the built app

Serve the built SPA behind a tiny static file server that also answers `/api/*` and `/auth/*` from on-disk JSON.

- Pros: no production change; conceptually simple; the app makes real same-origin requests answered by files.
- Cons: introduces a second served process (the fixture file server) and its own routing layer — a small piece of bespoke infrastructure to build and maintain, plus a port-coordination and readiness problem in CI. Path-parameterized routes (`/api/books/:slug`, `/api/profile/:npub/shelves`) need real route matching in that server, reinventing what `page.route` glob patterns already give us inside Playwright. It also cannot vary a response by test (logged-in vs logged-out `/auth/me`) without per-run server state. Rejected: strictly more moving parts than Option A for the same determinism, and the route-matching/auth-state variation is free in Option A.

### Option D — A docker-composed seeded backend in CI

Stand up `apps/api` + Postgres + the data layer in CI, seeded with fixed data, and screenshot against it.

- Pros: captures the true end-to-end render path against a real backend.
- Cons: cannot produce a stable baseline — by POV-first, the trust-weighted aggregates (ratings, trending, favorites, tag consensus) are recomputed and shift as the seed/GrapeRank evolves, which is precisely what the story flags as making "a real backend cannot produce a stable baseline." It is also the heaviest CI option (the data layer is strfry + Neo4j + Meilisearch + GrapeRank + Postgres), slow, and flaky on timing. Rejected: directly defeats the determinism requirement and is the most expensive path.

## Decision

We choose **Option A: Playwright route-mocking of `/api` and `/auth/*` at the network layer.** It is the only option that delivers reproducible screen content with **zero production-code change**, keeping the entire determinism mechanism in the test/CI layer as the story requires. No production seam is taken; the open question resolves to "no seam needed." Options B and D are recorded to show why a production seam and a real backend were rejected (B violates the hard constraint and weakens the proof; D cannot produce a stable baseline). Option C is rejected as strictly more infrastructure than A for the same result.

### Where Playwright and the suite live

Playwright is a **`devDependency` of `apps/web`**, not the root. Rationale: the package owns the build (`pnpm --filter @unbnd/web build`), owns the existing test surface (vitest under `apps/web/test/`), and is the only thing the harness screenshots. This matches the repo convention that each package owns its own dev tooling (`vitest` lives per-package). It keeps a heavy browser-download dependency out of the packages that do not need it. The suite is **separate from the vitest unit suite** — Playwright is an E2E runner with its own config and must not be swept into `vitest run` (which `pnpm -r test` invokes). The visual suite runs only via its own dedicated script and CI job.

Layout (all new, all test-layer):

```
apps/web/
  playwright.config.ts            # E2E config: webServer (vite preview), pinned project, capture defaults
  e2e/
    visual/
      visual.spec.ts              # one test per key screen; route-mocks then toHaveScreenshot
      fixtures/
        index.ts                  # typed fixture objects (against lib/api.ts response types) + the route map
        api/                      # JSON bodies per endpoint (books, tags, ratings, homepage, foryou, trust-status, profile, search)
        auth/                     # me (signed-out + signed-in variants)
      visual.spec.ts-snapshots/   # COMMITTED baselines, Playwright's default sibling dir; Linux-only PNGs
```

`apps/web/package.json` gains:

```jsonc
"scripts": {
  "test:visual": "playwright test --config=playwright.config.ts",
  "test:visual:update": "playwright test --config=playwright.config.ts --update-snapshots"
},
"devDependencies": {
  "@playwright/test": "1.48.2"   // pinned exact, no caret, per CLAUDE.md crypto/version-pin house rule pattern
}
```

The unit-test `test` script stays `vitest run`; the visual suite is **not** wired into `pnpm -r test`, so the existing `test` CI step is unchanged and stays fast. The version above is the canonical pin; the Implementer pins to the latest stable `@playwright/test` at implementation time and pins the matching browser, then records both in the ADR's "New dependency" line and in the docs.

### The determinism decision in detail (the central question)

1. `playwright.config.ts` defines a `webServer` that runs `pnpm --filter @unbnd/web build` then `vite preview --port 4173` (or reuses an already-built `dist`), with `baseURL: 'http://localhost:4173'`. The served bundle is the **unmodified** production build. `VITE_API_URL` is left unset so the app issues same-origin `/api` + `/auth` requests, which Playwright intercepts.
2. A shared `mockApi(page, { auth })` helper installs two route handlers before navigation:
   - `page.route('**/auth/**', …)` — fulfills `/auth/me` from the chosen auth fixture (signed-out by default), and returns the documented default for any other `/auth/*` path.
   - `page.route('**/api/**', …)` — matches the request path against the typed route map and fulfills with the corresponding JSON fixture; unmapped paths return the documented empty-but-valid default.
   Both run before `page.goto`, so the first paint already has canned data.
3. Each spec navigates, **waits for a content sentinel** (a stable selector/text proving the ready state rendered, never the loading/error state), then calls `await expect(page).toHaveScreenshot('<screen>.png')`. The sentinel makes a missing or wrong fixture fail loudly instead of capturing a spinner.

This is the resolution: deterministic content with no live backend and **no production-code change**.

### Cross-platform baseline strategy (the single biggest risk)

Screenshots captured on macOS (dev) differ at the pixel level from the same screen rendered on Linux (CI): different font stacks, hinting, and anti-aliasing. If baselines were captured on macOS and compared in Linux CI, every run would diff. The decision:

**The canonical capture environment is Linux, via Playwright's official pinned Docker image, and that is the only environment where baselines are generated or updated.** Concretely:

- Baselines are generated and updated **inside `mcr.microsoft.com/playwright:v<version>-jammy`** (the image tag must match the pinned `@playwright/test` version), never on a dev machine's host OS. A developer updating a baseline runs the documented Docker command (below), so the committed PNGs are always Linux-rendered and match what CI renders.
- CI runs the visual job **in that same Playwright Docker image** (`container:` in the job), so the comparison environment is byte-for-byte the capture environment.
- Playwright's snapshot path template is pinned so the committed filenames are **not** platform-suffixed in a way that splits baselines per-OS. Because only Linux baselines exist and only Linux ever compares, a single committed baseline per screen is correct. (`snapshotPathTemplate` in config fixes the path; we do not maintain macOS baselines at all.)

The documented update command (in the harness README the story requires):

```bash
docker run --rm --network host -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v<pinned>-jammy \
  pnpm --filter @unbnd/web test:visual:update
```

This is stated as the canonical capture environment so baselines are reproducible. Local-host runs (macOS) are for *iterating* on a spec, never for committing baselines; the docs say so explicitly.

### Determinism controls

Set in `playwright.config.ts` and asserted in the docs:

- **Pinned browser:** one project only, **Chromium**, at the version bundled with the pinned `@playwright/test`. No Firefox/WebKit project (more browsers means more baselines for no benefit to a same-pixels gate). The browser binary is whatever the pinned Playwright version ships, reproduced via the matching Docker image tag.
- **Animations disabled:** `toHaveScreenshot({ animations: 'disabled' })` (Playwright freezes CSS animations/transitions and finishes them). This is independent of, and complementary to, the epic's later `prefers-reduced-motion` work.
- **Fixed viewport + device scale factor:** `use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }`. A fixed DSF prevents Retina-vs-CI 2x/1x divergence. A second narrow viewport (e.g. 390-wide) is **out of scope** for this story's baseline contract and a later refinement.
- **Font/loading stability:** capture full-page (`fullPage: true`) only after fonts are ready and the content sentinel is visible; the Docker image carries a fixed font set so glyph rendering is stable run-to-run. Fixtures omit `coverUrl` so no external `covers.openlibrary.org` image loads (the token-gradient placeholder renders), removing the largest network/timing flake. Any unavoidable remaining sub-pixel jitter is absorbed by the threshold below.
- **Diff-threshold policy:** start strict and only loosen with evidence. `toHaveScreenshot` defaults: `maxDiffPixelRatio` set to a small documented value (start at `0`, i.e. zero-diff, and raise to a tiny ratio such as `0.001` only if the canonical Linux environment proves a stable sub-pixel floor; record the chosen value and why in the config and docs). `threshold` (per-pixel color sensitivity) left at the Playwright default unless evidence requires. The policy is "zero-diff by intent; any threshold is a documented, evidence-backed minimum, not a comfort margin" — a loose threshold would defeat the gate.

### Canonical fixtures (slug / npub / query per screen)

Fixed identifiers, consistent with the route-mock approach. These are fixture constants, never real catalog data, so they never drift with the live catalog:

- **Home** `/` — `/api/books?limit=18` returns a fixed list of fixture books (no `coverUrl`); `/api/tags` a fixed genre taxonomy; `/api/homepage/shelves` a fixed `trending`/`favorites`/`genres`; `/api/foryou` `{ state: "anonymous", books: [] }`; `/api/trust/status` `{ enabled: false, hasScores: false, canPersonalize: false }`. Auth: signed-out.
- **BookDetail** `/book/the-fixture-novel` — canonical slug **`the-fixture-novel`**. `/api/books/the-fixture-novel` a fixed `PublicBook` (no cover), empty `claimants`/`authorProvided`; `/api/books/the-fixture-novel/tags` fixed consensus; `/api/books/the-fixture-novel/ratings` a fixed `RatingsSummary` with a fixed `average`/`count` and a small fixed `ratings` array; `/api/trust/status` as above. Auth: signed-out.
- **Profile** `/profile/<canonical-npub>` — canonical npub **`npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsrdfm9`** (a fixture npub, never a real user; the Implementer fixes one valid-bech32 npub constant and uses it everywhere). `/api/profile/:npub` a fixed `ProfileMeta` (fixed `displayName`, no `picture` so the deterministic `Avatar` initials/gradient renders); `/api/profile/:npub/shelves` fixed shelves of cover-less books; `/stats` fixed honest counts; `/claimed-books` a fixed (possibly empty) list; `/api/profile/follows/:target` `{ following: false }`. Auth: signed-out (public-profile baseline, per the story's "public profile is the baseline screen").
- **Search** `/search?q=fixture` — canonical query **`fixture`**. `/api/search?q=fixture` a fixed `SearchResult` with a fixed `total` and a fixed `hits` array (cover-less), small enough that no "Load more" timing matters. Auth: signed-out.
- **AuthWelcome** `/auth/welcome` — no data fetch; renders static content. Auth: signed-out (its content is unconditional).
- **Submit** `/submit` — search-first; the at-rest screen is the `DuplicateCheck` search prompt inside the form shell. No fetch at rest. Auth: signed-out (the form's signed-out note is part of the deterministic baseline).

**Logged-in vs logged-out:** this story captures **logged-out only**, as the agreed baseline contract. Reason: logged-out is the unconditional state every screen can render without a session, the public Profile is explicitly the baseline per the story, and a single auth state keeps the first baseline set minimal and unambiguous. The `mockApi` helper takes an `auth` option and the route map already supports a signed-in `/auth/me` fixture, so a later story can add logged-in variants (logged-in Home, `/profile/me`, signed-in Submit) by adding specs — no rework. That extension is **out of scope here** and noted as a clean future addition.

### The CI job

A **new job `visual` added to the existing `.github/workflows/ci.yml`**, not a separate workflow. Rationale: it must gate the same pushes/PRs as `test`, `staging.yml` already keys off the `CI` workflow's success (`workflow_run: workflows: ["CI"]`), and a sibling job keeps one source of truth for "is this commit green." A separate workflow would fragment the gate and force a second `workflow_run` wiring. Shape:

```yaml
  visual:
    name: Visual regression
    runs-on: ubuntu-latest
    timeout-minutes: 15
    container:
      image: mcr.microsoft.com/playwright:v<pinned>-jammy   # matches @playwright/test pin
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @unbnd/web build
      - run: pnpm --filter @unbnd/web test:visual    # playwright webServer runs `vite preview`; route-mocks supply data
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: apps/web/playwright-report, retention-days: 7 }
```

- Running **inside the Playwright Docker image** is what makes CI's render environment identical to the canonical capture environment, so committed Linux baselines compare zero-diff. No browser-install step is needed (the image carries them); the `container:` image is the cross-platform fix in one line.
- No Postgres service and no data layer — Option A needs no backend, so the visual job is independent of the `test` job's Postgres service.
- On diff, the job fails and uploads the Playwright HTML report (expected/actual/diff PNGs) as an artifact for the reviewer.
- **Green-on-landing:** because baselines are captured from this same `main` inside the same Docker image, the job is zero-diff the moment it lands. The Implementer's procedure: build on the target `main`, generate baselines via the documented Docker update command, commit them, and confirm a fresh `test:visual` run is zero-diff before the PR is opened.

### The epic workflow (how later stories use the gate)

Documented in the harness README this story adds:

- **A behavior-preserving refactor (epic stories 3–14, the common case):** the story changes structure only and **must produce a zero-diff `test:visual` run**. The author does **not** touch the baselines. CI's `visual` job is the gate; a non-zero diff means the refactor changed pixels and is not behavior-preserving — it fails and must be fixed, not papered over by updating the baseline.
- **An intentional visual change (rare; a deliberate token-value change reviewed against brand rules):** the new render is correct, so the affected baseline is regenerated via the documented Docker `test:visual:update` command and committed **in its own clearly labeled commit**, separate from any structural change, with a message stating the intended visual delta and the brand-rule review. The reviewer diffs the PNG change deliberately. This keeps "structure changed, pixels held" and "pixels intentionally changed" as two distinct, auditable events — never blended.

## Consequences

- Turns "no visual change" from a reviewer's claim into an enforced CI gate, which is the proof mechanism epic stories 3–14 depend on. Every later refactor story can prove zero-diff mechanically.
- Establishes a Playwright E2E layer in `apps/web`, separate from the vitest unit layer, with its own config, scripts, and CI job. This is new test surface, scoped to visual regression; broadening it to functional E2E is not implied and not in scope.
- Adds a CI job that runs in a Docker container and downloads no browsers at run time. The `test` job and `staging.yml` are unchanged; the new job is a sibling gate under the same `CI` workflow.
- Baselines are committed Linux PNGs. They are binary artifacts in the repo; their size is small (six cover-less, gradient-placeholder screens at 1280×800, DSF 1). Updating one is a deliberate, labeled commit.
- **New debt / follow-ups:** the fixtures are a test-layer parallel of `apps/api` response shapes; they are typed against `lib/api.ts` exports so a shape change surfaces as a typecheck error, but a *semantic* divergence (a field the API now always sends) would not. Acceptable for a same-pixels gate; noted. Logged-in capture variants and a second (narrow) viewport are clean future additions the helper already admits. The pinned Playwright/browser version must be bumped in lockstep with the Docker image tag when upgraded, and a version bump may require a baseline refresh (a labeled commit) if the browser's rendering changes — documented in the README.
- **Affects existing fixtures?** No. The app's data fixtures (`apps/web/src/data/*`, `lib/view-model.ts`) are untouched. This story's fixtures are new, live entirely under `apps/web/e2e/visual/fixtures/`, and are test-only.
- **New dependency?** Yes — `@playwright/test` as a **dev** dependency of `apps/web`, pinned exact (no caret). This is the single tooling addition already approved by ADR 0038 sub-decision 2; no dependency beyond it is introduced. The Implementer pins to the current stable `@playwright/test` and the matching `mcr.microsoft.com/playwright:v<version>-jammy` image tag, recording both.
- **PRD section change required?** No. This changes no product behavior and no PRD claim. It is Phase 2 platform hardening (extends PRD §2.11 / Block E per ADR 0038), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (all additions are test/CI/docs-layer; no `.ts/.tsx/.css` under `apps/web/src`, no `apps/api`, no `lib/api.ts` change):

- **Dependency:** add `"@playwright/test": "<pinned-exact>"` to `apps/web/package.json` `devDependencies`. Pin exact. Record the version and the matching Docker image tag here and in the README.
- **Config:** `apps/web/playwright.config.ts` — `testDir: 'e2e'`; one Chromium `project`; `use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }`; `webServer: { command: 'pnpm --filter @unbnd/web build && pnpm --filter @unbnd/web preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }`; `expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0 /* see threshold policy */ } }`; pin `snapshotPathTemplate` so baselines are single, Linux-only, not OS-split.
- **Spec:** `apps/web/e2e/visual/visual.spec.ts` — one `test()` per screen (`/`, `/book/the-fixture-novel`, `/profile/<fixture-npub>`, `/search?q=fixture`, `/auth/welcome`, `/submit`). Each: `await mockApi(page, { auth: 'signed-out' })`; `await page.goto(<route>)`; `await expect(page.locator(<content sentinel>)).toBeVisible()`; `await expect(page).toHaveScreenshot('<screen>.png', { fullPage: true })`. The sentinel must select the ready-state content (e.g. a shelf title on Home, the book title on BookDetail), never the `route-status` loading/error text.
- **Fixtures + route map:** `apps/web/e2e/visual/fixtures/index.ts` — typed fixture objects imported against the response types exported from `apps/web/src/lib/api.ts` (`PublicBook`, `RatingsSummary`, `BookTags`, `HomepageShelves`, `ForYou`, `ProfileMeta`, `Shelf`, `ProfileStatsResponse`, `SearchResult`, `PublicUser`, etc.), plus `mockApi(page, opts)` installing the two `page.route` handlers with a catch-all default (`/auth/me` → signed-out body; unmapped `/api/*` → empty-valid shape). All fixture books omit `coverUrl`. Use the fixed canonical slug/npub/query constants from the Decision.
- **Baselines:** committed under `apps/web/e2e/visual/visual.spec.ts-snapshots/` (Playwright default), generated and updated **only** inside `mcr.microsoft.com/playwright:v<pinned>-jammy` via the documented Docker `test:visual:update` command. Capture from the target `main` so the job is zero-diff on landing.
- **CI:** add the `visual` job to `.github/workflows/ci.yml` exactly as shaped above (`container:` the matched Playwright image; checkout → pnpm/node → install → build web → `pnpm --filter @unbnd/web test:visual`; upload the report on failure). Do **not** add it to the `test` job's steps and do **not** wire the visual suite into `pnpm -r test`.
- **Docs:** a short harness README (e.g. `apps/web/e2e/visual/README.md`) covering: the run command, the canonical Linux/Docker capture environment and the update command, the determinism controls and threshold policy, the fixture identifiers, and the two-path epic workflow (zero-diff refactor vs labeled-commit baseline update). Copy is reviewed against `memory/feedback_unbnd_copy_and_visual.md` — no em dashes, no rhetorical contrasts, no filler.

## Out of scope

- Any token, primitive, icon, motion, or layout change. This story changes no app styling and no app behavior (epic stories 3+).
- Any CI literal-sweep guard test (`readFileSync` grep guards). Those ship with the sweep they protect, never here. This story's only CI addition is the `visual` job.
- Logged-in capture variants (logged-in Home, `/profile/me`, signed-in Submit) and a second narrow viewport — clean future additions the `mockApi` helper and route map already admit; not captured now.
- Functional/interaction E2E coverage. The Playwright layer here is visual-regression only.
- Visual coverage of every screen. The six-screen set is the agreed key-screen contract; broader coverage is a later refinement.
- Any production-code seam. None is taken; the determinism is entirely in the test layer (Option A). If a future screen genuinely cannot be made deterministic without a seam, that is a new explicit ADR decision at that time, not assumed here.
- Re-pointing the `CLAUDE.md` / `AGENTS.md` brand-token rule (epic story 14) and authoring a PRD addendum (post-Phase-2).
