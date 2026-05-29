// Generic strfry publish: open a WS, send ["EVENT", event], resolve on the
// relay's ["OK", id, accepted, msg] frame. Mirrors the handshake in
// origin/concept-graph:lib/publish.js. ADR 0005.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

const PUBLISH_TIMEOUT_MS = 5000;

export function publishEvent(
  relayUrl: string,
  event: SignedNostrEvent,
): Promise<PublishResult> {
  return new Promise<PublishResult>((resolve) => {
    let settled = false;
    const finish = (r: PublishResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(r);
    };

    const ws = new WebSocket(relayUrl);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish({ ok: false, reason: "publish timed out" });
    }, PUBLISH_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify(["EVENT", event]));
    });

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[0] !== "OK" || msg[1] !== event.id) return;
      const accepted = msg[2] === true;
      finish(
        accepted
          ? { ok: true, id: event.id }
          : { ok: false, reason: String(msg[3] ?? "rejected by relay") },
      );
    });

    ws.on("error", (err) => {
      finish({
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
