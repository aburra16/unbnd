# Review: Story 6 — Staging deployment

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff <main>..HEAD` on `deploy/staging` (ADR 0007 → impl `5645e5f`).

## Quality gates (run by reviewer)

- [x] `pnpm -r typecheck` — pass.
- [x] `pnpm -r test` — pass (schemas 69, api 160 + 10 skipped, web 19).
- [x] `pnpm --filter @unbnd/web build` — pass.
- [x] `pnpm --filter @unbnd/api bundle` — pass; the bundle **runs** (`node dist/index.js` reaches `loadConfig` and fails only on missing env), proving `@unbnd/schemas` TS was inlined and there is no runtime module-resolution failure. This was the one real packaging risk and it is verified.
- [~] **`docker build` / `docker compose up` NOT run** — no Docker daemon in this environment. Image builds, TLS provisioning, and the live stack are exercised on the droplet at go-live. The compose/Dockerfiles/workflow are authored and reviewed by hand; the Actions YAML is validated by GitHub on push.

## Process note (infra story)

This story has no app-behavior code, so the red-tests Test Design phase was folded into implementation: the testable risk (the esbuild bundle running) is verified locally; the rest is verified by execution on the droplet (runbook + go-live checklist). No contrived failing unit tests for Dockerfiles. Flagged so the skipped phase is explicit, not silent.

## Spec adherence

- [x] **AC-1** API multi-stage Dockerfile (esbuild bundle → node:22-slim) + static web build. Bundle verified runnable.
- [x] **AC-2** `docker-compose.prod.yml` runs caddy + api + tapestry (incl. strfry) + db + search on one host.
- [x] **AC-3** Caddy terminates TLS for `$SITE_ADDRESS` with an auto-provisioned cert; Caddy auto-redirects HTTP→HTTPS for a named site. (Cert issuance verified at go-live once DNS resolves.)
- [x] **AC-4** All config via env; `.env.production.example` documents every key with no values; no `.env` committed (`git ls-files` clean).
- [~] **AC-5** The keypair *mechanism* is specified (audited `scripts/generate-keypair.js`; only hex pubkey to config; nsec off-server). **The generation itself is a go-live step**, not yet executed.
- [x] **AC-6** Migrations run on API start (existing ADR 0002/0003 behavior); a fresh droplet Postgres self-migrates.
- [x] **AC-7** `.github/workflows/deploy.yml` triggers on `workflow_run` after **CI** succeeds on `main`, SSHes via `secrets.{DROPLET_HOST,DROPLET_USER,SSH_PRIVATE_KEY}`, `up -d --build`. Concurrency-guarded. (End-to-end firing verified once secrets + droplet exist.)
- [~] **AC-8** Live sovereign flow — **go-live verification** (needs the droplet). Tracked in the runbook's Verify section + the gated relay test.
- [x] **AC-9** `NODE_ENV=production` is set for the api service, so the existing `isProduction` cookie path (`Secure`) is exercised. `__Host-`/rate limiting correctly deferred to cycle 5.

## ADR adherence

- [x] Matches ADR 0007: Caddy auto-TLS, esbuild bundle on node:22-slim, one prod compose, GitHub Actions → SSH build-on-droplet, internal service-name networking, only Caddy exposing 80/443.
- [x] `esbuild` added as a **devDependency** with a dedicated `bundle` script (CI keeps `tsc --noEmit` as the typecheck gate) — exactly the authorized tooling change.
- [x] `OWNER_PUBKEY` for the data-layer image is wired to `LIBRARIAN_PUBKEY`, as the ADR specified.

## Things tests can't catch

- [x] No secrets committed; `.env.production.example` holds only blank keys + comments; `.dockerignore` excludes `node_modules`/`dist`/tests/engineering-team from the build context.
- [x] No app source changed → no behavior risk to the merged stories 4/5a.
- [x] Prod compose does **not** publish db/strfry/neo4j/search ports — only Caddy is reachable. Good default posture.
- [N] **strfry not publicly exposed** — the runbook's optional `STRFRY_TEST_URL` relay test must run from within the droplet (or with a temporary port open). Documented.
- [N] **esbuild full-bundle assumption** — all API deps proved bundleable (the bundle runs). If a future dep resists, mark it `--external` and ship its `node_modules` entry (noted in ADR consequences).

## House rules

- [x] No new lint/typecheck/build tooling beyond the ADR-authorized `esbuild`.
- [x] No PRD scope creep; staging only, launch concerns explicitly deferred.
- [x] Bridging/no-slop not applicable (no user-facing copy added).

## Findings

### Blocking
None for the artifacts.

### Non-blocking / go-live checklist (story stays open until done)
1. **Generate + set secrets** (AC-5): backup key, librarian keypair (hand nsec to operator), DB/relay passwords → `gh secret set` for `DROPLET_*`/`SSH_PRIVATE_KEY`; write `/opt/unbnd/.env`.
2. **Droplet + DNS:** provision Docker (runbook §1), install the deploy key, clone to `/opt/unbnd`, A record `staging.unbnd.ink` → IP.
3. **Confirm `unbnd/tapestry-data-layer:latest` is pullable** on the droplet; else build/push from the Tapestry repo first.
4. **First deploy + verify AC-8:** sovereign sign-in → rate → read-back over HTTPS against live strfry.

## Verdict
**PASS** for the deployment artifacts — they are correct, complete, and the one locally-verifiable risk (the API bundle) runs. The story is **not yet retired**: AC-5 (keypair generation), AC-7 (CD firing), and AC-8 (live sovereign flow) are go-live steps that require the droplet. Merge to `main` (so the CD workflow and clone source exist), then execute the go-live checklist; mark the story Done after AC-8 is confirmed on `staging.unbnd.ink`.
