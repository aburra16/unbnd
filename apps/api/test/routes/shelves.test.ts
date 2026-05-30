// Failing tests (red) for Story 18 — the shelves write/read routes. Mirrors
// apps/api/test/routes/tags.test.ts. Targets apps/api/src/routes/shelves.ts
// (buildShelvesRouter / ShelvesDeps), which does not exist yet.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  toShelfAssertionEvent,
  toWireTemplate,
  SHELF_ON,
  SHELF_OFF,
  type Polarity,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import {
  buildShelvesRouter,
  type ShelvesDeps,
  type ShelvesSessionUser,
} from "../../src/routes/shelves";

const LIB = asHexPubkey("1".repeat(63) + "a");
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

const HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-shelves" };

function signedShelf(
  sk: Uint8Array,
  bookSlug: string,
  shelfSlug: string,
  polarity: Polarity = SHELF_ON,
  shelfName?: string,
): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    shelfSlug,
    shelfName,
    polarity,
    ownerPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: HDR,
  };
  const tmpl = toWireTemplate(toShelfAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

const sovereign: ShelvesSessionUser = { id: "u", pubkeyHex: "9".repeat(64), tier: "sovereign" };

function makeApp(over: Partial<ShelvesDeps> = {}) {
  const deps: ShelvesDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildShelvesRouter(deps));
  return { app, deps };
}

describe("POST /api/shelves/template", () => {
  it("200 returns a kind-39999 template for a signed-in user (AC-1)", async () => {
    const res = await request(makeApp().app)
      .post("/api/shelves/template")
      .send({ bookSlug: "b1", shelfSlug: "want-to-read", polarity: SHELF_ON });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
  });

  it("400 on bad polarity, 401 without session (AC-6)", async () => {
    expect(
      (await request(makeApp().app).post("/api/shelves/template").send({ bookSlug: "b1", shelfSlug: "want-to-read", polarity: 7 })).status,
    ).toBe(400);
    expect(
      (await request(makeApp({ sessionUser: vi.fn(async () => null) }).app).post("/api/shelves/template").send({})).status,
    ).toBe(401);
  });

  it("carries the custom display name into the template (AC-4)", async () => {
    const res = await request(makeApp().app)
      .post("/api/shelves/template")
      .send({ bookSlug: "b1", shelfSlug: "beach-reads", shelfName: "Beach Reads", polarity: SHELF_ON });
    expect(res.status).toBe(200);
    expect(res.body.template.tags).toContainEqual(["name", "Beach Reads"]);
  });
});

describe("POST /api/shelves — sovereign (AC-1, AC-6)", () => {
  it("publishes a valid client-signed apply", async () => {
    const sk = generateSecretKey();
    const ev = signedShelf(sk, "b1", "want-to-read");
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
    });
    const res = await request(app).post("/api/shelves").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("publishes a retract via polarity -1 (AC-2)", async () => {
    const sk = generateSecretKey();
    const ev = signedShelf(sk, "b1", "want-to-read", SHELF_OFF);
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
    });
    const res = await request(app).post("/api/shelves").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("403 on pubkey mismatch", async () => {
    const ev = signedShelf(generateSecretKey(), "b1", "want-to-read"); // session pubkey is 9*64
    const res = await request(makeApp().app).post("/api/shelves").send({ event: ev });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/shelves — custodial (AC-6)", () => {
  it("server-signs the intent; 401 reauth_required when the wrap is gone", async () => {
    const sk = generateSecretKey();
    const ev = signedShelf(sk, "b1", "want-to-read");
    const ok = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial", pubkeyHex: getPublicKey(sk) })),
      custodialSign: vi.fn(async () => ev),
    });
    expect(
      (await request(ok.app).post("/api/shelves").set("Cookie", "session=" + "x".repeat(43)).send({ bookSlug: "b1", shelfSlug: "want-to-read", polarity: SHELF_ON })).status,
    ).toBe(200);

    const noWrap = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial" })),
      custodialSign: vi.fn(async () => null),
    });
    const r = await request(noWrap.app).post("/api/shelves").set("Cookie", "session=" + "x".repeat(43)).send({ bookSlug: "b1", shelfSlug: "want-to-read", polarity: SHELF_ON });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("reauth_required");
  });
});

describe("POST /api/shelves — anonymous (AC-6)", () => {
  it("401 and no publish for an anonymous caller", async () => {
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/shelves").send({ event: { kind: 39999 } });
    expect(res.status).toBe(401);
    expect(deps.publish).not.toHaveBeenCalled();
  });
});

describe("GET /api/shelves/mine — grouped honest read (AC-7)", () => {
  it("queries the user's own kind-39999 shelf assertions and groups them", async () => {
    const sk = generateSecretKey();
    const pubkeyHex = getPublicKey(sk);
    const query = vi.fn(async () => [
      signedShelf(sk, "orbital", "want-to-read"),
      signedShelf(sk, "north-woods", "want-to-read"),
    ]);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex })),
      query: query as never,
    });
    const res = await request(app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    const filter = (query.mock.calls[0]![0] ?? {}) as Record<string, unknown>;
    expect(filter.kinds).toContain(39999);
    expect((filter["#z"] as string[])[0]).toContain("book-shelves");
    expect(filter.authors).toEqual([pubkeyHex]);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    expect(want.count).toBe(2);
  });

  it("returns an empty list for a user with no assertions (honest empty)", async () => {
    const res = await request(makeApp({ query: vi.fn(async () => []) }).app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    expect(res.body.shelves).toEqual([]);
  });

  it("401 without a session", async () => {
    const res = await request(makeApp({ sessionUser: vi.fn(async () => null) }).app).get("/api/shelves/mine");
    expect(res.status).toBe(401);
  });
});
