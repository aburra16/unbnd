// FAILING TESTS — Story 79 / ADR 0077 (the removal endpoints).
//
// POST /api/ratings/remove/template mirrors /api/ratings/template (the
// server-built retraction template a sovereign client signs). POST
// /api/ratings/remove mirrors POST /api/ratings: tier-branched (sovereign
// posts a self-signed retraction event; custodial posts { bookSlug } and the
// server signs with the session key), with the idempotent short-circuit —
// no current rating means 200 { removed: false } and NO publish, so a double
// remove never spams tombstones (relay-cap discipline). The query mock is
// relay-replace realistic: after the retraction publishes, the book-address
// read returns the retraction INSTEAD of the rating (kind 39999 is
// parameterized-replaceable).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import {
  buildRatingsRouter,
  type RatingsDeps,
  type SessionUser,
} from "../../src/routes/ratings";
import { LIBRARIAN, signedRating, signedRetraction } from "../ratings/_fixtures";

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

function makeApp(overrides: Partial<RatingsDeps> = {}) {
  const deps: RatingsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => null),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    query: vi.fn(async () => []),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildRatingsRouter(deps));
  return { app, deps };
}

/**
 * A rated-then-removed harness: the caller has a current rating; once the
 * retraction publishes, the book-address read returns the retraction instead
 * (the relay replaced the rating at the same d-tag).
 */
function ratedApp(user: SessionUser, overrides: Partial<RatingsDeps> = {}) {
  const rating = signedRating({ bookSlug: "orbital", score: 4 });
  const sessionUser = { ...user, pubkeyHex: rating.pubkey };
  const retraction = signedRetraction({ sk: rating.sk, bookSlug: "orbital", createdAt: 2_000_000_000 });
  let published = false;
  const made = makeApp({
    sessionUser: vi.fn(async () => sessionUser),
    publish: vi.fn(async () => {
      published = true;
      return { ok: true as const, id: "evt-id" };
    }),
    query: vi.fn(async () => (published ? [retraction.event] : [rating.event]) as never),
    ...overrides,
  });
  return { ...made, rating, retraction, user: sessionUser };
}

describe("POST /api/ratings/remove/template", () => {
  it("returns a retraction template for the signed-in caller: same d-tag, retracted marker, no score", async () => {
    const sovereign: SessionUser = { id: "u1", pubkeyHex: "9".repeat(64), tier: "sovereign" };
    const { app } = makeApp({ sessionUser: vi.fn(async () => sovereign) });
    const res = await request(app)
      .post("/api/ratings/remove/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
    const tags = res.body.template.tags as string[][];
    expect(tags.find((t) => t[0] === "d")?.[1]).toBe(`rating--orbital--${"9".repeat(8)}`);
    expect(tags.find((t) => t[0] === "retracted")?.[1]).toBe("true");
    expect(tags.find((t) => t[0] === "score")).toBeUndefined();
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/ratings/remove/template")
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/ratings/remove — sovereign (self-signed retraction)", () => {
  it("publishes a valid self-signed retraction; the rating is gone from the summary and yourRating is null", async () => {
    const { app, deps, retraction } = ratedApp({ id: "u1", pubkeyHex: "", tier: "sovereign" });
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ event: retraction.event });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    // The recomputed summary excludes the removed rating (seam 1)…
    expect(res.body.summary.count).toBe(0);
    // …and the caller's own rating is honestly gone (seam 2).
    expect(res.body.yourRating).toBeNull();
  });

  it("403 when the retraction is signed by a different key than the session user", async () => {
    const someoneElse = signedRetraction({
      sk: signedRating({}).sk,
      bookSlug: "orbital",
    });
    const { app, deps } = ratedApp({ id: "u1", pubkeyHex: "", tier: "sovereign" });
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ event: someoneElse.event });
    expect(res.status).toBe(403);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("400 when the posted event is not a retraction (a rating with a score)", async () => {
    const { app, deps, rating } = ratedApp({ id: "u1", pubkeyHex: "", tier: "sovereign" });
    // A normal rating event, self-signed and valid — but not a retraction.
    const notARetraction = signedRating({ sk: rating.sk, bookSlug: "orbital", score: 1 });
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ event: notARetraction.event });
    expect(res.status).toBe(400);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/ratings/remove")
      .send({ event: signedRetraction({ sk: signedRating({}).sk }).event });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/ratings/remove — idempotent short-circuit (AC-4)", () => {
  it("200 { removed: false } and NO publish when the caller has no current rating", async () => {
    const rater = signedRating({});
    const retraction = signedRetraction({ sk: rater.sk, bookSlug: "orbital" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => ({ id: "u1", pubkeyHex: rater.pubkey, tier: "sovereign" })),
      query: vi.fn(async () => []), // never rated (or already removed)
    });
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ event: retraction.event });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(false);
    expect(deps.publish).not.toHaveBeenCalled();
  });
});

describe("POST /api/ratings/remove — custodial (server-signed)", () => {
  it("server-signs the retraction with the session key and publishes (no client event in the body)", async () => {
    const { app, deps, retraction } = ratedApp(
      { id: "u-cust", pubkeyHex: "", tier: "custodial" },
      { custodialSign: vi.fn(async () => undefined as never) },
    );
    (deps.custodialSign as ReturnType<typeof vi.fn>).mockResolvedValue(retraction.event);
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.yourRating).toBeNull();
    // The server-built template it signed is a retraction: marker, no score.
    const [, template] = (deps.custodialSign as ReturnType<typeof vi.fn>).mock.calls[0]! as [
      string,
      { tags: string[][] },
    ];
    expect(template.tags.find((t) => t[0] === "retracted")?.[1]).toBe("true");
    expect(template.tags.find((t) => t[0] === "score")).toBeUndefined();
  });

  it("401 reauth_required when the session has no live signing key (the rate-path branch, reused)", async () => {
    const { app, deps } = ratedApp(
      { id: "u-cust", pubkeyHex: "", tier: "custodial" },
      { custodialSign: vi.fn(async () => null) }, // wrap gone (post-restart)
    );
    const res = await request(app)
      .post("/api/ratings/remove")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
    expect(deps.publish).not.toHaveBeenCalled();
  });
});
