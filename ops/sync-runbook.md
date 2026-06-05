# Relay sync runbook (dcosl ↔ local strfry)

How catalog and community data move between the shared relay **dcosl**
(`wss://dcosl.brainstorm.world/`) and the droplet's **local** strfry (in the
`unbnd-tapestry` container, which the API reads/writes via `ws://tapestry/relay`).

## The two directions

| Direction | What | Mechanism | Cron |
|-----------|------|-----------|------|
| **Down** | Librarian-published catalog, taxonomy, baseline genre assertions | seeder publishes to dcosl → local strfry pulls down | `/etc/cron.d/unbnd-sync` (`--dir down`, every 5 min) |
| **Up** | Community writes: ratings + tag assertions signed by reader keys | API dual-publishes to dcosl best-effort (ADR 0011) **+** local strfry pushes up as a backstop | `/etc/cron.d/unbnd-upsync` (`--dir up`, every 5 min) |

The local relay is the **source of truth for reads** and the writer's immediate
read-back. dcosl is the **shared backbone** for global visibility + durability.

## Write up-sync (ADR 0011)

1. **Primary path — API dual-publish.** When `DCOSL_RELAY_URL` is set (and
   `PROPAGATE_WRITES` != `false`), the API publishes each accepted rating /
   tag assertion to the local relay (awaited, source of truth) **and** to dcosl
   best-effort (fire-and-forget, off the response's critical path). A dcosl
   failure is logged (`[upsync] dcosl publish failed …`) and never surfaced to
   the user.
2. **Backstop — `unbnd-upsync` cron.** Every 5 min, `strfry sync --dir up`
   reconciles local-only community writes to dcosl. Guarantees eventual
   propagation if a live dual-publish dropped. Idempotent (negentropy only
   sends what dcosl lacks; the librarian's seeded assertions already on dcosl
   are not re-pushed).

### Install the up-sync cron (one-time, on the droplet)

```bash
sudo cp /opt/unbnd/ops/cron/unbnd-upsync /etc/cron.d/unbnd-upsync
# substitute the librarian hex pubkey (the value of LIBRARIAN_PUBKEY in .env):
sudo sed -i "s/<LIBRARIAN_HEX>/<librarian hex>/g" /etc/cron.d/unbnd-upsync
sudo chmod 644 /etc/cron.d/unbnd-upsync
sudo systemctl restart cron
```

### Verify

```bash
# manual one-shot up-sync:
docker exec unbnd-tapestry strfry sync wss://dcosl.brainstorm.world/ --dir up \
  --filter '{"kinds":[39999],"#z":["39998:<librarian hex>:book-tag-assertions"]}'
# log:
tail -f /var/log/unbnd-upsync.log
```

## Sync-health monitoring (Story 63 / ADR 0062)

A programmatic signal that detects a stalled up-sync — the dual-publish dropping
**and** the cron failing — without diffing the relays by hand. The API caches a
bounded local-vs-dcosl diff (recomputed every 5 min) and serves it at
`GET /health/sync`. This is read-only observability; it does not change how
writes propagate.

### Verify the cron is installed

```bash
cat /etc/cron.d/unbnd-upsync
```

Confirm the file exists and the librarian hex is substituted — there must be no
`<LIBRARIAN_HEX>` placeholder left in the `--filter`.

### Verify the cron is running

```bash
tail -n 20 /var/log/unbnd-upsync.log
```

The recent lines should show `strfry sync` runs with no repeated errors, and the
most-recent timestamp should be within the last few cycles (under ~10 min old).
A stale or error-only log means the cron is not propagating.

### Read the sync-health signal

```bash
curl -s localhost:8787/health/sync | jq   # or through nginx
```

The endpoint always returns HTTP 200; the `status` field carries the health.
Interpret it:

- **`status:"in-sync"`, `backlog:0`** — healthy; community writes are reaching
  dcosl. Nothing to do.
- **`status:"backlog"`** with a rising `backlog` count and a growing
  `oldestUnpropagatedAgeMs` across reads — up-sync is stalled. Action:
  1. Run the manual one-shot up-sync (the `docker exec … strfry sync … --dir up`
     command above).
  2. Confirm the cron is installed and running (the two checks above).
  3. Confirm the `unbnd-tapestry` container is up and the dual-publish env is set
     (`DCOSL_RELAY_URL` set, `PROPAGATE_WRITES` not `false`).
  A `capped:true` reading means the local window hit its cap (`limit`): the
  backlog is **at least** the reported count, so treat it as a floor and
  investigate.
- **`status:"unknown"`** with a `reason` — the check could not read one of the
  relays (dcosl unreachable or slow, or `DCOSL_RELAY_URL`/`LIBRARIAN_PUBKEY`
  unset). An `unknown` is **not** "in sync" — treat it as "no signal,
  investigate." Confirm config is set and dcosl is reachable.

**Staleness:** `checkedAtMs` is the last compute time. If it is much older than
the 5-min monitor interval (`UPSYNC_CHECK_INTERVAL_MS`), the monitor timer has
stalled — check the api logs for `[upsync-check]` errors.

The window (`UPSYNC_CHECK_WINDOW_MS`, default 30 min) and cap
(`UPSYNC_CHECK_LIMIT`, default 500) are tunable; the 30-min window over a 5-min
cron gives several cycles of margin so a just-written event in flight does not
read as a false backlog.

## Notes

- Disable dual-publish without redeploying: set `PROPAGATE_WRITES=false` in
  `.env` and restart the api service. The cron backstop still propagates.
- dcosl accepts writes from any key (probed 2026-05-29); no allowlist gate.

## Search index (ADR 0013)

The search index is built by the `@unbnd/indexer` job from the local relay
(books + taxonomy + assertions). It is **not** live — re-run it after a
re-seed, or to reflect freshly-applied community tags in search:

```bash
cd /opt/unbnd
docker pull ghcr.io/aburra16/unbnd-indexer:latest   # profile jobs aren't pulled by deploy
docker compose -f docker-compose.prod.yml --profile index run --rm indexer
```

Idempotent (documents upsert by slug) and paginates past the relay's 500-event
`maxFilterLimit`. Provider-agnostic: set `SEARCH_PROVIDER` (default `meili`) —
the indexer and API both resolve the provider through `@unbnd/search`.
(Live index-on-write is a future upgrade.)
