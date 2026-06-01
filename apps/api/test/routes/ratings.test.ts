import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";
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
  trustProvider: "brainstorm",
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
  it("returns a raw summary; weighted is null when no trust provider is configured", async () => {
    const a = signedRating({ score: 4 });
    const b = signedRating({ score: 2 });
    const { app } = makeApp({
      query: vi.fn(async () => [a.event, b.event] as never),
    });
    const res = await request(app).get("/api/books/orbital/ratings");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.average).toBe(3);
    // No trust dep → no fabricated weighting (ADR 0014 fail-safe).
    expect(res.body.weighted).toBeNull();
  });

  it("returns a trust-weighted view from the observer's vantage when trust is configured", async () => {
    const a = signedRating({ score: 5 }); // high-trust rater
    const b = signedRating({ score: 1 }); // untrusted rater
    const weights = new Map<string, number>([[a.pubkey, 0.9]]); // only `a` trusted
    const trust = {
      name: "brainstorm" as const,
      weights: vi.fn(async () => weights),
      hasScores: vi.fn(async () => true),
      // CONTRACT MIGRATION (ADR 0026): authChallenge returns the unsigned
      // kind-27235 template now, not a bare string. These ratings tests never
      // call it; the mock is updated to the new return type for compilation.
      authChallenge: vi.fn(async () => ({ kind: 27235, created_at: 1, tags: [["challenge", "c"]], content: "" })),
      personalize: vi.fn(async () => true),
    };
    const { app } = makeApp({
      query: vi.fn(async () => [a.event, b.event] as never),
      trust,
    });
    const res = await request(app).get("/api/books/orbital/ratings?observer=" + "c".repeat(64));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2); // raw still counts both
    expect(res.body.weighted.trustedCount).toBe(1);
    expect(res.body.weighted.average).toBe(5); // only the trusted rater contributes
    expect(trust.weights).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([a.pubkey, b.pubkey]));
  });

  it("weighted is null when the observer trusts none of the raters", async () => {
    const a = signedRating({ score: 4 });
    const trust = {
      name: "brainstorm" as const,
      weights: vi.fn(async () => new Map()),
      hasScores: vi.fn(async () => true),
      // CONTRACT MIGRATION (ADR 0026): authChallenge returns the unsigned
      // kind-27235 template now, not a bare string. These ratings tests never
      // call it; the mock is updated to the new return type for compilation.
      authChallenge: vi.fn(async () => ({ kind: 27235, created_at: 1, tags: [["challenge", "c"]], content: "" })),
      personalize: vi.fn(async () => true),
    };
    const { app } = makeApp({ query: vi.fn(async () => [a.event] as never), trust });
    const res = await request(app).get("/api/books/orbital/ratings");
    expect(res.status).toBe(200);
    expect(res.body.weighted).toBeNull();
  });
});

// ── Story 28 / ADR 0029, AC-1/AC-3 (read seam): the additive `yourRating` field ──
//
// The GET ratings response gains `yourRating: PublicRating | null` — the signed-in
// caller's own current rating for this book, sourced from the deduped RAW set (never
// the trust-weighted subset), so it survives both `?observer=` vantages and the
// >500-rating cap. These are FAILING until ratings.ts resolves the session on the
// (still-public) GET and emits the field. DI only: inject `sessionUser` + `query`.

// A deterministic own keypair for "the signed-in caller". We match on hex inside
// the route; npub is what `toPublic` emits back to the client. Audited primitives
// (nostr-tools/@noble) per the crypto policy — no hand-rolled crypto.
const OWN_SK = generateSecretKey();
const OWN_HEX = getPublicKey(OWN_SK);
const OWN_NPUB = npubEncode(OWN_HEX);

function ownSession(): SessionUser {
  return { id: "owner", pubkeyHex: OWN_HEX, tier: "sovereign" };
}

// A query mock that branches on the filter: the book-address read returns the
// supplied `inAddressSet`; the author-scoped fallback read returns `ownEvents`.
// This lets a test assert which read fired and what `yourRating` resolves to even
// when the own rating is absent from the (truncated) address set.
function brancher(opts: {
  inAddressSet: unknown[];
  ownEvents?: unknown[];
}) {
  const ownEvents = opts.ownEvents ?? [];
  return vi.fn(async (filter: { authors?: string[] }) =>
    (filter.authors ? ownEvents : opts.inAddressSet) as never,
  );
}

describe("GET /api/books/:slug/ratings — yourRating (own-rating read seam)", () => {
  it("returns the caller's own rating as `yourRating`, sourced from the raw set", async () => {
    const own = signedRating({ sk: OWN_SK, score: 5, reviewText: "Mine.", reviewDate: "2026-05-20" });
    const other = signedRating({ score: 2 });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ownSession()),
      query: vi.fn(async () => [own.event, other.event] as never),
    });
    const res = await request(app)
      .get("/api/books/orbital/ratings")
      .set("Cookie", "session=tok");
    expect(res.status).toBe(200);
    // Present, and it is the caller's own entry (npub-keyed, full PublicRating).
    expect(res.body.yourRating).toMatchObject({
      npub: OWN_NPUB,
      score: 5,
      reviewText: "Mine.",
      reviewDate: "2026-05-20",
    });
  });

  it("is observer-independent: identical `yourRating` regardless of ?observer=", async () => {
    const own = signedRating({ sk: OWN_SK, score: 4, reviewDate: "2026-05-21" });
    const other = signedRating({ score: 1 });
    const events = [own.event, other.event];
    const sessionUser = vi.fn(async () => ownSession());

    const houseApp = makeApp({ sessionUser, query: vi.fn(async () => events as never) }).app;
    const obsApp = makeApp({ sessionUser, query: vi.fn(async () => events as never) }).app;

    const house = await request(houseApp).get("/api/books/orbital/ratings").set("Cookie", "session=tok");
    const observed = await request(obsApp)
      .get("/api/books/orbital/ratings?observer=" + "c".repeat(64))
      .set("Cookie", "session=tok");

    expect(house.body.yourRating).toEqual(observed.body.yourRating);
    expect(house.body.yourRating).toMatchObject({ npub: OWN_NPUB, score: 4 });
  });

  it("is present even when the caller's own rating is ABSENT from the weighted set (honesty seam)", async () => {
    // The caller rated, but the observer trusts only `other` — so the own rating
    // carries no weight and is absent from `weighted`. `yourRating` must still hold it.
    const own = signedRating({ sk: OWN_SK, score: 3, reviewDate: "2026-05-22" });
    const other = signedRating({ score: 5 });
    const weights = new Map<string, number>([[other.pubkey, 0.9]]); // own NOT trusted
    const trust = {
      name: "brainstorm" as const,
      weights: vi.fn(async () => weights),
      hasScores: vi.fn(async () => true),
      authChallenge: vi.fn(async () => ({ kind: 27235, created_at: 1, tags: [["challenge", "c"]], content: "" })),
      personalize: vi.fn(async () => true),
    };
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ownSession()),
      query: vi.fn(async () => [own.event, other.event] as never),
      trust,
    });
    const res = await request(app)
      .get("/api/books/orbital/ratings?observer=" + "c".repeat(64))
      .set("Cookie", "session=tok");
    expect(res.status).toBe(200);
    // The own rating is NOT in the weighted subset…
    const inWeighted = (res.body.weighted?.ratings ?? []).some(
      (r: { npub: string }) => r.npub === OWN_NPUB,
    );
    expect(inWeighted).toBe(false);
    // …but `yourRating` still surfaces it (sourced from raw, not weighted).
    expect(res.body.yourRating).toMatchObject({ npub: OWN_NPUB, score: 3 });
  });

  it("past the 500-cap: invokes the author-scoped fallback query and still populates yourRating", async () => {
    // The book-address read is truncated and does NOT contain the caller's own
    // event. The route must fall back to an author-scoped read
    // ({ kinds:[39999], authors:[ownHex], "#a":[addr] }) to find it.
    const own = signedRating({ sk: OWN_SK, score: 5, reviewDate: "2026-05-23" });
    const others = [signedRating({ score: 1 }), signedRating({ score: 2 })];
    const query = brancher({
      inAddressSet: others.map((o) => o.event), // own rating absent (capped out)
      ownEvents: [own.event],
    });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ownSession()),
      query,
    });
    const res = await request(app)
      .get("/api/books/orbital/ratings")
      .set("Cookie", "session=tok");
    expect(res.status).toBe(200);
    // The fallback fired with the author-scoped, book-scoped filter.
    const authorScoped = query.mock.calls.find(
      (c) => (c[0] as { authors?: string[] }).authors !== undefined,
    );
    expect(authorScoped).toBeDefined();
    const filter = authorScoped![0] as { kinds: number[]; authors: string[]; "#a": string[] };
    expect(filter.kinds).toContain(39999);
    expect(filter.authors).toContain(OWN_HEX);
    expect(filter["#a"][0]).toBe(`39999:${LIBRARIAN}:orbital`);
    // And the own rating is populated despite being outside the capped page.
    expect(res.body.yourRating).toMatchObject({ npub: OWN_NPUB, score: 5 });
  });

  it("yourRating is null for an anonymous request (no session cookie)", async () => {
    const own = signedRating({ sk: OWN_SK, score: 5 });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => null),
      query: vi.fn(async () => [own.event] as never),
    });
    const res = await request(app).get("/api/books/orbital/ratings");
    expect(res.status).toBe(200);
    expect(res.body.yourRating).toBeNull();
  });

  it("yourRating is null for a signed-in user who has never rated this book", async () => {
    const other = signedRating({ score: 3 }); // someone else only
    const query = brancher({ inAddressSet: [other.event], ownEvents: [] });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ownSession()),
      query,
    });
    const res = await request(app)
      .get("/api/books/orbital/ratings")
      .set("Cookie", "session=tok");
    expect(res.status).toBe(200);
    expect(res.body.yourRating).toBeNull();
  });
});
