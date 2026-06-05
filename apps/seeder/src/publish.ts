// Persistent relay connection + EVENT->OK publish, for seeding to dcosl.
// ADR 0008. One socket, sequential publishes, await the matching OK.
// ADR 0056 §1 hardens this transport primitive: a synchronous send-throw and a
// post-open close/error become a transport REJECTION (distinguishable from a
// relay NACK, which stays a resolved {ok:false}), and the WebSocket is
// injectable so the behavior is unit-tested without a real network.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export type RelayConnection = {
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishResult>;
  close(): void;
};

/** The slice of the `ws` WebSocket API this module drives. */
export type WebSocketLike = {
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
};

export type ConnectRelayOptions = {
  createWebSocket?: (url: string) => WebSocketLike;
};

/** Open a WebSocket to `url` and resolve once it is ready to publish. */
export function connectRelay(
  url: string,
  opts: ConnectRelayOptions = {},
): Promise<RelayConnection> {
  const createWebSocket =
    opts.createWebSocket ?? ((u: string) => new WebSocket(u) as WebSocketLike);
  return new Promise((resolve, reject) => {
    const ws = createWebSocket(url);
    const pending = new Map<
      string,
      {
        resolve: (r: PublishResult) => void;
        reject: (err: Error) => void;
        timer: NodeJS.Timeout;
      }
    >();
    let opened = false;
    let dead = false;

    // Post-open close/error rejects every pending publish and marks the
    // connection unusable, so a transient drop is surfaced as a fast transport
    // reject (the resilient layer reconnects + retries) instead of grinding each
    // publish to its 10s timeout.
    const killPending = (reason: string) => {
      dead = true;
      const err = new Error(reason);
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(err);
      }
      pending.clear();
    };

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
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
      opened = true;
      resolve({
        publish(event, timeoutMs = 10_000) {
          return new Promise<PublishResult>((res, rej) => {
            if (dead) {
              rej(new Error("relay connection is dead"));
              return;
            }
            const timer = setTimeout(() => {
              pending.delete(event.id);
              res({ ok: false, reason: "publish timed out" });
            }, timeoutMs);
            pending.set(event.id, { resolve: res, reject: rej, timer });
            try {
              ws.send(JSON.stringify(["EVENT", event]));
            } catch (err) {
              clearTimeout(timer);
              pending.delete(event.id);
              rej(err instanceof Error ? err : new Error(String(err)));
            }
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

    // Live for the connection's life: a post-open close/error rejects pending.
    ws.on("close", () => {
      if (opened) killPending("relay connection closed");
    });

    // A connect-time error (before open) rejects the connect promise; a post-open
    // error rejects pending. The single guard keeps the two paths distinct.
    ws.on("error", (err) => {
      if (opened) {
        killPending(err instanceof Error ? err.message : String(err));
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}
