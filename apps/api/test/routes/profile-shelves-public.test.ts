// Failing tests (red) for Story 20 AC-3 / AC-6 + the Decision-4 TTL cache — the
// PUBLIC by-pubkey shelves twin GET /api/profile/:npub/shelves. Mirrors
// apps/api/test/routes/shelves-enriched.test.ts (the session-gated /mine enriched
// read) but UN-GATED and author-scoped by the path npub instead of the session.
//
// ADR 0020 Decision 1 (Option A): a new thin public handler resolves :npub → hex
// (reusing the extracted toHex), then runs the SAME groupOwnShelves + one-batch
// catalog enrich as /mine, author-scoped to the target. Decision 4 wraps the read
// in a 60s in-memory TTL cache keyed by the resolved hex, with `now` injectable on
// ShelvesDeps for tests. None of: the public route, the npub→hex on this route, the
// `now` dep, or the cache exist yet.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toShelfAssertionEvent,
  toWireTemplate,
  SHELF_ON,
  type BookRecord,
  type Polarity,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildShelvesRouter, type ShelvesDeps } from "../../src/routes/shelves";

const LIB = asHexPubkey("1".repeat(63) + "a");
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

const SHELF_HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-shelves" };
const BOOKS_HDR = buildBookRecordsHeaderAddress(LIB);

// A deterministic target keypair: this is the user whose public profile is viewed.
const TARGET_SK = generateSecretKey();
const TARGET_HEX = getPublicKey(TARGET_SK);
const TARGET_NPUB = npubEncode(TARGET_HEX);

function signedShelf(
  sk: Uint8Array,
  bookSlug: string,
  shelfSlug: string,
  polarity: Polarity = SHELF_ON,
): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    shelfSlug,
    polarity,
    ownerPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: SHELF_HDR,
  };
  const tmpl = toWireTemplate(toShelfAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

function bookEvent(slug: string, title: string, author: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: author, format: "reference", source: "openlibrary",
    parentHeader: BOOKS_HDR, coverUrl: `https://covers/${slug}.jpg`, publishYear: 2024,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// Route the query mock by concept (#z): the shelf-membership read vs the catalog
// batch read. No session dep is wired — the public twin must not require a session.
function makeApp(opts: {
  shelfEvents: SignedNostrEvent[];
  bookEvents: SignedNostrEvent[];
  now?: () => number;
}) {
  const query = vi.fn(async (filter: Record<string, unknown>) => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-shelves")) return opts.shelfEvents;
    if (z.endsWith("books")) return opts.bookEvents;
    return [];
  });
  const deps: Partial<ShelvesDeps> & { now?: () => number } = {
    config: cfg,
    sessionUser: vi.fn(async () => null), // public route: never consulted
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: query as never,
    custodialSign: vi.fn(async () => null),
    ...(opts.now ? { now: opts.now } : {}),
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildShelvesRouter(deps as ShelvesDeps));
  return { app, query };
}

describe("GET /api/profile/:npub/shelves — public by-pubkey read (AC-3)", () => {
  it("resolves npub → hex and author-scopes the shelf read to the TARGET", async () => {
    const { app, query } = makeApp({
      shelfEvents: [signedShelf(TARGET_SK, "orbital", "want-to-read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    const shelfCall = query.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .find((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("book-shelves"));
    expect(shelfCall?.authors).toEqual([TARGET_HEX]);
  });

  it("returns the target's shelves as enriched PublicBooks (cover/title/author)", async () => {
    const { app } = makeApp({
      shelfEvents: [
        signedShelf(TARGET_SK, "orbital", "want-to-read"),
        signedShelf(TARGET_SK, "north-woods", "want-to-read"),
      ],
      bookEvents: [
        bookEvent("orbital", "Orbital", "Samantha Harvey"),
        bookEvent("north-woods", "North Woods", "Daniel Mason"),
      ],
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    expect(want.count).toBe(2);
    const orbital = want.books.find((b: { slug: string }) => b.slug === "orbital");
    expect(orbital.title).toBe("Orbital");
    expect(orbital.authorName).toBe("Samantha Harvey");
    expect(orbital.coverUrl).toBe("https://covers/orbital.jpg");
  });

  it("keeps the PublicBook boundary — no hex pubkey or parent header on the wire", async () => {
    const { app } = makeApp({
      shelfEvents: [signedShelf(TARGET_SK, "orbital", "read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(LIB); // librarian hex never leaks
    expect(json).not.toContain(TARGET_HEX); // target hex never leaks
    expect(json).not.toContain("parentHeader");
    expect(json).not.toContain("bookAtag");
  });

  it("omits a shelved slug with no catalog record and recounts to survivors (mirrors Story-19 AC-2)", async () => {
    const { app } = makeApp({
      shelfEvents: [
        signedShelf(TARGET_SK, "orbital", "want-to-read"),
        signedShelf(TARGET_SK, "ol-ghost", "want-to-read"),
      ],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    expect(want.count).toBe(1);
    expect(want.books).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("ol-ghost");
  });

  it("accepts a 64-char hex pubkey as well as an npub", async () => {
    const { app } = makeApp({
      shelfEvents: [signedShelf(TARGET_SK, "orbital", "read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
    });
    const res = await request(app).get(`/api/profile/${TARGET_HEX}/shelves`);
    expect(res.status).toBe(200);
    expect(res.body.shelves[0].books[0].slug).toBe("orbital");
  });

  it("returns an empty list (not 404) for a valid npub with no shelves", async () => {
    const { app } = makeApp({ shelfEvents: [], bookEvents: [] });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    expect(res.body.shelves).toEqual([]);
  });
});

describe("GET /api/profile/:npub/shelves — invalid npub → 404 (AC-6)", () => {
  it("404s on a segment that is neither npub nor hex", async () => {
    const { app } = makeApp({ shelfEvents: [], bookEvents: [] });
    const res = await request(app).get("/api/profile/not-a-key/shelves");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("GET /api/profile/:npub/shelves — 60s TTL cache (Decision 4)", () => {
  it("serves a second call within the TTL window from cache without re-querying", async () => {
    let clock = 1_000_000;
    const { app, query } = makeApp({
      shelfEvents: [signedShelf(TARGET_SK, "orbital", "read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
      now: () => clock,
    });
    await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    const callsAfterFirst = query.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    clock += 30_000; // still inside the 60s window
    await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(query.mock.calls.length).toBe(callsAfterFirst); // no new reads
  });

  it("re-queries once the TTL window has elapsed", async () => {
    let clock = 1_000_000;
    const { app, query } = makeApp({
      shelfEvents: [signedShelf(TARGET_SK, "orbital", "read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
      now: () => clock,
    });
    await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    const callsAfterFirst = query.mock.calls.length;

    clock += 61_000; // past the 60s window
    await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(query.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
