# Story 39: Visual-regression harness with committed screenshot baselines

**Status:** Draft
**Created:** 2026-06-03
**Type:** Refactor

## Background

Epic 0001 (Accepted) makes `apps/web` overhaul-ready as a staged sequence of behavior-preserving refactors. Its core operating principle is "same pixels, better structure": every later story (color tokens, type, spacing, primitives, motion, layout) must change internal structure while rendering byte-identical output. Type-checks and unit tests do not prove pixels are unchanged. Without a mechanism that proves it, "no visual change" is a claim a reviewer takes on trust, and trust-only enforcement is exactly what let the current token drift accumulate (ADR 0038, audit section: the live `--u-bg`/`--u-line`/`--u-danger` references that silently fall back).

This story is epic story 2: the proof gate the rest of the epic depends on. It stands up the mechanism, captures baselines from the current `main`, and wires a CI gate that fails on any pixel diff. It does not change any app styling or behavior; that is what makes it a clean baseline.

ADR 0038 sub-decision 2 ("Visual-regression testing to prove 'no visual change'") was **approved by the user on 2026-06-03**: adopt Playwright's screenshot assertions (`toHaveScreenshot`) as a dev dependency plus a dedicated CI job. That approval is the authority for the one tooling addition this story makes, satisfying the `CLAUDE.md` house rule "No new lint/typecheck/build tooling without an ADR." This story introduces no other tooling.

Phase classification: Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum. It changes no product behavior and no PRD claim. Governing ADR: 0038 (umbrella). A refining ADR for this story is expected, because the harness design carries a real open question (below) that is the Architect's to resolve.

## User-facing description

As an Unbnd engineer, I want a Playwright visual-regression harness with committed screenshot baselines for the key screens, wired into CI to fail on any pixel diff, so that every "same pixels, better structure" refactor in this epic proves zero visual change as an enforced gate rather than a reviewer's claim.

This is developer-facing infrastructure. No Reader, Curator, or Author sees any difference. The rendered app is identical before and after this story; that identity is precisely what the harness will capture as its first baseline.

## Acceptance criteria

Testable from the outside.

- [ ] Given the workspace, when an engineer runs the documented command to execute the visual-regression suite locally, then Playwright runs the screenshot assertions against the built `apps/web` and reports pass or per-screen diffs. (Playwright is present as a dev dependency; the command is documented in the repo.)
- [ ] Given the agreed key-screen set, when the suite runs against the current `main`, then a committed baseline screenshot exists for each screen in the set and the run is zero-diff (the baselines were captured from this same `main`).
- [ ] Given a pull request, when CI runs, then a visual-regression job builds `apps/web`, serves it, runs the Playwright screenshot assertions, and fails the job on any pixel diff against the committed baselines.
- [ ] Given the current `main` with no app change, when the visual-regression CI job runs, then it passes (zero-diff against the fresh baselines), so the gate is green the moment it lands.
- [ ] Given capture configuration, when the suite runs in CI and locally, then capture is deterministic: the browser version is pinned, animations are disabled during capture, and the viewport and device scale factor are fixed; the chosen flake-mitigation settings (for example a diff threshold or font-rendering controls) are documented alongside the command.
- [ ] Given the epic's later refactor stories, when an engineer reads the harness documentation, then it states the workflow: a behavior-preserving refactor must produce a zero-diff run, and an intentional visual change updates the affected baseline in its own clearly labeled commit (separate from any structural change).
- [ ] Given this story's diff, when it is reviewed, then it changes no production app behavior, styling, copy, or information architecture; the only additions are test infrastructure, baselines, CI wiring, and documentation. (If reaching deterministic screen content turns out to require any production-code seam, that does not land here; it is escalated per the open question below.)

## Key-screen set (confirmed against the router)

Routes confirmed in `apps/web/src/App.tsx`. The harness captures one canonical screen per epic-relevant surface:

- Home — route `/` (`Home`).
- Book detail — route `/book/:slug` (`BookDetail`); needs one canonical slug.
- Profile — route `/profile/:npub` (`Profile`, public profile); needs one canonical npub. (`/profile/me` is the logged-in variant and is a candidate for a later addition; the public profile is the baseline screen.)
- Search — route `/search` (`Search`); needs a canonical query and result set.
- Auth / welcome — route `/auth/welcome` (`AuthWelcome`).
- Submit — route `/submit` (`Submit`).

The Architect may add or split screens (for example a logged-in vs logged-out home, or `/auth` method-select alongside `/auth/welcome`) when resolving the open question, since the route's data dependency drives how stably it can be captured. The set above is the agreed starting contract.

## DList shapes touched

None. This is front-end test infrastructure, not a DList-shaped change. ADR 0038 records that the Tapestry branch survey does not apply to this design-system work; the governing prior art is in-repo (`packages/trust` package and CI-guard conventions, and the existing `.github/workflows/ci.yml` `test` job that this story's job sits beside).

## Out of scope

None of the following may grow into this story.

- Any token, primitive, icon, motion, or layout work. This story changes no app styling and no app behavior. Those are epic stories 3 and later (repo Stories 40+).
- Any CI guard test (the `readFileSync` literal-sweep guards). Guards ship in the same story as the sweep they protect, never here. This story's CI addition is the screenshot job only.
- Ideally any production app-code change at all. The intended end state is that production code is untouched. If making a screen deterministic for capture appears to need a production-code change (for example a test-only data seam), that is escalated to the Architect under the open question below, not designed or implemented here.
- Authoring or changing app copy, visuals, or information architecture.
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" rule or any other doc rule; that is epic story 14.
- Visual-regression coverage of every screen. The set above is the agreed key-screen contract; broader coverage is a later refinement, not this story.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving test infrastructure and does not approach the §11.3 line.

## Open questions

### Central open question for the Architect (do not solve in this phase)

**How does the harness get deterministic screen content without a live backend, while changing zero production code?** The key screens fetch from `/api` (and `/auth/*`) through `apps/web/src/lib/api.ts`, whose base URL is environment-driven (`import.meta.env`). Screenshot stability requires the rendered content to be fixed across runs, but the served build pulls live, POV-dependent, time-varying data. A book's displayed rating, the curators shown, the search results, and a profile's surface are all per-POV and change as events arrive (per the `CLAUDE.md` POV-first invariant), so a real backend cannot produce a stable baseline.

Options to evaluate (Architect's call, expected to produce a refining ADR):
- Playwright route-mocking of `/api` and `/auth/*` at the network layer (touches no production code; fixtures live in the test layer).
- A fixture or seed mode that serves canned data (assess against the "zero production-code change" constraint; if it needs a production seam, that cost must be weighed and ADR-recorded).
- Static fixtures committed to the test layer and served to the built app.
- A docker-composed deterministic backend seeded with fixed data in CI.

Hard constraint on the answer: **production code should not change to serve tests.** Approaches that keep the determinism entirely in the test/CI layer are preferred. If the Architect concludes a minimal production seam is unavoidable, that is an explicit ADR decision with its tradeoff stated, not a silent implementation choice.

### Supporting questions (feed the same gate)

- The canonical slug, npub, and search query for the book-detail, profile, and search baselines depend on the determinism approach chosen above (a mock fixture, a seeded record, or a static fixture). The Architect picks these as part of resolving the central question.
- Logged-in versus logged-out state for screens that branch on auth (home, profile, submit). Whether the baseline captures one state or both is a harness-design decision tied to how content is made deterministic.

## Dependencies

- Repo Story 38 (epic story 1, `@unbnd/ui` package scaffold) — **merged** (`done/38-scaffold-ui-package.md`). The harness exists to protect the refactors that build on that package.
- Requires the Architecture phase next. ADR 0038 sub-decision 2 is approved (Playwright adopted), but the harness design itself, and specifically the determinism approach in the central open question, needs an Architect decision and is expected to produce a refining ADR before implementation.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella; sub-decision 2 approved 2026-06-03). A refining ADR on harness design is expected from the Architecture phase.
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 2).
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
