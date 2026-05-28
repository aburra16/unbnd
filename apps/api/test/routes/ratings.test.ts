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

const sovereign: SessionUser = {
  id: "u1",
  pubkeyHex: "9".repeat(64),
  tier: "sovereign",
};

function makeApp(overrides: Partial<RatingsDeps> = {}) {
  const deps: RatingsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    query: vi.fn(async () => []),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildRatingsRouter(deps));
  return { app, deps };
}

describe("POST /api/ratings/template", () => {
  it("returns a template for a signed-in user", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/ratings/template")
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/ratings/template")
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(401);
  });

  it("400 on an out-of-range score", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/ratings/template")
      .send({ bookSlug: "orbital", score: 9, reviewDate: "2026-05-27" });
    expect(res.status).toBe(400);
  });

  it("503 when the librarian pubkey is not configured", async () => {
    const { librarianPubkey: _omit, ...noLibrarian } = cfg;
    const { app } = makeApp({ config: noLibrarian as Config });
    const res = await request(app)
      .post("/api/ratings/template")
      .send({ bookSlug: "orbital", score: 4, reviewDate: "2026-05-27" });
    expect(res.status).toBe(503);
  });
});

describe("POST /api/ratings", () => {
  it("publishes a valid signed rating and returns the summary", async () => {
    const { event, pubkey } = signedRating({ score: 5 });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: pubkey })),
      query: vi.fn(async () => [event] as never),
    });
    const res = await request(app).post("/api/ratings").send({ event });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.summary.count).toBe(1);
  });

  it("403 when the event pubkey is not the session user", async () => {
    const { event } = signedRating();
    const { app } = makeApp(); // session pubkey is 9*64, event is someone else
    const res = await request(app).post("/api/ratings").send({ event });
    expect(res.status).toBe(403);
  });

  it("401 when there is no session", async () => {
    const { event } = signedRating();
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/ratings").send({ event });
    expect(res.status).toBe(401);
  });

  it("400 on an invalid event", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: "a".repeat(64) })),
    });
    const res = await request(app)
      .post("/api/ratings")
      .send({ event: { kind: 39999, pubkey: "a".repeat(64) } });
    expect(res.status).toBe(400);
  });

  it("502 when publishing to strfry fails", async () => {
    const { event, pubkey } = signedRating();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: pubkey })),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app).post("/api/ratings").send({ event });
    expect(res.status).toBe(502);
  });
});

describe("GET /api/books/:slug/ratings", () => {
  it("returns a public raw summary (count + average, no trust number)", async () => {
    const a = signedRating({ score: 4 });
    const b = signedRating({ score: 2 });
    const { app } = makeApp({
      query: vi.fn(async () => [a.event, b.event] as never),
    });
    const res = await request(app).get("/api/books/orbital/ratings");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.average).toBe(3);
    expect(JSON.stringify(res.body)).not.toMatch(/weight|graperank|trust/i);
  });
});
