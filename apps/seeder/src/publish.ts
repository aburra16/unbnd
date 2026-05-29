// Persistent relay connection + EVENT->OK publish, for seeding to dcosl.
// ADR 0008. One socket, sequential publishes, await the matching OK.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export type RelayConnection = {
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishResult>;
  close(): void;
};

/** Open a WebSocket to `url` and resolve once it is ready to publish. */
export function connectRelay(url: string): Promise<RelayConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map<
      string,
      { resolve: (r: PublishResult) => void; timer: NodeJS.Timeout }
    >();

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[0] !== "OK") return;
      const id = String(msg[1]);
      const waiter = pending.get(id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      pending.delete(id);
      waiter.resolve(
        msg[2] === true
          ? { ok: true, id }
          : { ok: false, reason: String(msg[3] ?? "rejected") },
      );
    });

    ws.once("open", () => {
      resolve({
        publish(event, timeoutMs = 10_000) {
          return new Promise<PublishResult>((res) => {
            const timer = setTimeout(() => {
              pending.delete(event.id);
              res({ ok: false, reason: "publish timed out" });
            }, timeoutMs);
            pending.set(event.id, { resolve: res, timer });
            ws.send(JSON.stringify(["EVENT", event]));
          });
        },
        close() {
          for (const { timer } of pending.values()) clearTimeout(timer);
          pending.clear();
          try {
            ws.close();
          } catch {
            // ignore
          }
        },
      });
    });

    ws.once("error", (err) =>
      reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}
