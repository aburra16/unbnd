// Persistent relay connection + EVENT->OK publish + a one-shot REQ read, for the
// worker apps (seeder, promoter, and the Story-58 librarian). ADR 0008. One
// socket, sequential publishes, await the matching OK.
//
// ADR 0056 §1 hardens the transport primitive: a synchronous send-throw and a
// post-open close/error become a transport REJECTION (distinguishable from a
// relay NACK, which stays a resolved {ok:false}), and the WebSocket is injectable
// so the behavior is unit-tested without a real network. ADR 0058 folds the
// promoter's one-shot REQ read (`query`) onto the same hardened connection, so
// both capabilities live in one audited place.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type {
  PublishResult,
  RelayConnection,
  RelayFilter,
  WebSocketLike,
} from "./types";

export type { RelayConnection, WebSocketLike } from "./types";

export type ConnectRelayOptions = {
  createWebSocket?: (url: string) => WebSocketLike;
};

/** Open a WebSocket to `url` and resolve once it is ready to publish/query. */
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
    const subs = new Map<
      string,
      {
        events: SignedNostrEvent[];
        resolve: (e: SignedNostrEvent[]) => void;
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
      if (!Array.isArray(msg)) return;
      if (msg[0] === "OK") {
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
      } else if (msg[0] === "EVENT") {
        const subId = String(msg[1]);
        const sub = subs.get(subId);
        if (sub && msg[2]) sub.events.push(msg[2] as SignedNostrEvent);
      } else if (msg[0] === "EOSE") {
        const subId = String(msg[1]);
        const sub = subs.get(subId);
        if (!sub) return;
        clearTimeout(sub.timer);
        subs.delete(subId);
        try {
          ws.send(JSON.stringify(["CLOSE", subId]));
        } catch {
          // ignore
        }
        sub.resolve(sub.events);
      }
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
        query(filter: RelayFilter, timeoutMs = 10_000) {
          return new Promise<SignedNostrEvent[]>((res) => {
            const subId = `relay-${Math.random().toString(36).slice(2)}`;
            const timer = setTimeout(() => {
              const sub = subs.get(subId);
              subs.delete(subId);
              try {
                ws.send(JSON.stringify(["CLOSE", subId]));
              } catch {
                // ignore
              }
              res(sub ? sub.events : []);
            }, timeoutMs);
            subs.set(subId, { events: [], resolve: res, timer });
            ws.send(JSON.stringify(["REQ", subId, filter]));
          });
        },
        close() {
          for (const { timer } of pending.values()) clearTimeout(timer);
          for (const { timer } of subs.values()) clearTimeout(timer);
          pending.clear();
          subs.clear();
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
