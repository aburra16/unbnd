import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import {
  buildRatingsRouter,
  type RatingsDeps,
  type SessionUser,
} from "../../src/routes/ratings";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";

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
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
  librarianPubkey: LIBRARIAN,
};

const COOKIE = "session=" + "x".repeat(43);

function custodialUser(pubkeyHex: string): SessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

function makeApp(overrides: Partial<RatingsDeps> = {}) {
  const deps: RatingsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => custodialUser("9".repeat(64))),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildRatingsRouter(deps));
  return { app, deps };
}

describe("POST /api/ratings — custodial (server-signed)", () => {
  it("server-signs the rating and publishes it (no client event in the body)", async () => {
    const { event, pubkey } = signedRating({ score: 4, bookSlug: "orbital" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodialUser(pubkey)),
      custodialSign: vi.fn(async () => event as never),
      query: vi.fn(async () => [event] as never),
    });
    const res = await request(app)
      .post("/api/ratings")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.summary.count).toBe(1);
  });

  it("401 reauth_required when the session has no live signing key", async () => {
    const { app } = makeApp({
      custodialSign: vi.fn(async () => null), // wrap gone (post-restart)
    });
    const res = await request(app)
      .post("/api/ratings")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
  });

  it("400 with score_out_of_range on a bad score (before signing)", async () => {
    const { app, deps } = makeApp();
    const res = await request(app)
      .post("/api/ratings")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", score: 9, reviewDate: "2026-05-27" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("score_out_of_range");
    expect(deps.custodialSign).not.toHaveBeenCalled();
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/ratings")
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(401);
  });
});
