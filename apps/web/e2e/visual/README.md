# Visual-regression harness

This harness captures one full-page screenshot per key screen and fails CI on
any pixel diff against the committed baseline. It is the proof gate for epic
0001: every "same pixels, better structure" refactor must produce a zero-diff
run. Governing decision: `engineering-team/decisions/0039-visual-regression-harness.md`.

## Pinned versions

| Item | Version |
|---|---|
| `@playwright/test` | `1.60.0` (exact, no caret) |
| Capture / CI image | `mcr.microsoft.com/playwright:v1.60.0-jammy` |

The image tag must match the `@playwright/test` pin. Bump both together. A
version bump can change browser rendering and may require a baseline refresh
(a labeled commit, see below).

## Run it

```bash
pnpm --filter @unbnd/web test:visual
```

The Playwright `webServer` builds `apps/web` and serves the static bundle with
`vite preview` on `http://localhost:4173`. `VITE_API_URL` is left unset, so the
app issues same-origin `/api` and `/auth` requests, which the harness
intercepts. The HTML report (with expected, actual, and diff images on a
failure) is written to `apps/web/playwright-report`.

## How content is made deterministic

The screens render live, point-of-view-dependent data, so a real backend cannot
produce a stable baseline. The harness serves the unmodified production build
and supplies fixed content entirely in the test layer:

- `fixtures/index.ts` holds typed fixture objects, checked against the response
  types exported from `src/lib/api.ts`. An API shape change surfaces as a
  typecheck error here.
- `mockApi(page, { auth })` installs two `page.route` handlers before
  navigation. `**/auth/**` resolves `/auth/me` (signed-out by default, so
  `useSession` resolves to signed-out). `**/api/**` matches the request against
  the route map and fulfills with the corresponding fixture; an unmapped path
  returns a documented empty-but-valid default so an unanticipated fetch fails
  closed rather than reaching a real network.
- Every fixture book omits `coverUrl`, so the deterministic token-gradient
  cover placeholder renders and no external `covers.openlibrary.org` image
  loads.

Each spec waits for a content sentinel (a ready-state selector) before
capturing, so a missing or wrong fixture fails the assertion loudly instead of
screenshotting a spinner.

## Determinism controls

- **Pinned browser.** One Chromium project at the version the pinned
  `@playwright/test` ships, reproduced via the matching Docker image tag.
- **Animations frozen.** `toHaveScreenshot({ animations: 'disabled' })`.
- **Fixed viewport and device scale factor.** `1280x800`, DSF `1`. A fixed DSF
  prevents Retina-vs-CI divergence.
- **Single Linux baseline.** `snapshotPathTemplate` is pinned so a baseline
  filename carries no OS suffix. Only Linux baselines exist and only Linux ever
  compares.

### Threshold policy

`maxDiffPixelRatio` is `0` (true zero-diff). Zero-diff is the intent. Any
non-zero threshold is a documented, evidence-backed minimum that the canonical
Linux environment proved necessary, recorded in `playwright.config.ts` with the
reason. It is never a comfort margin, because a loose threshold defeats the
gate.

## Canonical capture environment

Screenshots captured on macOS differ at the pixel level from the same screen on
Linux. Baselines are generated and updated only inside the pinned Playwright
Docker image, so the committed PNGs always match what CI renders.

```bash
docker run --rm --network host -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-jammy \
  pnpm --filter @unbnd/web test:visual:update
```

Run this from the repo root. Local-host runs (`pnpm --filter @unbnd/web
test:visual`) are for iterating on a spec, never for committing baselines.

## Fixture identifiers

These are fixture constants, never real catalog data, so they never drift with
the live catalog (`fixtures/index.ts`):

- Book slug: `the-fixture-novel`
- Profile npub: `npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme`
  (the all-zero pubkey, a valid-bech32 fixture)
- Search query: `fixture`

## Captured screens

`/`, `/book/the-fixture-novel`, `/profile/<fixture-npub>`, `/search?q=fixture`,
`/auth/welcome`, `/submit`. All are captured signed-out. Logged-in variants and
a second narrow viewport are clean future additions the `mockApi` helper and
route map already admit.

## Workflow for the epic

There are two paths, kept as distinct, auditable events.

**A behavior-preserving refactor (the common case).** The story changes
structure only and must produce a zero-diff `test:visual` run. Do not touch the
baselines. CI's `visual` job is the gate. A non-zero diff means the refactor
changed pixels and is not behavior-preserving. Fix the refactor; do not update
the baseline to absorb the diff.

**An intentional visual change (rare).** A deliberate token-value change,
reviewed against the brand rules, produces a correct new render. Regenerate the
affected baseline with the Docker `test:visual:update` command and commit it in
its own clearly labeled commit, separate from any structural change, with a
message stating the intended visual delta and the brand-rule review. The
reviewer diffs the PNG change deliberately.
