// Story 110 / ADR 0098 §4: GET /api/profile/:id goes through the profile cache,
// and a kind-0 Unbnd publishes replaces the cached entry.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildProfileRouter } from "../../src/routes/profile";
import { cacheOnPublish, createProfileCache } from "../../src/profile/cache";

const HEX = "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";
const cfg = { profileRelays: ["wss://x"] } as unknown as Config;

describe("the profile route remembers profiles (story 110)", () => {
  it("a second request within 10 minutes reads no relay", async () => {
    const resolve = vi.fn(async () => ({ name: "avi", picture: "https://x/p.gif" }));
    const a = express();
    a.use("/", buildProfileRouter({ config: cfg, resolve }));
    await request(a).get(`/api/profile/${HEX}`);
    const res = await request(a).get(`/api/profile/${HEX}`);
    expect(res.body.profile.picture).toBe("https://x/p.gif");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("uses a cache it is given", async () => {
    const cache = createProfileCache({ resolve: async () => null });
    cache.set(HEX, { name: "cached" });
    const a = express();
    a.use("/", buildProfileRouter({ config: cfg, cache }));
    const res = await request(a).get(`/api/profile/${HEX}`);
    expect(res.body.profile.name).toBe("cached");
  });
});

describe("a kind-0 Unbnd publishes replaces the cached profile", () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const k0 = finalizeEvent({ kind: 0, created_at: 100, tags: [], content: JSON.stringify({ name: "new name" }) }, sk) as unknown as SignedNostrEvent;

  it("on success, the cache holds the published profile", async () => {
    const resolve = vi.fn(async () => ({ name: "old name" }));
    const cache = createProfileCache({ resolve });
    await cache.get(pk);
    const publish = cacheOnPublish(async () => ({ ok: true as const, id: k0.id }), cache);
    await publish(k0);
    expect(await cache.get(pk)).toEqual({ name: "new name" });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("on failure, the cache is untouched", async () => {
    const cache = createProfileCache({ resolve: async () => ({ name: "old name" }) });
    await cache.get(pk);
    const publish = cacheOnPublish(async () => ({ ok: false as const, reason: "refused" }), cache);
    await publish(k0);
    expect(await cache.get(pk)).toEqual({ name: "old name" });
  });

  it("a published event that is not a kind-0 leaves the cache alone (review round 1)", async () => {
    const cache = createProfileCache({ resolve: async () => ({ name: "old name" }) });
    await cache.get(pk);
    const k3 = finalizeEvent({ kind: 3, created_at: 100, tags: [], content: JSON.stringify({ name: "not a profile" }) }, sk) as unknown as SignedNostrEvent;
    await cacheOnPublish(async () => ({ ok: true as const, id: k3.id }), cache)(k3);
    expect(await cache.get(pk)).toEqual({ name: "old name" });
  });
});
