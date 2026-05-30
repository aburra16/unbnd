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
import { buildTagsRouter, type TagsDeps, type TagsSessionUser } from "../../src/routes/tags";

const LIB = asHexPubkey("1".repeat(63) + "a");
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

function taxEvent(slug: string, type: "genre" | "style" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name: slug, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: "x", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}
function signedAssertion(sk: Uint8Array, bookSlug: string, tagSlug: string) {
  const a = {
    bookSlug, bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug, tagType: "genre" as const, polarity: 1 as const,
    asserterPubkey: asHexPubkey(getPublicKey(sk)), parentHeader: HDR_ASSERT,
  };
  const tmpl = toWireTemplate(toBookTagAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

const sovereign: TagsSessionUser = { id: "u", pubkeyHex: "9".repeat(64), tier: "sovereign" };

function makeApp(over: Partial<TagsDeps> = {}) {
  const deps: TagsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, deps };
}

describe("GET /api/tags + reads", () => {
  it("returns the taxonomy", async () => {
    const { app } = makeApp({ query: vi.fn(async () => [taxEvent("literary-fiction", "genre", "normal")]) });
    const res = await request(app).get("/api/tags");
    expect(res.status).toBe(200);
    expect(res.body.tags[0].slug).toBe("literary-fiction");
  });

  it("aggregates a book's tags and hides accusatory", async () => {
    const sk = generateSecretKey();
    const query = vi.fn(async (f: Record<string, unknown>) =>
      (f["#z"] as string[])[0]!.endsWith("book-tags")
        ? [taxEvent("literary-fiction", "genre", "normal"), taxEvent("ai-generated", "signal", "accusatory")]
        : [signedAssertion(sk, "b1", "literary-fiction"), signedAssertion(generateSecretKey(), "b1", "ai-generated")],
    );
    const res = await request(makeApp({ query: query as never }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction").applies).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("ai-generated");
  });
});

describe("POST /api/tags/template", () => {
  it("200 for a signed-in user", async () => {
    const res = await request(makeApp().app).post("/api/tags/template").send({ bookSlug: "b1", tagSlug: "mystery", tagType: "genre", polarity: 1 });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
  });
  it("400 on bad polarity, 401 without session", async () => {
    expect((await request(makeApp().app).post("/api/tags/template").send({ bookSlug: "b1", tagSlug: "mystery", tagType: "genre", polarity: 7 })).status).toBe(400);
    expect((await request(makeApp({ sessionUser: vi.fn(async () => null) }).app).post("/api/tags/template").send({})).status).toBe(401);
  });
});

describe("POST /api/tags", () => {
  it("sovereign: publishes a valid signed assertion", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })) });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });
  it("sovereign: 403 on pubkey mismatch", async () => {
    const ev = signedAssertion(generateSecretKey(), "b1", "mystery");
    const res = await request(makeApp().app).post("/api/tags").send({ event: ev }); // session pubkey 9*64
    expect(res.status).toBe(403);
  });
  it("custodial: server-signs the intent; 401 reauth when no wrap", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const ok = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial", pubkeyHex: getPublicKey(sk) })),
      custodialSign: vi.fn(async () => ev),
    });
    expect((await request(ok.app).post("/api/tags").set("Cookie", "session=" + "x".repeat(43)).send({ bookSlug: "b1", tagSlug: "mystery", tagType: "genre", polarity: 1 })).status).toBe(200);

    const noWrap = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial" })),
      custodialSign: vi.fn(async () => null),
    });
    const r = await request(noWrap.app).post("/api/tags").set("Cookie", "session=" + "x".repeat(43)).send({ bookSlug: "b1", tagSlug: "mystery", tagType: "genre", polarity: 1 });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("reauth_required");
  });
});
