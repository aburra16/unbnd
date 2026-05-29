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

## Notes

- Disable dual-publish without redeploying: set `PROPAGATE_WRITES=false` in
  `.env` and restart the api service. The cron backstop still propagates.
- dcosl accepts writes from any key (probed 2026-05-29); no allowlist gate.
