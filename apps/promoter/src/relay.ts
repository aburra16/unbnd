// Persistent relay connection: publish (EVENT→OK) + a one-shot REQ read. Mirrors
// the seeder's `publish.ts` socket model (ADR 0008), extended with a bounded
// subscription read so the worker can fetch the submission event it promotes.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishOutcome } from "./index";

export type RelayFilter = {
  kinds?: number[];
  authors?: string[];
  "#d"?: string[];
  "#z"?: string[];
  limit?: number;
};

export type RelayConnection = {
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishOutcome>;
  query(filter: RelayFilter, timeoutMs?: number): Promise<SignedNostrEvent[]>;
  close(): void;
};

export function connectRelay(url: string): Promise<RelayConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const okWaiters = new Map<
      string,
      { resolve: (r: PublishOutcome) => void; timer: NodeJS.Timeout }
    >();
    const subs = new Map<
      string,
      { events: SignedNostrEvent[]; resolve: (e: SignedNostrEvent[]) => void; timer: NodeJS.Timeout }
    >();

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      if (msg[0] === "OK") {
        const id = String(msg[1]);
        const waiter = okWaiters.get(id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        okWaiters.delete(id);
        waiter.resolve(
          msg[2] === true ? { ok: true } : { ok: false, reason: String(msg[3] ?? "rejected") },
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
      resolve({
        publish(event, timeoutMs = 10_000) {
          return new Promise<PublishOutcome>((res) => {
            const timer = setTimeout(() => {
              okWaiters.delete(event.id);
              res({ ok: false, reason: "publish timed out" });
            }, timeoutMs);
            okWaiters.set(event.id, { resolve: res, timer });
            ws.send(JSON.stringify(["EVENT", event]));
          });
        },
        query(filter, timeoutMs = 10_000) {
          return new Promise<SignedNostrEvent[]>((res) => {
            const subId = `promoter-${Math.random().toString(36).slice(2)}`;
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
          for (const { timer } of okWaiters.values()) clearTimeout(timer);
          for (const { timer } of subs.values()) clearTimeout(timer);
          okWaiters.clear();
          subs.clear();
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
