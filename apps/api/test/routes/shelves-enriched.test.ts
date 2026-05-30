// Failing tests (red) for Story 19 AC-1 / AC-2 — the enriched /api/shelves/mine
// read. Mirrors apps/api/test/routes/shelves.test.ts (the /mine read) and
// books.test.ts (the catalog batch read + PublicBook mapping). Targets the
// enrichment step ADR 0019 Decision 1 adds to apps/api/src/routes/shelves.ts:
// after groupOwnShelves, ONE batch catalog read returns each shelf book as a
// PublicBook (cover/title/author, no hex/atag), dropping unresolvable slugs and
// recomputing count. That enrichment does not exist yet.
//
// NOTE FOR THE IMPLEMENTER: this changes the /mine `books` element shape from
// { bookSlug, bookAtag } to PublicBook. The existing
// apps/api/test/routes/shelves.test.ts "GET /api/shelves/mine" block asserts the
// old shape only via count (it does not assert on books[] elements), so it does
// not directly conflict — but the web `Shelf` type and ProfileMe must follow the
// PublicBook shape. See the test plan's migration note.
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
import { buildShelvesRouter, type ShelvesDeps, type ShelvesSessionUser } from "../../src/routes/shelves";

const LIB = asHexPubkey("1".repeat(63) + "a");
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

const SHELF_HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-shelves" };
const BOOKS_HDR = buildBookRecordsHeaderAddress(LIB);

function signedShelf(sk: Uint8Array, bookSlug: string, shelfSlug: string, polarity: Polarity = SHELF_ON): SignedNostrEvent {
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

// Route the query by concept (#z): the shelf-membership read vs. the catalog
// batch read. The catalog read is the single batch ADR 0019 Decision 1 adds.
function makeApp(opts: {
  sk: Uint8Array;
  shelfEvents: SignedNostrEvent[];
  bookEvents: SignedNostrEvent[];
}) {
  const query = vi.fn(async (filter: Record<string, unknown>) => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-shelves")) return opts.shelfEvents;
    if (z.endsWith("books")) return opts.bookEvents;
    return [];
  });
  const sovereign: ShelvesSessionUser = { id: "u", pubkeyHex: getPublicKey(opts.sk), tier: "sovereign" };
  const deps: ShelvesDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: query as never,
    // Membership read is via queryPaged (ADR 0021); wrap the routed one-shot
    // `query` into a PagedResult so the same shelfEvents drive it.
    queryPaged: vi.fn(async (filter) => ({ events: await query(filter as never), capped: false })) as never,
    custodialSign: vi.fn(async () => null),
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildShelvesRouter(deps));
  return { app, query };
}

describe("GET /api/shelves/mine — enriched books (AC-1)", () => {
  it("returns each shelf book as a PublicBook with cover/title/author and no raw slug-only entry", async () => {
    const sk = generateSecretKey();
    const { app } = makeApp({
      sk,
      shelfEvents: [
        signedShelf(sk, "orbital", "want-to-read"),
        signedShelf(sk, "north-woods", "want-to-read"),
      ],
      bookEvents: [
        bookEvent("orbital", "Orbital", "Samantha Harvey"),
        bookEvent("north-woods", "North Woods", "Daniel Mason"),
      ],
    });
    const res = await request(app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    expect(want.count).toBe(2);
    const orbital = want.books.find((b: { slug: string }) => b.slug === "orbital");
    expect(orbital.title).toBe("Orbital");
    expect(orbital.authorName).toBe("Samantha Harvey");
    expect(orbital.coverUrl).toBe("https://covers/orbital.jpg");
  });

  it("keeps the PublicBook boundary — no hex pubkey or parent header on the wire", async () => {
    const sk = generateSecretKey();
    const { app } = makeApp({
      sk,
      shelfEvents: [signedShelf(sk, "orbital", "read")],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")],
    });
    const res = await request(app).get("/api/shelves/mine");
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(LIB); // librarian hex never leaks
    expect(json).not.toContain("parentHeader");
    // The pre-enrichment membership tuple field is gone from the wire.
    expect(json).not.toContain("bookAtag");
  });

  it("issues a single batch catalog read for the distinct shelved slugs", async () => {
    const sk = generateSecretKey();
    const { app, query } = makeApp({
      sk,
      shelfEvents: [
        signedShelf(sk, "orbital", "want-to-read"),
        signedShelf(sk, "orbital", "read"), // same slug across two shelves → still one distinct
        signedShelf(sk, "north-woods", "read"),
      ],
      bookEvents: [
        bookEvent("orbital", "Orbital", "Samantha Harvey"),
        bookEvent("north-woods", "North Woods", "Daniel Mason"),
      ],
    });
    await request(app).get("/api/shelves/mine");
    const catalogCalls = query.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .filter((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("books"));
    expect(catalogCalls).toHaveLength(1);
    const filter = catalogCalls[0]!;
    expect(filter.kinds).toContain(39999);
    expect((filter["#d"] as string[]).sort()).toEqual(["north-woods", "orbital"]);
  });
});

describe("GET /api/shelves/mine — missing-book honesty (AC-2)", () => {
  it("omits a shelved slug with no catalog record and recounts to the survivors", async () => {
    const sk = generateSecretKey();
    const { app } = makeApp({
      sk,
      shelfEvents: [
        signedShelf(sk, "orbital", "want-to-read"),
        signedShelf(sk, "ol-ghost", "want-to-read"), // no catalog record
      ],
      bookEvents: [bookEvent("orbital", "Orbital", "Samantha Harvey")], // ghost absent
    });
    const res = await request(app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    expect(want.count).toBe(1); // recounted to the survivor
    expect(want.books).toHaveLength(1);
    expect(want.books[0].slug).toBe("orbital");
    // No slug fallback for the dropped book.
    expect(JSON.stringify(res.body)).not.toContain("ol-ghost");
  });

  it("never issues a catalog read when the user has no shelved books", async () => {
    const sk = generateSecretKey();
    const { app, query } = makeApp({ sk, shelfEvents: [], bookEvents: [] });
    const res = await request(app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    expect(res.body.shelves).toEqual([]);
    const catalogCalls = query.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .filter((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("books"));
    expect(catalogCalls).toHaveLength(0);
  });
});
