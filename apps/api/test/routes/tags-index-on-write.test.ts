// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 Q2 + §4. The API
// `POST /api/tags` route fires a best-effort, fire-and-forget reindex hook AFTER
// the durable publish succeeds (`published.ok`), on BOTH the sovereign and
// custodial branches; a FAILED publish (502) fires NO reindex; the hook is
// fire-and-forget so the 200 returns exactly as today.
//
// SEAM PINNED FROM ADR 0059 §4 (flag for the Implementer): `TagsDeps` gains an
// OPTIONAL injected hook
//     readonly reindexBook?: (bookSlug: string) => void;   // fire-and-forget
// fired unawaited after `published.ok` in both branches with the book slug
// (custodial: from the body intent; sovereign: from the parsed payload
// `bookTagAssertion.bookSlug`). The route decides WHETHER to reindex; the shared
// @unbnd/search `reindexBook` helper decides HOW (scoped read → buildBookDocument
// → provider.index, junk→skip, errors swallowed) — that helper is covered by
// packages/search reindex-book.test.ts, not here.
//
// RED until the Implementer adds `reindexBook?` to TagsDeps and the two post-
// publish trigger calls. Today `TagsDeps` has no such field, so `deps.reindexBook`
// is never invoked and the spy assertions fail at the assertion level. (The
// optional field is injected via an `as TagsDeps` cast on the deps object so the
// not-yet-present property is not a tsc excess-property wall.)
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import {
  buildTagsRouter,
  type TagsDeps,
  type TagsSessionUser,
} from "../../src/routes/tags";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };
const cfg = {
  port: 8787,
  strfryUrl: "ws://x",
  neo4jBoltUrl: "x",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "x",
  searchUrl: "x",
  searchApiKey: "x",
  searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "x",
  librarianPubkey: LIB,
} as Config;

function signedAssertion(
  sk: Uint8Array,
  bookSlug: string,
  tagSlug: string,
): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug,
    tagType: "genre" as const,
    polarity: 1 as const,
    asserterPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: HDR_ASSERT,
  };
  const tmpl = toWireTemplate(toBookTagAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

const sovereign: TagsSessionUser = {
  id: "u",
  pubkeyHex: "9".repeat(64),
  tier: "sovereign",
};

/** Build the tags app with an injected `reindexBook` spy (ADR 0059 §4 seam). */
function makeApp(over: Partial<TagsDeps> & { reindexBook?: (slug: string) => void } = {}) {
  const reindexBook = over.reindexBook ?? vi.fn();
  const deps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    reindexBook,
    ...over,
  } as unknown as TagsDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, deps, reindexBook };
}

describe("POST /api/tags → reindex hook (ADR 0059 §4, AC: incremental index update)", () => {
  it("sovereign: a successful assertion write fires reindexBook once for that book slug", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const reindexBook = vi.fn();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
      reindexBook,
    });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(reindexBook).toHaveBeenCalledTimes(1);
    expect(reindexBook).toHaveBeenCalledWith("b1");
  });

  it("custodial: a successful server-signed assertion fires reindexBook once for that book slug", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const reindexBook = vi.fn();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial", pubkeyHex: getPublicKey(sk) })),
      custodialSign: vi.fn(async () => ev),
      reindexBook,
    });
    const res = await request(app)
      .post("/api/tags")
      .set("Cookie", "session=" + "x".repeat(43))
      .send({ bookSlug: "b1", tagSlug: "mystery", tagType: "genre", polarity: 1 });
    expect(res.status).toBe(200);
    expect(reindexBook).toHaveBeenCalledTimes(1);
    expect(reindexBook).toHaveBeenCalledWith("b1");
  });

  it("a FAILED publish (502) fires NO reindex (mirrors withUpSync's on-local-success guard)", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const reindexBook = vi.fn();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay refused" })),
      reindexBook,
    });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(502);
    expect(reindexBook).not.toHaveBeenCalled();
  });

  it("the hook is fire-and-forget: the 200 returns even if reindexBook throws synchronously", async () => {
    const sk = generateSecretKey();
    const ev = signedAssertion(sk, "b1", "mystery");
    const reindexBook = vi.fn(() => {
      throw new Error("provider exploded");
    });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
      reindexBook,
    });
    const res = await request(app).post("/api/tags").send({ event: ev });
    expect(res.status).toBe(200);
    expect(reindexBook).toHaveBeenCalledTimes(1);
  });
});
