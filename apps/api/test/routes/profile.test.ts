import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import type { Config } from "../../src/config";
import { buildProfileRouter } from "../../src/routes/profile";

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const NPUB = npubEncode(HEX);
const cfg = { profileRelays: ["wss://x"] } as unknown as Config;

function app(resolve: (hex: string) => Promise<unknown>) {
  const a = express();
  a.use("/", buildProfileRouter({ config: cfg, resolve: resolve as never }));
  return a;
}

describe("GET /api/profile/:id", () => {
  it("resolves kind-0 by hex and returns npub + metadata", async () => {
    const res = await request(
      app(async () => ({ name: "satoshi", picture: "https://x/p.jpg" })),
    ).get(`/api/profile/${HEX}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.npub).toBe(NPUB);
    expect(res.body.profile.name).toBe("satoshi");
    expect(res.body.profile.picture).toBe("https://x/p.jpg");
  });

  it("accepts an npub and decodes it", async () => {
    const resolve = vi.fn(async () => ({ name: "from-npub" }));
    const res = await request(app(resolve)).get(`/api/profile/${NPUB}`);
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(HEX);
    expect(res.body.profile.name).toBe("from-npub");
  });

  it("returns just the npub when no kind-0 exists", async () => {
    const res = await request(app(async () => null)).get(`/api/profile/${HEX}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ npub: NPUB });
  });

  it("still returns the npub if resolution throws", async () => {
    const res = await request(
      app(async () => {
        throw new Error("relay boom");
      }),
    ).get(`/api/profile/${HEX}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ npub: NPUB });
  });

  it("400s on a non-pubkey id", async () => {
    const res = await request(app(async () => null)).get("/api/profile/not-a-key");
    expect(res.status).toBe(400);
  });
});
