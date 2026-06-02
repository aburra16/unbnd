// FAILING TESTS (red) — Story 33 / ADR 0034 §1, §2, §6. The sensitivity-
// conditional CURATOR WRITE GATE on POST /api/tags + the `canAssertAccusatory`
// picker flag on the book-tags read. All DI-driven (no intra-module vi.mock):
// inject the fixture TrustProvider, a fake session, a fake taxonomy `query`.
//
// AC-1: `canAssertAccusatory` on GET /api/books/:slug/tags is gate-aware
//   (above→true, below→false, anon→false, degrade→false), computed once.
// AC-2: an ACCUSATORY write is curator-gated server-side for BOTH tiers —
//   anon→401, below threshold→403 below_gate (NOT published), above→published.
//   The sovereign gate reads sensitivity from the SIGNED EVENT's `t` tag, so a
//   crafted body lying "normal" cannot smuggle an accusatory write. A NORMAL
//   (genre/style) write is UNAFFECTED for any signed-in user, both tiers.
// AC-7: honest degrade — trust unavailable/no-observer/throwing closes the
//   accusatory write (403, never throws); normal writes unaffected.
//
// RED until tags.ts (a) injects `trust: TrustProvider`, (b) reads the taxonomy
// + the asserted tag's sensitivity (off the signed event's `t` for sovereign,
// off the body for custodial), (c) curator-gates the accusatory branch with the
// houseWeightOf helper + config.curatorThreshold (anon 401, below 403
// below_gate, at/above publish), normal branch unchanged, and (d) computes
// `canAssertAccusatory` once on the book-tags read.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { buildTagsRouter, type TagsDeps, type TagsSessionUser } from "../../src/routes/tags";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "f".repeat(64); // house observer vantage (the gate is always HOUSE)
// Curators relative to the house weight map.
const ABOVE = "c".repeat(64); // above the gate (weight 0.9)
const MID = "d".repeat(64); // mid (weight 0.4)
const BELOW = "e".repeat(64); // absent from the map → weight 0 → below

function cfg(over: Partial<Config> = {}): Config {
  return {
    port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
    tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
    trustProvider: "fixture",
    databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x",
    librarianPubkey: LIB, houseObserverPubkey: HOUSE, curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

// House trusts ABOVE at 0.9, MID at 0.4; BELOW is absent (untrusted).
function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [ABOVE]: 0.9, [MID]: 0.4 } } });
}

const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

function taxEvent(slug: string, type: "genre" | "style" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name: slug, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: "x", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// A client-signed assertion event whose `t` tag carries the tag slug — the gate
// reads sensitivity off THIS, not off the request body.
function signedAssertion(sk: Uint8Array, bookSlug: string, tagSlug: string, tagType: "genre" | "style" | "signal" = "genre") {
  const a = {
    bookSlug, bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug, tagType, polarity: 1 as const,
    asserterPubkey: asHexPubkey(getPublicKey(sk)), parentHeader: HDR_ASSERT,
  };
  const tmpl = toWireTemplate(toBookTagAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

// The taxonomy the route reads: literary-fiction (normal genre) +
// ai-generated (accusatory signal).
const TAXONOMY = [
  taxEvent("literary-fiction", "genre", "normal"),
  taxEvent("ai-generated", "signal", "accusatory"),
];

// A `query` that returns the taxonomy for the book-tags concept and the given
// assertion events for the assertion concept.
function queryFor(asserts: SignedNostrEvent[] = []) {
  return vi.fn(async (f: Record<string, unknown>) =>
    (f["#z"] as string[])[0]!.endsWith("book-tags") ? TAXONOMY : asserts,
  );
}

function userOf(pubkeyHex: string, tier: "sovereign" | "custodial" = "sovereign"): TagsSessionUser {
  return { id: "u", pubkeyHex, tier };
}

function makeApp(over: Partial<TagsDeps> = {}, config: Config = cfg()) {
  const deps: TagsDeps = {
    config,
    sessionUser: vi.fn(async () => userOf(ABOVE)),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: queryFor() as never,
    custodialSign: vi.fn(async () => null),
    trust: fixtureTrust(),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, deps };
}

// ───────────────────────── AC-2: sovereign write gate ──────────────────────

describe("POST /api/tags — accusatory write gate, SOVEREIGN tier (AC-2)", () => {
  it("above-gate curator → publishes the accusatory assertion (200)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))) }, cfg());
    // The house map keys are ABOVE/MID; make the signer the ABOVE curator.
    const trust = new FixtureTrustProvider({ weights: { [HOUSE]: { [getPublicKey(sk)]: 0.9 } } });
    const { app: app2, deps: deps2 } = makeApp(
      { sessionUser: vi.fn(async () => userOf(getPublicKey(sk))), trust },
    );
    void app; void deps;
    const res = await request(app2).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps2.publish).toHaveBeenCalledTimes(1);
  });

  it("below-gate signer → 403 below_gate, NOT published (server-enforced, not UI-hidden)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    // The signer is absent from the house weight map → weight 0 → below.
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))) });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("anon (no session) → 401, NOT published", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(401);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("reads sensitivity from the SIGNED EVENT's `t` tag: a crafted body claiming `normal` cannot smuggle an accusatory write", async () => {
    const sk = generateSecretKey();
    // The signed event asserts the ACCUSATORY ai-generated tag…
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    // …but the request body LIES, claiming a normal genre. The signer is below
    // the gate. The gate must read the event's `t` (ai-generated → accusatory)
    // and reject, NOT trust the body.
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))) });
    const res = await request(app)
      .post("/api/tags")
      .send({ event: ev, bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(deps.publish).not.toHaveBeenCalled();
  });
});

// ───────────────────────── AC-2: custodial write gate ─────────────────────

describe("POST /api/tags — accusatory write gate, CUSTODIAL tier (AC-2)", () => {
  it("below-gate custodial user → 403 below_gate, NOT signed, NOT published", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const custodialSign = vi.fn(async () => ev);
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => userOf(BELOW, "custodial")),
      custodialSign,
    });
    const res = await request(app)
      .post("/api/tags")
      .set("Cookie", "session=" + "x".repeat(43))
      .send({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(custodialSign).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("above-gate custodial user → server-signs + publishes the accusatory write (200)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const custodialSign = vi.fn(async () => ev);
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => userOf(ABOVE, "custodial")),
      custodialSign,
    });
    const res = await request(app)
      .post("/api/tags")
      .set("Cookie", "session=" + "x".repeat(43))
      .send({ bookSlug: "b1", tagSlug: "ai-generated", tagType: "signal", polarity: 1 });
    expect(res.status).toBe(200);
    expect(custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────── AC-2: the NORMAL write is UNAFFECTED ─────────────────

describe("POST /api/tags — a NORMAL (genre/style) write is unaffected by the gate (AC-2)", () => {
  it("sovereign: a below-gate user still publishes a NORMAL genre assertion (200)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "literary-fiction", "genre");
    // Signer is below the curator gate, but the tag is normal → unaffected.
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))) });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("custodial: a below-gate user still publishes a NORMAL genre assertion (200)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "literary-fiction", "genre");
    const custodialSign = vi.fn(async () => ev);
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => userOf(BELOW, "custodial")),
      custodialSign,
    });
    const res = await request(app)
      .post("/api/tags")
      .set("Cookie", "session=" + "x".repeat(43))
      .send({ bookSlug: "b1", tagSlug: "literary-fiction", tagType: "genre", polarity: 1 });
    expect(res.status).toBe(200);
    expect(custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("an unknown tag slug is treated as non-accusatory (existing behavior, unchanged)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "not-in-taxonomy", "genre");
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))) });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────── AC-7: honest degrade closes the gate ──────────────────

describe("POST /api/tags — honest degrade closes the accusatory write (AC-7)", () => {
  it("no trust provider → accusatory write 403 (gate closes), normal still 200", async () => {
    const sk = generateSecretKey();
    const acc = signedAssertion(sk, "b1", "ai-generated", "signal");
    const accApp = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))), trust: undefined });
    expect((await request(accApp.app).post("/api/tags").send({ event: acc })).status).toBe(403);
    expect(accApp.deps.publish).not.toHaveBeenCalled();

    const norm = signedAssertion(sk, "b1", "literary-fiction", "genre");
    const normApp = makeApp({ sessionUser: vi.fn(async () => userOf(getPublicKey(sk))), trust: undefined });
    expect((await request(normApp.app).post("/api/tags").send({ event: norm })).status).toBe(200);
  });

  it("no house observer configured → accusatory write 403, seam never throws", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const { app, deps } = makeApp(
      { sessionUser: vi.fn(async () => userOf(ABOVE)) },
      cfg({ houseObserverPubkey: undefined }),
    );
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(403);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("a throwing trust seam closes the accusatory write without a 500", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "ai-generated", "signal");
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("trust backend down");
      }),
      hasScores: vi.fn(async () => false),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => userOf(ABOVE)),
      trust: throwing as never,
    });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(403);
    expect(deps.publish).not.toHaveBeenCalled();
  });
});

// ───────────────────── AC-1: the canAssertAccusatory flag ──────────────────

describe("GET /api/books/:slug/tags — canAssertAccusatory picker flag (AC-1)", () => {
  it("above-gate session user → canAssertAccusatory: true", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => userOf(ABOVE)) });
    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.canAssertAccusatory).toBe(true);
  });

  it("below-gate session user → canAssertAccusatory: false", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => userOf(BELOW)) });
    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.canAssertAccusatory).toBe(false);
  });

  it("anon → canAssertAccusatory: false (fail-closed)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.canAssertAccusatory).toBe(false);
  });

  it("trust degrade (no provider) → canAssertAccusatory: false, never 500", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => userOf(ABOVE)), trust: undefined });
    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.canAssertAccusatory).toBe(false);
  });

  it("computes the flag ONCE per request (the session-user weight seam is hit at most once)", async () => {
    const weights = vi.fn(async (_o: string, targets: readonly string[]) => {
      const m = new Map<string, number>();
      for (const t of targets) if (t === ABOVE) m.set(t, 0.9);
      return m;
    });
    const trust = {
      name: "fixture" as const,
      weights,
      hasScores: vi.fn(async () => true),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const { app } = makeApp({ sessionUser: vi.fn(async () => userOf(ABOVE)), trust: trust as never });
    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.canAssertAccusatory).toBe(true);
    // One read for the session-user gate (no per-row / N+1 fan-out for the flag).
    const sessionGateCalls = weights.mock.calls.filter((c) => (c[1] as string[]).includes(ABOVE));
    expect(sessionGateCalls.length).toBe(1);
  });
});
