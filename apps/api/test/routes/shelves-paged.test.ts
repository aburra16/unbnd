// Failing tests (red) for Story 21 AC-4 / AC-5 — shelves reads paginate past the
// 500 cap. Mirrors apps/api/test/routes/shelves-enriched.test.ts and
// profile-shelves-public.test.ts, but exercises the NEW `queryPaged` dep on
// ShelvesDeps (ADR 0021 Decision 4) for the shelf-MEMBERSHIP read and the chunked
// `#d` catalog-enrichment loop (Decision 3). Neither `queryPaged` on ShelvesDeps
// nor the >500-slug chunking exists yet → intended red.
//
// ADR 0021: enrichedShelvesFor swaps its membership read (the author-scoped
// "#z":[shelves], authors:[author] read) to deps.queryPaged (uses `.events`,
// discards `.capped`), and replaces the single "#d" batch read with a loop over
// RELAY_PAGE_SIZE (500) slices on deps.query, merging into bySlug. A >500-book
// shelf therefore renders fully.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
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

const TARGET_SK = generateSecretKey();
const TARGET_HEX = getPublicKey(TARGET_SK);
const TARGET_NPUB = npubEncode(TARGET_HEX);

const sovereign = { id: "u", pubkeyHex: TARGET_HEX, tier: "sovereign" };

function signedShelf(bookSlug: string, shelfSlug: string, polarity: Polarity = SHELF_ON): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    shelfSlug,
    polarity,
    ownerPubkey: asHexPubkey(TARGET_HEX),
    parentHeader: SHELF_HDR,
  };
  const tmpl = toWireTemplate(toShelfAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, TARGET_SK))) as SignedNostrEvent;
}

function bookEvent(slug: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title: `Title ${slug}`, authorName: `Author ${slug}`, format: "reference",
    source: "openlibrary", parentHeader: BOOKS_HDR, coverUrl: `https://covers/${slug}.jpg`, publishYear: 2024,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// Build a deps object with:
//  - queryPaged: PagedResult-returning membership read (routed by #z book-shelves)
//  - query: one-shot read used ONLY for the chunked #d catalog enrichment. It
//    answers each #d slice with only the records whose slug is in that slice, so a
//    single un-chunked >500 read (the current bug) would be capped by this fake at
//    500 and drop books — exactly the failure AC-4 pins.
function makeApp(opts: {
  shelfEvents: SignedNostrEvent[];
  books: SignedNostrEvent[];
  session?: boolean;
}) {
  const bySlug = new Map(opts.books.map((b) => [b.id, b]));
  const CAP = 500;
  const query = vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("books")) {
      const slugs = (filter["#d"] as string[]) ?? [];
      // strfry caps any single REQ at 500: a slice larger than the cap is
      // truncated. Chunked reads (≤500 each) escape this; one big read does not.
      const truncated = slugs.slice(0, CAP);
      return truncated.map((s) => bySlug.get(s)).filter((b): b is SignedNostrEvent => Boolean(b));
    }
    return [];
  });
  const queryPaged = vi.fn(async (filter: Record<string, unknown>) => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-shelves")) return { events: opts.shelfEvents, capped: false };
    return { events: [], capped: false };
  });
  const deps = {
    config: cfg,
    sessionUser: vi.fn(async () => (opts.session ? sovereign : null)),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query,
    queryPaged,
    custodialSign: vi.fn(async () => null),
  } as unknown as ShelvesDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildShelvesRouter(deps));
  return { app, query, queryPaged };
}

describe("shelves membership read paginates (AC-4)", () => {
  it("public: feeds groupOwnShelves ALL membership events via the paged read, author-scoped", async () => {
    const { app, queryPaged } = makeApp({
      shelfEvents: [signedShelf("orbital", "want-to-read")],
      books: [bookEvent("orbital")],
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    const membershipCall = queryPaged.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .find((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("book-shelves"));
    expect(membershipCall).toBeDefined();
    expect(membershipCall?.authors).toEqual([TARGET_HEX]);
  });

  it("/mine: uses the paged read for the signed-in user's membership", async () => {
    const { app, queryPaged } = makeApp({
      shelfEvents: [signedShelf("orbital", "read")],
      books: [bookEvent("orbital")],
      session: true,
    });
    const res = await request(app).get("/api/shelves/mine");
    expect(res.status).toBe(200);
    const membershipCall = queryPaged.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .find((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("book-shelves"));
    expect(membershipCall?.authors).toEqual([TARGET_HEX]);
  });
});

describe("shelves #d enrichment chunks >500 distinct slugs (AC-4, AC-5)", () => {
  it("renders a >500-book shelf in full by chunking the #d catalog read into ≤500 slices", async () => {
    const N = 1200;
    const slugs = Array.from({ length: N }, (_, i) => `book-${i}`);
    const shelfEvents = slugs.map((s) => signedShelf(s, "want-to-read"));
    const books = slugs.map((s) => bookEvent(s));
    const { app, query } = makeApp({ shelfEvents, books });

    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    expect(res.status).toBe(200);
    const want = res.body.shelves.find((s: { slug: string }) => s.slug === "want-to-read");
    // The whole 1200-book shelf renders; a single un-chunked #d read would cap at 500.
    expect(want.count).toBe(N);
    expect(want.books).toHaveLength(N);

    // The #d catalog read was issued in chunks, each ≤500 #d filter values.
    const dCalls = query.mock.calls
      .map((c) => (c[0] ?? {}) as Record<string, unknown>)
      .filter((f) => (((f["#z"] as string[]) ?? [])[0] ?? "").endsWith("books"));
    expect(dCalls.length).toBeGreaterThanOrEqual(3); // ceil(1200/500) = 3
    for (const f of dCalls) {
      expect(((f["#d"] as string[]) ?? []).length).toBeLessThanOrEqual(500);
    }
  });

  it("does not leak the target or librarian hex on the wire for a large shelf", async () => {
    const slugs = Array.from({ length: 600 }, (_, i) => `book-${i}`);
    const { app } = makeApp({
      shelfEvents: slugs.map((s) => signedShelf(s, "read")),
      books: slugs.map((s) => bookEvent(s)),
    });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/shelves`);
    // The full 600-book shelf renders (pins chunking; a single #d read caps at 500).
    const read = res.body.shelves.find((s: { slug: string }) => s.slug === "read");
    expect(read.count).toBe(600);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(LIB);
    expect(json).not.toContain(TARGET_HEX);
    expect(json).not.toContain("parentHeader");
  });
});
