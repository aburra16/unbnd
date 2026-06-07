# Review: Story 69 — CI/deploy action version bump (Lite path)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (workflow YAML only)
**Story:** `engineering-team/stories/done/69-ci-action-version-bump.md`

> Lite path (chore, no product behavior change): no ADR, no unit tests. The authoritative gate is the CI run on push and the staging deploy on merge — GitHub Actions cannot run locally.

## Correctness
- [x] The bumps match the current node24 majors per GitHub's deprecation guidance: `actions/checkout@v4 → @v5`, `actions/setup-node@v4 → @v5`, `actions/upload-artifact@v4 → @v6` (node24 by default; runner ≥ 2.327.1, which GitHub-hosted runners meet).
- [x] All GitHub-authored JS actions are off the Node-20 runtime (no `@v4` of those three remains across `ci.yml`, `staging.yml`, `publish-tapestry-data-layer.yml`).
- [x] Third-party actions (`pnpm/action-setup@v4`, `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/build-push-action@v6`, `appleboy/ssh-action@v1.2.0`) are at current majors and author-maintained — correctly left unchanged.
- [x] The diff is workflow-YAML only — no source, so `pnpm -r typecheck/test/build` are unaffected and remain green.

## Things to watch on the CI run (post-merge)
- The `visual` job's `actions/upload-artifact@v6` (v4→v6 is a larger jump than the others). Basic upload/download is stable across v4–v6, but confirm the `visual-snapshots` artifact upload step still succeeds on the first run.
- The Node-20 deprecation warnings should disappear from the bumped jobs.

## Findings

### Blocking
None.

### Non-blocking
1. If the CI run shows `upload-artifact@v6` behaves unexpectedly, `@v5` (also node24 in its latest minor) is the fallback. Verify on the first post-merge run.

## Verdict
**PASS** — the version bumps are correct per the deprecation guidance and scoped to the GitHub-authored actions; source gates unaffected. Mergeable; CI + the staging deploy are the authoritative validation on push.
