# Review: Story 38 — Scaffold the `@unbnd/ui` package and consume existing tokens from it

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code or tests)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-38-ui-scaffold`, PR #81. Implementer commit `55cbfd7` (the scaffold + token move + story doc); the Accepted ADR 0038 + epic 0001 + Story-37 review ride along from `0c74d1e` (not yet on `main`).
**Story:** `engineering-team/stories/38-scaffold-ui-package.md`
**ADR:** `engineering-team/decisions/0038-design-system-architecture.md` (§7 package shape; epic story 1)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md`
**Classification:** behavior-preserving refactor, "Impl→Reviewer" lean tier (Architecture covered by ADR 0038; Test-Design skipped by approval). No standalone test plan.

## Verdict: **PASS** (APPROVED)

The diff does exactly what the story claims and nothing more. The package shape matches `@unbnd/trust` precisely; the token sheet is a pure `R100` rename with zero content change; `apps/web` consumes it through the package `exports` map; the old in-app copy is gone with no lingering references in code or HTML. Every gate I ran myself is green. The load-bearing behavior-preserving claim is **proven, not trusted**: I built both `main` and the branch and the emitted web CSS bundle is **byte-identical** (same md5, same content-hashed filename). No scope creep — no primitives, no new token axes, no guard, no `base.css` touch, no copy/behavior change. All findings below are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS, zero errors.** All 10 workspace projects done clean, including the new `packages/ui` (`tsc --noEmit`).
- [x] `pnpm --filter @unbnd/ui test` — **PASS.** `test/tokens.test.ts` → 2 passed (1 file). Smoke test asserts the file ships from the package and carries the three core brand tokens; vitest 2.1.9.
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, no regressions. The `ECONNREFUSED ::1:3000` / `:3000` stderr is the pre-existing caught `useTrustView`/`api.trust.status()` noise documented in the Story-36 review (item 2) — caught, not a failure; the file count and pass count are deterministic.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build` succeed; 444 modules; emits `dist/assets/index-COIOkN-v.css` (47.64 kB, md5 `bd0642a358be3dcbab867496a409f4f9`).
- [x] **Byte-identical CSS proof (the load-bearing check).** Built `origin/main` (`eee79df`) in a clean worktree with `--frozen-lockfile`: it emits the **same** `index-COIOkN-v.css`, **same size**, **same md5 `bd0642a3…`**, and `diff` of the two bundles exits `0`. The relocation changes nothing rendered. Author's "same content hash" claim verified.
- [x] PR #81 CI (`gh pr checks 81`): **both jobs pass** — "Typecheck, test, build" and "Validate Caddyfile". My local run is the source of truth and agrees.
- [ ] _Lint not configured — skipped._

---

## Spec adherence (per acceptance criterion)

| AC | Verdict | Evidence |
|---|---|---|
| `pnpm -r typecheck` passes incl. new `@unbnd/ui` with a `typecheck` script | **PASS** | Ran it; 10/10 clean; `packages/ui/package.json` has `"typecheck": "tsc --noEmit"`. |
| `pnpm -r test` passes incl. `@unbnd/ui` (Vitest, minimal set ok) | **PASS** | `@unbnd/ui` 2/2 green; web 300/300 green; `package.json` has `"test": "vitest run"`. |
| `apps/web` build succeeds consuming the token sheet from `@unbnd/ui` | **PASS** | Build green; `main.tsx:4` imports `@unbnd/ui/styles/tokens.css`. |
| `packages/ui/package.json`: `@unbnd/ui`, `private`, `type: module`, `main`/`types`/`exports`→ raw `./src/index.ts` no build step, `react`/`react-dom` as **peer** deps | **PASS** | All present (`package.json:2,3,5,6,7,8`). `react`/`react-dom` under `peerDependencies` (not `dependencies`). No `build` script. |
| `apps/web/package.json` includes `"@unbnd/ui": "workspace:*"` | **PASS** | `apps/web/package.json:19`. Lockfile links it to `../../packages/ui`. |
| App entry imports the token sheet from `@unbnd/ui`, not local | **PASS** | `apps/web/src/main.tsx:4` `import "@unbnd/ui/styles/tokens.css";`. |
| Relocated sheet identical token-for-token to the previous one | **PASS** | `git diff` shows `R100` (similarity 100%), empty body. Byte-identical. |
| `apps/web/src/styles/tokens.css` removed (one source of truth) | **PASS** | File absent (`ls` → No such file); rename moved it. `base.css` untouched and still present. |
| Pre-existing `apps/web` suite stays green | **PASS** | 300/300, same as `main`. |
| Render visually identical (manual confirmation is the proof; no VR gate yet) | **PASS (mechanical proof stronger than required)** | Byte-identical emitted CSS bundle + green build. Operator manual render confirmation is the story's stated proof; the byte-identical bundle makes a pixel change impossible by construction. |
| `@unbnd/ui` shape matches `@unbnd/trust` conventions (no build step, raw `src` export, `workspace:*`, same `package.json`/`tsconfig`/`vitest` layout) | **PASS** | `tsconfig.json` and `vitest.config.ts` are **byte-identical** to `packages/trust`. `package.json` matches the trust template (private, `0.0.0`, `type: module`, raw export, `test`+`typecheck` scripts), with the only deltas being the intentional, story-required ones (peer deps instead of trust's crypto runtime deps; added `./styles/tokens.css` subpath export). |

No acceptance criterion silently dropped.

## ADR adherence (§7 package shape)

- Matches ADR 0038 §7 verbatim: `"@unbnd/ui"`, `private`, `type: module`, `main`/`types`→`./src/index.ts`, an `exports` map, scripts `test` (`vitest run`) + `typecheck` (`tsc --noEmit`), `react`/`react-dom` as peers, `vitest`+`typescript` dev deps, **no build step**, raw `./src/index.ts` consumed through Vite bundler resolution.
- CSS delivery matches §7: the token sheet ships from the package and `apps/web` imports it once at the app entry, replacing the in-app copy.
- `pnpm-workspace.yaml` already globs `packages/*` — no workspace-config change, as the ADR predicted (confirmed: not in the diff).
- The diff implements **only** epic story 1 (the beachhead). Everything ADR/epic defers — two-tier tokens, new axes, primitives, icon registry, motion, layout, guards, the genre-palette de-triplication, the `CLAUDE.md`/`AGENTS.md` re-point — is absent, as required.

## Subpath-export resolvability

- `packages/ui/package.json` `exports["./styles/tokens.css"]` → `"./styles/tokens.css"`, which is a real file (`packages/ui/styles/tokens.css`, 1054 bytes, 44 lines).
- `apps/web/node_modules/@unbnd/ui` is a workspace symlink to `packages/ui`, so Vite resolves the subpath through the `exports` map. The authoritative proof is the **green web build that imports it** — it succeeds and emits the expected CSS. (A bare `node -e require.resolve('@unbnd/ui/styles/tokens.css')` from the repo root fails, but that is a CJS-resolver artifact — Node's CJS loader does not load `.css` and the repo root is not inside a node_modules path. It is not a defect in the export map; Vite, the real consumer, resolves it correctly, as the build proves.)

## Scope / single-source-of-truth / lingering-reference audit

- `git diff --stat origin/main...HEAD`: 13 files. Source-code touch is exactly two pointer lines (`apps/web/package.json` dep, `apps/web/src/main.tsx` import) + the `R100` token-sheet rename. The rest is the new `packages/ui/*` scaffold, the lockfile link, the story doc, and the Accepted ADR 0038 / epic 0001 / Story-37 review riding from `0c74d1e`. **No primitives, no new tokens, no guard, no `base.css` change, no behavior/copy change.**
- Grepped the whole repo for `styles/tokens.css`: every remaining hit is in **docs/ADRs/old stories** (historical text, and ADR 0038 §Consequences explicitly defers the `CLAUDE.md`/`AGENTS.md` re-point to epic story 14). **No source `.ts/.tsx/.css`/`.html` still references the old path.** The only live code reference is the new `@unbnd/ui/styles/tokens.css` import in `main.tsx`.
- Lockfile diff is exactly the `@unbnd/ui` workspace link in `apps/web` + the `packages/ui` importer entry (peers resolve to the existing `react`/`react-dom 18.3.1`; dev deps to existing `typescript`/`vitest`). **No new third-party package pulled in.**

## House rules

- **No new tooling.** Reuses pnpm workspaces, Vitest, `tsc` only. ADR-gated rule honored.
- **Version pinning (the story's open question, adjudicated).** `@unbnd/ui` matches the `@unbnd/trust` precedent: `^` on `typescript`/`vitest` dev deps, `version: "0.0.0"`. The exact-pin rule (`CLAUDE.md`, anchored in ADR 0002) is about **crypto** libraries; `@unbnd/ui` has no crypto deps. Matching the in-repo precedent for consistency is the right call. **Acceptable.**
- **No hand-rolled crypto.** N/A — the package has no crypto surface (peers are `react`/`react-dom` only).
- **Brand tokens are the visual source of truth.** Strengthened, not weakened: there is now exactly one token sheet, and it is a byte-identical move.
- **No AI-slop.** The two files this story authored (`packages/ui/src/index.ts` placeholder comment, `packages/ui/test/tokens.test.ts`) and the story doc carry no em dashes, no banned filler verbs, no rhetorical contrasts. The em dashes that appear in the diff are confined to ADR 0038 + epic 0001, which were authored and **Accepted** in the prior commit (`0c74d1e`) and gated at their own approval; they are governing inputs to this story, not strings this story ships.
- **PRD §11.3 scope:** untouched. No payments, file hosting, ebook sales, bounty, social feed, reading progress, federation, or notifications. Developer-facing infrastructure only.
- **Architecture invariants (POV-first / decentralized-first / filter-at-view-time):** N/A — presentation-layer packaging, no data path.

## `src/index.ts` placeholder check

`export {};` with a documented comment explaining the beachhead and what arrives in later epic stories. Intentional and acceptable: there is no JS API yet, and **nothing imports a JS symbol from `@unbnd/ui`** (the only consumption is the CSS subpath import in `main.tsx`). The empty `export {}` keeps the file a module under `isolatedModules`. Correct.

## Test-integrity audit

- `git show --stat 55cbfd7`: the Implementer commit authored the new test file (`packages/ui/test/tokens.test.ts`) alongside the scaffold; this is the lean Impl→Reviewer tier (Test-Design skipped by approval), so a single Implementer commit is expected. No pre-existing test was skipped, deleted, or weakened (web suite 300/300, same as `main`).
- The smoke test is **not tautological**: it `readFileSync`s the relocated sheet and asserts three real token values (`--u-amber: #C4763C`, `--u-ink: #1A1A2E`, `--u-parchment: #FAF6F0`) plus existence at the **package** path. If the relocation had dropped a token or shipped the file from the wrong place, it would fail. Minimal, but it pins the story's actual deliverable.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **pnpm lockfile lists `react`/`react-dom` under `packages/ui` `dependencies`.** This is pnpm's standard handling of peerDependencies (it installs peers locally so the package can typecheck/test in isolation); the `package.json` correctly declares them as `peerDependencies`. No action — noted so a future reader does not mistake it for a regular-dep regression.
2. **`exports` subpath is `.css`-only besides `.`.** Fine for the beachhead. As primitives land, the package will grow component CSS exports; keep the `exports` map the single resolution authority (don't reintroduce deep relative imports into `apps/web`). Future-story guidance, not a defect here.
3. **Web test stderr noise (`ECONNREFUSED :3000`)** is inherited from the pre-existing `useTrustView` un-mocked status call (already filed in the Story-36 review). Not introduced here; not a CI risk. No action for this story.

## Scope / firewall
Engineering-only review. No product/PRD-scope change. No Unbnd business/grant/community rationale touched. Diff approaches none of PRD §11.3. `base.css`, all components, all fixtures, the data layer, and the API are untouched.

---

## Verdict: **PASS / APPROVED**

Story 38 is mergeable as committed at `55cbfd7` (PR #81). Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` to `done/`), left in the working tree unstaged for the human.
