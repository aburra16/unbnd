# Review: Story 63 — Up-sync sync-health monitoring (Block E)

**Story:** `engineering-team/stories/done/63-upsync-monitoring.md`
**ADR:** `engineering-team/decisions/0062-upsync-monitoring.md`
**Test plan:** `engineering-team/stories/done/63-upsync-monitoring.test-plan.md`
**PR:** #108 — branch `story-63-upsync-monitoring`, head `c247b4a`
**Reviewer:** independent (fresh context)
**Date:** 2026-06-05

## Verdict: PASS

A best-effort, bounded, graceful-degrading up-sync sync-health signal that matches
ADR 0062 §1–6 exactly. The load-bearing correctness property (a down/unreachable
dcosl reads as `unknown`, never a false `in-sync`) holds and is pinned by tests.
The existing query exports, dual-publish, cron, and `/health` + `/health/data` are
untouched. All gates green. Scope is API-only.

## Gates (run independently)

| Gate | Command | Result |
|---|---|---|
| API tests | `pnpm --filter @unbnd/api test` | **851 passed**, 10 skipped (was 827 passed at red `bcb3080` → +24 newly green; 29 total in the 3 new files, 5 of which passed red as the unchanged-`queryRelayUrl` + non-flap baselines) |
| New Story-63 files | scoped run of the 3 files | **29 passed (29)** — `upsync.test.ts` 16, `query-checked.test.ts` 6, `health-sync.test.ts` 7 |
| Full monorepo tests | `pnpm -r test` | All packages green, no regressions (api 851, librarian 40, promoter 32, indexer 26, seeder 121, shelves 26, …) |
| Typecheck | `pnpm -r typecheck` | All 12 packages `Done` |
| API build | `pnpm --filter @unbnd/api build` | Clean (`tsc`, no output) |
| PR checks | `gh pr checks 108` | Typecheck/test/build **pass**, Validate Caddyfile **pass**, Visual regression **pass**. PR head == local HEAD (`c247b4a`). |

## Test integrity

- `git diff bcb3080 HEAD -- '**/*.test.ts'` is **EMPTY** — no test was modified,
  weakened, or deleted between the tester's red set (`bcb3080`) and the green head
  (`c247b4a`). The green commit added only `src/` (+ config/index/runbook/docs).
- Files changed `bcb3080~1..HEAD`: `config.ts`, `health/upsync.ts`, `index.ts`,
  `nostr/query.ts`, `routes/health.ts`, `ops/sync-runbook.md` (+ the 3 test files
  that landed in the red commit, untouched since).
- The degrade tests assert the right contract, not a hollow one: the dcosl-fail
  case (`upsync.test.ts:161`) asserts both `status === "unknown"` AND
  `status not.toBe("in-sync")` — the explicit anti-false-positive guarantee.

## `checkUpsyncBacklog` correctness (the load-bearing logic) — `apps/api/src/health/upsync.ts`

Verified line-by-line against ADR 0062 §2, reasoned independently:

- **Unreachable-vs-in-sync resolution (the critical property): CONFIRMED.** Every
  no-signal path returns `status:"unknown"` with a reason, never `in-sync`/
  `backlog:0`:
  - `readDcosl === null` OR `librarianPubkey === null` → `unknown`, `reason:"dcosl/
    librarian not configured"`, **no reads attempted** (L81–87; tests assert
    `readLocal`/`readDcosl` not called).
  - `!local.ok` (failed local read) → `unknown`, `reason:"local relay read failed"`
    (L100–102) — never a backlog off a failed local read.
  - `!dcosl.ok` (timed-out/errored dcosl read) → `unknown`, `reason:"dcosl read
    failed/timeout"` (L120–127). **A down dcosl cannot read as healthy.**
- **Units: CONFIRMED.** `since = Math.floor((now() - windowMs) / 1000)` — seconds
  (L91, comment notes nostr `created_at` is seconds). `oldestUnpropagatedAgeMs =
  now() - oldestMissingSec * 1000` (L137,141) — `created_at` seconds × 1000 → ms,
  consistent with the ms clock. Test `upsync.test.ts:156` pins `NOW_MS −
  oldestMissingSec*1000`.
- **Local read shape: CONFIRMED.** `{ kinds:[39999], "#z":[<…:book-ratings>,
  <…:book-tag-assertions>], since, limit }` (L94–99). Both `#z` handles built from
  `librarianPubkey` at call time (L89–90; `HEADER_KIND = 39998`). No hardcoded
  npub/hex.
- **dcosl read keyed on local ids: CONFIRMED.** `readDcosl({ ids: localIds })`
  (L116,119) — exact membership form, self-bounded since `localIds.length ≤ limit`.
- **`capped = localEvents.length >= limit`** (L105), carried through every branch.
- **Empty local window → `in-sync`, dcosl not consulted** (L108–114).
- **Diff:** `dcoslIds = new Set(...)`, `missing = localEvents.filter(!has)`;
  `missing.length === 0 → in-sync`, `> 0 → backlog: missing.length` (L130–145).
- **Purity: CONFIRMED.** No `Date.now()` or real network inside the function — all
  reads + clock are injected. Test `upsync.test.ts:276` asserts the injected clock
  is used for the age math.

## `queryRelayUrlChecked` + unchanged exports — `apps/api/src/nostr/query.ts`

- **`queryRelayUrlChecked` is additive and correct.** Resolves `{ ok:true, events }`
  only on the EOSE branch; `{ ok:false, events:[] }` on the timeout (`ws.terminate`)
  and `ws.on("error")` branches. Idempotent `finish(ok)` guard. (L85–137.)
- **`NostrFilter` gained `ids?: string[]` and `since?: number`** (additive optional
  fields). They are forwarded verbatim into the REQ frame via the same
  `JSON.stringify(["REQ", SUB_ID, filter])` path — pinned by
  `query-checked.test.ts` ("forwards ids and since on the REQ filter").
- **Existing exports byte-unchanged.** Compared each function body against
  `bcb3080~1`: `queryEvents`, `queryAllPages`, `queryEventsPaged` are byte-identical.
  `queryRelayUrl`'s body is byte-identical through its `ws.on("error", () =>
  finish());` close — the only delta in its region is the new doc comment +
  `queryRelayUrlChecked` appended after it. The resolve-on-error / bare-array
  contract of `queryRelayUrl` is intact (still resolves with collected array on
  EOSE, empty on error). The two "queryRelayUrl UNCHANGED" tests pass against it.

## `/health/sync` + non-flap — `apps/api/src/routes/health.ts`

- **`GET /health/sync` always HTTP 200** (L98–101), serving
  `deps.readUpsyncHealth()` verbatim, defaulting to a pre-first-run `unknown`
  (`checkedAtMs:null`, `reason:"not yet computed"`) when the optional dep is absent.
- **Off the aggregate: CONFIRMED.** `readUpsyncHealth` is **not** in
  `/health/data`'s `Promise.allSettled` probe set; it is a separate route added
  after `/health/data`. A backlog/`unknown` cannot flip the aggregate `ok`/503.
  `/health` and `/health/data` route bodies are unchanged (baseline diff shows only
  the new import, the `readUpsyncHealth?` dep, the pre-first-run helper, and the new
  route). Tests assert both "sync unknown does NOT flip /health/data" and "sync
  backlog does NOT flip /health/data", plus "/health stays a trivial 200".

## The monitor — `startUpsyncHealthMonitor` (`apps/api/src/health/upsync.ts` L197–223)

- Each tick runs `check()`, then caches `{ ...result, checkedAtMs: Date.now() }`
  (L206–207); `getUpsyncHealth()` reflects it (test "computes on each tick…").
- **Fault-isolated: CONFIRMED.** The tick body is wrapped in try/catch; a throwing
  check is caught + logged (`[upsync-check] tick failed: …`), the prior cache is
  left untouched (not re-stamped), no throw escapes, the timer keeps ticking. Test
  "catches a throwing check, leaves the prior cache, keeps ticking" pins it.
- **`unref()`'d: CONFIRMED** (L218; test asserts `unref` called once on the handle).
- **`stop()` clears the interval** (L221; test "no further ticks after stop()").

## Config + wiring — `config.ts`, `index.ts`

- `UPSYNC_CHECK_WINDOW_MS` (default 1_800_000 / 30 min), `UPSYNC_CHECK_LIMIT`
  (default 500), `UPSYNC_CHECK_INTERVAL_MS` (default 300_000 / 5 min) added with the
  exact `withDefault` + `Number.isFinite`/`Number.isInteger`/`>= 1` parse-and-throw
  style mirroring `maintenanceIntervalMs`. Optional on `Config`, always set by
  `loadConfig`.
- `index.ts main()` wires `readUpsyncHealth: getUpsyncHealth` into
  `buildHealthRouter`, and starts `startUpsyncHealthMonitor` after `app.listen` near
  the maintenance timer. `readLocal` wraps `queryRelayUrlChecked(config.strfryUrl,
  …)`; `readDcosl` is null when `dcoslRelayUrl` is unset; `librarianPubkey` passed
  through (so the check still degrades to `unknown` when the librarian is unset even
  if dcosl is configured); `now: Date.now`; window/limit from config. Background,
  `unref`'d, never on the request path.
- **Dual-publish (`propagate.ts`) + `ops/cron/unbnd-upsync`: untouched** (empty
  diff). No `--dir down`/down-sync references in the src diff.

## Runbook — `ops/sync-runbook.md`

New "Sync-health monitoring (Story 63 / ADR 0062)" section: cron-installed check
(`cat /etc/cron.d/unbnd-upsync`, no `<LIBRARIAN_HEX>` placeholder), cron-running
check (`tail` the log, < ~10 min recency), and the read-signal interpretation
(`in-sync`/`backlog`/`unknown` with actions, `capped` floor note, `checkedAtMs`
staleness). Accurate against the real cron file and the real endpoint shape.
Copy is clean — em dashes appear only in ops-doc prose and code comments, which are
out of scope for the UI/user-facing no-slop rule; no banned filler verbs, no
rhetorical contrasts in the section.

## Scope / house rules

- API-only: `config.ts`, `health/upsync.ts`, `index.ts`, `nostr/query.ts`,
  `routes/health.ts` + runbook + engineering docs. **No web/UI, no schema, no new
  event/DList shape, no down-sync.** Observes only; propagation behavior untouched.
- No new dependency (reuses `ws`-backed query, the maintenance-timer pattern, the
  config parse style). No new lint/typecheck/build tooling.
- Librarian pubkey resolved at runtime from config; never hardcoded.

## Findings

None blocking. Minor (non-blocking) observations:

- `preFirstRunUpsyncHealth()` is duplicated in `health.ts` (router fallback) and
  `upsync.ts` (`preFirstRun`). Both produce the documented pre-first-run `unknown`;
  the router's stands alone so the router has no import-time coupling to the cache
  module's runtime state. Acceptable; not worth a shared export.
- The `ids:`-only dcosl read relies on dcosl honoring `ids:` filters (ADR 0062
  Risk notes the `#z`+`since` fallback if not). The chosen form is the ADR's
  preferred path; fine as shipped.

**PASS.**
