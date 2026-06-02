import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildBooksRouter, type BooksDeps } from "../../src/routes/books";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);
const cfg = { librarianPubkey: LIB } as unknown as Config;

function bookEvent(slug: string, title: string, createdAt = 1): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: `Author of ${title}`, format: "reference",
    source: "openlibrary", parentHeader: HDR, blurb: "x", publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), createdAt);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// MIGRATED for Story 31 / ADR 0032 §2(a) and Story 32 / ADR 0033 §5: GET
// /api/books/:slug now runs FOUR sibling reads (book, claims, author-verified
// assertions, author overlays) in parallel and returns `{ book: effectiveBook,
// claimants, authorProvided }`. The existing book records would be mis-parsed as
// claims/assertions/overlays if the same mock answered all reads, so the book-read
// mocks route by filter: the claims / author-verified / author-edits reads all
// return []. The `book`-shape assertions below are unchanged; a `claimants: []` +
// `authorProvided: []` assertion is added on the no-claims path. The verified
// read-merge paths live in the sibling books-verified-merge.test.ts; the
// claimants-population paths in books-claimants.test.ts.
function bookOnly(...books: SignedNostrEvent[]) {
  return vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-claims") || z.endsWith("author-verified") || z.endsWith("author-edits")) {
      return [];
    }
    return books;
  });
}

function makeApp(over: Partial<BooksDeps> = {}) {
  const deps = { config: cfg, query: vi.fn(async () => []), ...over } as unknown as BooksDeps;
  const app = express();
  app.use("/", buildBooksRouter(deps));
  return app;
}

describe("GET /api/books/:slug", () => {
  it("returns the book record (with an empty claimants array when none)", async () => {
    const app = makeApp({ query: bookOnly(bookEvent("ol-a", "Alpha")) });
    const res = await request(app).get("/api/books/ol-a");
    expect(res.status).toBe(200);
    expect(res.body.book.title).toBe("Alpha");
    expect(res.body.book.authorName).toBe("Author of Alpha");
    // Additive (ADR 0032 §2a): the no-claims path carries an empty claimant set.
    expect(res.body.claimants).toEqual([]);
    // Additive (ADR 0033 §5): no verified author → no overlay applied.
    expect(res.body.authorProvided).toEqual([]);
    // The canonical blurb (no overlay) is unchanged.
    expect(res.body.book.blurb).toBe("x");
  });
  it("404 when not found, 503 when catalog unconfigured", async () => {
    expect((await request(makeApp()).get("/api/books/ol-x")).status).toBe(404);
    const noLib = makeApp({ config: {} as unknown as Config });
    expect((await request(noLib).get("/api/books/ol-x")).status).toBe(503);
  });
});

describe("GET /api/books", () => {
  it("batch by slugs returns found books in request order", async () => {
    const query = vi.fn(async () => [bookEvent("ol-b", "Beta"), bookEvent("ol-a", "Alpha")]);
    const res = await request(makeApp({ query })).get("/api/books?slugs=ol-a,ol-b,ol-missing");
    expect(res.status).toBe(200);
    expect(res.body.books.map((b: { slug: string }) => b.slug)).toEqual(["ol-a", "ol-b"]);
  });
  it("recent shelf (no slugs) returns newest first", async () => {
    const query = vi.fn(async () => [bookEvent("ol-old", "Old", 1), bookEvent("ol-new", "New", 9)]);
    const res = await request(makeApp({ query })).get("/api/books?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.books[0].slug).toBe("ol-new");
  });
});
