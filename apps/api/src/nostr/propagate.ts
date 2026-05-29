// Write up-sync (ADR 0011): compose the local publish (source of truth, gates
// the API response and the writer's read-back) with a best-effort dcosl
// publish that propagates the event to the shared backbone WITHOUT blocking
// the response. Only locally-accepted writes propagate; dcosl failures are
// logged and left to the `strfry sync --dir up` cron backstop.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "./publish";

export type Publisher = (event: SignedNostrEvent) => Promise<PublishResult>;

/**
 * Wrap a local publisher so that, on local success, the event is also
 * published to dcosl best-effort (fire-and-forget). The returned publisher
 * resolves with the LOCAL result as soon as the local publish settles — it
 * never awaits the dcosl publish, and never rejects because of it.
 */
export function withUpSync(
  localPublish: Publisher,
  dcoslPublish: Publisher,
  onError: (reason: string, id: string) => void = () => {},
): Publisher {
  return async (event) => {
    const local = await localPublish(event);
    if (local.ok) {
      // Off the critical path: do not await. Swallow every failure mode
      // (rejected OK frame, thrown/closed socket) — the up-sync cron is the
      // durability backstop.
      void Promise.resolve()
        .then(() => dcoslPublish(event))
        .then((r) => {
          if (!r.ok) onError(r.reason, event.id);
        })
        .catch((err) => {
          onError(err instanceof Error ? err.message : String(err), event.id);
        });
    }
    return local;
  };
}
