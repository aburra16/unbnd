# Story 69: CI/deploy action version bump (Node-20 deprecation)

**Status:** Done
**Created:** 2026-06-06
**Type:** Chore (refactor — no product behavior change)
**Path:** Lite (Implement + Review; verified by CI on push — no architecture, no unit tests). Date-bound: GitHub Actions default to Node-24 from 2026-06-16 and remove Node-20 on 2026-09-16; bump the GitHub-authored JS actions off the deprecated Node-20 runtime.

Anchor: `product-team/prd/social-loop.md` §8.1 (the date-bound CI/deploy action bump).

## What changed
The GitHub-authored JavaScript actions ran on the deprecated Node-20 runtime. Bumped to their current node24 majors across `.github/workflows/ci.yml`, `staging.yml`, `publish-tapestry-data-layer.yml`:
- `actions/checkout@v4 → @v5`
- `actions/setup-node@v4 → @v5`
- `actions/upload-artifact@v4 → @v6` (node24 by default; runner ≥ 2.327.1)

Third-party actions (`pnpm/action-setup@v4`, `docker/*@v6/@v3`, `appleboy/ssh-action@v1.2.0`) are already at current majors and are maintained by their authors; left unchanged.

## Acceptance criteria
- [ ] No GitHub-authored action remains on the Node-20 runtime (checkout/setup-node/upload-artifact bumped to node24 majors).
- [ ] CI gates (typecheck, test, build, Validate Caddyfile) and the staging deploy run green on the bumped versions.

## Verification
Local gates (`pnpm -r typecheck && pnpm -r test && pnpm --filter @unbnd/web build`) are unaffected (the bump is workflow-yaml only) and stay green. The authoritative verification is the CI run on push / the merge to `main` (the deploy pipeline) — Actions cannot run locally.

## Linked artifacts
- ADR: none (chore, no architectural decision).
- Test plan: none (no unit-testable behavior; CI is the test).
- Review: `engineering-team/reviews/69-ci-action-version-bump.md`
