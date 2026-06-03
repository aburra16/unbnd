# Review: Story 39 — Visual-regression harness with committed screenshot baselines

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, fixtures, or baselines)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-39-visual-regression`, PR #82. Commits: `2c3d863` (harness), `146782e` (Linux baselines), with ADR `ed996b7` and the story draft `2813c3b` riding along.
**Story:** `engineering-team/stories/done/39-visual-regression-harness.md`
**ADR:** `engineering-team/decisions/0039-visual-regression-harness.md` (Accepted; refining ADR under umbrella 0038)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 2)
**Classification:** behavior-preserving test-infrastructure refactor. Flow PO → Architect → Implementer → Reviewer (no separate Tester; the harness IS the test infra). No standalone test plan.

## Verdict: **PASS** (APPROVED)

The diff stands up exactly the harness ADR 0039 specifies and nothing more. Determinism lives entirely in the test layer (Playwright route-mocking of `/api` + `/auth/**` from typed fixtures, served against the unmodified `vite preview` build). Production code is untouched: no `apps/web/src/**`, no `apps/api/**`, no `lib/api.ts`. The single config deviation (`vite.config.ts` `preview: { proxy: {} }`) is a build/test-config change that cannot affect any shipped artifact and does not regress real local use — adjudicated acceptable below. Every gate I ran myself is green; PR #82's `Visual regression` CI job is zero-diff success. All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS, zero errors.** All 10 workspace projects clean. `apps/web` now includes `e2e` in its tsconfig, so the fixtures are type-validated against `src/lib/api.ts` response types as part of this gate — they pass, proving fixture/API shape conformance mechanically.
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`. Vitest does NOT pick up the `e2e/` specs (its `include` is `test/**` + `src/**` only), so the unit `test` step stays fast and the count is unaffected.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build` succeed; 444 modules; emits `dist/assets/index-COIOkN-v.css` (47.64 kB). Same content-hashed filename as the Story-38 baseline, corroborating zero production CSS change.
- [x] **PR #82 CI** (`gh pr checks 82`): **all three jobs pass** — "Typecheck, test, build", "Validate Caddyfile", and **"Visual regression" (1m16s, zero-diff success)**. The visual gate is the one I cannot run locally (no Docker); CI status plus harness-code reasoning confirm it.
- [ ] _Lint not configured — skipped (house rules)._

The visual suite was not run locally (no Docker; baselines are Linux-canonical and only the pinned Playwright image is authoritative). Verified via CI status + code reasoning per the review brief.

---

## Spec adherence (per acceptance criterion)

| AC | Verdict | Evidence |
|---|---|---|
| Documented local command runs the suite against the built app (Playwright present as dev dep; command documented) | **PASS** | `apps/web/package.json` adds `test:visual` / `test:visual:update`; `@playwright/test 1.60.0` dev dep; `README.md` "Run it". |
| Committed baseline per screen; zero-diff against current `main` | **PASS** | 6 PNGs under `e2e/visual/visual.spec.ts-snapshots/`; CI `visual` job zero-diff success on PR #82. |
| CI job builds, serves, screenshots, fails on any pixel diff | **PASS** | `ci.yml` `visual` job in pinned image; `maxDiffPixelRatio: 0`; report uploaded. |
| Green-on-landing (zero-diff on current `main`) | **PASS** | `gh pr checks 82` → Visual regression pass. |
| Deterministic capture: pinned browser, animations off, fixed viewport + DSF; flake settings documented | **PASS** | `playwright.config.ts`: one Chromium project, `animations: 'disabled'`, `viewport 1280x800`, `deviceScaleFactor: 1`; threshold policy + controls in README. |
| Docs state the epic workflow (zero-diff refactor vs labeled baseline-update commit) | **PASS** | `README.md` "Workflow for the epic" documents both paths distinctly. |
| Zero production app behavior/styling/copy/IA change; only test infra + baselines + CI + docs | **PASS (with one adjudicated config deviation)** | No `src/**`, no `apps/api/**`, no `lib/api.ts`. The only build-config touch is `vite.config.ts preview.proxy` — adjudicated acceptable below. |

No acceptance criterion silently dropped.

## Enumerated changes (the "zero production change" audit)

18 files, all test/CI/docs/config layer:
- **New test layer:** `apps/web/e2e/visual/visual.spec.ts`, `fixtures/index.ts`, `README.md`, 6 baseline PNGs, `apps/web/playwright.config.ts`, `apps/web/.gitignore` (Playwright run-artifact ignores; baselines explicitly NOT ignored).
- **CI:** `.github/workflows/ci.yml` (+`visual` job).
- **Config touches:** `apps/web/package.json` (2 scripts + 1 exact-pinned dev dep), `apps/web/tsconfig.json` (add `e2e` + `playwright.config.ts` to `include` so fixtures typecheck), `apps/web/vite.config.ts` (the one deviation), `pnpm-lock.yaml`.
- **Docs:** ADR 0039, story 39.

**No `apps/web/src/**`, no `apps/api/**`, no `lib/api.ts`, no `tokens.css`/`base.css`, no `.tsx`.** Confirmed by `git diff --name-only`.

## The one deviation: `vite.config.ts` `preview: { proxy: {} }` — adjudication

**Verdict: acceptable test/build-config change. NOT a blocking violation of the zero-production-change constraint.**

Reasoning:
1. **It cannot affect anything that ships.** Production serves `apps/web/dist` via Caddy `file_server` (`apps/web/Dockerfile` copies `dist` → `/srv`; `deploy/Caddyfile` `root * /srv` + `file_server`, with Caddy reverse-proxying `/api` + `/auth` to `api:8787`). `vite preview` is never in the production path — it is dev/test tooling only. The setting touches no shipped artifact.
2. **The dev server is untouched.** `server.proxy` (used by `pnpm dev:web` on :5181, the documented dev loop) is unchanged. Only `preview` (the :4173 static-bundle server) is affected.
3. **Why it is necessary.** By default `vite preview` inherits `server.proxy`, which would forward `/api` and `/auth` to `localhost:8787`. The harness needs an empty preview proxy so Playwright route-mocks intercept the data fetches and `/auth/welcome` (a client SPA route sharing the `/auth` prefix) falls through to `index.html` instead of 500-ing against a dead API.
4. **It does not regress any real `pnpm preview` use.** `vite preview` exists to smoke-test the production bundle; the production bundle is served statically by Caddy with its own proxy, so emptying preview's proxy makes `pnpm preview` behave closer to production, not worse. There is no documented workflow that runs `vite preview` against a live dev API. The change is well-commented and scoped to `preview` only.

This is a config seam in the build/test layer, not a production-code seam. ADR 0039's Option-A "zero production-code change" is about `src/**` / `apps/api` / `lib/api.ts`, all of which are untouched. The deviation is within the spirit and letter of the constraint.

## ADR 0039 adherence

- **Option A (route-mocking) implemented as specified.** `mockApi(page, { auth })` installs `**/auth/**` and `**/api/**` handlers before navigation; signed-out `/auth/me` returns a 401-shaped body so `useSession` resolves signed-out; unmapped `/api/*` returns the documented empty-valid default (fails closed). No production seam taken (Option B/D rejected, as recorded).
- **Fixtures typed against `lib/api.ts`.** `fixtures/index.ts` imports `BookTags`, `ForYou`, `HomepageShelves`, `ProfileMeta`, `ProfileStatsResponse`, `PublicBook`, `PublicUser`, `RatingsSummary`, `SearchResult`, `Shelf` — all confirmed exported. The `e2e` tsconfig inclusion makes a shape change a typecheck error. Verified.
- **All fixture books omit `coverUrl`** (the `book()` factory sets no cover; `coverUrl?` is optional on `PublicBook` and the search-hit type), so the deterministic token-gradient placeholder renders and no external `covers.openlibrary.org` image loads. Confirmed.
- **Sentinels are ready-state, not loading/error.** For all 6:
  - Home: `.shelf-title` "Recently added" is inside the `state.status === "ready"` branch (`Home.tsx:117,157`); loading/error use `.route-status`.
  - BookDetail: `.bh-title` from `BookHeader` (rendered on ready; loading/error use `.route-status`).
  - Profile: `.me-name` with text "Fixture Curator" — only from `meta.displayName` (`displayNameOf`); the fallback is a short npub, so a failed profile fetch would not match → fails loudly. Sits after the `notFound` guard.
  - Search: `.search-count` only in the `ready` branch (`Search.tsx:87,89`); loading="Searching…", idle/error use `.route-status`.
  - AuthWelcome: `.auth-card-title` "You're in" — unconditional static content.
  - Submit: `.dc-title` — at-rest static duplicate-check prompt (no fetch at rest).
  Each would fail the visible-assertion (not silently capture a blank) if its fixture were missing.
- **Capture determinism:** `maxDiffPixelRatio: 0` (true zero-diff, not a loose threshold), `animations: 'disabled'`, `viewport 1280x800`, `deviceScaleFactor: 1`, one Chromium project, `snapshotPathTemplate` pinned to a single non-OS-suffixed path. Matches the ADR.
- **CI wiring:** `visual` is a sibling job in `ci.yml` (not a separate workflow), runs in `mcr.microsoft.com/playwright:v1.60.0-jammy`, no Postgres, uploads the report. The `test` job and `staging.yml` are unchanged (`staging.yml` not in the diff). The visual suite is not wired into `pnpm -r test`. Confirmed.
- **`FIXTURE_NPUB` decodes** as a valid npub (the ADR's illustrative value had a bad checksum; the implementer's corrected constant decodes via `nip19.decode`, and the Profile spec resolves to a rendered profile in CI rather than NotFound).

## House rules

- **No new tooling beyond Playwright.** Lockfile adds only `@playwright/test@1.60.0` (+ transitive `playwright`/`playwright-core@1.60.0`, darwin-optional `fsevents@2.3.2`). Pinned **exact** (no caret), matching the version-pin house-rule pattern. ADR 0038 sub-decision 2 is the authority. Confirmed.
- **No AI-slop.** Grep of the README, spec, fixtures, and config comments for em dashes and banned filler verbs / rhetorical contrasts: none found. README is ASCII-hyphen only and documents the canonical Linux/Docker capture command and the two-path epic workflow.
- **Brand tokens / icons / trust-tiers / crypto:** N/A — no `src/**`, no token sheet, no crypto surface touched.
- **PRD §11.3 scope:** untouched. Developer-facing test infrastructure only; approaches no out-of-scope product surface.
- **Architecture invariants (POV-first / decentralized-first / filter-at-view-time):** respected — the ADR's rationale for route-mocking over a seeded backend is precisely POV-first (a real backend cannot produce a stable per-POV baseline).
- **Scope:** no token/primitive/icon/motion/layout/guard work. Only harness + CI + docs + the one vite deviation. Confirmed.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **CI report-upload uses `if: always()` and adds a `visual-snapshots` artifact step**, where ADR 0039's illustrative job shape used `if: failure()` and no snapshot-upload step. This is a benign, additive, well-commented change (it lets the first-run Linux baselines be retrieved during bootstrap and always preserves the report). Not a deviation that weakens the gate; noted only because it differs from the ADR's example YAML. No action.
2. **Fixtures are a test-layer parallel of `apps/api` response shapes.** They are typed against `lib/api.ts` so a *structural* shape change is a typecheck error, but a *semantic* divergence (a field the API now always sends) would not surface. The ADR records this as accepted debt for a same-pixels gate. No action for this story.
3. **`fsevents@2.3.2` (darwin-only) entered the lockfile** as a Playwright optional transitive. Harmless; standard pnpm handling. No action.

## Scope / firewall
Engineering-only review. No product/PRD-scope change. No Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. `apps/web/src/**`, all components, all app fixtures (`apps/web/src/data/*`, `lib/view-model.ts`), the data layer, and the API are untouched.

---

## Verdict: **PASS / APPROVED**

Story 39 is mergeable as committed on PR #82. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
