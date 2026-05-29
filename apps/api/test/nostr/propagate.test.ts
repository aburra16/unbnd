import { describe, expect, it, vi } from "vitest";
import { withUpSync } from "../../src/nostr/propagate";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "../../src/nostr/publish";

const EV = { id: "e1" } as SignedNostrEvent;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("withUpSync", () => {
  it("propagates to dcosl on local success and returns the local result", async () => {
    const local = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    const dcosl = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    const publish = withUpSync(local, dcosl);

    const res = await publish(EV);
    expect(res).toEqual({ ok: true, id: "e1" });
    await tick(); // let the fire-and-forget settle
    expect(dcosl).toHaveBeenCalledTimes(1);
    expect(dcosl).toHaveBeenCalledWith(EV);
  });

  it("resolves with the local result without awaiting dcosl (off the critical path)", async () => {
    const local = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    let dcoslResolved = false;
    // dcosl hangs well past the local resolution.
    const dcosl = vi.fn(
      () =>
        new Promise<PublishResult>((r) =>
          setTimeout(() => {
            dcoslResolved = true;
            r({ ok: true, id: "e1" });
          }, 50),
        ),
    );
    const res = await withUpSync(local, dcosl)(EV);
    expect(res).toEqual({ ok: true, id: "e1" });
    expect(dcoslResolved).toBe(false); // returned before dcosl finished
  });

  it("does NOT propagate when the local publish fails", async () => {
    const local = vi.fn(async (): Promise<PublishResult> => ({ ok: false, reason: "nope" }));
    const dcosl = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    const res = await withUpSync(local, dcosl)(EV);
    expect(res).toEqual({ ok: false, reason: "nope" });
    await tick();
    expect(dcosl).not.toHaveBeenCalled();
  });

  it("swallows a dcosl rejection (OK false) and still returns local ok", async () => {
    const local = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    const dcosl = vi.fn(async (): Promise<PublishResult> => ({ ok: false, reason: "relay down" }));
    const onError = vi.fn();
    const res = await withUpSync(local, dcosl, onError)(EV);
    expect(res).toEqual({ ok: true, id: "e1" });
    await tick();
    expect(onError).toHaveBeenCalledWith("relay down", "e1");
  });

  it("swallows a thrown dcosl publish and still returns local ok", async () => {
    const local = vi.fn(async (): Promise<PublishResult> => ({ ok: true, id: "e1" }));
    const dcosl = vi.fn(async (): Promise<PublishResult> => {
      throw new Error("socket boom");
    });
    const onError = vi.fn();
    const res = await withUpSync(local, dcosl, onError)(EV);
    expect(res).toEqual({ ok: true, id: "e1" });
    await tick();
    expect(onError).toHaveBeenCalledWith("socket boom", "e1");
  });
});
