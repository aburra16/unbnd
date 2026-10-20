// Story 99 / ADR 0089 (the removal endpoints, formerly Story 79's retraction).
//
// POST /api/ratings/remove/template returns the kind 5 a sovereign client signs
// (null when there is nothing to remove). POST /api/ratings/remove is
// tier-branched: sovereign posts the signed removal; custodial posts
// { bookSlug } and the server signs with the session key. Idempotent: no
// current review means 200 { removed: false } and NO publish.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildRatingsRouter, type RatingsDeps, type SessionUser } from "../../src/routes/ratings";
import { LIBRARIAN, bookAddress, signedRating } from "../ratings/_fixtures";
import { memoryRelay } from "../ratings/_relay";

const cfg: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "x",
  searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
  librarianPubkey: LIBRARIAN,
};

const COOKIE = "session=" + "x".repeat(43);
const sign = (sk: Uint8Array, t: NostrEventTemplate) =>
  JSON.parse(JSON.stringify(finalizeEvent(t as never, sk))) as SignedNostrEvent;

/** A caller with a current review of "orbital" on an in-memory relay. */
function ratedApp(tier: "sovereign" | "custodial", over: Partial<RatingsDeps> = {}) {
  const rating = signedRating({ bookSlug: "orbital", score: 4, createdAt: 1_000 });
  const user: SessionUser = { id: "u", pubkeyHex: rating.pubkey, tier };
  const relay = memoryRelay([rating.event as SignedNostrEvent]);
  const deps: RatingsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => user),
    publish: relay.publish,
    query: relay.query,
    custodialSign: vi.fn(async (_id: string, t: NostrEventTemplate) => sign(rating.sk, t)),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildRatingsRouter(deps));
  return { app, deps, relay, rating, user };
}

describe("POST /api/ratings/remove/template", () => {
  it("returns a kind 5 naming the caller's current review by e and a, with k", async () => {
    const { app, rating } = ratedApp("sovereign");
    const res = await request(app).post("/api/ratings/remove/template").set("Cookie", COOKIE).send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(5);
    expect(res.body.template.tags).toEqual([
      ["e", rating.event.id],
      ["a", `34259:${rating.pubkey}:book:${bookAddress("orbital")}`],
      ["k", "34259"],
    ]);
  });

  it("returns a null template when there is nothing to remove", async () => {
    const { app } = ratedApp("sovereign");
    const res = await request(app).post("/api/ratings/remove/template").set("Cookie", COOKIE).send({ bookSlug: "other" });
    expect(res.status).toBe(200);
    expect(res.body.template).toBeNull();
  });
});

describe("POST /api/ratings/remove — sovereign (self-signed removal)", () => {
  it("401 when there is no session", async () => {
    const { app } = ratedApp("sovereign", { sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/ratings/remove").send({ event: {} });
    expect(res.status).toBe(401);
  });

  it("publishes a valid self-signed removal; the review is gone from the summary and yourRating is null", async () => {
    const { app, deps, rating } = ratedApp("sovereign");
    const tpl = (await request(app).post("/api/ratings/remove/template").set("Cookie", COOKIE).send({ bookSlug: "orbital" })).body.template;
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ event: sign(rating.sk, tpl) });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(res.body.summary.count).toBe(0);
    expect(res.body.summary).not.toHaveProperty("average"); // Story 101
    expect(res.body.yourRating).toBeNull();
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("400 when the posted event is a review, not a removal", async () => {
    const { app, rating } = ratedApp("sovereign");
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ event: rating.event });
    expect(res.status).toBe(400);
  });

  it("403 when the removal is signed by a different key than the session user", async () => {
    const { app, rating } = ratedApp("sovereign");
    const tags = [["e", rating.event.id], ["a", `34259:${rating.pubkey}:book:${bookAddress("orbital")}`], ["k", "34259"]];
    const forged = sign(generateSecretKey(), { kind: 5, created_at: 2_000, tags, content: "" });
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ event: forged });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/ratings/remove — idempotent short-circuit (AC-4)", () => {
  it("200 { removed: false } and NO publish when the caller has no current review", async () => {
    const { app, deps } = ratedApp("custodial");
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ bookSlug: "other" });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(false);
    expect(deps.publish).not.toHaveBeenCalled();
  });
});

describe("POST /api/ratings/remove — custodial (server-signed)", () => {
  it("server-signs the removal with the session key and publishes (no client event in the body)", async () => {
    const { app, deps, relay } = ratedApp("custodial");
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(relay.events.some((e) => e.kind === 5)).toBe(true);
  });

  it("401 reauth_required when the session has no live signing key", async () => {
    const { app } = ratedApp("custodial", { custodialSign: vi.fn(async () => null) });
    const res = await request(app).post("/api/ratings/remove").set("Cookie", COOKIE).send({ bookSlug: "orbital" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
  });
});
